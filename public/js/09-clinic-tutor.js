"use strict";
/* ---------------- v11: Anatomy & Clinical Lab (identificare, cazuri, semiologie), galerie 3 + „Mai multe”, AI Tutor ---------------- */
ANAT_CAT.imag = "Radiologie și imagistică";
/* galerie: cele mai bune 3, restul la „Mai multe” */
const _galHtml10 = galHtml;
galHtml = function(o){
  const L = labState(), cat = L.galCat || "3d";
  if (cat === "3d") return _galHtml10(o);
  const st = GAL.get(o.id + ":" + cat);
  if (!Array.isArray(st) || st.length <= 3) return _galHtml10(o);
  const more = !!(L.galMore && L.galMore[o.id + ":" + cat]);
  const shown = more ? st : st.slice(0, 3);
  return `<div class="gal-grid">${shown.map((c, i) => `<button type="button" class="gal-it" data-act="gal-open" data-i="${i}" title="${esc(c.v || c.title)}"><img src="${esc(c.thumb)}" alt="${esc(c.v || c.title)}" loading="lazy">${c.v ? `<span class="gal-cap">${esc(c.v)}</span>` : ""}</button>`).join("")}</div>
    <div class="row"><button type="button" class="btn sm" data-act="gal-more" data-k="${o.id}:${cat}">${more ? "Arată doar cele mai bune 3" : `Mai multe (${st.length - 3})`}</button><span class="hint">Apasă pe o imagine ca s-o vezi mare și s-o explice ghidul.</span></div>`;
};

/* ---- structura laboratorului ---- */
const LAB_VIEWS = [["anat", "Anatomie 3D"], ["ident", "Identificarea structurilor"], ["caz", "Cazuri clinice"], ["semio", "Semiologie"]];
const _renderLab10 = renderLab;
renderLab = function(){
  const L = labState(), p = $("#p-lab"), ov = $("#progOv");
  if (!L.lab) L.lab = "anat";
  if (p && (!ov || ov.hidden)){
    const body = L.lab === "ident" ? identHtml() : L.lab === "caz" ? cazLabHtml() : L.lab === "semio" ? semioHtml() : anatHtml();
    p.innerHTML = `<div class="lab-h"><div><h2 class="lab-title">Anatomy &amp; Clinical Lab</h2><p class="hint">Anatomie 3D, histologie, radiologie, identificarea structurilor, cazuri clinice și semiologie.</p></div>
      <div class="seg lab-nav">${LAB_VIEWS.map(([k, t]) => `<button type="button" data-lab="${k}" aria-pressed="${L.lab === k}">${t}</button>`).join("")}</div></div>
      <div class="lab-body">${body}</div>`;
  }
  try { renderProg(); paintCalW(); paintProgBtn(); } catch {}
  initM3();
};

