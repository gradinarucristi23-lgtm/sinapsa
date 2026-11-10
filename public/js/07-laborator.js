"use strict";
/* ---------------- Simulation Lab: anatomie, greșeli, statistici, materie, calendar ---------------- */
const PKEY = "ghid.prog.v1", LOGCAP = 3000, DAY = 86400000;
function emptyProg(){ return { log: [], wrong: [], syl: [], exams: [], notes: [], del: { wrong: {}, syl: {}, exams: {} } }; }
function normProg(p){
  p = p && typeof p === "object" ? p : {};
  const d = p.del || {};
  return { log: arr(p.log), wrong: arr(p.wrong), syl: arr(p.syl), exams: arr(p.exams), notes: arr(p.notes), del: { wrong: Object.assign({}, d.wrong), syl: Object.assign({}, d.syl), exams: Object.assign({}, d.exams) } };
}
function loadProg(){ try { return normProg(JSON.parse(localStorage.getItem(PKEY) || "null")); } catch { return emptyProg(); } }
let PROG = loadProg();
function saveProg(){ try { localStorage.setItem(PKEY, JSON.stringify(PROG)); } catch {} try { schedulePush("prog"); } catch {} try { paintCalW(); paintProgBtn(); } catch {} }
function mergeProg(l, r){
  l = normProg(l); r = normProg(r);
  const del = { wrong: trimTomb(Object.assign({}, r.del.wrong, l.del.wrong)), syl: trimTomb(Object.assign({}, r.del.syl, l.del.syl)), exams: trimTomb(Object.assign({}, r.del.exams, l.del.exams)) };
  const byU = (A, B, d) => {
    const m = new Map();
    for (const x of [...A, ...B]){
      if (!x || !x.id || (d && d[x.id])) continue;
      const p = m.get(x.id);
      if (!p || (x.u || x.t || 0) >= (p.u || p.t || 0)) m.set(x.id, x);
    }
    return [...m.values()];
  };
  return { log: byU(r.log, l.log).sort((a, b) => a.t - b.t).slice(-LOGCAP), wrong: byU(r.wrong, l.wrong, del.wrong), syl: byU(r.syl, l.syl, del.syl), exams: byU(r.exams, l.exams, del.exams), notes: byU(r.notes, l.notes), del };
}

/* ---- potrivirea temelor ---- */
function nrm(s){ return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
const LAB_STOP = new Set(["pentru", "despre", "care", "este", "sunt", "prin", "dintre", "asupra", "intre", "notiuni", "generale", "principii", "aspecte"]);
const stemCache = new Map();
function stemsOf(s){
  const key = String(s || "");
  if (stemCache.has(key)) return stemCache.get(key);
  const out = new Set(nrm(stripMarks(key)).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !LAB_STOP.has(w)).map(w => w.slice(0, 5)));
  if (stemCache.size > 4000) stemCache.clear();
  stemCache.set(key, out); return out;
}
function topicSim(item, other){
  const a = stemsOf(item), b = stemsOf(other);
  if (!a.size || !b.size) return 0;
  let n = 0; a.forEach(x => { if (b.has(x)) n++; });
  return n / a.size;
}
function topicStatsFor(titlu){
  let n = 0, ok = 0;
  for (const e of PROG.log) if (e.topic && topicSim(titlu, e.topic) >= 0.6){ n++; if (e.ok) ok++; }
  return { n, ok };
}

/* ---- înregistrarea răspunsurilor ---- */
function qKey(q){
  const s = nrm(q.enunt).replace(/\s+/g, " ").trim();
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return "w" + h.toString(36) + s.length.toString(36);
}
function sameAns(ch, cor){ ch = arr(ch).slice().sort(); cor = arr(cor).slice().sort(); return ch.length === cor.length && ch.every((c, k) => c === cor[k]); }
function curTopicCtx(){ const r = state.result; return { topic: stripMarks((r && r.titlu) || ""), disc: (r && r.disciplina) || "" }; }
function fqToQ(f){
  const v = {}; arr(f.variante).forEach((x, k) => { v[LETTERS[k]] = x; });
  const c = Math.max(0, Math.min(arr(f.variante).length - 1, Number(f.corect) || 0));
  return { enunt: f.intrebare, tip: "CS", variante: v, corecte: [LETTERS[c]], explicatie: f.explicatie || "" };
}
function progRecord(q, chosen, src, ctx){
  if (!q || !q.enunt || !arr(chosen).length || !arr(q.corecte).length) return null;
  ctx = ctx || {};
  const ok = sameAns(chosen, q.corecte), now = Date.now();
  PROG.log.push(Object.assign({ id: "l" + now.toString(36) + Math.random().toString(36).slice(2, 7), t: now, src, topic: ctx.topic || "", disc: ctx.disc || "", ok }, ok ? {} : { ty: errType(q, chosen) }));
  if (PROG.log.length > LOGCAP) PROG.log = PROG.log.slice(-LOGCAP);
  const id = ctx.wid || qKey(q);
  let w = PROG.wrong.find(x => x.id === id);
  if (!ok){
    const qq = { enunt: q.enunt, tip: q.tip || (arr(q.corecte).length > 1 ? "CM" : "CS"), variante: q.variante, corecte: arr(q.corecte), explicatie: q.explicatie || "", de_ce: q.de_ce || null };
    if (!w){ w = { id, q: qq, topic: ctx.topic || "", disc: ctx.disc || "", src, t: now, n: 0, okRun: 0, rez: 0 }; PROG.wrong.push(w); }
    w.n = (w.n || 0) + 1; w.okRun = 0; w.rez = 0; w.u = now; w.last = arr(chosen); w.lastTxt = arr(chosen).map(L => (q.variante || {})[L]).filter(Boolean);
    delete PROG.del.wrong[id];
  } else if (w && !w.rez){
    w.okRun = (w.okRun || 0) + 1; w.u = now;
    if (w.okRun >= 2) w.rez = now;
  }
  if (PROG.wrong.length > 600){
    const open = PROG.wrong.filter(x => !x.rez), done = PROG.wrong.filter(x => x.rez).sort((a, b) => b.rez - a.rez);
    PROG.wrong = open.slice(-600).concat(done).slice(0, 600);
  }
  saveProg();
  return ok;
}

