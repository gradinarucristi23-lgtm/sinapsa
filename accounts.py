"""Conturi (utilizator + parolă, fără email) și sincronizarea datelor între dispozitive.

Folosește aceeași bază de date ca biblioteca comună (kb.KB). Conturile pornesc doar pe o
bază permanentă (Postgres prin DATABASE_URL); pe baza temporară ar dispărea la fiecare
repornire. Pentru teste locale: ACCOUNTS_TEMP=1.
"""
import base64
import hashlib
import hmac
import os
import re
import secrets
import time

ITER = 200_000
SESSION_DAYS = 180
MAX_DOC = 6_000_000          # octeți per document sincronizat
MAX_USER = 14_000_000        # octeți în total per cont
SYNC_KEYS = ("hist", "banks", "prog")
# administratorii (văd statisticile site-ului): nume de utilizator separate prin virgulă, în Render
ADMIN_USERS = {u.strip().lower() for u in os.environ.get("ADMIN_USERS", "").split(",") if u.strip()}
DB_LIMIT_MB = float(os.environ.get("DB_LIMIT_MB", "1024"))  # spațiul planului gratuit Neon
USER_RE = re.compile(r"^[a-z0-9._-]{3,32}$")


def _hash(secret, salt):
    return hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt, ITER).hex()


def _recovery_code():
    raw = base64.b32encode(secrets.token_bytes(10)).decode().rstrip("=")
    return "-".join(raw[i:i + 4] for i in range(0, 16, 4))


