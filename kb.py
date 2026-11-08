"""Biblioteca comuna: explicatiile generate (mod motor de cautare) si prezentarile lor.

Cu DATABASE_URL (Postgres, de ex. Neon) datele sunt permanente.
Fara DATABASE_URL se foloseste un fisier SQLite local: merge, dar pe Render
se goleste la fiecare repornire a serverului.
"""
import hashlib
import json
import os
import re
import sqlite3
import threading
import time
import unicodedata

DB_URL = os.environ.get("DATABASE_URL", "").strip()
SQLITE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kb.sqlite3")
MAX_DATA = 400_000  # octeti per explicatie

STOP = set("""a ai al ale alt alte am ar are as asa au ca care cat ce cea cei cel cele ceva cine cu cum da dar de deci
despre din dintre doar dupa ea ei el ele este eu fi fie fost iar in inca intr intre la le lor lui mai mult nu o or ori
pe pentru prin sa sau se si sunt te tot toti un una unei unui unor vs versus explica explicatie tema temei temele
rol ul ului""".split())


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def stems(s):
    out = set()
    for w in norm(s).split():
        if len(w) < 3 or w in STOP:
            continue
        out.add(w[:5] if len(w) >= 5 else w)
    return out


def topic_key(titlu):
    return hashlib.sha1(" ".join(sorted(stems(titlu))).encode()).hexdigest()[:16]


