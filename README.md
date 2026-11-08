# Sinapsa: tutore medical pentru studenți

Site care explică teme medicale la nivel simplificat și avansat, cu teorie, practică, schemă vizuală, grilă CS/CM și prezentare .pptx. Funcționează din cursul tău (PDF, DOCX, PPTX, TXT, poze) sau ca motor de căutare.

Oricine deschide linkul îl poate folosi, fără cont. Explicațiile sunt generate de Google Gemini, pe nivelul gratuit.

## Ce conține folderul

| Fișier | Rol |
|---|---|
| `public/index.html` | Site-ul (tot ce vede utilizatorul) |
| `server.py` | Server mic care ține cheia AI ascunsă și trimite cererile la Gemini |
| `requirements.txt` | Gol: serverul nu are nevoie de pachete în plus |

---

## Pasul 1: cheia gratuită Gemini (5 minute)

1. Intră pe **https://aistudio.google.com** și conectează-te cu un cont Google.
2. Apasă **Get API key**, apoi **Create API key**.
3. Copiază cheia (începe de obicei cu `AIza…`) și păstreaz-o pentru Pasul 3.

**Important:**
- **Nu activa facturarea (billing)** pe acel proiect Google și nu adăuga card. Așa nu poți fi taxat niciodată: când se termină limita gratuită, site-ul afișează un mesaj și limita revine a doua zi.
- **Nu pune cheia în niciun fișier** și nu o urca pe GitHub. Ea se pune doar în Render (Pasul 3).

## Pasul 2: codul pe GitHub (5 minute)

1. Fă-ți cont pe **https://github.com**.
2. Apasă **+** (dreapta sus), apoi **New repository**. Nume: `sinapsa`. Lasă-l **Public** și apasă **Create repository**.
3. Pe pagina nouă apasă linkul **uploading an existing file**.
4. Trage în fereastră **conținutul** acestui folder: `server.py`, `requirements.txt`, `README.md` și folderul `public` întreg.
5. Jos apasă **Commit changes**.

Verifică la final că în repository se vede `public/index.html` (în folderul `public`), nu doar `index.html`.

## Pasul 3: site-ul pe Render (5 minute)

1. Intră pe **https://render.com**, apasă **Get Started** și conectează-te **cu contul GitHub**.
2. Apasă **New +**, apoi **Web Service**, și alege repository-ul `sinapsa` (dacă nu apare, apasă **Configure GitHub** și dă acces la el).
3. Completează:
   - **Language:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python server.py`
   - **Instance Type:** **Free**
4. La **Environment Variables** apasă **Add Environment Variable**:
   - **Key:** `GEMINI_API_KEY`
   - **Value:** cheia de la Pasul 1
5. Apasă **Deploy Web Service** și așteaptă 1–3 minute până apare **Live**.

Linkul site-ului apare sus, de forma `https://sinapsa-xxxx.onrender.com`. Pe el îl trimiți oricui.

---

## Ce e bine de știut

- **Pornirea lentă după pauză:** pe planul gratuit, Render oprește serverul după 15 minute fără vizitatori. Prima deschidere după o pauză durează până la aproximativ un minut, apoi merge normal.
- **Limita gratuită e comună:** toți utilizatorii împart limita zilnică a cheii tale. Limitele exacte le vezi în Google AI Studio, la *Rate limits*. Când limita se termină, site-ul afișează un mesaj și limita revine a doua zi. Serverul încearcă automat și alte modele Gemini gratuite înainte să renunțe.
- **Protecție anti-abuz:** fiecare vizitator poate trimite cel mult 40 de cereri pe oră. Poți schimba numărul din Render cu variabila `RATE_PER_HOUR`.
- **Confidențialitate:** pe nivelul gratuit, Google poate folosi conținutul trimis pentru a-și îmbunătăți serviciile. Nu încărca documente cu date care identifică pacienți.
- **Istoricul** fiecărui utilizator rămâne doar în browserul lui.

## Modificări ulterioare

Când schimbi un fișier pe GitHub (de exemplu `public/index.html`), Render publică automat versiunea nouă în 1–2 minute.

### Setări opționale (variabile de mediu în Render)

| Variabilă | Implicit | Rol |
|---|---|---|
| `RATE_PER_HOUR` | `40` | Cereri permise pe oră pentru fiecare vizitator |
| `MODELS_DEFAULT` | `gemini-flash-latest,gemini-2.5-flash,…` | Modelele încercate, în ordine, la profunzimea *Standard* |
| `MODELS_QUICK` | `gemini-flash-lite-latest,…` | Modelele pentru *Rapid* |
| `MODELS_COMPLEX` | `gemini-2.5-pro,gemini-flash-latest,…` | Modelele pentru *Aprofundat* |
| `MAX_OUTPUT_TOKENS` | `32768` | Lungimea maximă a unui răspuns |

## Rulare pe calculator (opțional)

Ai nevoie de Python 3.9 sau mai nou. În PowerShell, din acest folder:

```powershell
$env:GEMINI_API_KEY = "cheia-ta"
python server.py
```

Apoi deschide http://localhost:10000