/* ---- identificarea structurilor pe modele 3D ---- */
function identPool(){ return Object.entries(M3D_FULL).flatMap(([org, list]) => list.filter(m => m[2].length >= 4).map(m => ({ org, uid: m[0], title: m[1], names: m[2] }))); }
function identNew(){
  const L = labState(), pool = identPool().filter(m => !L.identOrg || L.identOrg === "toate" || m.org === L.identOrg);
  if (!pool.length) return;
  const m = pool[Math.floor(Math.random() * pool.length)], uniq = [...new Set(m.names)];
  const ans = Math.floor(Math.random() * m.names.length), right = m.names[ans];
  const wrong = shuffle(uniq.filter(n => n !== right)).slice(0, 3);
  L.ident = { m, ans, opts: shuffle([right, ...wrong]), right, picked: null, score: (L.ident && L.ident.score) || 0, n: (L.ident && L.ident.n) || 0 };
}
function identHtml(){
  const L = labState();
  if (!L.ident) identNew();
  const I = L.ident; if (!I) return `<p class="hint">Nu sunt modele potrivite.</p>`;
  const orgs = [...new Set(identPool().map(m => m.org))];
  const done = I.picked != null;
  return `<div class="ident">
    <div class="row"><label class="field"><span class="label">Organ</span><select data-act="ident-org"><option value="toate">Toate organele, la întâmplare</option>${orgs.map(o => `<option value="${o}"${L.identOrg === o ? " selected" : ""}>${esc((ORGANS.find(x => x.id === o) || {}).nume || o)}</option>`).join("")}</select></label>
      <span class="grow"></span><span class="pill">Scor: ${I.score}/${I.n}</span></div>
    <h4 class="m3-title">${esc(I.m.title)}</h4>
    <div class="m3-box"><iframe data-uid="${I.m.uid}" data-quiz="${I.ans}" title="Model pentru identificare" allow="autoplay; fullscreen; xr-spatial-tracking" allowfullscreen></iframe></div>
    <p class="ident-q"><b>Ce structură e marcată cu punctul nr. ${I.ans + 1}?</b> <span class="hint">Modelul se rotește singur spre ea. Dacă nu se vede, apasă pe „Arată din nou punctul”.</span></p>
    <div class="ident-opts">${I.opts.map(o => `<button type="button" class="opt${done ? (o === I.right ? " right" : o === I.picked ? " wrong" : "") : ""}" data-act="ident-pick" data-v="${esc(o)}" ${done ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>
    <div class="row">${done ? `<span class="verdict ${I.picked === I.right ? "ok" : "no"}">${I.picked === I.right ? "Corect" : `Greșit: răspunsul era „${esc(I.right)}”`}</span>` : ""}<span class="grow"></span>
      <button type="button" class="btn sm" data-act="ident-show">Arată din nou punctul</button><button type="button" class="btn sm primary" data-act="ident-next">${done ? "Următoarea structură" : "Sari peste"}</button></div>
  </div>`;
}
/* inițializarea modelului de identificare: etichetele ascunse, mergem la punctul cerut */
const _initM3_10 = initM3;
initM3 = async function(){
  const f = document.querySelector(".m3-box iframe[data-quiz]:not([data-init])");
  if (!f) return _initM3_10();
  f.dataset.init = "1"; M3API = null;
  const uid = f.dataset.uid, idx = +f.dataset.quiz;
  try { await loadScript(VIEWER_JS); } catch {}
  if (!window.Sketchfab || !f.isConnected){ if (f.isConnected) f.src = `https://sketchfab.com/models/${uid}/embed?autostart=1&annotation_tooltip_visible=0&ui_theme=dark&dnt=1`; return; }
  new window.Sketchfab(f).init(uid, { autostart: 1, preload: 1, ui_theme: "dark", ui_hint: 0, dnt: 1, annotation_tooltip_visible: 0, annotation_cycle: 0,
    success: api => { api.start(); api.addEventListener("viewerready", () => { if (!f.isConnected) return; M3API = api; setTimeout(() => { try { api.gotoAnnotation(idx, { preventCameraAnimation: false, preventCameraMove: false }); } catch {} }, 600); }); },
    error: () => {} });
};

/* ---- cazuri clinice interactive ---- */
const CAZ_SYS = ["Cardiovascular", "Respirator", "Digestiv", "Renal și urinar", "Nervos", "Endocrin și metabolic", "Hematologic", "Infecțios", "Locomotor", "Pediatrie", "Urgență"];
function cazLabHtml(){
  const L = labState(), C = L.cl;
  const head = `<div class="row"><label class="field"><span class="label">Sistem</span><select id="clSys">${CAZ_SYS.map(s => `<option${L.clSys === s ? " selected" : ""}>${s}</option>`).join("")}</select></label>
    <label class="field"><span class="label">Nivel</span><select id="clLvl"><option value="anul III–IV">Anii III–IV</option><option value="anul V–VI"${L.clLvl === "anul V–VI" ? " selected" : ""}>Anii V–VI</option><option value="rezidențiat"${L.clLvl === "rezidențiat" ? " selected" : ""}>Rezidențiat</option></select></label>
    <span class="grow"></span><button type="button" class="btn primary" data-act="cl-new" data-busy>${C ? "Alt pacient" : "Pacient nou"}</button></div>`;
  if (!C) return head + `<div class="placeholder"><h3>Un pacient fictiv, pas cu pas</h3><p>Primești prezentarea, apoi decizi la fiecare etapă: anamneză, examen obiectiv, investigații, diagnostic și tratament. După fiecare alegere afli rezultatul și de ce. Pacienții sunt inventați, pentru exersare.</p></div>`;
  const shown = C.pasi.slice(0, C.i + 1);
  return head + `<div class="cl-case">
    <div class="cl-pt"><b>${esc(C.titlu || "Caz clinic")}</b><p>${md(C.prezentare)}</p></div>
    ${shown.map((p, k) => { const ans = C.ans[k], done = ans != null;
      return `<section class="cl-step"><span class="cl-et">${k + 1}. ${esc(p.etapa)}</span><p class="qq-t">${mdi(p.intrebare)}</p>
        <div class="ident-opts">${arr(p.variante).map((v, j) => `<button type="button" class="opt${done ? (j === p.corect ? " right" : j === ans ? " wrong" : "") : ""}" data-act="cl-pick" data-k="${k}" data-j="${j}" ${done ? "disabled" : ""}>${mdi(v)}</button>`).join("")}</div>
        ${done ? `<div class="qx">${mdi(p.explicatie)}${p.rezultat ? `<p class="cl-res"><b>Rezultat:</b> ${mdi(p.rezultat)}</p>` : ""}</div>` : ""}</section>`; }).join("")}
    ${C.ans.length === C.pasi.length && C.ans[C.pasi.length - 1] != null ? `<section class="cl-end"><h3>Diagnostic: ${mdi(C.diagnostic)}</h3><p>${md(C.rezumat)}</p><p><b>${C.ans.filter((a, k) => a === C.pasi[k].corect).length}/${C.pasi.length}</b> decizii corecte.</p></section>` : ""}
  </div>`;
}
async function cazNew(){
  if (state.busy) return;
  const L = labState(); L.clSys = $("#clSys").value; L.clLvl = $("#clLvl").value;
  setBusy(true, "Se pregătește pacientul…");
  try {
    const r = await callClaude(`Creează un caz clinic FICTIV, interactiv, pentru studenți la medicină (${L.clLvl}), sistemul: ${L.clSys}. În română, conform ghidurilor actuale și practicii din Republica Moldova/UE.
Răspunde doar cu JSON:
{"titlu":"scurt, fără diagnostic","prezentare":"vârstă, sex, motivele prezentării, 2–4 propoziții","pasi":[{"etapa":"Anamneză|Examen obiectiv|Investigații|Diagnostic|Tratament","intrebare":"ce face/alege studentul","variante":["4 opțiuni plauzibile"],"corect":0,"explicatie":"de ce e corect și de ce celelalte nu (2–3 propoziții)","rezultat":"ce se află după acest pas (date noi despre pacient, valori, imagini descrise)"}],"diagnostic":"diagnosticul final","rezumat":"3–4 propoziții cu raționamentul și perlele de examen"}
Exact 5 pași, în ordinea etapelor. Indicele „corect” variază între pași.`, { tier: "default", noCache: true });
    const pasi = arr(r && r.pasi).filter(p => p && p.intrebare && arr(p.variante).length >= 3).map(p => Object.assign({}, p, { corect: Math.max(0, Math.min(arr(p.variante).length - 1, Number(p.corect) || 0)) }));
    if (!pasi.length) throw { code: "invalid_json" };
    L.cl = { titlu: r.titlu, prezentare: r.prezentare, pasi, diagnostic: r.diagnostic, rezumat: r.rezumat, i: 0, ans: [] };
    renderLab();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}

/* ---- exerciții de semiologie ---- */
const SEMIO_SYS = ["Aparatul respirator", "Aparatul cardiovascular", "Aparatul digestiv", "Aparatul renal", "Sistemul nervos", "Aparatul locomotor", "Examenul general"];
function semioHtml(){
  const L = labState(), S = L.sm;
  const head = `<div class="row"><label class="field"><span class="label">Aparat</span><select id="smSys">${SEMIO_SYS.map(s => `<option${L.smSys === s ? " selected" : ""}>${s}</option>`).join("")}</select></label>
    <span class="grow"></span><button type="button" class="btn primary" data-act="sm-new" data-busy>${S ? "Alte exerciții" : "Generează exerciții"}</button></div>`;
  if (!S) return head + `<div class="placeholder"><h3>Semne, manevre și interpretare</h3><p>Exerciții de semiologie: recunoști semnul descris, alegi manevra corectă de examinare sau interpretezi ce înseamnă. Fiecare răspuns vine cu explicația fiziopatologică.</p></div>`;
  return head + `<ol class="sm-list">${S.list.map((x, k) => { const a = S.ans[k], done = a != null;
    return `<li class="cl-step"><span class="cl-et">${esc(x.tip || "Exercițiu")}</span><p>${mdi(x.enunt)}</p><p class="qq-t">${mdi(x.intrebare)}</p>
      <div class="ident-opts">${arr(x.variante).map((v, j) => `<button type="button" class="opt${done ? (j === x.corect ? " right" : j === a ? " wrong" : "") : ""}" data-act="sm-pick" data-k="${k}" data-j="${j}" ${done ? "disabled" : ""}>${mdi(v)}</button>`).join("")}</div>
      ${done ? `<div class="qx">${mdi(x.explicatie)}</div>` : ""}</li>`; }).join("")}</ol>
    ${S.ans.filter(a => a != null).length === S.list.length ? `<p class="cl-end"><b>${S.ans.filter((a, k) => a === S.list[k].corect).length}/${S.list.length}</b> corecte.</p>` : ""}`;
}
async function semioNew(){
  if (state.busy) return;
  const L = labState(); L.smSys = $("#smSys").value;
  setBusy(true, "Se pregătesc exercițiile…");
  try {
    const r = await callClaude(`Creează 6 exerciții de SEMIOLOGIE MEDICALĂ pentru studenți la USMF, tema: ${L.smSys}. În română, termeni consacrați (de ex. matitate, raluri crepitante, semnul Blumberg, freamăt vocal).
Amestecă tipurile: „Recunoaște semnul” (descrii ce constată examinatorul), „Manevra de examinare” (cum se caută un semn), „Interpretare” (ce sugerează asocierea de semne), „Diferențiere” (două semne asemănătoare).
Răspunde doar cu JSON: {"exercitii":[{"tip":"...","enunt":"descrierea situației, 1–3 propoziții","intrebare":"...","variante":["4 opțiuni"],"corect":0,"explicatie":"mecanismul fiziopatologic și de ce celelalte variante nu se potrivesc (2–3 propoziții)"}]}
Indicele „corect” variază.`, { tier: "default", noCache: true });
    const list = arr(r && r.exercitii).filter(x => x && x.intrebare && arr(x.variante).length >= 3).map(x => Object.assign({}, x, { corect: Math.max(0, Math.min(arr(x.variante).length - 1, Number(x.corect) || 0)) }));
    if (!list.length) throw { code: "invalid_json" };
    L.sm = { list, ans: [] }; renderLab();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
function asQ(enunt, variante, corect){ const v = {}; arr(variante).forEach((x, k) => { v[LETTERS[k]] = String(x); }); return { enunt, tip: "CS", variante: v, corecte: [LETTERS[corect]] }; }

/* ---- evenimente ---- */
$("#p-lab").addEventListener("click", ev => {
  const b = ev.target.closest("[data-lab],[data-act]"); if (!b) return;
  const L = labState();
  if (b.dataset.lab){ L.lab = b.dataset.lab; renderLab(); return; }
  const a = b.dataset.act;
  if (a === "gal-more"){ L.galMore = L.galMore || {}; L.galMore[b.dataset.k] = !L.galMore[b.dataset.k]; renderLab(); }
  else if (a === "ident-pick"){
    const I = L.ident; if (!I || I.picked != null) return;
    I.picked = b.dataset.v; I.n++; if (I.picked === I.right) I.score++;
    progRecord(asQ(`Identifică structura nr. ${I.ans + 1} pe modelul „${I.m.title}”: ${I.right}`, I.opts, I.opts.indexOf(I.right)), [LETTERS[I.opts.indexOf(I.picked)]], "identificare", { topic: (ORGANS.find(o => o.id === I.m.org) || {}).nume || "Anatomie", disc: "Anatomie" });
    renderLab();
  }
  else if (a === "ident-next"){ identNew(); renderLab(); }
  else if (a === "ident-show"){ if (M3API) try { M3API.gotoAnnotation(L.ident.ans, { preventCameraAnimation: false, preventCameraMove: false }); } catch {} else toast("Modelul încă se încarcă"); }
  else if (a === "cl-new") cazNew();
  else if (a === "cl-pick"){
    const C = L.cl, k = +b.dataset.k, j = +b.dataset.j; if (!C || C.ans[k] != null) return;
    C.ans[k] = j; const p = C.pasi[k];
    progRecord(asQ(`${C.titlu}: ${p.intrebare}`, p.variante, p.corect), [LETTERS[j]], "caz", { topic: `Caz clinic: ${L.clSys || ""}`, disc: "" });
    if (k === C.i && C.i < C.pasi.length - 1) C.i++;
    renderLab();
  }
  else if (a === "sm-new") semioNew();
  else if (a === "sm-pick"){
    const S = L.sm, k = +b.dataset.k, j = +b.dataset.j; if (!S || S.ans[k] != null) return;
    S.ans[k] = j; const x = S.list[k];
    progRecord(asQ(`${x.enunt} ${x.intrebare}`, x.variante, x.corect), [LETTERS[j]], "semiologie", { topic: `Semiologie: ${L.smSys || ""}`, disc: "Semiologie medicală" });
    renderLab();
  }
});
$("#p-lab").addEventListener("change", ev => { if (ev.target.dataset && ev.target.dataset.act === "ident-org"){ labState().identOrg = ev.target.value; labState().ident = null; renderLab(); } });
Object.assign(SRC_LABEL, { identificare: "Identificarea structurilor", caz: "Cazuri clinice", semiologie: "Semiologie" });

/* ---------------- AI Tutor ---------------- */
const TKEY = "ghid.tutor.v1";
const TUT = { msgs: (() => { try { return JSON.parse(localStorage.getItem(TKEY) || "[]") || []; } catch { return []; } })(), busy: false, img: null, mode: "explica", ctl: null };
function tutSave(){ try { localStorage.setItem(TKEY, JSON.stringify(TUT.msgs.slice(-40))); } catch {} }
const TUT_MODES = { explica: "Explică-mi", socratic: "Ascultă-mă (întrebări pe rând)", caz: "Discută un caz cu mine" };
const TUT_STARTERS = ["Explică-mi diferența dintre sindromul nefrotic și cel nefritic", "Ascultă-mă la ciclul cardiac", "Cum interpretez o gazometrie arterială?", "Dă-mi un truc să rețin nervii cranieni"];
function renderTutor(){
  const p = $("#p-tutor"); if (!p) return;
  const topic = state.result && !(state.meta && state.meta.sample) ? stripMarks(state.result.titlu) : "";
  p.innerHTML = `<div class="tut">
    <div class="tut-h"><div><h2 class="lab-title">AI Tutor</h2><p class="hint">Vorbești cu tutorul tău de medicină. Întreabă orice, cere să te asculte sau trimite o imagine (radiografie, preparat, schemă).</p></div>
      <div class="row"><select id="tutMode" aria-label="Mod">${Object.entries(TUT_MODES).map(([k, t]) => `<option value="${k}"${TUT.mode === k ? " selected" : ""}>${t}</option>`).join("")}</select><button type="button" class="btn sm" id="tutNew">Conversație nouă</button></div></div>
    <div class="tut-log" id="tutLog">${TUT.msgs.length ? TUT.msgs.map(tutMsgHtml).join("") : `<div class="tut-empty"><p class="hint">Începe cu o întrebare sau alege una:</p><div class="tut-st">${TUT_STARTERS.map(s => `<button type="button" class="chip" data-st="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>`}</div>
    <form class="tut-in" id="tutForm">
      ${topic ? `<label class="tut-ctx"><input type="checkbox" id="tutCtx" checked> Ține cont de tema deschisă: „${esc(topic)}”</label>` : ""}
      ${TUT.img ? `<div class="tut-att"><img src="${TUT.img.url}" alt=""><button type="button" class="icon-btn" id="tutImgX" aria-label="Scoate imaginea">×</button></div>` : ""}
      <div class="tut-row"><label class="icon-btn tut-clip" title="Atașează o imagine" aria-label="Atașează o imagine"><input type="file" id="tutFile" accept="image/*" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5"/></svg></label>
        <textarea id="tutQ" rows="2" placeholder="Scrie întrebarea ta… (Enter trimite, Shift+Enter rând nou)"></textarea>
        ${TUT.busy ? `<button type="button" class="btn" id="tutStop">Oprește</button>` : `<button type="submit" class="btn primary">Trimite</button>`}</div>
    </form></div>`;
  const log = $("#tutLog"); log.scrollTop = log.scrollHeight;
  $("#tutMode").onchange = e => { TUT.mode = e.target.value; };
  $("#tutNew").onclick = () => { if (TUT.busy) return; TUT.msgs = []; tutSave(); renderTutor(); };
  $("#tutForm").onsubmit = e => { e.preventDefault(); tutSend(); };
  $("#tutQ").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); tutSend(); } });
  $("#tutFile").onchange = e => { const f = e.target.files[0]; if (!f) return; if (f.size > 8e6){ toast("Imaginea e prea mare (maxim 8 MB)"); return; } TUT.img = { blob: f, url: URL.createObjectURL(f) }; renderTutor(); $("#tutQ").focus(); };
  $("#tutImgX") && ($("#tutImgX").onclick = () => { TUT.img = null; renderTutor(); });
  $("#tutStop") && ($("#tutStop").onclick = () => { if (TUT.ctl) TUT.ctl.abort(); });
  $$(".tut-st .chip", p).forEach(c => c.onclick = () => { $("#tutQ").value = c.dataset.st; tutSend(); });
}
function tutMsgHtml(m){ return `<div class="tut-m ${m.r === "u" ? "u" : "a"}">${m.img ? `<span class="tut-imgnote">[imagine atașată]</span>` : ""}<div class="prose">${m.r === "u" ? esc(m.t).replace(/\n/g, "<br>") : md(m.t || "…")}</div></div>`; }
async function tutSend(){
  if (TUT.busy) return;
  const q = ($("#tutQ").value || "").trim(); if (!q && !TUT.img) return;
  const ctxOn = $("#tutCtx") && $("#tutCtx").checked, r = state.result;
  const img = TUT.img; TUT.img = null;
  TUT.msgs.push({ r: "u", t: q || "Ce se vede în imagine?", img: !!img });
  const a = { r: "a", t: "" }; TUT.msgs.push(a); TUT.busy = true; renderTutor();
  const hist = TUT.msgs.slice(-14, -1).map(m => `${m.r === "u" ? "STUDENT" : "TUTORE"}: ${m.t}`).join("\n\n");
  const modeTxt = { explica: "Explică clar, întâi simplu, apoi la nivel de examen; folosește exemple clinice.", socratic: "Nu da răspunsul direct: pune o singură întrebare pe rând, așteaptă răspunsul, corectează blând și urcă treptat dificultatea.", caz: "Condu un caz clinic fictiv pas cu pas: dă câte o informație, întreabă ce ar face studentul, apoi comentează." }[TUT.mode];
  const prompt = `Ești „AI Tutor”, tutorele de medicină al Ghidului studentului USMF. Vorbești în română, cald și concis, ca un asistent universitar bun. ${modeTxt}
Folosește markdown (liste scurte, **termeni-cheie**). Dacă nu ești sigur de ceva, spune. Pentru întrebări despre pacienți reali, amintește că nu înlocuiești medicul. Răspunde doar la ce ține de medicină și studiu.
${ctxOn && r ? `Tema deschisă de student: „${stripMarks(r.titlu)}”. Rezumat: ${stripMarks(r.rezumat || "").slice(0, 600)}\n` : ""}
Conversația de până acum:
${hist}

Răspunde la ultimul mesaj al studentului.`;
  TUT.ctl = new AbortController();
  try {
    const s = await sampleP;
    const opts = { modelTier: "default", signal: TUT.ctl.signal, onText: ({ text }) => { a.t = text; const ms = $$("#tutLog .tut-m.a"); const last = ms[ms.length - 1]; if (last){ $(".prose", last).innerHTML = md(text); const log = $("#tutLog"); log.scrollTop = log.scrollHeight; } } };
    if (img) opts.images = [img.blob];
    const { text } = await s(prompt, opts);
    a.t = text;
  } catch (e){ a.t = a.t || (e && e.code === "cancelled" ? "_(oprit)_" : `_${errCopy(e)}_`); }
  finally { TUT.busy = false; TUT.ctl = null; tutSave(); renderTutor(); $("#tutQ") && $("#tutQ").focus(); }
}