class KB:
    def __init__(self):
        self.lock = threading.RLock()
        self.index = {}
        self.kind = "postgres" if DB_URL else "temporar"
        self.enabled = False
        self.error = ""
        self._conn = None
        try:
            self._init()
            self.enabled = True
        except Exception as e:  # baza nu e disponibila: site-ul merge mai departe fara bibliotecă
            self.error = str(e)[:300]
            print("KB dezactivata:", self.error.encode("ascii", "replace").decode(), flush=True)

    # ---- conexiune ----
    def _connect(self):
        if self.kind == "postgres":
            import psycopg
            # prepare_threshold=None: compatibil cu conexiunea „pooled” (PgBouncer) de la Neon
            return psycopg.connect(DB_URL, autocommit=True, connect_timeout=15, prepare_threshold=None)
        c = sqlite3.connect(SQLITE_PATH, check_same_thread=False)
        c.isolation_level = None
        return c

    def _q(self, sql):
        return sql.replace("?", "%s") if self.kind == "postgres" else sql

    def _exec(self, sql, params=(), fetch=False):
        with self.lock:
            for attempt in (1, 2):
                try:
                    if self._conn is None:
                        self._conn = self._connect()
                    cur = self._conn.cursor()
                    cur.execute(self._q(sql), params)
                    rows = cur.fetchall() if fetch else None
                    cur.close()
                    return rows
                except Exception:
                    try:
                        self._conn.close()
                    except Exception:
                        pass
                    self._conn = None
                    if attempt == 2:
                        raise

    def _init(self):
        self._exec("""CREATE TABLE IF NOT EXISTS explicatii (
            id TEXT PRIMARY KEY, cheie TEXT UNIQUE, created BIGINT, updated BIGINT,
            titlu TEXT, disciplina TEXT, rezumat TEXT, query TEXT, keywords TEXT,
            data TEXT, slides TEXT, uses INTEGER DEFAULT 0)""")
        rows = self._exec("SELECT id, cheie, created, updated, titlu, disciplina, rezumat, query, keywords, uses, slides IS NOT NULL FROM explicatii", fetch=True)
        for r in rows:
            self._index_row(*r)
        print(f"KB {self.kind}: {len(self.index)} explicatii incarcate", flush=True)

    def _index_row(self, id, cheie, created, updated, titlu, disciplina, rezumat, query, keywords, uses, has_slides):
        self.index[id] = {
            "id": id, "cheie": cheie, "created": created, "updated": updated, "titlu": titlu, "disciplina": disciplina,
            "rezumat": (rezumat or "")[:300], "query": query, "uses": uses or 0, "slides": bool(has_slides),
            "_title": stems(titlu) | stems(query), "_t": stems(titlu), "_all": set((keywords or "").split()),
        }

    # ---- operatii ----
    @staticmethod
    def _public(e, score=None):
        d = {k: v for k, v in e.items() if not k.startswith("_")}
        if score is not None:
            d["score"] = round(score, 3)
        return d

    def status(self):
        return {"enabled": self.enabled, "kind": self.kind, "count": len(self.index)}

    @staticmethod
    def _hit(word, stemset):
        # potrivire pe rădăcină (primele 5 litere) sau rădăcină conținută într-un cuvânt compus (hiperALDOSteronism)
        return word[:5] in stemset or any(len(s) >= 5 and s in word for s in stemset)

    def search(self, q, n=5):
        words = [w for w in norm(q).split() if len(w) >= 3 and w not in STOP]
        if not words:
            return []
        scored = []
        for e in list(self.index.values()):
            s = sum(2 if self._hit(w, e["_title"]) else 1 if self._hit(w, e["_all"]) else 0 for w in words) / (2 * len(words))
            if s <= 0:
                continue
            # „aceeași temă”: interogarea acoperă aproape tot titlul și titlul acoperă interogarea
            t = e["_t"]
            cov = sum(1 for st in t if any(w[:5] == st or (len(st) >= 5 and st in w) for w in words)) / max(1, len(t))
            scored.append((s, cov, e))
        scored.sort(key=lambda x: (-x[0], -x[1], -(x[2]["updated"] or 0)))
        out = []
        for s, cov, e in scored[:n]:
            d = self._public(e, s)
            d["same"] = s >= 0.85 and cov >= 0.6
            out.append(d)
        return out

    def recent(self, n=20):
        items = sorted(self.index.values(), key=lambda e: -(e["updated"] or 0))[:n]
        return [self._public(e) for e in items]

    def get(self, id, count=True):
        rows = self._exec("SELECT data, slides, query, updated FROM explicatii WHERE id = ?", (id,), fetch=True)
        if not rows:
            return None
        data, slides, query, updated = rows[0]
        if count:
            self._exec("UPDATE explicatii SET uses = uses + 1 WHERE id = ?", (id,))
            if id in self.index:
                self.index[id]["uses"] += 1
        return {"id": id, "result": json.loads(data), "slides": json.loads(slides) if slides else None, "query": query, "updated": updated}

    def save(self, result, query=""):
        if not isinstance(result, dict) or not result.get("titlu") or not isinstance(result.get("sectiuni"), list) or not result["sectiuni"]:
            raise ValueError("explicație incompletă")
        data = json.dumps(result, ensure_ascii=False)
        if len(data.encode()) > MAX_DATA:
            raise ValueError("explicație prea mare")
        titlu = str(result.get("titlu"))[:300]
        cheie = topic_key(titlu)
        kw = set()
        for part in [titlu, result.get("disciplina"), query, result.get("rezumat")] + \
                [s.get("titlu") for s in result["sectiuni"] if isinstance(s, dict)] + \
                [g.get("termen") for g in (result.get("glosar") or []) if isinstance(g, dict)]:
            kw |= stems(part)
        now = int(time.time() * 1000)
        with self.lock:
            existing = [e for e in self.index.values() if e["cheie"] == cheie]
            if existing:
                id = existing[0]["id"]
                self._exec("UPDATE explicatii SET updated = ?, titlu = ?, disciplina = ?, rezumat = ?, query = ?, keywords = ?, data = ? WHERE id = ?",
                           (now, titlu, result.get("disciplina", ""), result.get("rezumat", ""), query, " ".join(sorted(kw)), data, id))
                created, uses, has_slides = existing[0]["created"], existing[0]["uses"], existing[0]["slides"]
            else:
                id = "k" + hashlib.sha1(f"{cheie}{now}".encode()).hexdigest()[:12]
                self._exec("INSERT INTO explicatii (id, cheie, created, updated, titlu, disciplina, rezumat, query, keywords, data, uses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
                           (id, cheie, now, now, titlu, result.get("disciplina", ""), result.get("rezumat", ""), query, " ".join(sorted(kw)), data))
                created, uses, has_slides = now, 0, False
            self._index_row(id, cheie, created, now, titlu, result.get("disciplina", ""), result.get("rezumat", ""), query, " ".join(sorted(kw)), uses, has_slides)
        return id

    def save_slides(self, titlu, slides):
        if not isinstance(slides, list) or not slides:
            raise ValueError("prezentare goală")
        data = json.dumps(slides, ensure_ascii=False)
        if len(data.encode()) > MAX_DATA:
            raise ValueError("prezentare prea mare")
        cheie = topic_key(titlu)
        with self.lock:
            e = next((x for x in self.index.values() if x["cheie"] == cheie), None)
            if not e:
                return None
            self._exec("UPDATE explicatii SET slides = ? WHERE id = ?", (data, e["id"]))
            e["slides"] = True
            return e["id"]
