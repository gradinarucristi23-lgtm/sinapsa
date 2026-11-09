"""Sinapsa - server mic, fara dependinte externe.

Serveste pagina din /public si trimite cererile catre Google Gemini (API gratuit),
pastrand cheia ascunsa pe server. Cheia se pune in variabila de mediu GEMINI_API_KEY.
"""
import hashlib
import json
import mimetypes
import os
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from accounts import Accounts
from kb import KB

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
KEY = os.environ.get("GEMINI_API_KEY", "").strip()
BASE = os.environ.get("GEMINI_BASE", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
PORT = int(os.environ.get("PORT", "10000"))
MAX_OUT = int(os.environ.get("MAX_OUTPUT_TOKENS", "32768"))
RATE_PER_HOUR = int(os.environ.get("RATE_PER_HOUR", "40"))
MAX_BODY = 30 * 1024 * 1024


def _models(env, default):
    return [m.strip() for m in os.environ.get(env, default).split(",") if m.strip()]


# Daca un model nu exista sau si-a atins limita gratuita, se incearca urmatorul din lista.
MODELS = {
    "quick": _models("MODELS_QUICK", "gemini-flash-lite-latest,gemini-2.5-flash-lite,gemini-flash-latest,gemini-2.5-flash"),
    # Standard = modelul rapid (Flash Lite); Aprofundat = modelul mare (Flash), mai lent.
    "default": _models("MODELS_DEFAULT", "gemini-flash-lite-latest,gemini-2.5-flash-lite,gemini-flash-latest,gemini-2.5-flash"),
    "complex": _models("MODELS_COMPLEX", "gemini-flash-latest,gemini-2.5-pro,gemini-2.5-flash,gemini-flash-lite-latest"),
}

SAFETY = [
    {"category": c, "threshold": "BLOCK_ONLY_HIGH"}
    for c in (
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
    )
]

KBASE = KB()  # biblioteca comună (Postgres cu DATABASE_URL, altfel SQLite temporar)
ACC = Accounts(KBASE)  # conturi și sincronizare (doar pe bază permanentă)

_hits = {}
_hits_lock = threading.Lock()


def rate_ok(ip):
    now = time.time()
    with _hits_lock:
        lst = [t for t in _hits.get(ip, []) if now - t < 3600]
        if len(lst) >= RATE_PER_HOUR:
            _hits[ip] = lst
            return False
        lst.append(now)
        _hits[ip] = lst
        if len(_hits) > 5000:  # curatenie ocazionala
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > 3600]:
                _hits.pop(k, None)
        return True


