"use strict";
/* ---------------- BIBLIOTECA COMUNĂ (bază de date pe server) ---------------- */
const KB = { on: false, kind: "", count: 0, items: [], q: "" };
async function kbFetch(path, opts){
  const r = await fetch("/api/kb/" + path, opts);
  if (!r.ok) throw new Error("kb " + r.status);
  return r.json();
}
async function kbInit(){
  try {
    const s = await kbFetch("status");
    KB.on = !!s.enabled; KB.kind = s.kind; KB.count = s.count;
  } catch { KB.on = false; }
  $("#kbPanel").hidden = true; // panoul e ascuns; biblioteca lucrează doar în fundal
  if (KB.on) kbList();
}
async function kbList(){
  const q = KB.q.trim();
  try {
    const d = q ? await kbFetch("search?n=10&q=" + encodeURIComponent(q)) : await kbFetch("recent?n=12");
    KB.items = d.items || [];
  } catch { KB.items = []; }
  kbRender();
}
function kbRender(){
  $("#kbCount").textContent = KB.count ? `${KB.count} ${KB.count === 1 ? "temă" : "teme"}` : "goală";
  $("#kbNote").textContent = KB.kind === "temporar"
    ? "Biblioteca e temporară până se configurează baza de date: se golește când serverul repornește."
    : (KB.count ? "" : "Temele explicate în modul Motor de căutare apar aici, pentru toți.");
  $("#kbList").innerHTML = KB.items.map(e => `<li><button class="h-open" type="button" data-kb="${esc(e.id)}"><span class="h-t">${esc(e.titlu)}</span><span class="h-m">${esc(e.disciplina || "")}${e.slides ? " · cu prezentare" : ""}${e.uses === 1 ? " · deschisă o dată" : e.uses > 1 ? ` · deschisă de ${e.uses} ori` : ""}</span></button></li>`).join("")
    || (KB.q ? `<li class="hint" style="padding:6px 2px">Nimic găsit pentru „${esc(KB.q)}”.</li>` : "");
}
async function kbSearch(q, n){
  if (!KB.on || !q) return [];
  try { return (await kbFetch("search?n=" + (n || 4) + "&q=" + encodeURIComponent(q))).items || []; } catch { return []; }
}
async function kbContext(hits, excludeTitle){
  const parts = [];
  for (const h of hits){
    if (excludeTitle && normQ(h.titlu) === normQ(excludeTitle)) continue;
    try {
      const d = await kbFetch("get?ctx=1&id=" + encodeURIComponent(h.id));
      const r = d.result;
      const secs = arr(r.sectiuni).map(s => `- ${s.titlu}: ${String(s.avansat || s.simplu || "").replace(/\s+/g, " ").slice(0, 600)}`).join("\n");
      parts.push(`### ${r.titlu} (${r.disciplina || ""})\n${r.rezumat || ""}\n${secs}`.slice(0, 4000));
    } catch {}
    if (parts.length >= 2) break;
  }
  if (!parts.length) return "";
  return `BAZA DE CUNOȘTINȚE A SITE-ULUI (explicații salvate anterior pe teme apropiate). Folosește-le pentru consecvență (aceeași terminologie, aceleași valori și clasificări) și ca să faci legături între teme; nu le copia. Dacă observi în ele o informație greșită, nu o prelua.\n\n${parts.join("\n\n")}`;
}
async function kbSave(result, query){
  if (!KB.on) return;
  try {
    const d = await kbFetch("save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ result, query }) });
    if (d && d.ok){ KB.count = d.count; toast("Salvată în biblioteca comună"); if (!KB.q) kbList(); else kbRender(); }
  } catch {}
}
async function kbSaveSlides(){
  if (!KB.on || !state.result || !state.meta || state.meta.mode !== "general") return;
  try { await kbFetch("slides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titlu: state.result.titlu, slides: state.slides.list }) }); if (!KB.q) kbList(); } catch {}
}
/* golește tot ce ținea de tema anterioară (quiz, prezentare, flashcards, caz, instrumente, vizual) */
function resetTopicExtras(slides){
  state.histId = null; state.exportSvg = null; state.exportFor = null;
  state.quiz = { list: [], answers: {}, checked: false };
  state.slides = { list: arr(slides), idx: 0 };
  state.flash = emptyFlash(); state.caz = emptyCaz(); state.tools.hy = null; state.vis = emptyVis();
}
/* numerele dintr-un text (doze, valori, criterii): reformularea nu are voie să le schimbe */
function numsOf(o){ return (JSON.stringify(o).match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(",", ".")); }
function sameNumbers(a, b){
  const A = new Set(numsOf(a)), B = numsOf(b), Bs = new Set(B);
  if (B.some(x => !A.has(x))) return false;
  let kept = 0; A.forEach(x => { if (Bs.has(x)) kept++; });
  return !A.size || kept / A.size >= 0.9;
}
async function kbOpen(id){
  if (state.busy) return;
  try {
    const d = await kbFetch("get?id=" + encodeURIComponent(id));
    state.result = d.result;
    state.meta = { mode: "general", query: d.query || "", sample: false, date: d.updated || Date.now(), sources: [], fromKb: true };
    state.ctx = null; state.lastReq = null;
    resetTopicExtras(d.slides);
    saveHistory(); showNotice("");
    renderAll(); selectTab("explicatie");
    $(".work").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch { toast("Tema nu a putut fi deschisă din bibliotecă"); }
}
/* Tema există deja în bibliotecă: pornim de la ea și o reformulăm cu modelul rapid (mai ieftin decât o explicație de la zero).
   Dacă AI-ul nu răspunde (limită, rețea), deschidem varianta salvată, ca studentul să aibă oricum explicația. */
function kbRewordPrompt(src){
  return `Mai jos este o explicație medicală pentru studenți, în format JSON. Rescrie-o în limba română CU ALTE CUVINTE: reformulează frazele, schimbă topica și legăturile dintre idei, poți alege alte exemple clinice echivalente, ca textul să nu fie identic cu originalul.
Reguli stricte:
- Păstrează EXACT aceeași structură JSON: aceleași chei, același număr de secțiuni și de elemente în fiecare listă, aceleași valori pentru câmpurile de tip/categorie.
- Păstrează toate faptele: valori, doze, criterii, clasificări, eponime și termenii medicali consacrați. Nu adăuga și nu elimina informații.
- Păstrează marcajele speciale din text (de ex. {+ +}, [S1 p.4], **…**) și formatul markdown.
Răspunde doar cu JSON-ul rescris.

JSON:
${JSON.stringify(src)}`;
}
async function kbReword(top, req){
  setBusy(true, "Caută în biblioteca comună…");
  let d = null;
  try { d = await kbFetch("get?id=" + encodeURIComponent(top.id)); } catch {}
  if (!d || !d.result || !Array.isArray(d.result.sectiuni)){ setBusy(false); state.kbSkip = true; return generate(); }
  showNotice(""); selectTab("explicatie");
  const base = d.result, src = Object.assign({}, base); delete src.schema;
  const liveMeta = { mode: "general", query: req.query, sample: false, sources: [], fromKb: true, reworded: true };
  $("#stText").textContent = "Reformulează explicația din bibliotecă…";
  let r = null, lastDraw = 0;
  try {
    r = await callClaude(kbRewordPrompt(src), { tier: "quick", noCache: true, progress: ({ text }) => {
      $("#stSub").textContent = `${fmt(text.length)} caractere`;
      const now = Date.now(); if (now - lastDraw < 300) return; lastDraw = now;
      const part = partialJSON(text);
      if (part && (part.titlu || part.rezumat)) renderExplain({ partial: Object.assign(part, { schema: base.schema }), meta: liveMeta, schemaDone: true });
    } });
    if (!r || typeof r !== "object" || !Array.isArray(r.sectiuni) || r.sectiuni.length < Math.ceil(base.sectiuni.length * 0.7)) r = null;
    else if (!sameNumbers(src, Object.assign({}, r, { schema: undefined }))) r = null; // a schimbat o valoare: păstrăm originalul
  } catch (e){
    if (e && e.code === "cancelled"){ setBusy(false); renderExplain(); showNotice(""); return; }
    r = null;
  }
  const reworded = !!r;
  if (r){ if (base.schema !== undefined) r.schema = base.schema; } else r = base;
  state.lastReq = req; state.ctx = req.ctx;
  state.result = r;
  state.meta = { mode: "general", query: req.query || d.query || "", sample: false, date: Date.now(), sources: [], fromKb: true, reworded };
  resetTopicExtras(d.slides);
  saveHistory(); renderAll(); selectTab("explicatie");
  setBusy(false);
  const n = $("#notice");
  n.className = "notice kb-hit"; n.hidden = false;
  n.innerHTML = `<span>${reworded ? "Tema exista deja în biblioteca comună, așa că ți-am pregătit-o mai repede, reformulată." : "Tema exista deja în biblioteca comună. Vezi explicația salvată (reformularea n-a fost posibilă acum)."}</span>
    <span class="row"><button class="btn sm" type="button" id="kbHitNew">Generează una de la zero</button></span>`;
  $("#kbHitNew").onclick = () => { showNotice(""); state.kbSkip = true; generate(); };
  if (req.intent === "examen") await genQuiz();
  else if (req.intent === "prezentare" && !state.slides.list.length) await genSlides();
}
$("#kbList").addEventListener("click", ev => { const b = ev.target.closest("[data-kb]"); if (b) kbOpen(b.dataset.kb); });
$("#kbQ").addEventListener("input", ev => { KB.q = ev.target.value; clearTimeout(kbList._t); kbList._t = setTimeout(kbList, 250); });
kbInit();

/* ---------------- tabs & counts ---------------- */
function selectTab(t){
  state.tab = t;
  $$(".tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  ["explicatie", "vis", "quiz", "bank", "lab", "tutor", "flash", "caz", "prezentare", "tools"].forEach(k => $("#p-" + k).hidden = k !== t);
  if (t === "tutor") renderTutor();
  if (t === "lab") renderLab();
  $$(".tab").forEach(b => { const n = $(".n", b); b.classList.toggle("zero", !!n && n.textContent === "0" && b.dataset.tab !== t); });
  if (t === "bank") renderBank();
  if (t === "tools") renderTools();
  if (t === "vis") renderVis();
  hideTip(); hideDefBtn();
}
$$(".tab").forEach(b => b.onclick = () => selectTab(b.dataset.tab));
function updateCounts(){ $("#nQuiz").textContent = state.quiz.list.length; $("#nSlides").textContent = state.slides.list.length; $("#nFlash").textContent = state.flash.list.length; const bb = curBank(); $("#nBank").textContent = bb ? bb.questions.length : 0; paintTabs(); }
function paintTabs(){
  const has = !!state.result;
  $$(".tab").forEach(b => {
    const k = b.dataset.tab;
    b.hidden = !has && k !== "explicatie" && k !== "bank" && k !== "lab" && k !== "tutor";
    const n = $(".n", b);
    b.classList.toggle("zero", !!n && n.textContent === "0" && b.getAttribute("aria-selected") !== "true");
  });
  if (!has && state.tab && state.tab !== "explicatie" && state.tab !== "bank" && state.tab !== "lab" && state.tab !== "tutor") selectTab("explicatie");
}
function renderAll(){ renderExplain(); renderQuiz(); renderSlides(); renderFlash(); renderCaz(); renderTools(); renderVis(); updateCounts(); }

/* ---------------- history (this browser only) ---------------- */
const HKEY = "sinapsa.hist.v1";
function readHist(){ try { return JSON.parse(localStorage.getItem(HKEY) || "[]") || []; } catch { return []; } }
function writeHist(h){ try { localStorage.setItem(HKEY, JSON.stringify(h)); } catch { try { localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 5))); } catch {} } try { schedulePush("hist"); } catch {} }
function saveHistory(){
  if (!state.result || (state.meta && state.meta.sample)) return;
  const h = readHist();
  if (!state.histId){ state.histId = "h" + Date.now(); state.ctxHist = state.histId; }
  const entry = { id: state.histId, result: state.result, meta: state.meta, quiz: state.quiz.list, slides: state.slides.list, flash: state.flash.list, caz: state.caz.data };
  const i = h.findIndex(x => x.id === state.histId);
  if (i >= 0) h[i] = entry; else h.unshift(entry);
  writeHist(h.slice(0, 15)); renderHist();
}
function renderHist(){
  const h = readHist();
  $("#histEmpty").hidden = h.length > 0;
  $("#hist").innerHTML = h.map(x => `<li><button class="h-open" type="button" data-id="${x.id}"><span class="h-t">${esc(stripMarks(x.result && x.result.titlu))}</span><span class="h-m">${esc(MODE_LABEL[x.meta && x.meta.mode] || "")} · ${new Date((x.meta && x.meta.date) || Date.now()).toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}${x.quiz && x.quiz.length ? " · grilă" : ""}${x.slides && x.slides.length ? " · slide-uri" : ""}</span></button><button class="icon-btn" type="button" data-del="${x.id}" aria-label="Șterge din istoric"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></li>`).join("");
}
$("#hist").addEventListener("click", ev => {
  const del = ev.target.closest("[data-del]");
  if (del){ tombHist(del.dataset.del); writeHist(readHist().filter(x => x.id !== del.dataset.del)); renderHist(); return; }
  const b = ev.target.closest(".h-open"); if (!b || state.busy) return;
  const x = readHist().find(e => e.id === b.dataset.id); if (!x) return;
  state.result = x.result; state.meta = x.meta; state.histId = x.id;
  state.quiz = { list: arr(x.quiz), answers: {}, checked: false };
  state.slides = { list: arr(x.slides), idx: 0 };
  state.flash = Object.assign(emptyFlash(), { list: arr(x.flash) });
  state.caz = Object.assign(emptyCaz(), { data: x.caz || null });
  state.tools.hy = null; state.vis = emptyVis();
  state.exportSvg = null; state.exportFor = null;
  renderAll(); selectTab("explicatie");
  $(".work").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------------- mod luminos / întunecat ---------------- */
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
function effectiveTheme(){
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "light" || t === "dark") return t;
  try { return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { return "light"; }
}
function paintThemeBtn(){
  const dark = effectiveTheme() === "dark", b = $("#themeBtn");
  b.innerHTML = dark ? ICON_SUN + "<span>Mod luminos</span>" : ICON_MOON + "<span>Mod întunecat</span>";
  b.setAttribute("aria-label", dark ? "Treci pe modul luminos" : "Treci pe modul întunecat");
  b.title = b.getAttribute("aria-label");
}
$("#themeBtn").onclick = () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("ghid.theme", next); } catch {}
  paintThemeBtn();
};
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintThemeBtn); } catch {}
paintThemeBtn();

