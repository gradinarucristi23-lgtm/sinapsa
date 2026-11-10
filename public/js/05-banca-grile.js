"use strict";
/* ---------------- BANCA DE GRILE: import, quiz aleatoriu, quiz similar pe 3 niveluri ---------------- */
const BKEY = "ghid.banks.v1";
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const LEVELS = {
  simplu: { nume: "Simplu", desc: "Recunoaștere directă: definiții, clasificări de bază, fapte esențiale. Distractorii sunt clar greșiți pentru cine a citit materia." },
  mediu: { nume: "Mediu", desc: "Înțelegere: mecanisme, comparații, relații cauză-efect, raționament în doi pași. Distractori plauzibili." },
  dificil: { nume: "Dificil", desc: "Aplicare: mini-cazuri clinice, excepții, valori și detalii fine, raționament în mai mulți pași. Distractori foarte apropiați de varianta corectă." }
};
let BANKS = loadBanks();
BANKS.del = BANKS.del || { banks: {}, questions: {} };
function loadBanks(){
  try { const d = JSON.parse(localStorage.getItem(BKEY) || "null"); if (d && Array.isArray(d.banks)) return d; } catch {}
  return { banks: [], current: null };
}
function saveBanks(){
  try { localStorage.setItem(BKEY, JSON.stringify(BANKS)); try { updateCounts(); } catch {} try { schedulePush("banks"); } catch {} return true; }
  catch { toast("Nu mai e spațiu în browser pentru bancă. Exportă banca în .json și șterge una mai veche."); return false; }
}
function curBank(){
  let b = BANKS.banks.find(x => x.id === BANKS.current);
  if (!b && BANKS.banks.length){ b = BANKS.banks[0]; BANKS.current = b.id; }
  return b || null;
}
function newBank(name){
  const b = { id: "b" + Date.now(), name: name || `Banca ${BANKS.banks.length + 1}`, created: Date.now(), questions: [] };
  BANKS.banks.push(b); BANKS.current = b.id; saveBanks(); return b;
}
const normQ = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
function cleanQ(q){
  const variante = {};
  let k = 0;
  for (const L of LETTERS){ const v = q.variante && q.variante[L]; if (v != null && String(v).trim()) variante[LETTERS[k++]] = String(v).trim(); }
  const letters = Object.keys(variante);
  const corecte = [...new Set(arr(q.corecte).map(c => String(c).trim().toUpperCase()).filter(c => letters.includes(c)))].sort();
  let tip = String(q.tip || "").toUpperCase().replace(/[^CSM]/g, "");
  if (tip !== "CS" && tip !== "CM") tip = corecte.length > 1 ? "CM" : corecte.length === 1 ? "CS" : "";
  return { id: q.id || "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), tip, enunt: String(q.enunt || "").trim(), variante, corecte,
    ai: !!q.ai, gen: !!q.gen, nivel: LEVELS[q.nivel] ? q.nivel : "", stats: q.stats || { seen: 0, wrong: 0 }, de_ce: q.de_ce || null, explicatie: q.explicatie || "", nr: q.nr };
}