class Accounts:
    def __init__(self, kb):
        self.kb = kb
        self.enabled = False
        self.reason = ""
        if not kb.enabled:
            self.reason = "baza de date nu este disponibilă"
        elif kb.kind != "postgres" and os.environ.get("ACCOUNTS_TEMP") != "1":
            self.reason = "conturile pornesc după configurarea bazei de date permanente"
        else:
            try:
                kb._exec("""CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE, salt TEXT,
                            pass_hash TEXT, rec_hash TEXT, created BIGINT)""")
                kb._exec("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, created BIGINT, expires BIGINT)")
                kb._exec("""CREATE TABLE IF NOT EXISTS userdata (user_id TEXT, k TEXT, data TEXT, updated BIGINT,
                            PRIMARY KEY (user_id, k))""")
                self.enabled = True
            except Exception as e:
                self.reason = "eroare la inițializarea conturilor"
                print("Accounts:", str(e).encode("ascii", "replace").decode(), flush=True)

    def status(self):
        return {"enabled": self.enabled, "reason": self.reason}

    # ---- utilizatori ----
    def _user_by_name(self, username):
        rows = self.kb._exec("SELECT id, username, salt, pass_hash, rec_hash FROM users WHERE username = ?", (username,), fetch=True)
        return rows[0] if rows else None

    def register(self, username, password):
        username = str(username or "").strip().lower()
        if not USER_RE.match(username):
            raise ValueError("Numele de utilizator are 3–32 de caractere: litere mici, cifre, punct, minus sau _.")
        if len(str(password or "")) < 8:
            raise ValueError("Parola trebuie să aibă cel puțin 8 caractere.")
        if self._user_by_name(username):
            raise ValueError("Numele de utilizator este deja folosit.")
        salt = secrets.token_bytes(16)
        code = _recovery_code()
        uid = "u" + secrets.token_hex(8)
        self.kb._exec("INSERT INTO users (id, username, salt, pass_hash, rec_hash, created) VALUES (?, ?, ?, ?, ?, ?)",
                      (uid, username, salt.hex(), _hash(password, salt), _hash(code.replace("-", ""), salt), int(time.time() * 1000)))
        return uid, username, code

    def login(self, username, password):
        u = self._user_by_name(str(username or "").strip().lower())
        if not u:
            _hash(str(password or ""), b"0" * 16)  # timp constant aproximativ
            raise ValueError("Utilizator sau parolă greșită.")
        uid, name, salt, ph, _ = u
        if not hmac.compare_digest(_hash(str(password or ""), bytes.fromhex(salt)), ph):
            raise ValueError("Utilizator sau parolă greșită.")
        return uid, name

    def recover(self, username, code, new_password):
        u = self._user_by_name(str(username or "").strip().lower())
        clean = re.sub(r"[^A-Z0-9]", "", str(code or "").upper())
        if not u or not hmac.compare_digest(_hash(clean, bytes.fromhex(u[2])), u[4]):
            raise ValueError("Utilizator sau cod de recuperare greșit.")
        if len(str(new_password or "")) < 8:
            raise ValueError("Parola trebuie să aibă cel puțin 8 caractere.")
        salt = secrets.token_bytes(16)
        new_code = _recovery_code()
        self.kb._exec("UPDATE users SET salt = ?, pass_hash = ?, rec_hash = ? WHERE id = ?",
                      (salt.hex(), _hash(new_password, salt), _hash(new_code.replace("-", ""), salt), u[0]))
        self.kb._exec("DELETE FROM sessions WHERE user_id = ?", (u[0],))
        return u[0], u[1], new_code

    def delete_user(self, uid):
        for t in ("userdata", "sessions"):
            self.kb._exec(f"DELETE FROM {t} WHERE user_id = ?", (uid,))
        self.kb._exec("DELETE FROM users WHERE id = ?", (uid,))

    # ---- sesiuni ----
    def new_session(self, uid):
        token = secrets.token_urlsafe(32)
        now = int(time.time() * 1000)
        self.kb._exec("INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)",
                      (hashlib.sha256(token.encode()).hexdigest(), uid, now, now + SESSION_DAYS * 86400_000))
        return token

    def session_user(self, token):
        if not token:
            return None
        rows = self.kb._exec("""SELECT u.id, u.username, s.expires FROM sessions s JOIN users u ON u.id = s.user_id
                                WHERE s.token_hash = ?""", (hashlib.sha256(token.encode()).hexdigest(),), fetch=True)
        if not rows or rows[0][2] < time.time() * 1000:
            return None
        return {"id": rows[0][0], "username": rows[0][1]}

    def end_session(self, token):
        if token:
            self.kb._exec("DELETE FROM sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),))

    # ---- administrare ----
    @staticmethod
    def is_admin(user):
        return bool(user) and str(user.get("username", "")).lower() in ADMIN_USERS

    def stats(self):
        q = lambda sql, p=(): self.kb._exec(sql, p, fetch=True)
        one = lambda sql, p=(): (q(sql, p) or [[0]])[0][0] or 0
        now = int(time.time() * 1000)
        ago = lambda days: now - days * 86400_000
        out = {"now": now, "limit_mb": DB_LIMIT_MB, "kind": self.kb.kind}
        out["users"] = one("SELECT COUNT(*) FROM users")
        out["new"] = {d: one("SELECT COUNT(*) FROM users WHERE created >= ?", (ago(d),)) for d in (1, 7, 30)}
        # activ = a sincronizat ceva (a învățat cu contul deschis) în perioada respectivă
        out["active"] = {d: one("SELECT COUNT(DISTINCT user_id) FROM userdata WHERE updated >= ?", (ago(d),)) for d in (1, 7, 30)}
        out["logins7"] = one("SELECT COUNT(DISTINCT user_id) FROM sessions WHERE created >= ?", (ago(7),))
        with_data = one("SELECT COUNT(DISTINCT user_id) FROM userdata")
        total = one("SELECT SUM(LENGTH(data)) FROM userdata")
        out["data"] = {"users": with_data, "bytes": total, "avg": int(total / with_data) if with_data else 0,
                       "by_key": {k: n or 0 for k, n in q("SELECT k, SUM(LENGTH(data)) FROM userdata GROUP BY k")}}
        out["top"] = [{"username": u, "bytes": n or 0} for u, n in q(
            "SELECT u.username, SUM(LENGTH(d.data)) AS s FROM userdata d JOIN users u ON u.id = d.user_id GROUP BY u.username ORDER BY s DESC LIMIT 5")]
        out["kb"] = one("SELECT COUNT(*) FROM explicatii")
        if self.kb.kind == "postgres":
            out["db_bytes"] = one("SELECT pg_database_size(current_database())")
            out["tables"] = {t: n for t, n in q(
                "SELECT relname, pg_total_relation_size(relid) FROM pg_catalog.pg_statio_user_tables ORDER BY 2 DESC")}
        else:
            out["db_bytes"] = one("PRAGMA page_count") * one("PRAGMA page_size")
            out["tables"] = {}
        return out

    # ---- date sincronizate ----
    def get_docs(self, uid):
        rows = self.kb._exec("SELECT k, data, updated FROM userdata WHERE user_id = ?", (uid,), fetch=True)
        return {k: {"data": d, "updated": u} for k, d, u in rows}

    def put_doc(self, uid, key, data):
        if key not in SYNC_KEYS:
            raise ValueError("cheie necunoscută")
        if not isinstance(data, str) or len(data.encode()) > MAX_DOC:
            raise ValueError("Datele sunt prea mari pentru sincronizare.")
        rows = self.kb._exec("SELECT k, LENGTH(data) FROM userdata WHERE user_id = ?", (uid,), fetch=True)
        other = sum(n or 0 for k, n in rows if k != key)
        if other + len(data) > MAX_USER:
            raise ValueError("Contul a atins limita de spațiu. Șterge bănci sau teme vechi.")
        now = int(time.time() * 1000)
        if any(k == key for k, _ in rows):
            self.kb._exec("UPDATE userdata SET data = ?, updated = ? WHERE user_id = ? AND k = ?", (data, now, uid, key))
        else:
            self.kb._exec("INSERT INTO userdata (user_id, k, data, updated) VALUES (?, ?, ?, ?)", (uid, key, data, now))
        return now