/* ---------------- CONTURI ȘI SINCRONIZARE ---------------- */
const SYNC = { enabled: false, reason: "", user: null, last: 0, lastPull: 0, timers: {}, msg: "", pulling: false, view: "login", recovery: "", error: "" };
const HDEL = "ghid.hist.del";
function trimTomb(d){ return Object.fromEntries(Object.entries(d || {}).sort((a, b) => b[1] - a[1]).slice(0, 500)); }
function readHistDel(){ try { return JSON.parse(localStorage.getItem(HDEL) || "{}") || {}; } catch { return {}; } }
function writeHistDel(d){ try { localStorage.setItem(HDEL, JSON.stringify(trimTomb(d))); } catch {} }
function tombHist(id){ const d = readHistDel(); d[id] = Date.now(); writeHistDel(d); }
const entryWeight = x => arr(x.quiz).length + arr(x.slides).length + arr(x.flash).length + (x.caz ? 1 : 0);
function mergeHist(localItems, localDel, remote){
  const del = Object.assign({}, (remote && remote.del) || {}, localDel || {});
  const map = new Map();
  for (const x of [...arr(remote && remote.items), ...arr(localItems)]){
    if (!x || !x.id || del[x.id]) continue;
    const prev = map.get(x.id);
    if (!prev || entryWeight(x) >= entryWeight(prev)) map.set(x.id, x);
  }
  const items = [...map.values()].sort((a, b) => ((b.meta && b.meta.date) || 0) - ((a.meta && a.meta.date) || 0)).slice(0, 15);
  return { items, del: trimTomb(del) };
}
function mergeBanks(local, remote){
  const ld = (local && local.del) || {}, rd = (remote && remote.del) || {};
  const del = { banks: Object.assign({}, rd.banks, ld.banks), questions: Object.assign({}, rd.questions, ld.questions) };
  const byId = new Map();
  for (const b of [...arr(remote && remote.banks), ...arr(local && local.banks)]){
    if (!b || !b.id || del.banks[b.id]) continue;
    const cur = byId.get(b.id);
    const qs = arr(b.questions).filter(q => q && q.id && !del.questions[q.id]);
    if (!cur){ byId.set(b.id, Object.assign({}, b, { questions: qs })); continue; }
    const qmap = new Map(cur.questions.map(q => [q.id, q]));
    for (const q of qs){
      const p = qmap.get(q.id);
      if (!p || ((q.stats && q.stats.seen) || 0) >= ((p.stats && p.stats.seen) || 0)) qmap.set(q.id, q);
    }
    cur.questions = [...qmap.values()];
    if (b.name) cur.name = b.name;
  }
  const banks = [...byId.values()].sort((a, b) => (a.created || 0) - (b.created || 0));
  const current = local && local.current && byId.has(local.current) ? local.current : (banks[0] ? banks[0].id : null);
  return { banks, current, del: { banks: trimTomb(del.banks), questions: trimTomb(del.questions) } };
}
async function api(path, opts){
  const r = await fetch(path, Object.assign({ credentials: "same-origin" }, opts || {}));
  let d = {}; try { d = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(d.message || ("HTTP " + r.status)), { status: r.status, data: d });
  return d;
}
const postJSON = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

