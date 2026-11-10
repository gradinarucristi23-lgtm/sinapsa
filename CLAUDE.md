# Ghidul studentului USMF

Site gratuit de studiu pentru studenții la medicină (USMF), în **română**. Live: https://sinapsa.onrender.com
Repo: `gradinarucristi23-lgtm/sinapsa` (branch `main`). Render publică automat la fiecare push (1–3 min).
Proprietarul (Cristi) scrie în română; răspunde-i în română, scurt și concret.

## Cum lucrezi eficient (important: limitele de utilizare)
- Citește **doar fișierul** de care e nevoie (vezi harta de mai jos). Folosește Grep pe `public/js/` în loc să citești fișiere întregi.
- **Nu deschide** `public/js/00-date-anatomie.js` (117 KB de date generate).
- Fără capturi de ecran sau verificări vizuale decât dacă se cere sau schimbarea e riscantă. Verifică sintaxa cu `python check.py`.
- După modificare: commit + push (singur, fără să întrebi), apoi verifică `/api/health` → câmpul `commit`.
- Mesajele de commit în română. Nu încărca chei/parole în cod (cheia Gemini și `DATABASE_URL` stau doar în Render, grupul `sinapsa-env`).

## Arhitectură
- `server.py` — server Python fără framework (ThreadingHTTPServer). Proxy către **Google Gemini** (nivel gratuit), streaming NDJSON pe `/api/generate`. Lipește `public/js/*.js` în ordinea numelor și le servește ca **`/app.js`** (un singur script, ordinea contează pentru hoisting). Se ține singur treaz (ping la 10 min). Rute: `/api/health`, `/api/generate`, `/api/kb/*` (biblioteca comună), `/api/auth/*`, `/api/sync/<hist|banks|prog>`, `/api/admin/stats` (doar pentru utilizatorii din `ADMIN_USERS`; contorul AI `GEN` e în memorie).
- `kb.py` — biblioteca comună de explicații (Postgres Neon prin `DATABASE_URL`, altfel SQLite temporar).
- `accounts.py` — conturi (utilizator + parolă PBKDF2, cod de recuperare), sincronizare documente `hist`, `banks`, `prog`.
- `public/index.html` — doar markup-ul (antet, panouri, file). `public/css/app.css` — tot stilul (variabile de culoare în `:root`, mod întunecat cu `data-theme`).

## Harta codului client (`public/js/`)
| Fișier | Conține |
|---|---|
| `01-baza.js` | biblioteci la cerere (`loadScript`, `LIB`), adaptorul AI (`makeSample` → `/api/generate`, `sampleP`), exemplul SRAA, `state`, helpers (`$`, `$$`, `esc`, `md`, `mdi`, `toast`, `saveFile`, `saveDoc`), surse (PDF/DOCX/PPTX), prompturi (`explainPrompt`) |
| `02-explicatie.js` | `callClaude`, `generate()`, mermaid, `renderExplain` |
| `03-studiu.js` | Quiz, Prezentare (.pptx), Flashcards, Caz clinic, Instrumente (High-Yield, mnemonice), glosar, întrebări fulger, imagini Commons (`commonsSearch`) |
| `04-vizual.js` | fila Vizual: poster, diagrame, imagini reale |
| `05-banca-grile.js` | Banca de grile: import, quiz aleatoriu, quiz similar pe 3 niveluri, `shuffleOptions` |
| `06-aplicatie.js` | biblioteca comună (client), `selectTab`, `updateCounts`/`paintTabs`, istoric, temă luminos/întunecat, conturi și sincronizare (`SYNC`, `mergeHist`, `mergeBanks`), fereastra „Cum funcționează” |
| `07-laborator.js` | progres (`PROG`, `progRecord`, `mergeProg`), anatomia 2D cu zone (`ORGANS`, `anatHtml`), Greșeli/Statistici/Materie/Calendar, notițe, timp estimat, text în tabel, tipuri de greșeli, mod examen, panoul „Progresul meu” (`openProg`), calendarul din colț (`paintCalW`) |
| `08-laborator-extra.js` | 3D Sketchfab cu Viewer API (`model3dHtml`, `initM3`), galerii de imagini alese, fereastra imagine mare (`ivOpen`), panoul pe sisteme (`sysPanelHtml`), insight-uri la teme |
| `09-clinic-tutor.js` | Anatomy & Clinical Lab: navigare (`renderLab`), identificarea structurilor, cazuri clinice interactive, semiologie, galerie 3 + „Mai multe”; **AI Tutor** (`renderTutor`, `tutSend`) |
| `10-pornire.js` | pornirea aplicației |
| `00-date-anatomie.js` | date generate: `M3D_FULL`, `SYS3D` (modele 3D + denumiri RO), `CUR_IMG`, `SYS_IMG` (imagini Wikimedia alese) |

Funcțiile sunt suprascrise pe straturi (ex. `renderLab`, `galHtml`, `model3dHtml` redefinite în fișierele ulterioare) — modifică **ultima** definiție (caut-o cu Grep).

## Reguli de conținut
- Proiect **neoficial** (bandeau sus: avertisment + contact Instagram @pregatire.usmf).
- Imagini anatomice: doar surse libere (Wikimedia Commons: OpenStax, Sobotta, Gray), **normale**, umane, fără patologie; legende în română.
- 3D: Sketchfab (furnizor extern, nu construim motor 3D propriu).
- AI: Gemini gratuit; explicațiile din laborator la cerere sunt „Aprofundat”.

## Comenzi
- Rulare locală: `PORT=10011 KEEPALIVE=0 python server.py` (fără cheie Gemini local, AI-ul nu răspunde).
- Verificare sintaxă: `python check.py` (lipește `public/js` și verifică cu quickjs; `pip install quickjs`).