/* ---- parser exact pentru formatele uzuale ---- */
function parseBank(text){
  const lines = String(text || "").replace(/\r/g, "").replace(/ /g, " ").split("\n");
  const out = [], key = {};
  let q = null, lastOpt = null;
  const reQ = /^\s*(?:\(?\s*(C\.?\s?S|C\.?\s?M)\s*\)?[.:]?\s*)?(\d{1,4})\s*[.)](?:\s+|(?=[A-ZĂÂÎȘȚ„("]))(.*)$/i;
  const reTag = /^\(?\s*(C\.?\s?S|C\.?\s?M)\s*\)?[\s.:\-–]*/i;
  const reOpt = /^\s*([*+])?\s*([A-Fa-f])\s*[.)]\s*([*+])?\s*(.+?)\s*(\*|\(corect[ăa]?\))?\s*$/i;
  const reAns = /^\s*(?:raspuns(?:uri)?(?:\s+corect[e]?)?|rasp\.?|r)\s*[:\-–]\s*([A-Fa-f](?:[\s,;.]*[A-Fa-f])*)\s*\.?\s*$/i;
  const push = () => { if (q && Object.keys(q.variante).length >= 2 && q.enunt) out.push(q); q = null; lastOpt = null; };
  for (const raw of lines){
    const line = raw.trim();
    if (!line || /^\[(pagina|slide) \d+\]$/i.test(line)) continue;
    const pairs = [...line.matchAll(/(\d{1,4})\s*[.)\-–:]?\s*([A-F]{1,5})(?=[\s,;]|$)/g)];
    if (pairs.length >= 2 && pairs.reduce((a, m) => a + m[0].replace(/\s/g, "").length, 0) >= line.replace(/[\s,;]/g, "").length - 1){
      pairs.forEach(m => { key[+m[1]] = m[2].split(""); }); continue;
    }
    let m = reAns.exec(line.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    if (m && q){ q.corecte = m[1].toUpperCase().match(/[A-F]/g); continue; }
    m = reQ.exec(line);
    if (m && /^[A-Fa-f](?:[\s,;]*[A-Fa-f]){0,4}\.?$/.test(m[3].trim())){ key[+m[2]] = m[3].toUpperCase().match(/[A-F]/g); continue; }
    if (m){
      push();
      let rest = m[3], tag = m[1] || "";
      const t = reTag.exec(rest);
      if (t){ tag = t[1]; rest = rest.slice(t[0].length); }
      q = { nr: +m[2], tip: tag ? (/M/i.test(tag) ? "CM" : "CS") : "", enunt: rest.trim(), variante: {}, corecte: [] };
      continue;
    }
    m = reOpt.exec(line);
    if (m && q){
      const L = m[2].toUpperCase(), expected = LETTERS[Object.keys(q.variante).length];
      if (L === expected){
        q.variante[L] = m[4].trim(); lastOpt = L;
        if (m[1] || m[3] || m[5]) q.corecte.push(L);
        continue;
      }
    }
    if (q){
      if (lastOpt) q.variante[lastOpt] += " " + line;
      else q.enunt += " " + line;
    }
  }
  push();
  const nrs = out.map(x => x.nr), unique = new Set(nrs).size === nrs.length;
  if (unique) out.forEach(x => { if (!x.corecte.length && key[x.nr]) x.corecte = key[x.nr]; });
  return out;
}
async function aiParseBank(text, progress){
  const chunks = [];
  let rest = String(text);
  while (rest.length){
    if (rest.length <= 9000){ chunks.push(rest); break; }
    const head = rest.slice(0, 9000);
    let lastQ = -1, mm;
    const reStart = /\n\s*\d{1,4}\s*[.)]\s/g;
    while ((mm = reStart.exec(head))) lastQ = mm.index;
    let cut = lastQ > 3000 ? lastQ : head.lastIndexOf("\n");
    if (cut < 3000) cut = 9000;
    chunks.push(rest.slice(0, cut)); rest = rest.slice(cut);
  }
  const all = [];
  for (let i = 0; i < chunks.length; i++){
    progress && progress(i + 1, chunks.length);
    const list = await callClaude(`Extrage întrebările-grilă din fragmentul de mai jos (bancă de teste a unei facultăți de medicină). Păstrează formularea EXACTĂ a enunțurilor și a variantelor; corectează doar spațiile sau cuvintele rupte de extragerea textului. Nu inventa întrebări, variante sau răspunsuri.
Pentru fiecare întrebare: "nr" = numărul ei din text (sau null), "tip" = "CS" sau "CM" dacă e indicat în text, altfel "", "enunt", "variante" = {"A": "…", "B": "…", …} (dacă variantele nu au litere, atribuie A, B, C, D, E în ordine), "corecte" = literele corecte DOAR dacă sunt indicate în text (marcaj, „Răspuns: …”, cheie de răspunsuri), altfel [].
Ignoră titlurile, numerele de pagină și textul care nu face parte din întrebări. Omite întrebările tăiate la începutul sau la sfârșitul fragmentului.
FORMAT: răspunde doar cu un array JSON: [{"nr": 1, "tip": "CS", "enunt": "…", "variante": {"A": "…", "B": "…"}, "corecte": ["B"]}]

FRAGMENT ${i + 1} din ${chunks.length}:
${chunks[i]}`, { tier: "default", noCache: true });
    arr(Array.isArray(list) ? list : list && list.intrebari).forEach(x => all.push(x));
  }
  const key = {};
  String(text).split("\n").forEach(line => {
    const pairs = [...line.matchAll(/(\d{1,4})\s*[.)\-–:]?\s*([A-F]{1,5})(?=[\s,;]|$)/g)];
    if (pairs.length >= 2) pairs.forEach(m => { key[+m[1]] = m[2].split(""); });
  });
  all.forEach(x => { if (!arr(x.corecte).length && x.nr && key[x.nr]) x.corecte = key[x.nr]; });
  return all;
}
async function fileToText(file){
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const src = { id: "B", name: file.name, images: [], text: "", meta: "" };
  if (ext === "pdf") await extractPdf(file, src);
  else if (ext === "docx") await extractDocx(file, src);
  else if (ext === "pptx") await extractPptx(file, src);
  else src.text = await file.text();
  return src.text || "";
}
function addToBank(list){
  const b = curBank() || newBank("Banca mea");
  const seen = new Set(b.questions.map(q => normQ(q.enunt) + "|" + normQ(Object.values(q.variante)[0])));
  let added = 0, dup = 0;
  for (const raw of list){
    const q = cleanQ(raw);
    if (!q.enunt || Object.keys(q.variante).length < 2) continue;
    const k = normQ(q.enunt) + "|" + normQ(Object.values(q.variante)[0]);
    if (seen.has(k)){ dup++; continue; }
    seen.add(k); b.questions.push(q); added++;
  }
  saveBanks();
  return { added, dup, noAns: b.questions.filter(q => !q.corecte.length).length };
}
async function importBank(){
  if (state.busy) return;
  const fileEl = $("#bkFile"), files = Array.from(fileEl.files || []), pasted = $("#bkText").value;
  if (!files.length && !pasted.trim()){ toast("Lipește întrebările sau alege un fișier"); return; }
  setBusy(true, "Citește întrebările…");
  try {
    let text = pasted, jsonQs = [];
    for (const f of files){
      if (/\.json$/i.test(f.name)){
        try { const d = JSON.parse(await f.text()); jsonQs.push(...arr(d.questions || (d.banks && d.banks.flatMap(b => b.questions)) || d)); } catch { toast(`${f.name} nu este un export valid`); }
      } else text += "\n" + await fileToText(f);
    }
    let parsed = [], how = "";
    if (text.trim()){
      parsed = parseBank(text);
      const good = parsed.length >= 3 && parsed.filter(q => Object.keys(q.variante).length >= 3).length >= parsed.length * 0.7;
      if (good) how = "citite direct din text";
      else {
        if (!text.replace(/\[(pagina|slide) \d+\]/g, "").trim()) throw { code: "no_text" };
        parsed = await aiParseBank(text, (i, n) => { $("#stText").textContent = `AI-ul extrage întrebările: fragmentul ${i} din ${n}…`; });
        how = "extrase cu AI (formularea păstrată)";
      }
    }
    const res = addToBank([...jsonQs, ...parsed]);
    state.bk.msg = `Am adăugat ${res.added} întrebări${how ? `, ${how}` : ""}${res.dup ? `. ${res.dup} duplicate ignorate` : ""}.${res.noAns ? ` ${res.noAns} întrebări din bancă nu au răspuns: le poți completa cu AI.` : ""}`;
    if (!res.added && !res.dup) state.bk.msg = "Nu am găsit întrebări-grilă în text. Verifică dacă fiecare întrebare are variante (A–E).";
    $("#bkText").value = ""; fileEl.value = "";
    renderBank();
  } catch (e){
    if (e && e.code === "no_text") showNotice("Fișierul nu conține text (pare scanat). Folosește un PDF sau DOCX cu text.", "err");
    else if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err");
  } finally { setBusy(false); }
}
async function fillAnswers(){
  const b = curBank(); if (!b || state.busy) return;
  const todo = b.questions.filter(q => !q.corecte.length);
  if (!todo.length){ toast("Toate întrebările au răspuns"); return; }
  setBusy(true, "AI-ul completează răspunsurile…");
  try {
    for (let i = 0; i < todo.length; i += 20){
      $("#stText").textContent = `Completează răspunsurile: ${Math.min(i + 20, todo.length)} din ${todo.length}…`;
      const batch = todo.slice(i, i + 20);
      const r = await callClaude(`Ești examinator de medicină. Pentru fiecare întrebare-grilă de mai jos, indică varianta sau variantele corecte. CS = exact un răspuns corect; CM = între 2 și 4 răspunsuri corecte; dacă tipul lipsește, decide după conținut.
Răspunde doar cu un array JSON: [{"i": 0, "corecte": ["B"], "tip": "CS"}]

${batch.map((q, k) => `${k}. ${q.tip ? "(" + q.tip + ") " : ""}${q.enunt}\n${Object.entries(q.variante).map(([L, v]) => `${L}. ${v}`).join("\n")}`).join("\n\n")}`, { tier: "complex", noCache: true });
      arr(r).forEach(x => {
        const q = batch[+x.i]; if (!q) return;
        const c = arr(x.corecte).map(s => String(s).toUpperCase()).filter(L => q.variante[L]);
        if (c.length){ q.corecte = c.sort(); q.ai = true; if (!q.tip) q.tip = c.length > 1 ? "CM" : "CS"; }
      });
      saveBanks();
    }
    state.bk.msg = "Am completat răspunsurile lipsă. Sunt marcate „răspuns propus de AI”: verifică-le cu cursul.";
    renderBank();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
async function rateLevels(){
  const b = curBank(); if (!b || state.busy) return;
  const todo = b.questions.filter(q => !q.nivel);
  if (!todo.length){ toast("Toate întrebările au deja nivel"); return; }
  setBusy(true, "Estimează nivelul întrebărilor…");
  try {
    for (let i = 0; i < todo.length; i += 40){
      $("#stText").textContent = `Estimează nivelul: ${Math.min(i + 40, todo.length)} din ${todo.length}…`;
      const batch = todo.slice(i, i + 40);
      const r = await callClaude(`Clasifică fiecare întrebare-grilă de medicină pe un nivel de dificultate:
- "simplu": ${LEVELS.simplu.desc}
- "mediu": ${LEVELS.mediu.desc}
- "dificil": ${LEVELS.dificil.desc}
Răspunde doar cu un array JSON: [{"i": 0, "nivel": "mediu"}]

${batch.map((q, k) => `${k}. ${q.enunt} | ${Object.values(q.variante).join(" | ")}`).join("\n")}`, { tier: "default", noCache: true });
      arr(r).forEach(x => { const q = batch[+x.i]; if (q && LEVELS[x.nivel]) q.nivel = x.nivel; });
      saveBanks();
    }
    state.bk.msg = "Am estimat nivelul întrebărilor. Acum poți filtra quiz-ul aleatoriu după nivel.";
    renderBank();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}

/* ---- quiz aleatoriu din bancă ---- */
function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function shuffleOptions(q){
  const old = Object.keys(q.variante), perm = shuffle(old.slice());
  const variante = {}, de_ce = q.de_ce ? {} : null;
  perm.forEach((o, i) => { variante[LETTERS[i]] = q.variante[o]; if (de_ce && q.de_ce[o]) de_ce[LETTERS[i]] = q.de_ce[o]; });
  return Object.assign({}, q, { variante, de_ce, corecte: q.corecte.map(c => LETTERS[perm.indexOf(c)]).sort() });
}
function bankPool(){
  const b = curBank(); if (!b) return [];
  const P = state.bk.prefs;
  return b.questions.filter(q => q.corecte.length && (P.tip === "mixt" || q.tip === P.tip) && (P.nivel === "toate" || q.nivel === P.nivel) && (!P.wrong || q.stats.wrong > 0));
}
function startRandom(){
  const pool = bankPool();
  if (!pool.length){ toast("Nu sunt întrebări cu răspuns pentru filtrele alese"); return; }
  const P = state.bk.prefs, n = P.n === "toate" ? pool.length : Math.min(+P.n, pool.length);
  const list = shuffle(pool.slice()).slice(0, n).map(q => P.mix ? shuffleOptions(q) : Object.assign({}, q));
  state.bk.runner = { list, answers: {}, checked: false, title: `Quiz aleatoriu din „${curBank().name}” · ${list.length} întrebări`, fromBank: true };
  renderBank(); $("#bkRun")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---- quiz nou, similar, pe nivel ---- */
async function genSimilar(){
  const b = curBank(); if (!b || state.busy) return;
  const withAns = b.questions.filter(q => q.corecte.length);
  if (b.questions.length < 3){ toast("Adaugă întâi cel puțin 3 întrebări în bancă"); return; }
  const P = state.bk.prefs, lvl = LEVELS[P.genLevel] || LEVELS.mediu;
  const pool = (withAns.length >= 5 ? withAns : b.questions);
  const sameLvl = pool.filter(q => q.nivel === P.genLevel);
  const ex = shuffle((sameLvl.length >= 8 ? sameLvl : pool).slice()).slice(0, 18);
  const kindLine = P.genTip === "CS" ? "Toate întrebările sunt CS." : P.genTip === "CM" ? "Toate întrebările sunt CM." : "Amestecă aproximativ jumătate CS și jumătate CM.";
  setBusy(true, `Creează un quiz nou, nivel ${lvl.nume.toLowerCase()}…`);
  try {
    const list = await callClaude(`${ROLE}

Ești examinator la USMF „Nicolae Testemițanu”. Mai jos sunt exemple numerotate din banca de grile a studentului. Creează ${P.genN} întrebări NOI, similare cu exemplele.
SIMILARITATE (obligatoriu): fiecare întrebare nouă pornește de la UN exemplu anume și rămâne pe aceeași noțiune sau pe o noțiune vecină din același capitol, întrebând-o din alt unghi (alt detaliu, alt mecanism, altă consecință, altă situație clinică). Nu introduce alte capitole sau alte discipline decât cele din exemple. Nu copia și nu reformula minimal enunțurile din exemple. Câmpul "baza" = numărul exemplului de la care ai pornit; folosește exemple diferite pentru întrebări diferite.
NIVEL: ${lvl.nume.toUpperCase()}. ${lvl.desc}
${kindLine}
- CS (complement simplu): 5 variante A–E, exact un răspuns corect. CM (complement multiplu): 5 variante A–E, între 2 și 4 răspunsuri corecte.
- Fără „toate variantele” sau „niciuna”, fără duble negații, fără ambiguități. Informația trebuie să fie corectă medical.
- Pentru FIECARE variantă, "de_ce" spune de ce este corectă sau greșită.
FORMAT: răspunde doar cu un array JSON:
[{"tip":"CS","enunt":"…","variante":{"A":"…","B":"…","C":"…","D":"…","E":"…"},"corecte":["B"],"de_ce":{"A":"…","B":"…","C":"…","D":"…","E":"…"},"explicatie":"raționamentul pe scurt","tema":"capitolul, 2–4 cuvinte","baza":1}]

EXEMPLE DIN BANCĂ:
${ex.map((q, k) => `${k + 1}. ${q.tip ? "(" + q.tip + ") " : ""}${q.enunt}\n${Object.entries(q.variante).map(([L, v]) => `${L}. ${v}`).join("\n")}${q.corecte.length ? `\nRăspuns: ${q.corecte.join(", ")}` : ""}`).join("\n\n")}`,
      { tier: P.genLevel === "dificil" ? "complex" : "default", noCache: true, progress: ({ text }) => { $("#stSub").textContent = `${(text.match(/"enunt"/g) || []).length} întrebări scrise`; } });
    const qs = arr(list).map(x => cleanQ(Object.assign({}, x, { gen: true, nivel: P.genLevel }))).filter(q => q.enunt && q.corecte.length && Object.keys(q.variante).length >= 3);
    if (!qs.length) throw { code: "invalid_json" };
    state.bk.runner = { list: qs, answers: {}, checked: false, title: `Quiz nou, similar cu banca · nivel ${lvl.nume} · ${qs.length} întrebări`, generated: true, saved: false };
    renderBank(); $("#bkRun")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}

/* ---- rulare quiz (aleatoriu sau generat) ---- */
function checkRunner(){
  const R = state.bk.runner; if (!R) return;
  R.checked = true;
  { const bn = (curBank() && curBank().name) || "Banca de grile"; R.list.forEach((q, i) => progRecord(q, R.answers[i] || [], "bank", { topic: bn, disc: "" })); }
  if (R.fromBank){
    const b = curBank();
    R.list.forEach((q, i) => {
      const orig = b && b.questions.find(x => x.id === q.id); if (!orig) return;
      const ch = (R.answers[i] || []).slice().sort();
      orig.stats.seen++;
      if (!(ch.length === q.corecte.length && ch.every((c, k) => c === q.corecte[k]))) orig.stats.wrong++;
      else if (orig.stats.wrong > 0) orig.stats.wrong--;
    });
    saveBanks();
  }
  renderBank(); $("#bkRun")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function runnerHtml(){
  const R = state.bk.runner; if (!R) return "";
  let score = 0;
  const items = R.list.map((q, i) => {
    const chosen = R.answers[i] || [], ok = chosen.length === q.corecte.length && chosen.every(c => q.corecte.includes(c));
    if (R.checked && ok) score++;
    const opts = Object.keys(q.variante).map(L => {
      const sel = chosen.includes(L), cor = q.corecte.includes(L);
      let cls = sel ? "sel" : "";
      if (R.checked) cls = cor && sel ? "right" : (!cor && sel ? "wrong" : (cor ? "missed" : ""));
      const why = R.checked && q.de_ce && q.de_ce[L] ? `<span class="why">${mdi(q.de_ce[L])}</span>` : "";
      return `<label class="opt ${cls}"><input type="${q.tip === "CM" ? "checkbox" : "radio"}" name="bq${i}" value="${L}" ${sel ? "checked" : ""} ${R.checked ? "disabled" : ""}><span class="L">${L}</span><span>${mdi(q.variante[L])}${why}</span></label>`;
    }).join("");
    return `<li class="qq" data-i="${i}">
      <div class="qq-h"><span class="qq-n">${i + 1}/${R.list.length}</span><span class="qtype ${q.tip === "CM" ? "cm" : ""}">${q.tip || "?"}</span>
        ${q.nivel ? `<span class="badge">${LEVELS[q.nivel].nume}</span>` : ""}${q.ai ? `<span class="badge sample">răspuns propus de AI</span>` : ""}
        ${R.checked ? `<span class="verdict ${ok ? "ok" : "no"}">${ok ? "Corect" : "Greșit"}</span>` : ""}</div>
      <p class="qq-t">${mdi(q.enunt)}</p><div class="opts">${opts}</div>
      ${R.checked ? `<div class="qx"><b>Răspuns: ${q.corecte.join(", ")}</b>${q.explicatie ? "<br>" + mdi(q.explicatie) : ""}</div>` : ""}
    </li>`;
  }).join("");
  const answered = Object.keys(R.answers).filter(k => (R.answers[k] || []).length).length;
  return `<div class="bk-run-h"><h3 class="block-h" style="margin:0">${esc(R.title)}</h3><button class="btn sm" type="button" data-bk="close">Închide quiz-ul</button></div>
    <div class="q-score">${R.checked ? `<span><b>${score}/${R.list.length}</b> &nbsp;răspunsuri complet corecte (${Math.round(score / R.list.length * 100)}%)</span>` : `<span>${answered}/${R.list.length} întrebări răspunse · CS = un răspuns, CM = mai multe</span>`}
      <span class="row">${R.checked ? `<button class="btn sm" type="button" data-bk="retry">Reia</button>${R.list.some((q, i) => { const c = R.answers[i] || []; return !(c.length === q.corecte.length && c.every(x => q.corecte.includes(x))); }) ? `<button class="btn sm" type="button" data-bk="wrongonly">Doar greșelile</button>` : ""}${R.generated && !R.saved ? `<button class="btn sm primary" type="button" data-bk="save">Adaugă întrebările în bancă</button>` : ""}` : `<button class="btn sm primary" type="button" data-bk="check">Verifică răspunsurile</button>`}</span></div>
    <ol class="qs ${R.checked ? "checked" : ""}">${items}</ol>
    ${R.checked ? "" : `<div class="q-foot"><button class="btn primary" type="button" data-bk="check">Verifică răspunsurile</button></div>`}`;
}

/* ---- randare tab ---- */
function renderBank(){
  const p = $("#p-bank"); if (!p) return;
  const b = curBank(), P = state.bk.prefs, qs = b ? b.questions : [];
  const n = { total: qs.length, cs: qs.filter(q => q.tip === "CS").length, cm: qs.filter(q => q.tip === "CM").length, ans: qs.filter(q => q.corecte.length).length, ai: qs.filter(q => q.ai).length, lvl: qs.filter(q => q.nivel).length, wrong: qs.filter(q => q.stats.wrong > 0).length };
  const byLvl = k => qs.filter(q => q.nivel === k && q.corecte.length).length;
  const pool = bankPool().length;
  const search = (state.bk.search || "").trim().toLowerCase();
  const shown = b && state.bk.showList ? qs.filter(q => !search || (q.enunt + " " + Object.values(q.variante).join(" ")).toLowerCase().includes(search)).slice(0, 60) : [];
  p.innerHTML = `
  <section class="tool">
    <div class="tool-h"><div><h3>Banca ta de grile</h3><p class="hint">Pune aici toate întrebările cu variantele lor (și răspunsurile, dacă le ai). Se salvează în acest browser.</p></div></div>
    <div class="row">
      ${BANKS.banks.length ? `<div class="field"><span class="label">Banca</span><select id="bkSel">${BANKS.banks.map(x => `<option value="${x.id}" ${b && x.id === b.id ? "selected" : ""}>${esc(x.name)} (${x.questions.length})</option>`).join("")}</select></div>` : ""}
      <div class="field grow"><span class="label">Bancă nouă</span><input id="bkName" class="vis-in" placeholder="de ex. Fiziologie, modulul 2"></div>
      <button class="btn" type="button" id="bkNew">Creează</button>
      ${b ? `<button class="btn sm dl" type="button" id="bkExport">Exportă .json</button><button class="btn sm" type="button" id="bkDel">Șterge banca</button>` : ""}
    </div>
    <div class="bk-import">
      <textarea id="bkText" rows="7" placeholder="Lipește întrebările, de exemplu:&#10;1. CS. Etapa limitantă a cascadei SRAA este:&#10;A. Conversia Ang I în Ang II&#10;B. Scindarea angiotensinogenului de către renină&#10;C. …&#10;Răspuns: B&#10;&#10;Merg și: variante marcate cu *, sau o cheie de răspunsuri la final (1-B, 2-ACD …)."></textarea>
      <div class="row">
        <label class="btn" for="bkFile">Alege fișiere (PDF, DOCX, TXT, .json)</label><input type="file" id="bkFile" multiple accept=".pdf,.docx,.pptx,.txt,.md,.json" hidden>
        <span class="hint" id="bkFileName"></span><span class="grow"></span>
        <button class="btn primary" type="button" id="bkImport" data-busy>Adaugă în bancă</button>
      </div>
    </div>
    ${state.bk.msg ? `<p class="notice" style="margin:0">${esc(state.bk.msg)}</p>` : ""}
    ${b ? `<div class="bk-stats"><span><b>${n.total}</b> întrebări</span><span><b>${n.cs}</b> CS</span><span><b>${n.cm}</b> CM</span><span><b>${n.ans}</b> cu răspuns</span>${n.total - n.ans ? `<span class="warn"><b>${n.total - n.ans}</b> fără răspuns</span>` : ""}${n.ai ? `<span><b>${n.ai}</b> răspunsuri propuse de AI</span>` : ""}${n.wrong ? `<span><b>${n.wrong}</b> greșite anterior</span>` : ""}</div>
      <div class="row">
        ${n.total - n.ans ? `<button class="btn sm" type="button" id="bkFill" data-busy>Completează răspunsurile lipsă cu AI</button>` : ""}
        ${n.total && n.lvl < n.total ? `<button class="btn sm" type="button" id="bkRate" data-busy>Estimează nivelul întrebărilor (AI)</button>` : ""}
        ${n.total ? `<button class="btn sm" type="button" id="bkList">${state.bk.showList ? "Ascunde întrebările" : "Vezi întrebările"}</button>` : ""}
      </div>` : ""}
    ${state.bk.showList && b ? `<div class="bk-list"><input id="bkSearch" class="vis-in" placeholder="Caută în bancă…" value="${esc(state.bk.search || "")}">
      <ol>${shown.map(q => `<li><div><span class="qtype ${q.tip === "CM" ? "cm" : ""}">${q.tip || "?"}</span>${q.nivel ? ` <span class="badge">${LEVELS[q.nivel].nume}</span>` : ""} ${mdi(q.enunt)}<small>${Object.entries(q.variante).map(([L, v]) => `<span class="${q.corecte.includes(L) ? "ok" : ""}">${L}. ${esc(v)}</span>`).join("")}</small></div><button class="icon-btn" type="button" data-delq="${q.id}" aria-label="Șterge întrebarea"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></li>`).join("")}</ol>
      ${qs.length > shown.length ? `<p class="hint">Se văd primele ${shown.length}. Folosește căutarea ca să găsești alte întrebări.</p>` : ""}</div>` : ""}
  </section>

  ${b && n.total ? `<div class="bk-grid">
  <section class="tool">
    <div class="tool-h"><div><h3>Quiz aleatoriu din bancă</h3><p class="hint">Întrebări alese la întâmplare, cu variantele amestecate.</p></div></div>
    <div class="row vis-row">
      <div class="field"><span class="label">Întrebări</span><select id="bkN">${["10", "20", "30", "50", "toate"].map(v => `<option ${P.n === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="field"><span class="label">Tip</span><select id="bkTip"><option value="mixt">Mixt</option><option value="CS">Doar CS</option><option value="CM">Doar CM</option></select></div>
      <div class="field"><span class="label">Nivel</span><select id="bkNivel"><option value="toate">Toate</option>${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}" ${byLvl(k) ? "" : "disabled"}>${l.nume} (${byLvl(k)})</option>`).join("")}</select></div>
    </div>
    <label class="fc-only"><input type="checkbox" id="bkMix" ${P.mix ? "checked" : ""}> Amestecă variantele de răspuns</label>
    <label class="fc-only"><input type="checkbox" id="bkWrong" ${P.wrong ? "checked" : ""} ${n.wrong ? "" : "disabled"}> Doar întrebările greșite anterior (${n.wrong})</label>
    <div class="row"><span class="hint grow">${pool} întrebări corespund filtrelor${n.lvl ? "" : ". Nivelurile apar după „Estimează nivelul”"}.</span><button class="btn primary" type="button" id="bkStart" ${pool ? "" : "disabled"}>Începe</button></div>
  </section>
  <section class="tool">
    <div class="tool-h"><div><h3>Quiz nou, similar cu banca</h3><p class="hint">AI-ul creează întrebări noi pe aceleași capitole și în același stil, cu explicație pentru fiecare variantă.</p></div></div>
    <div class="seg bk-lvl" role="group" aria-label="Nivel">${Object.entries(LEVELS).map(([k, l]) => `<button type="button" data-lvl="${k}" aria-pressed="${P.genLevel === k}">${l.nume}</button>`).join("")}</div>
    <p class="hint" style="margin:0">${esc(LEVELS[P.genLevel].desc)}</p>
    <div class="row vis-row">
      <div class="field"><span class="label">Întrebări</span><select id="bkGenN">${["5", "10", "15", "20"].map(v => `<option ${String(P.genN) === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="field"><span class="label">Tip</span><select id="bkGenTip"><option value="mixt">Mixt</option><option value="CS">Doar CS</option><option value="CM">Doar CM</option></select></div>
      <span class="grow"></span><button class="btn primary" type="button" id="bkGen" data-busy>Generează quiz-ul</button>
    </div>
  </section></div>` : ""}

  <section id="bkRun" class="bk-run">${runnerHtml()}</section>`;

  /* evenimente */
  $("#bkSel") && ($("#bkSel").onchange = ev => { BANKS.current = ev.target.value; saveBanks(); state.bk.runner = null; state.bk.msg = ""; renderBank(); });
  $("#bkNew").onclick = () => { const nm = $("#bkName").value.trim(); newBank(nm); state.bk.msg = `Am creat banca „${curBank().name}”. Adaugă întrebările mai jos.`; state.bk.runner = null; renderBank(); };
  $("#bkDel") && ($("#bkDel").onclick = () => {
    if (!confirm(`Ștergi banca „${b.name}” cu ${b.questions.length} întrebări? Nu se poate anula.`)) return;
    BANKS.del.banks[b.id] = Date.now(); BANKS.banks = BANKS.banks.filter(x => x.id !== b.id); BANKS.current = BANKS.banks[0] ? BANKS.banks[0].id : null; saveBanks(); state.bk.runner = null; state.bk.msg = "Banca a fost ștearsă."; renderBank();
  });
  $("#bkExport") && ($("#bkExport").onclick = () => saveFile(slug("banca " + b.name) + ".json", JSON.stringify({ app: "Ghidul studentului USMF", name: b.name, questions: b.questions }, null, 1)));
  $("#bkFile").onchange = ev => { const f = Array.from(ev.target.files || []); $("#bkFileName").textContent = f.map(x => x.name).join(", "); };
  $("#bkImport").onclick = importBank;
  $("#bkFill") && ($("#bkFill").onclick = fillAnswers);
  $("#bkRate") && ($("#bkRate").onclick = rateLevels);
  $("#bkList") && ($("#bkList").onclick = () => { state.bk.showList = !state.bk.showList; renderBank(); });
  $("#bkSearch") && ($("#bkSearch").oninput = ev => { state.bk.search = ev.target.value; clearTimeout(renderBank._t); renderBank._t = setTimeout(() => { renderBank(); const s = $("#bkSearch"); if (s){ s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 250); });
  $$("[data-delq]", p).forEach(x => x.onclick = () => { BANKS.del.questions[x.dataset.delq] = Date.now(); b.questions = b.questions.filter(q => q.id !== x.dataset.delq); saveBanks(); renderBank(); });
  if ($("#bkTip")){
    $("#bkTip").value = P.tip; $("#bkNivel").value = P.nivel; $("#bkGenTip").value = P.genTip;
    $("#bkN").onchange = ev => { P.n = ev.target.value; };
    ["bkTip", "bkNivel"].forEach(id => $("#" + id).onchange = ev => { P[id === "bkTip" ? "tip" : "nivel"] = ev.target.value; renderBank(); });
    $("#bkMix").onchange = ev => { P.mix = ev.target.checked; };
    $("#bkWrong").onchange = ev => { P.wrong = ev.target.checked; renderBank(); };
    $("#bkStart").onclick = startRandom;
    $$("[data-lvl]", p).forEach(x => x.onclick = () => { P.genLevel = x.dataset.lvl; renderBank(); });
    $("#bkGenN").onchange = ev => { P.genN = +ev.target.value; };
    $("#bkGenTip").onchange = ev => { P.genTip = ev.target.value; };
    $("#bkGen").onclick = genSimilar;
  }
  const run = $("#bkRun");
  run.addEventListener("change", ev => {
    const li = ev.target.closest(".qq"), R = state.bk.runner; if (!li || !R || R.checked) return;
    const i = +li.dataset.i;
    R.answers[i] = $$("input:checked", li).map(x => x.value);
    $$(".opt", li).forEach(o => o.classList.toggle("sel", $("input", o).checked));
  });
  $$("[data-bk]", run).forEach(x => x.onclick = () => {
    const R = state.bk.runner, a = x.dataset.bk;
    if (a === "check") checkRunner();
    else if (a === "close"){ state.bk.runner = null; renderBank(); }
    else if (a === "retry"){ R.checked = false; R.answers = {}; R.list = R.list.map(q => P.mix && R.fromBank ? shuffleOptions(q) : q); renderBank(); }
    else if (a === "wrongonly"){
      R.list = R.list.filter((q, i) => { const c = R.answers[i] || []; return !(c.length === q.corecte.length && c.every(y => q.corecte.includes(y))); });
      R.checked = false; R.answers = {}; R.title = "Doar întrebările greșite · " + R.list.length; renderBank();
    } else if (a === "save"){ const r = addToBank(R.list); R.saved = true; state.bk.msg = `Am adăugat ${r.added} întrebări noi în bancă.`; renderBank(); }
  });
  if (state.busy) $$("[data-busy]", p).forEach(x => x.disabled = true);
}