async function acctInit(){
  try { const d = await api("/api/auth/me"); SYNC.enabled = !!d.enabled; SYNC.reason = d.reason || ""; SYNC.user = d.user || null; } catch {}
  paintAcct();
  if (SYNC.user) syncPull();
}
async function syncPull(){
  if (!SYNC.user || SYNC.pulling) return;
  SYNC.pulling = true; SYNC.msg = "Se sincronizează…"; paintAcct();
  try {
    const d = await api("/api/sync");
    const docs = d.docs || {};
    const rh = docs.hist ? JSON.parse(docs.hist.data) : null;
    const mh = mergeHist(readHist(), readHistDel(), rh);
    writeHist(mh.items); writeHistDel(mh.del);
    const rb = docs.banks ? JSON.parse(docs.banks.data) : null;
    BANKS = mergeBanks(BANKS, rb); saveBanks();
    const rp = docs.prog ? JSON.parse(docs.prog.data) : null;
    PROG = mergeProg(PROG, rp); saveProg(); renderLab();
    renderHist(); if (state.tab === "bank") renderBank(); updateCounts();
    SYNC.pulling = false; SYNC.lastPull = Date.now();
    await syncPush("hist"); await syncPush("banks"); await syncPush("prog");
  } catch (e){
    if (e.status === 401){ SYNC.user = null; }
    SYNC.msg = e.status === 401 ? "Sesiunea a expirat. Intră din nou în cont." : "Sincronizarea a eșuat. Încearcă din nou.";
  } finally { SYNC.pulling = false; paintAcct(); }
}
function schedulePush(key){
  if (!SYNC.user || SYNC.pulling) return;
  clearTimeout(SYNC.timers[key]);
  SYNC.timers[key] = setTimeout(() => syncPush(key), 2500);
}
async function syncPush(key){
  if (!SYNC.user) return;
  const data = key === "hist" ? JSON.stringify({ items: readHist(), del: readHistDel() }) : key === "prog" ? JSON.stringify(PROG) : JSON.stringify(BANKS);
  try {
    await api("/api/sync/" + key, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
    SYNC.last = Date.now(); SYNC.msg = "";
  } catch (e){
    if (e.status === 401) SYNC.user = null;
    SYNC.msg = e.status === 401 ? "Sesiunea a expirat. Intră din nou în cont." : (e.data && e.data.message) || "Fără conexiune: datele se trimit la următoarea modificare.";
  }
  paintAcct();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && SYNC.user && Date.now() - SYNC.lastPull > 60000) syncPull(); });