class Handler(BaseHTTPRequestHandler):
    server_version = "Sinapsa/1.0"

    def log_message(self, fmt, *args):  # jurnal scurt, fara continutul cererilor
        print("%s %s" % (self.address_string(), fmt % args), flush=True)

    # ---------- helpers ----------
    def client_ip(self):
        fwd = self.headers.get("X-Forwarded-For", "")
        return fwd.split(",")[0].strip() if fwd else self.client_address[0]

    def send_json(self, status, obj, cookie=None):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def emit(self, obj):
        self.wfile.write((json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8"))

    # ---------- static ----------
    def serve_static(self, head=False):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if path in ("", "/"):
            path = "/index.html"
        full = os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
        if not full.startswith(ROOT) or not os.path.isfile(full):
            self.send_json(404, {"error": "not_found"})
            return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        with open(full, "rb") as f:
            data = f.read()
        # ETag: la reîncărcare browserul primește „304, nu s-a schimbat” în loc să descarce din nou pagina
        etag = '"' + hashlib.sha1(data).hexdigest()[:16] + '"'
        cache = "public, max-age=86400" if ctype.startswith("image/") else "no-cache"
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", cache)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.send_header("ETag", etag)
        self.end_headers()
        if not head:
            self.wfile.write(data)

    def do_HEAD(self):
        self.serve_static(head=True)

    def do_GET(self):
        if self.path.startswith("/api/health"):
            self.send_json(200, {"ok": True, "key": bool(KEY), "kb": KBASE.status(), "commit": os.environ.get("RENDER_GIT_COMMIT", "")[:7], "db_var": bool(os.environ.get("DATABASE_URL", "").strip())})
            return
        if self.path.startswith("/api/kb/"):
            self.handle_kb_get()
            return
        if self.path.startswith("/api/auth/me"):
            user = ACC.session_user(self.cookie("sid")) if ACC.enabled else None
            self.send_json(200, {**ACC.status(), "user": user})
            return
        if self.path.startswith("/api/sync"):
            user = self.require_user()
            if user:
                self.send_json(200, {"docs": ACC.get_docs(user["id"])})
            return
        self.serve_static()

    # ---------- conturi și sincronizare ----------
    def cookie(self, name):
        for part in self.headers.get("Cookie", "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == name:
                return v
        return ""

    def session_cookie(self, token):
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "") == "https" else ""
        if token:
            return f"sid={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={180 * 86400}{secure}"
        return f"sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}"

    def require_user(self):
        if not ACC.enabled:
            self.send_json(503, {"code": "accounts_off", "message": ACC.reason})
            return None
        user = ACC.session_user(self.cookie("sid"))
        if not user:
            self.send_json(401, {"code": "login_required"})
        return user

    def read_json(self, limit):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > limit:
            raise ValueError("Cerere prea mare sau goală.")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def handle_auth(self):
        if not ACC.enabled:
            self.send_json(503, {"code": "accounts_off", "message": ACC.reason})
            return
        route = urlparse(self.path).path
        if route in ("/api/auth/register", "/api/auth/login", "/api/auth/recover") and not rate_ok("auth:" + self.client_ip()):
            self.send_json(429, {"code": "ip_limited", "message": "Prea multe încercări. Așteaptă puțin."})
            return
        try:
            if route == "/api/auth/logout":
                ACC.end_session(self.cookie("sid"))
                self.send_json(200, {"ok": True}, cookie=self.session_cookie(""))
                return
            if route == "/api/auth/delete":
                user = self.require_user()
                if user:
                    ACC.delete_user(user["id"])
                    self.send_json(200, {"ok": True}, cookie=self.session_cookie(""))
                return
            body = self.read_json(20_000)
            if route == "/api/auth/register":
                uid, name, code = ACC.register(body.get("username"), body.get("password"))
                self.send_json(200, {"user": {"id": uid, "username": name}, "recovery": code}, cookie=self.session_cookie(ACC.new_session(uid)))
            elif route == "/api/auth/login":
                uid, name = ACC.login(body.get("username"), body.get("password"))
                self.send_json(200, {"user": {"id": uid, "username": name}}, cookie=self.session_cookie(ACC.new_session(uid)))
            elif route == "/api/auth/recover":
                uid, name, code = ACC.recover(body.get("username"), body.get("code"), body.get("password"))
                self.send_json(200, {"user": {"id": uid, "username": name}, "recovery": code}, cookie=self.session_cookie(ACC.new_session(uid)))
            else:
                self.send_json(404, {"error": "not_found"})
        except ValueError as e:
            self.send_json(400, {"code": "invalid", "message": str(e)})
        except Exception as e:
            print("Auth:", str(e).encode("ascii", "replace").decode(), flush=True)
            self.send_json(500, {"code": "auth_error", "message": "Eroare de server. Încearcă din nou."})

    def do_PUT(self):
        if not self.path.startswith("/api/sync/"):
            self.send_json(404, {"error": "not_found"})
            return
        user = self.require_user()
        if not user:
            return
        try:
            body = self.read_json(7_000_000)
            updated = ACC.put_doc(user["id"], urlparse(self.path).path.rsplit("/", 1)[-1], body.get("data"))
            self.send_json(200, {"ok": True, "updated": updated})
        except ValueError as e:
            self.send_json(400, {"code": "invalid", "message": str(e)})
        except Exception as e:
            print("Sync:", str(e).encode("ascii", "replace").decode(), flush=True)
            self.send_json(500, {"code": "sync_error"})

    # ---------- biblioteca comună ----------
    def handle_kb_get(self):
        u = urlparse(self.path)
        qs = parse_qs(u.query)
        arg = lambda k, d="": (qs.get(k) or [d])[0]
        if u.path == "/api/kb/status":
            self.send_json(200, KBASE.status())
            return
        if not KBASE.enabled:
            self.send_json(503, {"code": "kb_off"})
            return
        try:
            if u.path == "/api/kb/search":
                self.send_json(200, {"items": KBASE.search(arg("q"), max(1, min(10, int(arg("n", "5") or 5))))})
            elif u.path == "/api/kb/recent":
                self.send_json(200, {"items": KBASE.recent(max(1, min(60, int(arg("n", "20") or 20))))})
            elif u.path == "/api/kb/get":
                d = KBASE.get(arg("id"), count=arg("ctx") != "1")
                self.send_json(200 if d else 404, d or {"code": "not_found"})
            else:
                self.send_json(404, {"error": "not_found"})
        except Exception as e:
            print("KB get:", e, flush=True)
            self.send_json(500, {"code": "kb_error"})

    def handle_kb_post(self):
        if not KBASE.enabled:
            self.send_json(503, {"code": "kb_off"})
            return
        if not rate_ok("kb:" + self.client_ip()):
            self.send_json(429, {"code": "ip_limited"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > 1_000_000:
            self.send_json(413, {"code": "too_large"})
            return
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            if self.path.startswith("/api/kb/save"):
                id = KBASE.save(body.get("result"), str(body.get("query") or "")[:500])
            elif self.path.startswith("/api/kb/slides"):
                id = KBASE.save_slides(str(body.get("titlu") or ""), body.get("slides"))
            else:
                self.send_json(404, {"error": "not_found"})
                return
            self.send_json(200, {"ok": bool(id), "id": id, "count": len(KBASE.index)})
        except ValueError as e:
            self.send_json(400, {"code": "invalid", "message": str(e)})
        except Exception as e:
            print("KB post:", e, flush=True)
            self.send_json(500, {"code": "kb_error"})

    # ---------- AI ----------
    def do_POST(self):
        if self.path.startswith("/api/kb/"):
            self.handle_kb_post()
            return
        if self.path.startswith("/api/auth/"):
            self.handle_auth()
            return
        if not self.path.startswith("/api/generate"):
            self.send_json(404, {"error": "not_found"})
            return
        if not KEY:
            self.send_json(500, {"code": "server_key", "message": "GEMINI_API_KEY lipseste pe server."})
            return
        if not rate_ok(self.client_ip()):
            self.send_json(429, {"code": "ip_limited", "message": "Prea multe cereri in ultima ora."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self.send_json(413, {"code": "prompt_too_large", "message": "Cerere prea mare."})
            return
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self.send_json(400, {"code": "invalid_request", "message": "JSON invalid."})
            return

        prompt = body.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            self.send_json(400, {"code": "invalid_request", "message": "Lipseste textul cererii."})
            return
        parts = []
        for im in (body.get("images") or [])[:10]:
            if isinstance(im, dict) and isinstance(im.get("data"), str) and str(im.get("mime", "")).startswith("image/"):
                parts.append({"inline_data": {"mime_type": im["mime"], "data": im["data"]}})
        parts.append({"text": prompt})

        gen = {"temperature": 0.4, "maxOutputTokens": MAX_OUT}
        if body.get("json"):
            gen["responseMimeType"] = "application/json"
        payload = json.dumps({
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": gen,
            "safetySettings": SAFETY,
        }).encode("utf-8")

        tier = body.get("tier") if body.get("tier") in MODELS else "default"
        last_status, last_msg, resp, used = 0, "", None, None
        for model in MODELS[tier]:
            req = urllib.request.Request(
                f"{BASE}/models/{model}:streamGenerateContent?alt=sse",
                data=payload,
                headers={"Content-Type": "application/json", "x-goog-api-key": KEY},
                method="POST",
            )
            try:
                resp = urllib.request.urlopen(req, timeout=300)
                used = model
                break
            except urllib.error.HTTPError as e:
                try:
                    msg = e.read().decode("utf-8", "replace")[:1500]
                except Exception:
                    msg = ""
                last_status, last_msg = e.code, msg
                low = msg.lower()
                print(f"model {model}: HTTP {e.code}", flush=True)
                if "api key" in low or "api_key" in low:
                    self.send_json(500, {"code": "server_key", "message": "Cheia Gemini este invalida."})
                    return
                if e.code == 400 and "token" in low and ("exceed" in low or "too long" in low or "too large" in low):
                    self.send_json(413, {"code": "prompt_too_large", "message": "Material prea mare."})
                    return
                continue
            except Exception as e:  # retea, timeout
                last_status, last_msg = 502, str(e)
                print(f"model {model}: {e}", flush=True)
                continue

        if resp is None:
            if last_status == 429:
                self.send_json(429, {"code": "rate_limited", "message": "Limita gratuita Gemini a fost atinsa."})
            else:
                self.send_json(502, {"code": "upstream_error", "message": f"Gemini a raspuns {last_status}."})
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        truncated, got_text, blocked = False, False, False
        try:
            for raw in resp:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                try:
                    ev = json.loads(line[5:].strip())
                except ValueError:
                    continue
                if (ev.get("promptFeedback") or {}).get("blockReason"):
                    blocked = True
                for cand in ev.get("candidates") or []:
                    for part in (cand.get("content") or {}).get("parts") or []:
                        t = part.get("text")
                        if t and not part.get("thought"):
                            got_text = True
                            self.emit({"d": t})
                    fr = cand.get("finishReason")
                    if fr == "MAX_TOKENS":
                        truncated = True
                    elif fr in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"):
                        blocked = True
            if not got_text:
                self.emit({"error": "refused" if blocked else "empty_completion"})
            else:
                self.emit({"done": True, "truncated": truncated, "model": used})
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # utilizatorul a apasat "Opreste" sau a inchis pagina
        except Exception as e:
            try:
                self.emit({"error": "upstream_error", "message": str(e)[:200]})
            except Exception:
                pass
        finally:
            try:
                resp.close()
            except Exception:
                pass


def keep_awake():
    """Pe Render gratuit, serverul adoarme după 15 minute fără vizite și prima deschidere durează ~1 minut.
    Serverul își face singur o vizită prin adresa publică la fiecare 10 minute, ca să rămână pornit."""
    url = os.environ.get("KEEPALIVE_URL") or os.environ.get("RENDER_EXTERNAL_URL", "")
    if not url or os.environ.get("KEEPALIVE", "1") == "0":
        return
    url = url.rstrip("/") + "/api/health"
    while True:
        time.sleep(600)
        try:
            urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "ghid-keepalive"}), timeout=30).read()
        except Exception as e:
            print("keepalive:", str(e).encode("ascii", "replace").decode(), flush=True)


if __name__ == "__main__":
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/markdown", ".md")
    print(f"Sinapsa pe portul {PORT} - cheie Gemini: {'da' if KEY else 'NU'}", flush=True)
    threading.Thread(target=keep_awake, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