/* ---- zile, serie, recapitulare spațiată ---- */
function noon(t){ const d = new Date(t); d.setHours(12, 0, 0, 0); return d.getTime(); }
function addDays(t, n){ const d = new Date(t); d.setDate(d.getDate() + n); return noon(d.getTime()); }
function dayKey(t){ const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function parseDay(s){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : NaN; }
function activeDays(){
  const s = new Set(PROG.log.map(e => dayKey(e.t)));
  readHist().forEach(h => { if (h.meta && h.meta.date) s.add(dayKey(h.meta.date)); });
  return s;
}
function streak(){
  const s = activeDays(); let t = noon(Date.now()), n = 0;
  if (!s.has(dayKey(t))) t = addDays(t, -1);
  while (s.has(dayKey(t))){ n++; t = addDays(t, -1); }
  return n;
}
const REV_GAP = [0, 2, 6];
function dueAt(w){ return (w.u || w.t || 0) + REV_GAP[Math.min(w.okRun || 0, 2)] * DAY; }
function openWrong(){ return PROG.wrong.filter(w => !w.rez && w.q && w.q.enunt); }
function dueWrong(){ const lim = Date.now() + 3600000; return openWrong().filter(w => dueAt(w) <= lim).sort((a, b) => (b.n - a.n) || ((a.u || 0) - (b.u || 0))); }
function aggBy(keyFn, entries){
  const m = new Map();
  for (const e of entries){ const k = keyFn(e); if (!k) continue; const a = m.get(k) || { k, n: 0, ok: 0, last: 0 }; a.n++; if (e.ok) a.ok++; a.last = Math.max(a.last, e.t || 0); m.set(k, a); }
  return [...m.values()];
}
const SRC_LABEL = { quiz: "Quiz", bank: "Banca de grile", fulger: "Întrebări fulger", revizuire: "Revizuire" };
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

/* ---- starea filei ---- */
function labState(){ if (!state.lab) state.lab = { view: "anat", organ: null, sys: "toate", rev: null }; return state.lab; }
function labExplain(q, disc, deep){
  if (state.busy){ toast("Așteaptă să se termine explicația curentă"); return; }
  closeProg();
  $("#q").value = q;
  if (disc && DISCIPLINES.includes(disc)) $("#disc").value = disc;
  if (deep) $("#depth").value = "complex";
  selectTab("explicatie");
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("#go").click();
}

/* ---- anatomie interactivă ---- */
const SYS = {
  nervos: { nume: "Nervos", c: "c1" }, cardio: { nume: "Cardiovascular", c: "eosin" }, respirator: { nume: "Respirator", c: "c2" },
  digestiv: { nume: "Digestiv", c: "c4" }, urinar: { nume: "Urinar", c: "c3" }, endocrin: { nume: "Endocrin", c: "c5" },
  hemato: { nume: "Hemato-imun", c: "hema" }, locomotor: { nume: "Locomotor", c: "warn" }
};
const ANAT_CAT = { "3d": "3D", anat: "Anatomie", hist: "Histologie", imag: "Imagistică" };
/* ordinea contează: organele de la final stau deasupra celor de la început */
const ORGANS = [
  { id: "muschi", nume: "Mușchii membrului superior", sis: "locomotor", hs: '<path d="M190 540 Q240 505 300 520 L300 900 Q240 960 175 940 Q170 720 190 540 Z"/>', img: { anat: "muscles of the upper limb anatomy", hist: "skeletal muscle histology", imag: "MRI arm muscles" }, teme: ["Mușchii brațului și antebrațului", "Fiziologia contracției musculare", "Miastenia gravis", "Miopatiile"], cuv: ["muschi", "muscul", "miasten", "miopat", "contracti"] },
  { id: "vase", nume: "Vasele membrului superior", sis: "cardio", hs: '<path d="M690 570 L760 580 Q800 760 830 990 L760 1000 Q720 800 690 570 Z"/>', img: { anat: "arteries of the upper limb", hist: "artery vein histology", imag: "angiography upper limb" }, teme: ["Arterele membrului superior", "Sistemul venos și întoarcerea venoasă", "Tromboza venoasă profundă", "Reglarea tensiunii arteriale"], cuv: ["arter", "venoas", "vascul", "trombo", "tensiun"] },
  { id: "ganglioni", nume: "Ganglionii limfatici", sis: "hemato", hs: '<ellipse cx="410" cy="420" rx="16" ry="70"/><ellipse cx="556" cy="420" rx="16" ry="70"/><ellipse cx="712" cy="690" rx="50" ry="60"/>', img: { anat: "lymph nodes of the neck anatomy", hist: "lymph node histology", imag: "lymph node ultrasound" }, teme: ["Sistemul limfatic: anatomie și funcții", "Răspunsul imun în ganglionul limfatic", "Limfadenopatia: diagnostic diferențial", "Limfoamele Hodgkin și non-Hodgkin"], cuv: ["ganglion", "limf", "adenopat"] },
  { id: "plamani", nume: "Plămânii", sis: "respirator", hs: '<path d="M330 560 Q360 520 430 530 L425 800 Q390 880 330 880 Q300 760 330 560 Z"/><path d="M545 530 Q620 520 655 570 Q680 760 650 880 Q590 880 560 820 L545 600 Z"/>', img: { anat: "lungs anatomy anterior view", hist: "lung histology alveoli", imag: "normal chest radiograph" }, teme: ["Mecanica ventilației pulmonare", "Schimbul de gaze alveolo-capilar", "Pneumonia comunitară", "BPOC și astmul bronșic"], cuv: ["plaman", "pulmon", "pneum", "respir", "astm", "bpoc", "ventil"] },
  { id: "inima", nume: "Inima", sis: "cardio", hs: '<path d="M420 560 Q470 545 540 575 Q575 640 565 720 Q540 790 470 800 Q420 780 405 720 Q395 630 420 560 Z"/>', img: { anat: "Gray internal structure of heart", hist: "cardiac muscle histology", imag: "echocardiography four chamber view" }, teme: ["Ciclul cardiac", "Mecanismul Frank–Starling", "Insuficiența cardiacă", "Infarctul miocardic acut"], cuv: ["inim", "cardi", "miocard", "coronar", "frank", "valv", "aritm"] },
  { id: "trahee", nume: "Laringele și traheea", sis: "respirator", hs: '<path d="M458 262 L510 262 L512 420 L456 420 Z"/>', img: { anat: "larynx trachea anatomy", hist: "trachea histology", imag: "larynx laryngoscopy" }, teme: ["Anatomia laringelui și a traheei", "Clearance-ul mucociliar și tusea", "Laringita și epiglotita"], cuv: ["trahe", "laring", "epiglot"] },
  { id: "tiroida", nume: "Tiroida", sis: "endocrin", hs: '<ellipse cx="484" cy="446" rx="42" ry="26"/>', img: { anat: "thyroid gland anatomy", hist: "thyroid histology follicles", imag: "thyroid ultrasound" }, teme: ["Fiziologia hormonilor tiroidieni", "Hipotiroidismul", "Hipertiroidismul și boala Graves", "Nodulul tiroidian"], cuv: ["tiroid", "graves", "hashimoto"] },
  { id: "creier", nume: "Creierul", sis: "nervos", hs: '<ellipse cx="483" cy="148" rx="102" ry="82"/>', img: { anat: "human brain anatomy lateral view", hist: "cerebral cortex histology", imag: "MRI brain normal axial" }, teme: ["Anatomia emisferelor cerebrale", "Circulația cerebrală și poligonul Willis", "Accidentul vascular cerebral", "Sindromul de hipertensiune intracraniană"], cuv: ["creier", "cerebr", "encefal", "cortex", "avc", "willis"] },
  { id: "colon", nume: "Colonul", sis: "digestiv", line: true, hs: '<path d="M345 1205 Q318 1100 335 1040 Q345 1000 380 1000 L590 990 Q640 1000 648 1050 Q660 1120 640 1200 Q600 1235 560 1225"/>', img: { anat: "large intestine colon anatomy", hist: "colon histology", imag: "colonoscopy normal colon" }, teme: ["Anatomia colonului", "Bolile inflamatorii intestinale", "Cancerul colorectal", "Apendicita acută"], cuv: ["colon", "colorect", "rect", "apendic", "crohn"] },
  { id: "intestin", nume: "Intestinul subțire", sis: "digestiv", hs: '<ellipse cx="485" cy="1110" rx="105" ry="68"/>', img: { anat: "small intestine anatomy", hist: "small intestine villi histology", imag: "small bowel follow through" }, teme: ["Digestia și absorbția nutrienților", "Boala celiacă", "Ocluzia intestinală"], cuv: ["intestin", "duoden", "jejun", "celiac", "absorb", "ocluz"] },
  { id: "aorta", nume: "Aorta abdominală", sis: "cardio", hs: '<path d="M470 985 L500 985 L502 1130 L468 1130 Z"/>', img: { anat: "abdominal aorta branches anatomy", hist: "aorta histology elastic", imag: "CT angiography abdominal aorta" }, teme: ["Ramurile aortei abdominale", "Anevrismul de aortă abdominală", "Ateroscleroza"], cuv: ["aort", "anevrism", "ateroscl"] },
  { id: "ficat", nume: "Ficatul", sis: "digestiv", hs: '<path d="M305 820 Q370 800 445 830 Q440 880 425 900 L385 900 L380 965 Q350 985 320 960 Q298 900 305 820 Z"/>', img: { anat: "anatomy of liver and gall bladder", hist: "liver lobule histology", imag: "liver CT scan" }, teme: ["Anatomia și vascularizația ficatului", "Metabolismul bilirubinei", "Ciroza hepatică", "Hepatitele virale"], cuv: ["ficat", "hepat", "ciroz", "bilirub", "icter"] },
  { id: "stomac", nume: "Stomacul", sis: "digestiv", hs: '<path d="M548 790 Q610 770 650 820 Q660 870 630 890 Q590 880 560 870 Q545 835 548 790 Z"/>', img: { anat: "stomach anatomy regions", hist: "gastric mucosa histology", imag: "gastroscopy stomach" }, teme: ["Secreția gastrică și reglarea ei", "Boala ulceroasă", "Infecția cu Helicobacter pylori", "Hemoragia digestivă superioară"], cuv: ["stomac", "gastr", "ulcer", "pylori"] },
  { id: "pancreas", nume: "Pancreasul", sis: "endocrin", hs: '<path d="M432 900 Q470 880 560 880 Q630 895 640 930 Q620 980 540 985 Q460 990 432 960 Z"/>', img: { anat: "pancreas anatomy duodenum", hist: "pancreas histology islets of Langerhans", imag: "pancreas CT" }, teme: ["Pancreasul endocrin și insulina", "Diabetul zaharat tip 1 și tip 2", "Pancreatita acută", "Secreția pancreatică exocrină"], cuv: ["pancrea", "insulin", "diabet", "glicem"] },
  { id: "biliara", nume: "Vezica biliară", sis: "digestiv", hs: '<path d="M388 950 Q392 905 440 895 Q438 940 410 965 Q392 968 388 950 Z"/>', img: { anat: "gallbladder biliary tree anatomy", hist: "gallbladder histology", imag: "gallbladder ultrasound gallstones" }, teme: ["Fiziologia secreției biliare", "Litiaza biliară", "Colecistita acută"], cuv: ["biliar", "colecist"] },
  { id: "rinichi", nume: "Rinichii", sis: "urinar", hs: '<ellipse cx="358" cy="1012" rx="32" ry="54"/><ellipse cx="612" cy="1000" rx="30" ry="50"/>', img: { anat: "kidney section vertical", hist: "kidney glomerulus histology", imag: "kidney ultrasound" }, teme: ["Filtrarea glomerulară", "Sistemul renină–angiotensină–aldosteron", "Sindromul nefrotic vs nefritic", "Insuficiența renală acută"], cuv: ["rinich", "renal", "nefr", "glomer", "renin"] },
  { id: "vezica", nume: "Vezica urinară", sis: "urinar", hs: '<ellipse cx="482" cy="1268" rx="62" ry="46"/>', img: { anat: "urinary bladder anatomy", hist: "urinary bladder transitional epithelium histology", imag: "bladder ultrasound" }, teme: ["Fiziologia micțiunii", "Infecțiile tractului urinar", "Litiaza urinară"], cuv: ["vezic", "mictiun", "urinar", "cistit", "litiaz"] },
  { id: "splina", nume: "Splina", sis: "hemato", hs: "", img: { anat: "spleen anatomy", hist: "spleen histology white pulp", imag: "spleen ultrasound" }, teme: ["Anatomia și funcțiile splinei", "Splenomegalia", "Hipersplenismul"], cuv: ["splin", "splen"] },
  { id: "suprarenale", nume: "Glandele suprarenale", sis: "endocrin", hs: "", img: { anat: "adrenal gland anatomy", hist: "adrenal cortex histology zones", imag: "adrenal CT" }, teme: ["Hormonii corticosuprarenalei", "Sindromul Cushing", "Insuficiența corticosuprarenală (boala Addison)", "Feocromocitomul"], cuv: ["suprarenal", "cortizol", "cushing", "addison", "aldoster", "feocrom"] },
  { id: "maduva", nume: "Măduva spinării", sis: "nervos", hs: "", img: { anat: "spinal cord cross section anatomy", hist: "spinal cord histology", imag: "MRI spine sagittal" }, teme: ["Anatomia măduvei spinării", "Căile ascendente și descendente ale măduvei", "Sindroamele medulare"], cuv: ["maduv", "medular", "spinal"] }
];
function organStudied(o){
  const texts = readHist().map(h => nrm(stripMarks(h.result && h.result.titlu))).concat(PROG.log.map(e => nrm(e.topic)));
  return new Set(texts.filter(t => t && o.cuv.some(c => t.includes(c)))).size;
}
const ORGAN_EN = { muschi: "biceps brachii", vase: "brachial artery", ganglioni: "lymph node", plamani: "human lung", inima: "human heart", trahee: "trachea", tiroida: "thyroid gland", creier: "human brain", colon: "colon", intestin: "small intestine", aorta: "abdominal aorta", ficat: "human liver", stomac: "human stomach", pancreas: "pancreas", biliara: "gallbladder", rinichi: "human kidney", vezica: "urinary bladder", splina: "spleen", suprarenale: "adrenal gland", maduva: "spinal cord" };
const GAL = new Map();
function galKey(o){ return o.id + ":" + (labState().galCat || "anat"); }
function loadGal(o){
  const cat = labState().galCat || "anat", key = o.id + ":" + cat;
  if (GAL.has(key)) return;
  GAL.set(key, "loading");
  const extra = `${ORGAN_EN[o.id] || ""} ${{ anat: "anatomy", hist: "histology micrograph", imag: "radiology" }[cat]}`.trim();
  Promise.all([commonsSearch(o.img[cat]).catch(() => []), commonsSearch(extra).catch(() => [])]).then(([a, b]) => {
    const seen = new Set(), out = [];
    for (const c of [...a, ...b]) if (!seen.has(c.thumb)){ seen.add(c.thumb); out.push(c); }
    GAL.set(key, out.slice(0, 9));
  }).catch(() => GAL.set(key, [])).finally(() => {
    const g = $("#anatGal"), L = labState();
    if (g && L.organ === o.id && (L.galCat || "anat") === cat) g.innerHTML = galHtml(o);
  });
}
function galHtml(o){
  if ((labState().galCat || "3d") === "3d") return model3dHtml(o.id);
  const st = GAL.get(galKey(o));
  if (!st){ loadGal(o); return `<p class="hint">Se caută imagini reale pe Wikimedia Commons…</p>`; }
  if (st === "loading") return `<p class="hint">Se caută imagini reale pe Wikimedia Commons…</p>`;
  if (!st.length) return `<p class="hint">Nu am găsit imagini potrivite. Încearcă altă categorie sau fila Vizual.</p>`;
  return `<div class="gal-grid">${st.map((c, i) => `<button type="button" class="gal-it" data-act="gal-open" data-i="${i}" title="${esc(c.title)}"><img src="${esc(c.thumb)}" alt="${esc(c.title)}" loading="lazy"></button>`).join("")}</div><p class="hint">Apasă pe o imagine ca s-o vezi mare și s-o explice ghidul.</p>`;
}
function anatHtml(){
  const L = labState(), sel = ORGANS.find(o => o.id === L.organ);
  if (!L.galCat) L.galCat = "3d";
  const studied = new Map(ORGANS.map(o => [o.id, organStudied(o)]));
  const hs = ORGANS.filter(o => o.hs).map(o => `<g class="hs${o.line ? " line" : ""}${studied.get(o.id) ? " done" : ""}${sel && sel.id === o.id ? " sel" : ""}${L.sys !== "toate" ? (o.sis !== L.sys ? " hide" : " sysv") : ""}" data-org="${o.id}" data-name="${esc(o.nume)}" style="--oc:var(--${SYS[o.sis].c})" tabindex="0" role="button" aria-label="${esc(o.nume)}"><title>${esc(o.nume)}</title>${o.hs}</g>`).join("");
  const nDone = [...studied.values()].filter(Boolean).length;
  const chips = `<div class="sys-chips"><button type="button" class="chip${L.sys === "toate" ? " on" : ""}" data-sys="toate">Toate</button>${Object.entries(SYS).map(([k, s]) => `<button type="button" class="chip${L.sys === k ? " on" : ""}" data-sys="${k}" style="--oc:var(--${s.c})"><i class="dot"></i>${s.nume}</button>`).join("")}</div>`;
  const fig = `<div class="anat-fig real${L.outl === false ? "" : " outl"}${L.sys !== "toate" ? " sys-on" : ""}"><div class="anat-stage">
      <img src="/anatomie-corp.webp" alt="Ilustrație anatomică a corpului uman cu organele interne" width="960" height="1332">
      <svg viewBox="0 0 960 1332" role="group" aria-label="Organe pe care poți apăsa">${hs}</svg><span class="hs-name" id="hsName" hidden></span></div>
    <div class="fig-foot"><label class="fig-tg"><input type="checkbox" data-act="outl"${L.outl === false ? "" : " checked"}> Arată contururile</label><span class="fig-credit">Ilustrație: Mikael Häggström, după Gray's Anatomy (CC0)</span></div></div>`;
  const list = `<ul class="org-list">${ORGANS.map(o => `<li><button type="button" class="linkbtn${sel && sel.id === o.id ? " on" : ""}" data-org="${o.id}"><i class="dot" style="--oc:var(--${SYS[o.sis].c})"></i>${esc(o.nume)}${studied.get(o.id) ? ` <span class="ok-mark" title="studiat">✓</span>` : ""}</button></li>`).join("")}</ul>`;
  const info = sel ? `<div class="org-info" style="--oc:var(--${SYS[sel.sis].c})">
      <span class="org-sys"><i class="dot"></i>Sistemul ${SYS[sel.sis].nume.toLowerCase()}</span>
      <h3>${esc(sel.nume)}</h3>
      <div class="seg gal-tabs">${Object.entries(ANAT_CAT).map(([k, t]) => `<button type="button" data-act="gal-cat" data-cat="${k}" aria-pressed="${L.galCat === k}">${t}</button>`).join("")}</div>
      <div id="anatGal">${galHtml(sel)}</div>
      <h4 class="org-h4">Teme de studiu</h4>
      <p class="hint">${studied.get(sel.id) ? `Ai lucrat deja ${studied.get(sel.id)} ${studied.get(sel.id) === 1 ? "temă legată" : "teme legate"} de acest organ.` : "Încă nu ai studiat nicio temă legată de acest organ."} Apasă pe o temă pentru un insight scurt. Explicația completă, detaliată, o ceri doar dacă vrei.</p>
      <div class="org-topics">${sel.teme.map(t => `<div class="org-ti"><button type="button" class="org-t" data-act="insight" data-q="${esc(t)}" aria-expanded="false"><span>${esc(t)}</span><span class="ins-ic">${ICON_BULB} Insight</span></button><div class="ins" hidden></div></div>`).join("")}</div>
      <div class="row org-own"><input class="vis-in grow" id="orgQ" placeholder="Altă temă despre ${esc(sel.nume.toLowerCase())}…"><button class="btn sm" type="button" data-act="org-ins">Insight</button></div><div class="ins" id="orgOwnIns" hidden></div>
      <details class="org-more"><summary>Toate organele</summary>${list}</details>
    </div>`
    : L.sys !== "toate" ? sysPanelHtml(L.sys) : `<div class="org-info empty"><h3>Corpul uman în 3D</h3>${model3dHtml("corp")}<h4 class="org-h4">Apasă pe un organ</h4><p class="hint">Îl vezi în 3D și în imagini reale (anatomie, histologie, imagistică) și alegi o temă de studiu. Organele marcate cu ✓ sunt cele pe care le-ai studiat deja (${nDone} din ${ORGANS.length}). Splina, suprarenalele și măduva nu se văd în desen: le găsești în listă.</p>${list}</div>`;
  return `${chips}<div class="anat">${fig}${info}</div>`;
}
/* fereastra cu imaginea mare */
const imgOv = document.createElement("div"); imgOv.className = "acct-ov img-ov"; imgOv.hidden = true; document.body.appendChild(imgOv);
function openGalImg(i){
  const L = labState(), o = ORGANS.find(x => x.id === L.organ), list = o && GAL.get(galKey(o));
  if (!Array.isArray(list) || !list[i]) return;
  L.galSel = i;
  const c = list[i], exp = imgExpCache.get(c.thumb);
  imgOv.innerHTML = `<div class="acct-box img-box-lg" role="dialog" aria-modal="true" aria-label="${esc(c.title)}">
    <button class="icon-btn ac-x" type="button" data-iv="close" aria-label="Închide"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
    <div class="iv-img"><img src="${esc(c.thumb)}" alt="${esc(c.title)}"></div>
    <p class="iv-cap"><b>${esc(c.title)}</b><span>${c.author ? esc(c.author) + " · " : ""}${c.license ? esc(c.license) + " · " : ""}<a href="${esc(c.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></span></p>
    <div class="row"><button class="btn" type="button" data-iv="prev" ${i ? "" : "disabled"}>← Anterioara</button><button class="btn" type="button" data-iv="next" ${i < list.length - 1 ? "" : "disabled"}>Următoarea →</button><span class="grow"></span><button class="btn primary" type="button" data-iv="explain">Explică imaginea</button></div>
    <div class="iv-exp prose" id="ivExp"${exp ? "" : " hidden"}>${exp ? md(exp) : ""}</div></div>`;
  imgOv.hidden = false;
}
async function explainOrganImg(btn){
  const L = labState(), o = ORGANS.find(x => x.id === L.organ), list = o && GAL.get(galKey(o)), c = Array.isArray(list) && list[L.galSel];
  if (!c) return;
  const out = $("#ivExp"); out.hidden = false;
  if (imgExpCache.has(c.thumb)){ out.innerHTML = md(imgExpCache.get(c.thumb)); return; }
  btn.disabled = true; out.innerHTML = `<p class="hint">Se analizează imaginea…</p>`;
  try {
    const blob = await (await fetch(c.thumb)).blob();
    const s = await sampleP;
    const { text } = await s(`Ești tutore de medicină pentru studenți. Imaginea atașată („${c.title}”, de pe Wikimedia Commons) ilustrează: ${o.nume} (${ANAT_CAT[L.galCat || "anat"].toLowerCase()}).
Explică în limba română ce se vede: tipul imaginii (desen anatomic, preparat histologic, imagistică), structurile și etichetele (tradu-le în română), ce e important pentru examen și o greșeală frecventă de interpretare. 120–200 de cuvinte, markdown simplu (un paragraf scurt și o listă). Dacă imaginea nu arată organul, spune asta într-o propoziție.`, { modelTier: "default", images: [blob], onText: ({ text }) => { out.innerHTML = md(text); } });
    imgExpCache.set(c.thumb, text); out.innerHTML = md(text);
  } catch (e){ out.innerHTML = `<p class="hint">${esc(e && e.code ? errCopy(e) : "Imaginea nu a putut fi pregătită pentru analiză. Încearcă alta.")}</p>`; }
  finally { btn.disabled = false; }
}
imgOv.addEventListener("click", ev => {
  if (ev.target === imgOv){ imgOv.hidden = true; return; }
  const b = ev.target.closest("[data-iv]"); if (!b) return;
  const L = labState(), a = b.dataset.iv;
  if (a === "close") imgOv.hidden = true;
  else if (a === "prev") openGalImg(L.galSel - 1);
  else if (a === "next") openGalImg(L.galSel + 1);
  else if (a === "explain") explainOrganImg(b);
});
document.addEventListener("keydown", ev => {
  if (imgOv.hidden) return;
  if (ev.key === "Escape") imgOv.hidden = true;
  else if (ev.key === "ArrowRight") openGalImg(labState().galSel + 1);
  else if (ev.key === "ArrowLeft") openGalImg(labState().galSel - 1);
});

/* ---- revizuirea greșelilor ---- */
function revHtml(){
  const L = labState();
  if (L.rev) return revRunHtml();
  const open = openWrong(), due = dueWrong();
  if (!open.length) return `<div class="placeholder"><h3>Nicio greșeală de revizuit</h3><p>Greșelile din Quiz, Banca de grile și întrebările fulger apar aici automat. O întrebare iese din listă după ce îi răspunzi corect de 2 ori, la câteva zile distanță.</p></div>`;
  const groups = aggBy(w => w.topic || "Fără temă", open.map(w => ({ topic: w.topic, t: w.u, ok: false }))).sort((a, b) => b.n - a.n);
  return `<div class="lab-kpis"><div class="kpi"><b>${due.length}</b><span>de revizuit acum</span></div><div class="kpi"><b>${open.length}</b><span>greșeli active</span></div><div class="kpi"><b>${PROG.wrong.filter(w => w.rez).length}</b><span>rezolvate</span></div></div>
    <div class="row"><button class="btn primary" type="button" data-act="rev-due" ${due.length ? "" : "disabled"}>Începe revizuirea${due.length ? ` (${Math.min(due.length, 20)})` : ""}</button><button class="btn" type="button" data-act="rev-all">Toate greșelile (${Math.min(open.length, 30)})</button></div>
    ${due.length ? "" : `<p class="hint">Următoarele întrebări revin la revizuire peste 2, apoi 6 zile. Așa se fixează mai bine.</p>`}
    <h3 class="lab-sub">Pe teme</h3>
    <ul class="lab-list">${groups.map(g => `<li><span class="grow"><b>${esc(g.k)}</b><small>${g.n} ${g.n === 1 ? "întrebare" : "întrebări"}</small></span><button class="btn sm" type="button" data-act="rev-topic" data-topic="${esc(g.k)}">Revizuiește</button></li>`).join("")}</ul>`;
}
function revStart(list){
  const L = labState();
  if (!list.length){ toast("Nu e nimic de revizuit aici"); return; }
  L.rev = { ids: list.slice(0, 30).map(w => w.id), i: 0, ans: [], checked: false, score: 0, qs: {} };
  renderLab();
}
function revRunHtml(){
  const R = labState().rev;
  if (R.i >= R.ids.length){
    return `<div class="rev-end"><h3>Revizuire terminată</h3><p><b>${R.score}/${R.ids.length}</b> răspunsuri corecte (${pct(R.score, R.ids.length)}%).</p><p class="hint">Întrebările greșite revin mâine în listă; cele corecte revin peste câteva zile, pentru fixare.</p><div class="row"><button class="btn primary" type="button" data-act="rev-back">Înapoi la greșeli</button></div></div>`;
  }
  const w = PROG.wrong.find(x => x.id === R.ids[R.i]);
  if (!w){ R.i++; return revRunHtml(); }
  const q = R.qs[w.id] || (R.qs[w.id] = shuffleOptions(w.q)), ok = R.checked && sameAns(R.ans, q.corecte);
  const opts = Object.keys(q.variante || {}).map(L => {
    const sel = R.ans.includes(L), cor = q.corecte.includes(L);
    let cls = sel ? "sel" : "";
    if (R.checked) cls = cor && sel ? "right" : (!cor && sel ? "wrong" : (cor ? "missed" : ""));
    const why = R.checked && q.de_ce && q.de_ce[L] ? `<span class="why">${mdi(q.de_ce[L])}</span>` : "";
    return `<label class="opt ${cls}"><input type="${q.tip === "CM" ? "checkbox" : "radio"}" name="rv" value="${L}" ${sel ? "checked" : ""} ${R.checked ? "disabled" : ""}><span class="L">${L}</span><span>${mdi(q.variante[L])}${why}</span></label>`;
  }).join("");
  return `<div class="rev-run">
    <div class="rev-top"><span class="qq-n">${R.i + 1}/${R.ids.length}</span><span class="qtype ${q.tip === "CM" ? "cm" : ""}">${esc(q.tip)}</span><span class="hint">${esc(w.topic || "")} · ${esc(SRC_LABEL[w.src] || "")} · greșită de ${w.n} ${w.n === 1 ? "dată" : "ori"}</span>${R.checked ? `<span class="verdict ${ok ? "ok" : "no"}">${ok ? "Corect" : "Greșit"}</span>` : ""}</div>
    <p class="qq-t">${mdi(q.enunt)}</p><div class="opts" id="rvOpts">${opts}</div>
    ${R.checked ? `<div class="qx"><b>Răspuns: ${q.corecte.join(", ")}</b><br>${mdi(q.explicatie || "")}</div>` : ""}
    <div class="row"><button class="btn" type="button" data-act="rev-back">Oprește</button><span class="grow"></span>${R.checked ? `<button class="btn primary" type="button" data-act="rev-next">${R.i + 1 < R.ids.length ? "Următoarea" : "Vezi rezultatul"}</button>` : `<button class="btn primary" type="button" data-act="rev-check">Verifică</button>`}</div></div>`;
}

/* ---- statistici ---- */
function statsHtml(){
  const log = PROG.log;
  if (!log.length) return `<div class="placeholder"><h3>Statisticile apar după primele răspunsuri</h3><p>Rezolvă un Quiz, o grilă din Banca de grile sau întrebările fulger din explicații. Aici vezi apoi acuratețea, seria de zile, punctele forte și punctele slabe.</p></div>`;
  const n = log.length, ok = log.filter(e => e.ok).length, st = streak();
  const today = noon(Date.now()), days = [];
  for (let k = 13; k >= 0; k--){ const t = addDays(today, -k), key = dayKey(t); const es = log.filter(e => dayKey(e.t) === key); days.push({ t, n: es.length, ok: es.filter(e => e.ok).length }); }
  const max = Math.max(5, ...days.map(d => d.n)), W = 700, H = 170, bw = 32, gap = (W - 20 - bw * 14) / 13;
  const bars = days.map((d, i) => {
    const x = 10 + i * (bw + gap), hOk = d.ok / max * (H - 50), hNo = (d.n - d.ok) / max * (H - 50), base = H - 24;
    const wd = new Date(d.t);
    return `<g><rect x="${x}" y="${base - hOk}" width="${bw}" height="${hOk}" rx="3" class="b-ok"/><rect x="${x}" y="${base - hOk - hNo}" width="${bw}" height="${hNo}" rx="3" class="b-no"/>
      ${d.n ? `<text x="${x + bw / 2}" y="${base - hOk - hNo - 6}" class="b-v">${d.n}</text>` : ""}<text x="${x + bw / 2}" y="${H - 6}" class="b-d${i === 13 ? " today" : ""}">${i === 13 ? "azi" : wd.getDate()}</text></g>`;
  }).join("");
  const topics = aggBy(e => e.topic, log).filter(a => a.n >= 3);
  const weak = topics.filter(a => a.ok / a.n < 0.6).sort((a, b) => a.ok / a.n - b.ok / b.n).slice(0, 6);
  const strong = topics.filter(a => a.ok / a.n >= 0.8).sort((a, b) => b.ok / b.n - a.ok / a.n || b.n - a.n).slice(0, 6);
  const src = aggBy(e => SRC_LABEL[e.src] || e.src, log).sort((a, b) => b.n - a.n);
  const tline = a => `<li><span class="grow"><b>${esc(a.k)}</b><small>${a.ok}/${a.n} corecte</small></span><span class="acc-bar"><i style="width:${pct(a.ok, a.n)}%"></i></span><span class="acc-v">${pct(a.ok, a.n)}%</span></li>`;
  return `<div class="lab-kpis">
      <div class="kpi"><b>${n}</b><span>întrebări rezolvate</span></div>
      <div class="kpi"><b>${pct(ok, n)}%</b><span>acuratețe</span></div>
      <div class="kpi"><b>${st}</b><span>${st === 1 ? "zi la rând" : "zile la rând"}</span></div>
      <div class="kpi"><b>${openWrong().length}</b><span>greșeli de revizuit</span></div></div>
    <h3 class="lab-sub">Ultimele 14 zile</h3>
    <div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Întrebări rezolvate pe zi, ultimele 14 zile">${bars}</svg>
      <div class="legend"><span><i class="lg ok"></i>corecte</span><span><i class="lg no"></i>greșite</span></div></div>
    <div class="lab-two">
      <section><h3 class="lab-sub">Puncte slabe</h3>${weak.length ? `<ul class="lab-list">${weak.map(a => tline(a) .replace("</li>", `<button class="btn sm" type="button" data-act="explain" data-q="${esc(a.k)}">Reia tema</button></li>`)).join("")}</ul>` : `<p class="hint">Nicio temă sub 60% (din cele cu cel puțin 3 răspunsuri).</p>`}</section>
      <section><h3 class="lab-sub">Puncte forte</h3>${strong.length ? `<ul class="lab-list">${strong.map(tline).join("")}</ul>` : `<p class="hint">Temele cu peste 80% răspunsuri corecte apar aici.</p>`}</section>
    </div>
    ${errTypesHtml()}
    <h3 class="lab-sub">Pe tipuri de exercițiu</h3><ul class="lab-list">${src.map(tline).join("")}</ul>`;
}

/* ---- parcurgerea materiei ---- */
const ST_LABEL = { nou: "Neînceput", lucru: "În lucru", stapanit: "Stăpânit" };
function itemStatus(it){
  const s = topicStatsFor(it.titlu);
  if (it.st && ST_LABEL[it.st]) return { k: it.st, auto: false, s };
  const explained = readHist().some(h => topicSim(it.titlu, h.result && h.result.titlu) >= 0.6);
  if (s.n >= 5 && s.ok / s.n >= 0.8) return { k: "stapanit", auto: true, s };
  if (explained || s.n) return { k: "lucru", auto: true, s };
  return { k: "nou", auto: true, s };
}
function discOptions(sel){ return DISCIPLINES.map(d => `<option${d === sel ? " selected" : ""}>${esc(d)}</option>`).join(""); }
function matHtml(){
  const L = labState(), cur = state.result && !(state.meta && state.meta.sample) ? state.result : null;
  const discs = [...new Set(PROG.syl.map(i => i.disc))];
  const form = `<div class="lab-card"><h3 class="lab-sub" style="margin-top:0">Adaugă tematica</h3>
    <p class="hint">Copiază lista de teme din programa catedrei sau din tematica de examen. O temă pe rând. Statusul se actualizează singur din explicațiile și grilele tale.</p>
    <div class="row"><select id="sylDisc">${discOptions(L.sylDisc || (cur && cur.disciplina) || DISCIPLINES[0])}</select></div>
    <textarea id="sylText" class="lab-ta" rows="4" placeholder="1. Sistemul renină–angiotensină–aldosteron&#10;2. Filtrarea glomerulară&#10;3. Sindromul nefrotic"></textarea>
    <div class="row"><button class="btn primary" type="button" data-act="syl-add">Adaugă temele</button>${cur ? `<button class="btn" type="button" data-act="syl-cur">Adaugă tema curentă („${esc(stripMarks(cur.titlu)).slice(0, 40)}”)</button>` : ""}</div></div>`;
  if (!discs.length) return form + `<div class="placeholder"><h3>Încă nu ai adăugat tematica</h3><p>După ce o adaugi, vezi aici cât ai parcurs din fiecare disciplină, iar Calendarul îți face planul până la examen.</p></div>`;
  const blocks = discs.map(d => {
    const items = PROG.syl.filter(i => i.disc === d).sort((a, b) => (a.o || 0) - (b.o || 0));
    const sts = items.map(i => ({ i, st: itemStatus(i) }));
    const nS = sts.filter(x => x.st.k === "stapanit").length, nL = sts.filter(x => x.st.k === "lucru").length;
    return `<section class="lab-card syl"><div class="syl-h"><h3>${esc(d)}</h3><span class="hint">${nS} stăpânite · ${nL} în lucru · ${items.length - nS - nL} neîncepute</span></div>
      <div class="prog-bar" aria-label="${pct(nS, items.length)}% stăpânit"><i class="ps" style="width:${pct(nS, items.length)}%"></i><i class="pl" style="width:${pct(nL, items.length)}%"></i></div>
      <ul class="lab-list">${sts.map(({ i, st }) => `<li><span class="pill st-${st.k}">${ST_LABEL[st.k]}</span><span class="grow"><b>${esc(i.titlu)}</b>${st.s.n ? `<small>${st.s.ok}/${st.s.n} răspunsuri corecte</small>` : ""}</span>
        <select class="sm-sel" data-act="syl-st" data-id="${i.id}" aria-label="Status"><option value="auto"${st.auto ? " selected" : ""}>Automat</option>${Object.entries(ST_LABEL).map(([k, t]) => `<option value="${k}"${!st.auto && st.k === k ? " selected" : ""}>${t}</option>`).join("")}</select>
        <button class="btn sm" type="button" data-act="explain" data-q="${esc(i.titlu)}" data-disc="${esc(d)}">Explică</button>
        <button class="icon-btn" type="button" data-act="syl-del" data-id="${i.id}" aria-label="Șterge tema"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></li>`).join("")}</ul></section>`;
  }).join("");
  return form + blocks;
}

/* ---- calendar inteligent ---- */
function buildPlan(){
  const today = noon(Date.now()), days = new Map(), warn = [];
  const add = (t, task) => { const k = dayKey(t); if (!days.has(k)) days.set(k, []); days.get(k).push(task); };
  const exams = PROG.exams.filter(e => parseDay(e.date) >= today).sort((a, b) => parseDay(a.date) - parseDay(b.date));
  for (const ex of exams){
    const eday = parseDay(ex.date), D = Math.round((eday - today) / DAY);
    add(eday, { k: "exam", disc: ex.disc, txt: "Examen: " + ex.disc });
    if (D >= 2) add(addDays(eday, -1), { k: "recap", disc: ex.disc, txt: "Recapitulare generală și grile din bancă" });
    const all = PROG.syl.filter(i => i.disc === ex.disc);
    if (!all.length){ warn.push(ex.disc); continue; }
    if (D <= 0) continue;
    const items = all.map(i => { const st = itemStatus(i); return { i, st, weak: st.s.n >= 3 && st.s.ok / st.s.n < 0.6 }; }).filter(x => x.st.k !== "stapanit");
    const pr = x => x.weak ? 0 : x.st.k === "nou" ? 1 : 2;
    items.sort((a, b) => pr(a) - pr(b) || (a.i.o || 0) - (b.i.o || 0));
    const slots = Math.max(1, D - 1), per = Math.ceil(items.length / slots);
    items.forEach((x, j) => {
      const d = Math.floor(j / per);
      add(addDays(today, d), { k: "nou", disc: ex.disc, txt: x.i.titlu, weak: x.weak });
      [2, 6].forEach(g => { const rd = addDays(today, d + g); if (rd < eday) add(rd, { k: "rep", disc: ex.disc, txt: x.i.titlu }); });
    });
  }
  const nDue = dueWrong().length;
  if (nDue) add(today, { k: "rev", txt: `Revizuiește greșelile (${nDue})` });
  return { days, warn, exams, today };
}
function discColor(d){ let h = 0; for (const ch of String(d || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return ["c1", "c2", "c3", "c4", "c5"][h % 5]; }
function calHtml(){
  const L = labState(), plan = buildPlan(), today = plan.today;
  const sylDiscs = [...new Set(PROG.syl.map(i => i.disc))];
  const form = `<div class="lab-card"><h3 class="lab-sub" style="margin-top:0">Examenele tale</h3>
    <div class="row"><select id="exDisc">${sylDiscs.map(d => `<option>${esc(d)}</option>`).join("")}${sylDiscs.length ? `<option disabled>──────</option>` : ""}${DISCIPLINES.filter(d => !sylDiscs.includes(d)).map(d => `<option>${esc(d)}</option>`).join("")}</select>
      <input type="date" id="exDate" class="vis-in" min="${dayKey(today)}" style="max-width:180px"><button class="btn primary" type="button" data-act="ex-add">Adaugă examenul</button></div>
    ${plan.exams.length ? `<ul class="lab-list">${plan.exams.map(e => { const n = Math.round((parseDay(e.date) - today) / DAY); return `<li><i class="dot" style="--oc:var(--${discColor(e.disc)})"></i><span class="grow"><b>${esc(e.disc)}</b><small>${new Date(parseDay(e.date)).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" })}</small></span><span class="pill">${n === 0 ? "azi" : n === 1 ? "mâine" : `în ${n} zile`}</span><button class="icon-btn" type="button" data-act="ex-del" data-id="${e.id}" aria-label="Șterge examenul"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></li>`; }).join("")}</ul>` : ""}</div>`;
  if (!plan.exams.length) return form + `<div class="placeholder"><h3>Adaugă data unui examen</h3><p>Planul se face singur: temele neparcurse din <b>Materie</b> se împart pe zilele rămase, temele slabe vin primele, fiecare temă revine la repetare după 2 și 6 zile, iar ziua dinaintea examenului e pentru recapitulare. Greșelile de revizuit apar zilnic.</p></div>`;
  const last = Math.max(...plan.exams.map(e => parseDay(e.date)));
  const span = Math.min(45, Math.max(7, Math.round((last - today) / DAY) + 1));
  const cards = [];
  for (let k = 0; k < span; k++){
    const t = addDays(today, k), tasks = plan.days.get(dayKey(t)) || [];
    if (!tasks.length && k > 0) continue;
    const ex = tasks.filter(x => x.k === "exam"), rc = tasks.filter(x => x.k === "recap"), nw = tasks.filter(x => x.k === "nou"), rp = tasks.filter(x => x.k === "rep"), rv = tasks.filter(x => x.k === "rev");
    const lbl = k === 0 ? "Azi" : k === 1 ? "Mâine" : new Date(t).toLocaleDateString("ro-RO", { weekday: "long" });
    cards.push(`<li class="day${ex.length ? " has-exam" : ""}"><div class="day-h"><b>${lbl}</b><span>${new Date(t).toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}</span></div><div class="day-b">
      ${ex.map(x => `<div class="task exam" style="--oc:var(--${discColor(x.disc)})">${esc(x.txt)}</div>`).join("")}
      ${rc.map(x => `<div class="task recap" style="--oc:var(--${discColor(x.disc)})"><b>${esc(x.disc)}:</b> ${esc(x.txt)}</div>`).join("")}
      ${nw.map(x => `<button type="button" class="task new" style="--oc:var(--${discColor(x.disc)})" data-act="explain" data-q="${esc(x.txt)}" data-disc="${esc(x.disc)}"><span class="tk">${x.weak ? "Temă slabă" : "De învățat"}</span>${esc(x.txt)}</button>`).join("")}
      ${rp.length ? `<div class="task rep"><span class="tk">Repetă</span>${rp.slice(0, 4).map(x => esc(x.txt)).join(" · ")}${rp.length > 4 ? ` · +${rp.length - 4}` : ""}</div>` : ""}
      ${rv.map(x => `<button type="button" class="task rev" data-act="go-rev">${esc(x.txt)}</button>`).join("")}
      ${!tasks.length ? `<span class="hint">Liber. Poți face o grilă din bancă.</span>` : ""}</div></li>`);
  }
  return form + (plan.warn.length ? `<p class="notice">Pentru ${plan.warn.map(esc).join(", ")} nu ai adăugat încă tematica. Adaug-o la <button type="button" class="linkbtn" data-lv="mat">Materie</button> și planul se completează singur.</p>` : "")
    + `<div class="row" style="justify-content:space-between"><h3 class="lab-sub">Planul tău</h3><button class="btn sm dl" type="button" data-act="ics">Adaugă în calendarul telefonului (.ics)</button></div><ul class="days">${cards.join("")}</ul>`;
}
function planIcs(){
  const plan = buildPlan(), esc2 = s => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const f = t => dayKey(t).replace(/-/g, "");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ghidul studentului USMF//Plan//RO", "CALSCALE:GREGORIAN"];
  [...plan.days.entries()].sort().forEach(([k, tasks], n) => {
    const t = parseDay(k), ex = tasks.find(x => x.k === "exam");
    const sum = ex ? ex.txt : `Studiu: ${tasks.filter(x => x.k === "nou").length} teme noi`;
    const desc = tasks.map(x => (x.k === "nou" ? "De învățat: " : x.k === "rep" ? "Repetă: " : "") + (x.disc && x.k !== "exam" ? x.disc + " - " : "") + x.txt).join("\n");
    L.push("BEGIN:VEVENT", `UID:ghid-${k}-${n}@usmf-ghid`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${f(t)}`, `DTEND;VALUE=DATE:${f(addDays(t, 1))}`, `SUMMARY:${esc2(sum)}`, `DESCRIPTION:${esc2(desc)}`, "END:VEVENT");
  });
  L.push("END:VCALENDAR");
  return L.join("\r\n");
}

/* ---- randare și evenimente ---- */
function onLab(type, fn){ ["#p-lab", "#progBody"].forEach(sel => { const e = $(sel); if (e) e.addEventListener(type, fn); }); }
function renderLab(){
  const p = $("#p-lab"), ov = $("#progOv");
  if (p && (!ov || ov.hidden)) p.innerHTML = `<div class="lab-h"><div><h2 class="lab-title">Simulation Lab</h2><p class="hint">Alege un organ: îl vezi în 3D, în imagini reale (anatomie, histologie, imagistică) și îi studiezi temele.</p></div></div>
    <div class="lab-body">${anatHtml()}</div>`;
  try { renderProg(); paintCalW(); paintProgBtn(); } catch {}
}
onLab("click", ev => {
  const b = ev.target.closest("[data-lv],[data-act],[data-org],[data-sys]"); if (!b || b.tagName === "SELECT") return;
  const L = labState();
  if (b.dataset.lv){ L.view = b.dataset.lv; L.rev = null; renderLab(); return; }
  if (b.dataset.org){ L.organ = b.dataset.org === L.organ && b.tagName !== "BUTTON" ? null : b.dataset.org; renderLab(); return; }
  if (b.dataset.sys){ L.sys = b.dataset.sys; L.organ = null; L.sysView = null; renderLab(); return; }
  const a = b.dataset.act;
  if (a === "explain") return labExplain(b.dataset.q, b.dataset.disc);
  if (a === "org-own"){ const v = ($("#orgQ").value || "").trim(); const o = ORGANS.find(x => x.id === L.organ); if (v) labExplain(v); else if (o) labExplain(o.teme[0]); return; }
  if (a === "rev-due") return revStart(dueWrong());
  if (a === "rev-all") return revStart(openWrong().slice().sort((x, y) => y.n - x.n));
  if (a === "rev-topic") return revStart(openWrong().filter(w => (w.topic || "Fără temă") === b.dataset.topic));
  if (a === "rev-back"){ L.rev = null; renderLab(); return; }
  if (a === "rev-check"){
    const R = L.rev, w = PROG.wrong.find(x => x.id === R.ids[R.i]);
    if (!R.ans.length){ toast("Alege un răspuns"); return; }
    if (progRecord((R.qs && R.qs[w.id]) || w.q, R.ans, "revizuire", { topic: w.topic, disc: w.disc, wid: w.id })) R.score++;
    R.checked = true; renderLab(); return;
  }
  if (a === "rev-next"){ const R = L.rev; R.i++; R.ans = []; R.checked = false; renderLab(); $("#progBody").scrollTop = 0; return; }
  if (a === "go-rev"){ L.view = "rev"; revStart(dueWrong()); return; }
  if (a === "syl-add" || a === "syl-cur"){
    const disc = a === "syl-cur" ? (state.result.disciplina && DISCIPLINES.includes(state.result.disciplina) ? state.result.disciplina : $("#sylDisc").value) : $("#sylDisc").value;
    const lines = a === "syl-cur" ? [stripMarks(state.result.titlu)] : ($("#sylText").value || "").split(/\n+/).map(s => s.replace(/^\s*(?:\d+[.)]|[-•*–])\s*/, "").trim()).filter(s => s.length > 2);
    if (!lines.length){ toast("Scrie cel puțin o temă"); return; }
    const have = new Set(PROG.syl.filter(i => i.disc === disc).map(i => nrm(i.titlu)));
    let o = PROG.syl.filter(i => i.disc === disc).length, added = 0;
    lines.slice(0, 300).forEach(t => { if (have.has(nrm(t))) return; have.add(nrm(t)); PROG.syl.push({ id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), disc, titlu: t.slice(0, 200), o: o++, st: "", u: Date.now() }); added++; });
    L.sylDisc = disc; saveProg(); renderLab(); toast(added ? `Am adăugat ${added} ${added === 1 ? "temă" : "teme"}` : "Temele erau deja în listă"); return;
  }
  if (a === "syl-del"){ const id = b.dataset.id; PROG.syl = PROG.syl.filter(i => i.id !== id); PROG.del.syl[id] = Date.now(); saveProg(); renderLab(); return; }
  if (a === "ex-add"){
    const disc = $("#exDisc").value, date = $("#exDate").value;
    if (!date || isNaN(parseDay(date))){ toast("Alege data examenului"); return; }
    PROG.exams.push({ id: "e" + Date.now().toString(36), disc, date, u: Date.now() }); saveProg(); renderLab(); return;
  }
  if (a === "ex-del"){ const id = b.dataset.id; PROG.exams = PROG.exams.filter(e => e.id !== id); PROG.del.exams[id] = Date.now(); saveProg(); renderLab(); return; }
  if (a === "ics") return saveFile("plan-de-studiu.ics", new Blob([planIcs()], { type: "text/calendar" }));
});
onLab("change", ev => {
  const t = ev.target, L = labState();
  if (t.dataset && t.dataset.act === "syl-st"){
    const it = PROG.syl.find(i => i.id === t.dataset.id); if (!it) return;
    it.st = t.value === "auto" ? "" : t.value; it.u = Date.now(); saveProg(); renderLab(); return;
  }
  if (t.name === "rv" && L.rev && !L.rev.checked){
    L.rev.ans = $$('#rvOpts input:checked').map(x => x.value).sort();
    $$("#rvOpts .opt").forEach(o => o.classList.toggle("sel", $("input", o).checked));
  }
});
onLab("keydown", ev => {
  const g = ev.target.closest && ev.target.closest("g[data-org]");
  if (g && (ev.key === "Enter" || ev.key === " ")){ ev.preventDefault(); g.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
});

/* ---------------- v8: notițe, timp estimat, text în tabel, tipuri de greșeli, mod examen ---------------- */
/* anatomie: numele organului la trecerea mouse-ului, contururi */
onLab("mouseover", ev => {
  const g = ev.target.closest && ev.target.closest("g.hs"), n = $("#hsName");
  if (!n) return;
  if (g){ n.textContent = g.dataset.name; n.hidden = false; } else n.hidden = true;
});
onLab("mouseleave", () => { const n = $("#hsName"); if (n) n.hidden = true; });
onLab("click", ev => {
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const L = labState(), a = b.dataset.act;
  if (a === "outl"){ L.outl = b.checked; const f = b.closest(".anat-fig"); if (f) f.classList.toggle("outl", b.checked); }
  else if (a === "gal-cat"){ L.galCat = b.dataset.cat; renderLab(); }
  else if (a === "gal-open") openGalImg(+b.dataset.i);
  else if (a === "err-ai") analyzeErrors(b);
  else if (a === "note-open") labExplain(b.dataset.q);
  else if (a === "note-del"){ if (confirm("Ștergi notița?")){ saveNote(b.dataset.q, ""); renderLab(); } }
});
onLab("input", ev => {
  const t = ev.target;
  if (t.dataset && t.dataset.note != null){ clearTimeout(t._t); t._t = setTimeout(() => saveNote(t.dataset.note, t.value), 700); }
  if (t.id === "noteQ"){ labState().noteQ = t.value; clearTimeout(t._t); t._t = setTimeout(() => { renderLab(); const q = $("#noteQ"); if (q){ q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 300); }
});

/* ---- notițe personale ---- */
function noteId(titlu){ return "n" + qKey({ enunt: stripMarks(titlu) }).slice(1); }
function saveNote(titlu, text){
  const id = noteId(titlu), now = Date.now();
  let n = PROG.notes.find(x => x.id === id);
  if (!n){ if (!String(text).trim()) return; n = { id, titlu: stripMarks(titlu) }; PROG.notes.push(n); }
  n.text = String(text).slice(0, 20000); n.u = now;
  saveProg();
  const s = $("#noteSaved"); if (s) s.textContent = n.text.trim() ? "salvate" : "";
}
function estimateTime(r){
  const words = s => String(s || "").split(/\s+/).filter(Boolean).length;
  let w = words(r.rezumat);
  arr(r.sectiuni).forEach(s => { w += words(s.simplu) + words(s.avansat); });
  if (r.tabel) w += arr(r.tabel.randuri).flat().map(words).reduce((a, b) => a + b, 0);
  if (r.caz_clinic) w += words(r.caz_clinic.prezentare);
  const nq = arr(r.sectiuni).filter(s => s.fulger && s.fulger.intrebare).length;
  const read = Math.max(3, Math.round(w / 130));                  // citit atent, text medical dens
  const study = Math.max(read + 5, Math.round((read * 2 + nq * 1 + 5) / 5) * 5); // + recitire, întrebări, schemă
  return { read, study, words: w };
}
const ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
function paintNotes(){
  const p = $("#p-explicatie"), r = state.result;
  if (!r || !p || $(".notes-box", p)) return;
  const head = $(".ex-head", p); if (!head) return;
  const est = estimateTime(r);
  head.insertAdjacentHTML("beforeend", `<div class="est-line">${ICON_CLOCK}<span>≈ <b>${est.read} min</b> de citit atent · <b>${est.study} min</b> ca s-o înveți (cu schema, întrebările și o recitire)</span></div>`);
  if (state.meta && state.meta.sample) return;
  const n = PROG.notes.find(x => x.id === noteId(r.titlu)), has = !!(n && n.text && n.text.trim());
  head.insertAdjacentHTML("afterend", `<details class="notes-box"${has ? " open" : ""}><summary>Notițele mele <span class="hint" id="noteSaved">${has ? "salvate" : ""}</span></summary>
    <textarea id="noteTa" rows="4" placeholder="Scrie aici ce vrei să reții din tema asta: o idee, o capcană, o întrebare pentru profesor…">${esc(n ? n.text : "")}</textarea>
    <p class="hint">Se salvează automat${SYNC.user ? " și se sincronizează cu contul" : ""}. Toate notițele sunt în Progresul meu → Notițe.</p></details>`);
  const ta = $("#noteTa"), titlu = r.titlu;
  ta.addEventListener("input", () => { clearTimeout(ta._t); ta._t = setTimeout(() => saveNote(titlu, ta.value), 700); });
}
const _renderExplain0 = renderExplain;
renderExplain = function(opts){ _renderExplain0(opts); if (!(opts && opts.partial)) paintNotes(); };
function notesHtml(){
  const L = labState(), q = nrm(L.noteQ || "");
  const all = PROG.notes.filter(n => n.text && n.text.trim()).sort((a, b) => (b.u || 0) - (a.u || 0));
  const list = q ? all.filter(n => nrm(n.titlu + " " + n.text).includes(q)) : all;
  if (!all.length) return `<div class="placeholder"><h3>Nicio notiță încă</h3><p>Sub titlul fiecărei explicații ai căsuța „Notițele mele”. Ce scrii acolo apare aici, pe teme, și se sincronizează cu contul.</p></div>`;
  return `<input class="vis-in" id="noteQ" placeholder="Caută în notițe…" value="${esc(L.noteQ || "")}">
    <div class="notes-list">${list.map(n => `<section class="lab-card note-card"><div class="row"><b class="grow">${esc(n.titlu)}</b><span class="hint">${new Date(n.u || Date.now()).toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}</span></div>
      <textarea class="lab-ta" rows="3" data-note="${esc(n.titlu)}">${esc(n.text)}</textarea>
      <div class="row"><button class="btn sm" type="button" data-act="note-open" data-q="${esc(n.titlu)}">Deschide tema</button><button class="btn sm danger" type="button" data-act="note-del" data-q="${esc(n.titlu)}">Șterge</button></div></section>`).join("") || `<p class="hint">Nicio notiță nu conține „${esc(L.noteQ)}”.</p>`}</div>`;
}

/* ---- tipuri de greșeli ---- */
const ERR_INFO = {
  negatie: ["Capcane de negație", "Greșești la întrebările cu „NU”, „cu excepția” sau „fals”. Subliniază negația înainte să citești variantele și caută varianta falsă."],
  incomplet: ["Răspunsuri incomplete la CM", "Bifezi corect, dar prea puțin. La CM sunt 2–4 răspunsuri: judecă fiecare variantă separat, ca adevărat sau fals."],
  in_plus: ["Variante în plus la CM", "Bifezi și variante false. Atenție la termenii absoluți („întotdeauna”, „niciodată”, „exclusiv”): de obicei fac varianta falsă."],
  mixt: ["Confuzii la CM", "Și omiți, și adaugi variante: tema e încă neclară. Reia explicația, apoi refă grila."],
  confuzie: ["Confuzii la CS", "Alegi o variantă apropiată de cea corectă. Pune noțiunile asemănătoare față în față într-un tabel (Instrumente → Text în tabel)."]
};
function errType(q, chosen){
  const cor = arr(q.corecte), ch = arr(chosen);
  const en = String(q.enunt || "");
  if (/\bNU\b/.test(en) || /cu excep|\bfals|\bincorect|\bgreșit/i.test(en)) return "negatie";
  if (cor.length > 1 || ch.length > 1 || q.tip === "CM"){
    const miss = cor.filter(c => !ch.includes(c)).length, extra = ch.filter(c => !cor.includes(c)).length;
    if (!extra && miss) return "incomplet";
    if (extra && !miss) return "in_plus";
    return "mixt";
  }
  return "confuzie";
}
function errTypesHtml(){
  const since = Date.now() - 60 * DAY, bad = PROG.log.filter(e => !e.ok && e.ty && e.t >= since);
  const L = labState();
  if (bad.length < 3) return `<h3 class="lab-sub">Ce fel de greșeli faci</h3><p class="hint">Apare după primele greșeli din grile: arată dacă greșești din negații, din răspunsuri incomplete la CM sau din confuzii.</p>`;
  const agg = Object.keys(ERR_INFO).map(k => ({ k, n: bad.filter(e => e.ty === k).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  return `<h3 class="lab-sub">Ce fel de greșeli faci <span class="hint">(ultimele 60 de zile)</span></h3>
    <ul class="lab-list err-types">${agg.map((x, i) => `<li><span class="grow"><b>${ERR_INFO[x.k][0]}</b><small>${ERR_INFO[x.k][1]}</small></span><span class="acc-bar"><i style="width:${pct(x.n, bad.length)}%;background:var(--bad)"></i></span><span class="acc-v">${x.n}</span></li>`).join("")}</ul>
    <div class="row"><button class="btn" type="button" data-act="err-ai" ${openWrong().length ? "" : "disabled"}>Analiză AI: ce noțiuni confund?</button></div>
    ${L.errAi ? `<div class="lab-card prose">${md(L.errAi)}</div>` : ""}`;
}
async function analyzeErrors(btn){
  if (state.busy) return;
  const items = openWrong().sort((a, b) => (b.u || 0) - (a.u || 0)).slice(0, 25);
  if (!items.length) return;
  const txt = items.map((w, i) => `${i + 1}. [${w.topic || "fără temă"}] ${w.q.enunt}\n${Object.entries(w.q.variante || {}).map(([L, v]) => `   ${L}) ${v}`).join("\n")}\n   Corect: ${arr(w.q.corecte).map(c => c + ") " + ((w.q.variante || {})[c] || "")).join(" / ")} · Ales de student: ${(w.lastTxt && w.lastTxt.length ? w.lastTxt.join(" / ") : arr(w.last).join(", ")) || "?"}`).join("\n\n");
  setBusy(true, "Analizează greșelile…");
  try {
    const t = await callClaude(`Ești tutore de medicină. Mai jos sunt întrebările de grilă la care un student a greșit, cu răspunsul corect și ce a ales el.
Găsește tiparele: ce noțiuni confundă (perechi concrete), ce tip de raționament îi scapă, ce teme trebuie reluate. Fii concret și scurt, în română, markdown:
- **Confuzii frecvente** (2–4 puncte, fiecare cu distincția corectă într-o frază)
- **Teme de reluat** (2–4 puncte)
- **Sfat de rezolvare** (1–2 puncte)
Nu repeta întrebările.

${txt.slice(0, 12000)}`, { json: false, tier: "default", noCache: true });
    labState().errAi = typeof t === "string" ? t : (t && t.text) || "";
    renderLab();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}

/* ---- text în tabel (Instrumente) ---- */
function ttState(){ if (!state.tt) state.tt = { text: "", res: null }; return state.tt; }
function ttMd(t){ return `## ${t.titlu || "Tabel"}\n\n| ${t.coloane.join(" | ")} |\n|${t.coloane.map(() => "---").join("|")}|\n` + t.randuri.map(r => "| " + r.map(c => String(c ?? "").replace(/\|/g, "/")).join(" | ") + " |").join("\n"); }
function ttHtml(){
  const T = ttState(), r = T.res;
  return `<section class="tool" id="ttTool">
    <div class="tool-h"><div><h3>Text în tabel</h3><p class="hint">Lipește un paragraf din curs sau din notițe. Ghidul îl transformă într-un tabel comparativ, mai ușor de învățat. Dacă lași căsuța goală, folosește explicația curentă.</p></div>
      <button class="btn primary" type="button" id="ttGo" data-busy>Transformă în tabel</button></div>
    <textarea id="ttText" class="lab-ta" rows="5" placeholder="De exemplu: diferențele dintre sindromul nefrotic și cel nefritic, așa cum apar în curs…">${esc(T.text)}</textarea>
    ${r ? `<div class="tbl-wrap"><table><caption>${mdi(r.titlu || "")}</caption><thead><tr>${r.coloane.map(c => `<th>${mdi(c)}</th>`).join("")}</tr></thead><tbody>${r.randuri.map(row => `<tr>${row.map(c => `<td>${mdi(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="row"><button class="btn sm" type="button" id="ttCopy">Copiază (merge lipit în Excel sau Word)</button><button class="btn sm dl" type="button" id="ttDoc">Descarcă (Word)</button></div>` : ""}
  </section>`;
}
async function genTable(){
  if (state.busy) return;
  const T = ttState();
  T.text = ($("#ttText").value || "").trim();
  const src = T.text || (state.result ? resultToMd(state.result) : "");
  if (!src){ toast("Lipește un text sau generează întâi o explicație"); return; }
  setBusy(true, "Face tabelul…");
  try {
    const r = await callClaude(`Transformă textul medical de mai jos într-un singur tabel de învățat, în limba română.
Reguli: folosește doar informația din text, nu adăuga fapte noi. Alege coloanele potrivite (de ex. entitățile comparate pe coloane și criteriile pe rânduri, sau invers). 2–6 coloane, 3–15 rânduri, celule scurte (maxim 15 cuvinte).
Răspunde doar cu JSON: {"titlu": "...", "coloane": ["..."], "randuri": [["...", "..."]]}

TEXT:
${src.slice(0, 14000)}`, { tier: "default", noCache: true });
    const cols = arr(r && r.coloane).map(String);
    const rows = arr(r && r.randuri).map(row => cols.map((_, k) => String(arr(row)[k] ?? "")));
    if (cols.length < 2 || !rows.length) throw { code: "invalid_json" };
    T.res = { titlu: String(r.titlu || "Tabel"), coloane: cols, randuri: rows };
    renderTools(); $("#ttTool")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
const _renderTools0 = renderTools;
renderTools = function(){
  _renderTools0();
  const p = $("#p-tools"); if (!p) return;
  p.insertAdjacentHTML("beforeend", ttHtml());
  $("#ttGo").onclick = genTable;
  $("#ttText").addEventListener("input", ev => { ttState().text = ev.target.value; });
  const T = ttState();
  $("#ttCopy") && ($("#ttCopy").onclick = () => copyText([T.res.coloane, ...T.res.randuri].map(r => r.map(c => stripMarks(String(c)).replace(/\*\*/g, "").replace(/\t|\n/g, " ")).join("\t")).join("\n")));
  $("#ttDoc") && ($("#ttDoc").onclick = () => saveDoc(slug("tabel " + T.res.titlu), T.res.titlu, ttMd(T.res)));
  if (state.busy) $$("[data-busy]", p).forEach(b => b.disabled = true);
};

/* ---- mod examen (Quiz) ---- */
const EXAM = { on: false, end: 0, leaves: 0, timer: null, n: 0 };
function examBar(){
  let b = $("#examBar");
  if (!EXAM.on){ if (b) b.remove(); return; }
  if (!b){ document.body.insertAdjacentHTML("beforeend", `<div class="exam-bar" id="examBar" role="status"><b>Mod examen</b><span id="exT"></span><span id="exL"></span><button class="btn sm primary" type="button" id="exEnd">Predă lucrarea</button></div>`); b = $("#examBar"); $("#exEnd").onclick = () => examFinish(false); }
  const left = Math.max(0, EXAM.end - Date.now()), m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
  $("#exT").textContent = `${m}:${String(s).padStart(2, "0")} rămase`;
  $("#exT").classList.toggle("low", left < 60000);
  $("#exL").textContent = EXAM.leaves ? `${EXAM.leaves} ${EXAM.leaves === 1 ? "ieșire" : "ieșiri"} din pagină` : "fără ieșiri din pagină";
  if (!left) examFinish(true);
}
function examStart(){
  const Q = state.quiz; if (!Q.list.length || state.busy) return;
  if (!confirm(`Mod examen: ${Q.list.length} întrebări, ${Q.list.length} minute. Variantele se amestecă, explicațiile apar doar la final, iar ieșirile din pagină se numără. Începi?`)) return;
  Q.list = Q.list.map(shuffleOptions); Q.answers = {}; Q.checked = false; Q.exam = null;
  Object.assign(EXAM, { on: true, end: Date.now() + Q.list.length * 60000, leaves: 0, n: Q.list.length });
  try { const el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); } catch {}
  selectTab("quiz"); renderQuiz(); $("#p-quiz").scrollIntoView({ block: "start" });
  clearInterval(EXAM.timer); EXAM.timer = setInterval(examBar, 1000); examBar();
}
function examFinish(timeUp){
  if (!EXAM.on) return;
  EXAM.on = false; clearInterval(EXAM.timer); examBar();
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
  const used = Math.round((EXAM.n * 60000 - Math.max(0, EXAM.end - Date.now())) / 60000);
  state.quiz.exam = { timeUp, leaves: EXAM.leaves, min: used };
  const c = $("#qzCheck");
  if (c) c.click(); else { state.quiz.checked = true; renderQuiz(); }
}
document.addEventListener("visibilitychange", () => { if (EXAM.on && document.hidden){ EXAM.leaves++; examBar(); } });
document.addEventListener("fullscreenchange", () => { if (EXAM.on && !document.fullscreenElement){ EXAM.leaves++; examBar(); } });
const _renderQuiz0 = renderQuiz;
renderQuiz = function(){
  _renderQuiz0();
  const Q = state.quiz, sc = $("#p-quiz .q-score");
  if (!sc || !Q.list.length) return;
  if (!Q.checked && !EXAM.on && !Q.sample) sc.insertAdjacentHTML("beforeend", `<button class="btn sm" type="button" id="qzExam">Mod examen (cronometrat)</button>`);
  if (Q.checked && Q.exam) sc.insertAdjacentHTML("afterend", `<p class="notice exam-res">${Q.exam.timeUp ? "Timpul a expirat. " : ""}Ai lucrat ${Q.exam.min < 1 ? "mai puțin de un minut" : Q.exam.min + (Q.exam.min === 1 ? " minut" : " minute")} și ai ieșit din pagină de ${Q.exam.leaves} ${Q.exam.leaves === 1 ? "dată" : "ori"}.${Q.exam.leaves ? " La un examen supravegheat, ieșirile ar fi fost observate." : ""}</p>`);
  $("#qzExam") && ($("#qzExam").onclick = examStart);
};

/* ---------------- v9: modele 3D, „Progresul meu”, calendar în colț ---------------- */
const M3D = {
  corp: [["9b0b079953b840bc9a13f524b60041e4", "Corpul uman, animat"], ["8a43f3a308994699a4000b17004d5220", "Organele interne"], ["5cfafb312f504815aa3fec55735607a6", "Splanhnologie (Z-Anatomy)"]],
  creier: [["fc7ae7b989f94c80a50152e71f44e47c", "Creierul (Science Museum)"], ["06dd00c44ebd4b4c86475c6c5c33d500", "Creierul uman"], ["720038f031074c1fa150ea364deb2b59", "Creierul, cu etichete"]],
  inima: [["3f8072336ce94d18b3d0d055a1ece089", "Inima, realistă"], ["775d6629622740de8a5ed61a959c7506", "Inima care bate"], ["1b7bfb07e6b24dd891099395ed98e989", "Inima, cu etichete"]],
  plamani: [["ce09f4099a68467880f46e61eb9a3531", "Plămânii, realiști"], ["ad1a6c31b37547fabfc9fe37af69796b", "Plămânii care respiră"], ["50c877863fe64d11a55044afb79f5664", "Plămânii și funcțiile lor"]],
  ficat: [["08ee1a75c6fa437297848027c1baa94c", "Ficatul"], ["a20686a3e4a54792bfede17ad32f4b1a", "Ficatul, anatomie"], ["6c4e9bd0d49f4828b804259330c0c6c4", "Ficatul și vezica biliară"]],
  stomac: [["e0f1952de7204654ba469c3e887a029b", "Stomacul, realist"], ["7148476c702340aab6a6579124103ea9", "Stomacul, secțiune"], ["a81f02baae2b416188c9dac98db101a9", "Stomacul (Univ. Dundee)"]],
  rinichi: [["0215aaf9e9a243cdafca249a979680b0", "Rinichiul, secțiune"], ["e1476ceb1e3b4412af5418eee9c5ed08", "Rinichiul"], ["d7851420a5b84802aacd7e70e6ddb0c7", "Glomerulul renal"]],
  pancreas: [["b34ba50e38fd455bae43bd07b7ed2d3b", "Pancreasul și duodenul"], ["8acf64dc315b49308b4fcbd47e48b92b", "Pancreasul, secțiune"], ["f9a34dba04624c28a3131970fcac4b81", "Ficat, splină și pancreas"]],
  intestin: [["8a1ca8e3ca224cdeb9264674416bde38", "Intestinul subțire și gros"], ["851a7f14710c4170a2e9638c72e4701a", "Intestinul subțire cu mezenterul"], ["8c4c69035f4f4773813533d7ca56e516", "Tubul digestiv"]],
  colon: [["12cae23197da46cf87350694dc0e6539", "Colonul, realist"], ["8a1ca8e3ca224cdeb9264674416bde38", "Intestinul subțire și gros"], ["449839e7e6534cc9a8cd2fdd664e3eb9", "Colita ulcerativă"]],
  vezica: [["822b2eeb033f42f6a8e0e141287bf34d", "Tractul urinar"], ["3e96c2e9f3f24bb684fc7c8a874a90d6", "Vezica urinară"], ["03d325c81aaa4dfabb74b727fec0a1a4", "Rinichii și sistemul urinar"]],
  tiroida: [["b7e522c4f5dc4cea97d04a3d6773e96f", "Tiroida"], ["5238a9dfeee4455d84ffc03211aa8798", "Tiroida (Prof. G. Penna)"], ["01414eee96a34e29aba37affd4d28f58", "Tiroida, macro și micro"]],
  trahee: [["8458de63d0734776aa901615cf1f15ca", "Laringele, traheea și bronhiile"], ["3b247ff11b104e24acbb1c453f5bad46", "Laringele cu mușchi și ligamente"], ["87b255eec46e4ea7be20c3014e68cbbf", "Traheea și laringele, cu etichete"]],
  biliara: [["6c4e9bd0d49f4828b804259330c0c6c4", "Ficatul și vezica biliară"], ["060f3b31e5b14749884dcdc678d08930", "Vezica biliară, secțiune"], ["4fee79b4476e4720af7b41f5ed087d92", "Vezica biliară, anatomie"]],
  aorta: [["4e7aad1805584d9780186017f220fa92", "Anevrism de aortă abdominală"], ["33301eb197874104aa54519a81304b71", "Vasele organelor abdominale"], ["e7abdabd3a6d422cb25e6e63b45b1ab0", "Sistemul circulator"]],
  splina: [["621be4748b6b44fab11da23dc5d880c9", "Splina"], ["acc5ca7b5cc446d9889cdf12892467e2", "Splina, anatomie și histologie"]],
  suprarenale: [["271e40e97ae048b3bea75e91a82bc84b", "Glanda suprarenală, secțiune"], ["e4f3d676b99b45b88407cdf198cff66a", "Suprarenala, anatomie și histologie"]],
  maduva: [["d4af33ccf03b4fec8754180bcb480516", "Măduva spinării (Univ. Dundee)"], ["fab2a2dcbb0143e7a6dfa0406043b3a4", "Măduva, secțiune transversală"], ["f0276d0c5ab34d988f92c58c67b330de", "Vertebrele cu măduva"]],
  muschi: [["5671210f79784619a9232605b0a4e6aa", "Mușchii brațului"], ["af9a4101fa2c483cab363cf0a629762f", "Brațul, anatomie"], ["bd143831279c44e4b09035b872052c60", "Brațul, straturi"]],
  vase: [["35a61d7aefd24a1ea791ba743d381fae", "Arterele membrului superior"], ["9e710c08b921466d961df64439805e6a", "Arterele membrului superior (2)"], ["7691d2b07f7c42de9c037013b5c2f408", "Venele membrului superior"]],
  ganglioni: [["14800d739ecb46678d7584a401b0aa77", "Sistemul limfatic"], ["cc6896de8309441aabcefecb2d3f9b50", "Ganglionul limfatic"], ["5abcaca1574248c0860ae1d81b06998d", "Limfaticele capului și gâtului"]]
};
function model3dHtml(id){
  const L = labState(), list = M3D[id] || [];
  if (!list.length) return `<p class="hint">Pentru acest organ nu am încă un model 3D.</p>`;
  const mine = L.m3 && L.m3.org === id, k = mine ? Math.min(L.m3.k || 0, list.length - 1) : 0;
  const on = mine ? L.m3.on !== false : id !== "corp"; // corpul întreg e greu: pornește doar la cerere
  return `<div class="m3-box">${on
      ? `<iframe title="${esc(list[k][1])}" src="https://sketchfab.com/models/${list[k][0]}/embed?autostart=1&preload=1&ui_theme=dark&dnt=1" allow="autoplay; fullscreen; xr-spatial-tracking" allowfullscreen></iframe>`
      : `<button type="button" class="m3-start" data-act="m3-on" data-org="${id}"><span class="m3-ic">3D</span><b>Pornește modelul 3D</b></button>`}</div>
    ${list.length > 1 ? `<div class="m3-pick">${list.map(([u, n], i) => `<button type="button" class="chip${i === k ? " on" : ""}" data-act="m3-pick" data-m="${id}" data-i="${i}">${esc(n)}</button>`).join("")}</div>` : ""}
    <p class="hint">Rotești cu mouse-ul sau cu un deget, mărești cu rotița sau cu două degete. Modele 3D de pe Sketchfab, ale autorilor lor.</p>`;
}

/* ---- „Progresul meu”: panou lateral ---- */
const PROG_VIEWS = [["cal", "Calendar"], ["rev", "Greșeli"], ["stats", "Statistici"], ["mat", "Materie"], ["notes", "Notițe"]];
function openProg(view, date){
  const L = labState();
  if (view) L.view = view;
  if (!PROG_VIEWS.some(v => v[0] === L.view)) L.view = "cal";
  L.rev = null;
  $("#progOv").hidden = false; document.body.classList.add("no-scroll");
  renderProg();
  if (date){ const d = $("#exDate"); if (d){ d.value = date; d.focus(); } }
}
function closeProg(){ $("#progOv").hidden = true; document.body.classList.remove("no-scroll"); }
function renderProg(){
  const ov = $("#progOv"); if (!ov || ov.hidden) return;
  const L = labState(), nRev = dueWrong().length;
  if (!PROG_VIEWS.some(v => v[0] === L.view)) L.view = "cal";
  const body = { rev: revHtml, stats: statsHtml, mat: matHtml, cal: calHtml, notes: notesHtml }[L.view];
  $("#progNav").innerHTML = PROG_VIEWS.map(([k, t]) => `<button type="button" data-lv="${k}" aria-pressed="${L.view === k}">${t}${k === "rev" && nRev ? ` <span class="lab-n">${nRev}</span>` : ""}</button>`).join("");
  $("#progBody").innerHTML = `<div class="lab-body">${body()}</div>`;
}
$("#progNav").addEventListener("click", ev => { const b = ev.target.closest("[data-lv]"); if (!b) return; const L = labState(); L.view = b.dataset.lv; L.rev = null; renderProg(); $("#progBody").scrollTop = 0; });
$("#progOv").addEventListener("click", ev => { if (ev.target === $("#progOv") || ev.target.closest("[data-pclose]")) closeProg(); });
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !$("#progOv").hidden && imgOv.hidden) closeProg(); });
$("#progBtn").onclick = () => openProg();
function paintProgBtn(){
  const n = dueWrong().length, b = $("#progBtn"); if (!b) return;
  b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg><span>Progresul meu</span>${n ? `<i class="pb-n">${n}</i>` : ""}`;
}

/* ---- calendarul din colț ---- */
const CALW_KEY = "ghid.calw.mode";
let calMonth = 0;
function calWMode(){ try { const v = localStorage.getItem(CALW_KEY); return v === "min" || v === "full" ? v : "compact"; } catch { return "compact"; } }
function setCalWMode(m){ try { localStorage.setItem(CALW_KEY, m); } catch {} paintCalW(); }
const ICON_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
function paintCalW(){
  const w = $("#calW"); if (!w) return;
  const today = noon(Date.now()), mode = calWMode();
  const exams = PROG.exams.filter(e => parseDay(e.date) >= today).sort((a, b) => parseDay(a.date) - parseDay(b.date));
  const next = exams[0], days = next ? Math.round((parseDay(next.date) - today) / DAY) : null;
  const when = d => d === 0 ? "azi" : d === 1 ? "mâine" : `în ${d} zile`;
  if (mode === "min"){
    w.className = "cal-w min";
    w.innerHTML = `<button type="button" class="cal-pill" data-cw="compact" aria-label="Arată calendarul">${ICON_CAL}<span>${next ? `${esc(next.disc)} · ${when(days)}` : "Calendar"}</span></button>`;
    return;
  }
  const nextBtn = `<button type="button" class="cw-next" data-cw="open">${next
      ? `<span class="cw-cd" style="--oc:var(--${discColor(next.disc)})"><b>${days}</b><small>${days === 1 ? "zi" : "zile"}</small></span><span><b>${esc(next.disc)}</b><small>${new Date(parseDay(next.date)).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" })}${exams.length > 1 ? ` · +${exams.length - 1} ${exams.length === 2 ? "examen" : "examene"}` : ""}</small></span>`
      : `<span class="cw-cd empty">${ICON_CAL}</span><span><b>Data examenului</b><small>Adaug-o și primești planul de studiu</small></span>`}</button>`;
  if (mode === "compact"){
    w.className = "cal-w compact";
    w.innerHTML = `${nextBtn}<div class="cw-tools"><button type="button" class="icon-btn" data-cw="full" aria-label="Arată luna" title="Arată luna">${ICON_CAL}</button><button type="button" class="icon-btn" data-cw="min" aria-label="Micșorează" title="Micșorează">–</button></div>`;
    return;
  }
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + calMonth); base.setHours(12, 0, 0, 0);
  const y = base.getFullYear(), m = base.getMonth(), first = (base.getDay() + 6) % 7, nDays = new Date(y, m + 1, 0).getDate();
  const byDay = new Map(); PROG.exams.forEach(e => { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); });
  let cells = "";
  for (let i = 0; i < first; i++) cells += `<span></span>`;
  for (let d = 1; d <= nDays; d++){
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, t = new Date(y, m, d, 12).getTime();
    const ex = byDay.get(key), isT = key === dayKey(today), past = t < today;
    cells += `<button type="button" class="cd${isT ? " td" : ""}${ex ? " ex" : ""}${past ? " past" : ""}" data-cw="day" data-d="${key}"${ex ? ` style="--oc:var(--${discColor(ex[0].disc)})" title="Examen: ${esc(ex.map(e => e.disc).join(", "))}"` : past ? "" : ` title="Adaugă un examen pe ${d}"`}>${d}</button>`;
  }
  w.className = "cal-w full";
  w.innerHTML = `<div class="cw-h"><button type="button" class="icon-btn" data-cw="prev" aria-label="Luna anterioară">‹</button><b>${esc(base.toLocaleDateString("ro-RO", { month: "long", year: "numeric" }))}</b><button type="button" class="icon-btn" data-cw="next" aria-label="Luna următoare">›</button><button type="button" class="icon-btn" data-cw="compact" aria-label="Ascunde luna" title="Ascunde luna">–</button></div>
    <div class="cw-dow"><span>L</span><span>Ma</span><span>Mi</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
    <div class="cw-grid">${cells}</div>${nextBtn}`;
}
$("#calW").addEventListener("click", ev => {
  const b = ev.target.closest("[data-cw]"); if (!b) return;
  const a = b.dataset.cw;
  if (a === "min" || a === "compact" || a === "full"){ if (a === "full") calMonth = 0; setCalWMode(a); }
  else if (a === "prev"){ calMonth--; paintCalW(); }
  else if (a === "next"){ calMonth++; paintCalW(); }
  else if (a === "open") openProg("cal");
  else if (a === "day"){ const t = parseDay(b.dataset.d); openProg("cal", t >= noon(Date.now()) && !b.classList.contains("ex") ? b.dataset.d : ""); }
});
try { if (matchMedia("(max-width: 700px)").matches && localStorage.getItem(CALW_KEY) == null) localStorage.setItem(CALW_KEY, "min"); } catch {}
paintCalW(); paintProgBtn();

onLab("click", ev => {
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const L = labState(), a = b.dataset.act;
  if (a === "m3-on"){ L.m3 = { org: b.dataset.org, k: 0, on: true }; renderLab(); }
  else if (a === "m3-pick"){ L.m3 = { org: b.dataset.m, k: +b.dataset.i, on: true }; renderLab(); }
});