/* ---- interfață ---- */
const ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4.1-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/></svg>';
const acctOv = document.createElement("div"); acctOv.className = "acct-ov"; acctOv.hidden = true; document.body.appendChild(acctOv);
function ago(t){ const s = Math.round((Date.now() - t) / 1000); return s < 60 ? "acum câteva secunde" : s < 3600 ? `acum ${Math.round(s / 60)} min` : `acum ${Math.round(s / 3600)} h`; }
function paintAcct(){
  const b = $("#acctBtn");
  b.innerHTML = ICON_USER + `<span>${SYNC.user ? esc(SYNC.user.username) : "Intră în cont"}</span>`;
  b.classList.toggle("on", !!SYNC.user);
  b.setAttribute("aria-label", SYNC.user ? `Contul ${SYNC.user.username}` : "Intră în cont");
  if (!acctOv.hidden) renderAcct();
}
function openAcct(){ SYNC.error = ""; acctOv.hidden = false; renderAcct(); setTimeout(() => { const f = acctOv.querySelector("input"); if (f) f.focus(); }, 30); }
function closeAcct(){ acctOv.hidden = true; SYNC.recovery = ""; }
function renderAcct(){
  let body;
  if (!SYNC.enabled){
    body = `<h2>Conturi</h2><p>Conturile nu sunt pornite încă: ${esc(SYNC.reason || "serverul nu le are configurate")}.</p><p class="hint">Până atunci, istoricul și băncile de grile rămân salvate în acest browser.</p>`;
  } else if (SYNC.recovery){
    body = `<h2>Păstrează codul de recuperare</h2>
      <p>E singura cale de a-ți schimba parola dacă o uiți (contul nu folosește email). Notează-l sau fă-i o captură de ecran.</p>
      <div class="rec-code">${esc(SYNC.recovery)}</div>
      <div class="row"><button class="btn sm" type="button" id="recCopy">Copiază codul</button><span class="grow"></span><button class="btn primary" type="button" id="recDone">L-am salvat</button></div>`;
  } else if (SYNC.user){
    body = `<h2>Contul tău</h2>
      <p>Ești conectat ca <b>${esc(SYNC.user.username)}</b>. Istoricul, băncile de grile și greșelile tale se sincronizează pe toate dispozitivele unde intri în cont.</p>
      <p class="hint">${SYNC.msg ? esc(SYNC.msg) : SYNC.last ? "Sincronizat " + ago(SYNC.last) + "." : "Încă nesincronizat."}</p>
      <div class="row"><button class="btn sm" type="button" id="acSync">Sincronizează acum</button><button class="btn sm" type="button" id="acOut">Ieși din cont</button></div>
      <details class="ac-more"><summary>Mai multe opțiuni</summary>
        <div class="row"><button class="btn sm" type="button" id="acOutClear">Ieși și șterge datele de pe acest dispozitiv</button><button class="btn sm danger" type="button" id="acDel">Șterge contul</button></div>
        <p class="hint">„Șterge contul” elimină definitiv contul și datele sincronizate de pe server. Datele din acest browser rămân.</p>
      </details>`;
  } else {
    const v = SYNC.view;
    body = `<h2>${v === "register" ? "Cont nou" : v === "recover" ? "Am uitat parola" : "Intră în cont"}</h2>
      <p class="hint">${v === "register" ? "Fără email: alegi un nume de utilizator și o parolă. Datele pe care le ai deja în acest browser se adaugă în cont." : v === "recover" ? "Folosește codul de recuperare primit la crearea contului." : "Istoricul, băncile de grile și greșelile tale, pe orice dispozitiv."}</p>
      <form id="acForm" class="ac-form" novalidate>
        <label for="acUser">Nume de utilizator</label>
        <input id="acUser" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="de ex. ion.popescu">
        ${v === "recover" ? `<label for="acCode">Cod de recuperare</label><input id="acCode" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" required>` : ""}
        <label for="acPass">${v === "recover" ? "Parola nouă" : "Parola"}</label>
        <input id="acPass" type="password" autocomplete="${v === "login" ? "current-password" : "new-password"}" required minlength="8" placeholder="${v === "login" ? "" : "cel puțin 8 caractere"}">
        ${SYNC.error ? `<p class="ac-err" role="alert">${esc(SYNC.error)}</p>` : ""}
        <button class="btn primary" type="submit" id="acSubmit">${v === "register" ? "Creează contul" : v === "recover" ? "Schimbă parola" : "Intră"}</button>
      </form>
      <div class="ac-links">
        ${v !== "login" ? `<button class="linkbtn" type="button" data-view="login">Am deja cont</button>` : `<button class="linkbtn" type="button" data-view="register">Nu ai cont? Creează unul</button>`}
        ${v !== "recover" ? `<button class="linkbtn" type="button" data-view="recover">Am uitat parola</button>` : ""}
      </div>`;
  }
  acctOv.innerHTML = `<div class="acct-box" role="dialog" aria-modal="true" aria-label="Cont"><button class="icon-btn ac-x" type="button" id="acClose" aria-label="Închide"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>${body}</div>`;
  $("#acClose").onclick = closeAcct;
  $$("[data-view]", acctOv).forEach(x => x.onclick = () => { SYNC.view = x.dataset.view; SYNC.error = ""; renderAcct(); });
  const form = $("#acForm");
  if (form) form.onsubmit = async ev => {
    ev.preventDefault();
    const btn = $("#acSubmit"); btn.disabled = true;
    const v = SYNC.view, username = $("#acUser").value.trim(), password = $("#acPass").value;
    try {
      const d = await postJSON(v === "register" ? "/api/auth/register" : v === "recover" ? "/api/auth/recover" : "/api/auth/login",
        v === "recover" ? { username, password, code: $("#acCode").value } : { username, password });
      SYNC.user = d.user; SYNC.error = ""; SYNC.recovery = d.recovery || "";
      if (!SYNC.recovery) closeAcct();
      paintAcct(); toast(v === "register" ? "Cont creat" : "Ai intrat în cont");
      syncPull();
    } catch (e){ SYNC.error = e.message || "Nu a mers. Încearcă din nou."; renderAcct(); }
  };
  $("#recCopy") && ($("#recCopy").onclick = () => copyText(SYNC.recovery));
  $("#recDone") && ($("#recDone").onclick = () => { SYNC.recovery = ""; closeAcct(); });
  $("#acSync") && ($("#acSync").onclick = () => syncPull());
  const logout = async clear => {
    try { await postJSON("/api/auth/logout"); } catch {}
    SYNC.user = null; SYNC.last = 0; SYNC.msg = "";
    if (clear){
      try { [HKEY, HDEL, BKEY, PKEY].forEach(k => localStorage.removeItem(k)); } catch {}
      PROG = emptyProg(); renderLab();
      BANKS = { banks: [], current: null, del: { banks: {}, questions: {} } };
      renderHist(); if (state.tab === "bank") renderBank(); updateCounts();
    }
    closeAcct(); paintAcct(); toast(clear ? "Ai ieșit din cont și datele locale au fost șterse" : "Ai ieșit din cont");
  };
  $("#acOut") && ($("#acOut").onclick = () => logout(false));
  $("#acOutClear") && ($("#acOutClear").onclick = () => logout(true));
  $("#acDel") && ($("#acDel").onclick = async () => {
    if (!confirm(`Ștergi definitiv contul „${SYNC.user.username}” și datele lui de pe server?`)) return;
    try { await postJSON("/api/auth/delete"); SYNC.user = null; closeAcct(); paintAcct(); toast("Contul a fost șters"); }
    catch (e){ toast(e.message || "Contul nu a putut fi șters"); }
  });
}
acctOv.addEventListener("click", ev => { if (ev.target === acctOv) closeAcct(); });
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !acctOv.hidden) closeAcct(); });
$("#acctBtn").onclick = openAcct;
acctInit();


/* ---------------- ghid pentru începători ---------------- */
const helpOv = document.createElement("div"); helpOv.className = "acct-ov"; helpOv.hidden = true; document.body.appendChild(helpOv);
helpOv.innerHTML = `<div class="acct-box help-box" role="dialog" aria-modal="true" aria-labelledby="helpT">
  <button class="icon-btn ac-x" type="button" data-hclose aria-label="Închide"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
  <h2 id="helpT">Cum funcționează</h2>
  <p>Ghidul îți explică orice temă de medicină pe două niveluri: <b>simplificat</b>, ca să înțelegi ideea, și <b>avansat</b>, cum se cere la examen.</p>
  <ol class="steps">
    <li><b>Scrie tema</b> și apasă <b>Explică</b>. Primele părți apar după câteva secunde.</li>
    <li><b>Cu cursul tău</b>: adaugă fișierul în panoul Surse. Alegi apoi <b>Exclusiv din sursă</b> (doar ce scrie în curs) sau <b>Combinat</b> (cursul plus explicații în plus, marcate cu roz).</li>
    <li><b>Exersează</b> cu filele de sub căsuță:</li>
  </ol>
  <dl class="help-tabs">
    <dt>Vizual</dt><dd>poster, scheme și imagini reale pentru temă</dd>
    <dt>Quiz</dt><dd>grilă CS/CM cu explicație la fiecare variantă</dd>
    <dt>Banca de grile</dt><dd>pui grilele tale de examen; ghidul le amestecă și face altele asemănătoare, pe 3 niveluri</dd>
    <dt>Anatomie și clinică</dt><dd>anatomie 3D cu denumiri în română (și mod „testează-te”), histologie, imagistică, identificarea structurilor, cazuri clinice interactive și semiologie</dd>
    <dt>Tutorele AI</dt><dd>vorbești cu tutorele: te ascultă, îți explică, discută un caz sau o imagine</dd>
    <dt>Progresul meu</dt><dd>butonul de sus: cartonașele de repetat azi, greșelile de revizuit, statistici, materia parcursă, notițe și, dacă ai cont, calendarul examenelor</dd>
    <dt>Flashcards</dt><dd>carduri de repetat, exportabile în Anki</dd>
    <dt>Caz clinic</dt><dd>un pacient ipotetic, rezolvat pas cu pas</dd>
    <dt>Prezentare</dt><dd>slide-uri gata de descărcat în PowerPoint</dd>
    <dt>Instrumente</dt><dd>rezumat High-Yield, mnemonice, explicarea unei imagini</dd>
  </dl>
  <p class="hint">Cu un cont (butonul „Intră în cont”), istoricul, grilele și progresul tău apar pe orice dispozitiv. Contul e opțional.</p>
  <p class="hint">Ai o întrebare? Scrie-ne pe Instagram: <a href="https://www.instagram.com/pregatire.usmf/" target="_blank" rel="noopener" class="ig"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/></svg>@pregatire.usmf</a></p>
  <div class="row"><span class="grow"></span><button class="btn primary" type="button" data-hclose>Am înțeles</button></div>
</div>`;
$("#helpBtn").onclick = () => { helpOv.hidden = false; setTimeout(() => $("[data-hclose].btn", helpOv).focus(), 30); };
helpOv.addEventListener("click", ev => { if (ev.target === helpOv || ev.target.closest("[data-hclose]")) helpOv.hidden = true; });
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !helpOv.hidden) helpOv.hidden = true; });
setInterval(() => { const w = $("#histWhere"); if (w) w.textContent = (typeof SYNC !== "undefined" && SYNC.user) ? "sincronizat cu contul" : "pe acest dispozitiv"; }, 1500);
