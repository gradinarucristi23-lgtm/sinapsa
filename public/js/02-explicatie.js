"use strict";
/* ---------------- calling Claude ---------------- */
function setBusy(on, text){
  state.busy = on;
  $("#status").hidden = !on;
  if (on){ $("#stText").textContent = text || "Se gândește…"; $("#stSub").textContent = ""; }
  $$("[data-busy]").forEach(b => b.disabled = on);
  $("#go").disabled = on;
}
async function callClaude(prompt, { json = true, tier = "default", images = [], noCache = false, progress } = {}){
  const sample = await sampleP;
  if (!sample){ const e = { code: "not_available" }; throw e; }
  state.ctl = new AbortController();
  const opts = { signal: state.ctl.signal, modelTier: tier };
  if (images && images.length) opts.images = images;
  if (noCache) opts.cache = false;
  if (progress) opts.onText = progress;
  return json ? sample.json(prompt, opts) : sample(prompt, opts);
}
$("#stop").onclick = () => state.ctl && state.ctl.abort();

function explainProgress({ text }){
  const secs = (text.match(/"tip"\s*:/g) || []).length;
  let t = "Scrie explicația";
  if (/"glosar"\s*:/.test(text)) t = "Scrie glosarul";
  else if (/"capcane"\s*:/.test(text)) t = "Adună capcanele de examen";
  else if (/"caz_clinic"\s*:/.test(text)) t = "Scrie cazul clinic";
  else if (/"tabel"\s*:/.test(text)) t = "Construiește tabelul de sinteză";
  else if (/"schema"\s*:/.test(text)) t = "Desenează schema";
  else if (secs) t = `Scrie secțiunea ${secs}`;
  $("#stText").textContent = t + "…";
  $("#stSub").textContent = `${fmt(text.length)} caractere`;
}

async function generate({ regen = false } = {}){
  if (state.busy) return;
  const sample = await sampleP;
  if (!sample){ showNotice(errCopy({ code: "not_available" }), "err"); return; }
  if (state.sources.some(s => s.loading)){ showNotice("Așteaptă să se termine citirea surselor.", "warn"); return; }
  let req;
  if (regen && state.lastReq) req = state.lastReq;
  else {
    const mode = activeSources().length ? state.mode : "general";
    const query = $("#q").value.trim();
    if (mode === "general" && !query){ showNotice("Scrie tema pe care vrei să o explic.", "warn"); $("#q").focus(); return; }
    req = { mode, query, disc: $("#disc").value, tier: $("#depth").value, intent: state.intent, ctx: buildCtx(mode) };
  }
  if (!regen && req.mode === "general" && KB.on){
    const hits = await kbSearch(req.query, 4);
    if (hits[0] && hits[0].same && !state.kbSkip){ await kbReword(hits[0], req); return; }
    state.kbSkip = false;
    req.kbHits = hits.filter(h => h.score >= 0.34);
  }
  showNotice("");
  setBusy(true, "Se gândește…");
  if (req.kbHits && req.kbHits.length && req.kb === undefined){ $("#stText").textContent = "Consultă biblioteca comună…"; req.kb = await kbContext(req.kbHits); }
  selectTab("explicatie");
  const liveMeta = { mode: req.mode, query: req.query, sample: false, sources: req.ctx.ids || [] };
  let lastDraw = 0, shownPartial = false;
  const onText = u => {
    explainProgress(u);
    const now = Date.now();
    if (now - lastDraw < 300) return;
    lastDraw = now;
    const part = partialJSON(u.text);
    if (!part || part.in_afara_domeniului || !(part.titlu || part.rezumat)) return;
    const ks = Object.keys(part), si = ks.indexOf("schema");
    renderExplain({ partial: part, meta: liveMeta, schemaDone: si >= 0 && si < ks.length - 1 });
    shownPartial = true;
  };
  try {
    const r = await callClaude(explainPrompt(req.ctx, req.query, req.disc, req.kb), { tier: req.tier, images: req.ctx.images, noCache: regen, progress: onText });
    if (!r || typeof r !== "object") throw { code: "invalid_json" };
    if (r.in_afara_domeniului){ renderOutOfScope(r.mesaj); return; }
    if (!Array.isArray(r.sectiuni) || !r.sectiuni.length) throw { code: "invalid_json" };
    state.lastReq = req; state.ctx = req.ctx;
    state.result = r; state.meta = { mode: req.mode, query: req.query, sample: false, date: Date.now(), sources: req.ctx.ids || [] };
    state.exportSvg = null; state.exportFor = null;
    state.quiz = { list: [], answers: {}, checked: false };
    state.slides = { list: [], idx: 0 };
    state.flash = emptyFlash(); state.caz = emptyCaz(); state.tools.hy = null; state.vis = emptyVis();
    state.histId = null;
    saveHistory();
    renderAll(); selectTab("explicatie");
    setBusy(false);
    if (req.mode === "general") kbSave(r, req.query);
    if (req.intent === "examen") await genQuiz();
    else if (req.intent === "prezentare") await genSlides();
  } catch (e){
    if (shownPartial) renderExplain();
    if (e && e.code === "cancelled") showNotice("");
    else showNotice(errCopy(e), "err");
  } finally { setBusy(false); }
}
$("#go").onclick = () => generate();

/* Citește un JSON încă incomplet (pe măsură ce se scrie) și îl închide ca să poată fi afișat. */
function partialJSON(text){
  const start = text.indexOf("{"); if (start < 0) return null;
  const s = text.slice(start);
  const stack = [], snaps = [];
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++){
    const c = s[i];
    if (inStr){
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"'){ inStr = false; snaps.push([i + 1, stack.join("")]); }
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]"){ stack.pop(); snaps.push([i + 1, stack.join("")]); if (!stack.length) break; }
  }
  const close = st => st.split("").reverse().map(ch => ch === "{" ? "}" : "]").join("");
  if (inStr){
    let t = esc ? s.slice(0, -1) : s;
    t = t.replace(/\\u[0-9a-fA-F]{0,3}$/, "");
    try { return JSON.parse(t + '"' + close(stack.join(""))); } catch {}
  }
  for (let k = snaps.length - 1, n = 0; k >= 0 && n < 40; k--, n++){
    try { return JSON.parse(s.slice(0, snaps[k][0]) + close(snaps[k][1])); } catch {}
  }
  return null;
}
$("#q").addEventListener("keydown", ev => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) generate(); });

function renderOutOfScope(msg){
  const p = $("#p-explicatie");
  p.innerHTML = `<div class="oos"><span class="label">În afara domeniului</span><h2>Ghidul răspunde doar la teme medicale</h2><p class="lede">${esc(msg || "Cererea nu ține de medicină sau de științele biomedicale.")}</p><p class="hint">Încearcă o temă de anatomie, fiziologie, farmacologie, semiologie sau o specialitate clinică.</p></div>`;
  selectTab("explicatie");
}

/* ---------------- mermaid ---------------- */
let mmSeq = 0, mmQueue = Promise.resolve();
function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function screenVars(){
  return { primaryColor: cssVar("--hema-soft"), primaryBorderColor: cssVar("--hema"), primaryTextColor: cssVar("--ink"), lineColor: cssVar("--ink-2"),
    secondaryColor: cssVar("--eosin-soft"), tertiaryColor: cssVar("--surface-2"), mainBkg: cssVar("--hema-soft"), nodeBorder: cssVar("--hema"),
    clusterBkg: cssVar("--surface-2"), clusterBorder: cssVar("--line-2"), edgeLabelBackground: cssVar("--surface"), titleColor: cssVar("--ink"),
    textColor: cssVar("--ink"), background: cssVar("--surface"), fontFamily: '"IBM Plex Sans","Segoe UI",sans-serif', fontSize: "15px" };
}
const LIGHT_VARS = { primaryColor: "#E7E6F7", primaryBorderColor: "#3D379A", primaryTextColor: "#1D1A38", lineColor: "#55536F", secondaryColor: "#FCE4EE", tertiaryColor: "#ECEDF5", mainBkg: "#E7E6F7", nodeBorder: "#3D379A", clusterBkg: "#F3F4F9", clusterBorder: "#C5C8DA", edgeLabelBackground: "#FFFFFF", titleColor: "#1D1A38", textColor: "#1D1A38", background: "#FFFFFF", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "15px" };
function cleanMermaid(c){
  let s = String(c || "").trim().replace(/^```(?:mermaid)?\s*/i, "").replace(/```\s*$/, "").trim();
  s = s.replace(/\\n/g, "\n");
  if (!/^(flowchart|graph|mindmap|timeline|sequenceDiagram|stateDiagram|classDiagram)\b/i.test(s)) s = "flowchart TD\n" + s;
  return s;
}
function renderMermaid(code, vars, htmlLabels){
  const job = mmQueue.then(async () => {
    await loadScript(LIB.mermaid);
    const m = window.mermaid;
    m.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: vars, htmlLabels,
      flowchart: { htmlLabels, curve: "basis", padding: 14, nodeSpacing: 34, rankSpacing: 46, useMaxWidth: true } });
    const id = "mmd" + (++mmSeq);
    try { const { svg } = await m.render(id, cleanMermaid(code)); return svg; }
    finally { document.getElementById(id)?.remove(); document.getElementById("d" + id)?.remove(); }
  });
  mmQueue = job.catch(() => {});
  return job;
}
const mmCache = { key: "", svg: "" };
let mmDrawing = "", shownCode = "", shownLive = false;
function mmKey(code){ return code + "|" + cssVar("--ink"); }
async function drawSchema(live){
  const r = live || state.result; const code = r && r.schema && r.schema.mermaid;
  const fix = $("#fixMm");
  if (!code){
    if (!live){ const box = $("#mm"); if (box) box.innerHTML = `<div class="mm-wait">Schema lipsește din răspuns.</div>`; if (fix) fix.hidden = false; }
    return;
  }
  const key = mmKey(code);
  if (mmCache.key === key){ const box = $("#mm"); if (box && shownCode === code) box.innerHTML = mmCache.svg; if (fix) fix.hidden = true; return; }
  if (mmDrawing === key) return;
  mmDrawing = key;
  try {
    const svg = await renderMermaid(code, screenVars(), true);
    mmCache.key = key; mmCache.svg = svg;
    const box = $("#mm");
    if (box && shownCode === code){ box.innerHTML = svg; const f = $("#fixMm"); if (f) f.hidden = true; }
  } catch (e){
    const box = $("#mm");
    if (!shownLive && box && shownCode === code){
      box.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;max-width:100%"><span class="mm-wait">Schema nu a putut fi desenată. Apasă „Redesenează schema”.</span><pre>${esc(code)}</pre></div>`;
      const f = $("#fixMm"); if (f){ f.hidden = false; f.dataset.err = String((e && e.message) || e).slice(0, 400); }
    }
  } finally { if (mmDrawing === key) mmDrawing = ""; }
}
async function getExportSvg(){
  const r = state.result; const code = r && r.schema && r.schema.mermaid;
  if (!code) return null;
  if (state.exportFor === r && state.exportSvg) return state.exportSvg;
  try { const svg = await renderMermaid(code, LIGHT_VARS, false); state.exportSvg = svg; state.exportFor = r; return svg; }
  catch { return null; }
}
async function fixSchema(){
  if (state.busy) return;
  const r = state.result; if (!r) return;
  setBusy(true, "Redesenează schema…");
  try {
    const prompt = `Corectează sau creează o diagramă Mermaid validă pentru tema medicală „${r.titlu}”.
${r.schema && r.schema.mermaid ? `Diagrama actuală, care nu se poate desena:\n${r.schema.mermaid}\nEroare: ${$("#fixMm")?.dataset.err || "necunoscută"}` : `Rezumatul temei: ${r.rezumat}`}
Reguli stricte: începe cu flowchart TD; 7–14 noduri; ID-uri simple (A, B, C1); fiecare etichetă între ghilimele duble, de ex. A["Text scurt"]; pentru rând nou folosește <br/>; în etichete nu folosi ghilimele duble, paranteze drepte sau acolade; etichete pe săgeți scurte, fără ghilimele: A -->|activează| B; fără style, classDef sau comentarii. Textul în limba română.
Răspunde doar cu codul diagramei, fără explicații și fără blocuri de cod.`;
    const { text } = await callClaude(prompt, { json: false, tier: "default", noCache: true });
    r.schema = Object.assign({}, r.schema || { titlu: "Schemă", cum_se_citeste: "" }, { mermaid: cleanMermaid(text) });
    state.exportSvg = null; state.exportFor = null;
    saveHistory(); renderExplain();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
let themeT;
function onTheme(){ clearTimeout(themeT); themeT = setTimeout(drawSchema, 120); }
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onTheme); } catch {}
new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

/* ---------------- render: explanation ---------------- */
function renderExplain(opts){
  const live = !!(opts && opts.partial);
  const r = live ? opts.partial : state.result, m = (live ? opts.meta : state.meta) || {};
  const p = $("#p-explicatie");
  if (!r){
    p.innerHTML = `<div class="placeholder start"><h3>Începe în 3 pași</h3>
      <ol class="steps">
        <li><b>Scrie tema</b> în căsuța de sus, de exemplu „sindromul nefrotic” sau „mecanismul Frank–Starling”.</li>
        <li><b>Adaugă cursul, dacă vrei</b>, din panoul <button class="linkbtn" type="button" id="goSrc">Surse</button>. Fără curs, ghidul explică din manualele consacrate.</li>
        <li><b>Apasă Explică.</b> Primești explicația pe două niveluri, simplificat și avansat, cu schemă și întrebări scurte după fiecare parte.</li>
      </ol>
      <p class="start-more">După prima explicație apar și filele <b>Vizual</b>, <b>Quiz</b>, <b>Flashcards</b>, <b>Caz clinic</b>, <b>Prezentare</b> și <b>Instrumente</b>. Ai deja grile de la examen? Pune-le în <button class="linkbtn" type="button" id="goBank">Banca de grile</button>. Corpul uman în 3D, cazurile clinice și semiologia sunt în <button class="linkbtn" type="button" id="goLab">Anatomy &amp; Clinical Lab</button>, iar în <b>AI Tutor</b> vorbești cu tutorele, iar greșelile, statisticile și calendarul tău sunt în „Progresul meu”, sus.</p>
      <div class="row" style="margin-top:4px"><button class="btn" type="button" id="showSample">Arată un exemplu</button><span class="hint">Sistemul renină–angiotensină–aldosteron, cu grilă și prezentare</span></div></div>`;
    $("#showSample").onclick = () => toggleSample(true);
    $("#goBank").onclick = () => selectTab("bank");
    $("#goLab").onclick = () => selectTab("lab");
    $("#goSrc").onclick = () => { $("#srcPanel").scrollIntoView({ behavior: "smooth", block: "start" }); };
    return;
  }
  const code = (live && !opts.schemaDone) ? "" : ((r.schema && r.schema.mermaid) || "");
  const cachedSvg = code && mmCache.key === mmKey(code) ? mmCache.svg : "";
  const mmInner = cachedSvg || `<div class="mm-wait">${live && !opts.schemaDone ? "Schema apare imediat ce e scrisă…" : "Se desenează schema…"}</div>`;
  shownCode = code; shownLive = live;
  const secs = arr(r.sectiuni);
  const TC = ["c1", "c2", "c3"], PC = ["c4", "c5"], fqAns = fqStore(r);
  const secHtml = (s, n, col) => {
    const gi = secs.indexOf(s), f = s.fulger;
    const okF = !live && f && f.intrebare && arr(f.variante).length >= 2;
    const okImg = !live && s.imagine && String(s.imagine).trim() && m.mode !== "sursa";
    return `<article class="sec" style="--acc:var(--${col});--acc-soft:var(--${col}-soft)"><h3><span class="sec-n">${n}</span><span>${mdi(s.titlu)}</span></h3><div class="lv">
      <div class="lv-s"><span class="lv-tag">Simplificat</span><div class="prose">${md(s.simplu)}</div></div>
      <div class="lv-a"><span class="lv-tag">Avansat</span><div class="prose">${md(s.avansat)}</div></div></div>
      ${okImg ? `<figure class="sec-img" data-q="${esc(String(s.imagine).trim())}" data-gi="${gi}"><div class="img-wait">Se caută o imagine pe Wikimedia Commons…</div></figure>` : ""}
      ${okF ? fqHtml(f, gi, fqAns[gi]) : ""}</article>`;
  };
  const teorie = secs.filter(s => s.tip !== "practica"), practica = secs.filter(s => s.tip === "practica");
  const t = r.tabel && arr(r.tabel.coloane).length ? r.tabel : null;
  const cz = r.caz_clinic && r.caz_clinic.prezentare ? r.caz_clinic : null;
  const isDdx = !!(t && String(t.tip || "").toLowerCase() === "ddx");
  const tblHtml = t ? `<section class="block"><h3 class="block-h">${isDdx ? "Diagnostic diferențial: " : ""}${mdi(t.titlu || "Sinteză")}</h3><div class="tbl-wrap"><table class="${isDdx ? "ddx" : ""}"><thead><tr>${t.coloane.map(c => `<th>${mdi(c)}</th>`).join("")}</tr></thead><tbody>${arr(t.randuri).map(row => `<tr>${arr(row).map(c => `<td>${mdi(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>` : "";
  p.innerHTML = `
  <div class="ex-head">
    <div class="eyebrow"><span>${esc(r.disciplina || "Medicină")}</span>
      <span class="badge m-${m.mode}">${MODE_LABEL[m.mode] || ""}</span>
      ${m.sample ? `<span class="badge sample">Exemplu · generează propria temă</span>` : ""}${m.fromKb ? `<span class="badge m-sursa">${m.reworded ? "Din biblioteca comună, reformulată" : "Din biblioteca comună"}</span>` : ""}
      ${live ? `<span class="badge live"><span class="pulse"></span>Se scrie…</span>` : ""}</div>
    <h1>${mdi(r.titlu)}</h1>
    <p class="lede">${mdi(r.rezumat)}</p>
    ${m.mode !== "general" ? `<div class="legend"><span><span class="ref">S1 p.4</span> trimitere la sursă</span>${m.mode === "combinat" ? `<span><mark class="add">text marcat</mark> adăugat din afara sursei, ca să simplifice</span>` : ""}${arr(m.sources).length ? `<span>Surse: ${esc(m.sources.join(", "))}</span>` : ""}</div>` : ""}
    <div class="ex-actions">
      <div class="seg" role="group" aria-label="Nivel de explicație">
        <button type="button" data-lv="simplu" aria-pressed="${state.level === "simplu"}">Simplificat</button>
        <button type="button" data-lv="avansat" aria-pressed="${state.level === "avansat"}">Avansat</button>
        <button type="button" data-lv="ambele" aria-pressed="${state.level === "ambele"}">Ambele</button>
      </div>
      <span class="grow"></span>
      ${live ? "" : `${m.sample ? `<button class="btn sm" type="button" id="hideSample">Ascunde exemplul</button>` : ""}${!m.sample && state.lastReq && state.ctxHist === state.histId ? `<button class="btn sm" type="button" id="regen" data-busy>Regenerează</button>` : ""}
      <button class="btn sm" type="button" id="copyMd">Copiază</button>
      <button class="btn sm dl" type="button" id="dlMd">Descarcă (Word)</button>`}
    </div>
  </div>

  <figure class="schema">
    <div class="fig-h"><div><span class="label">Explicație vizuală</span><h2>${mdi((r.schema && r.schema.titlu) || "Schemă")}</h2></div>
      <div class="fig-act"><button class="btn sm" type="button" id="zoomMm">Mărește</button><button class="btn sm" type="button" id="fixMm" data-busy hidden>Redesenează schema</button></div></div>
    <div class="mm" id="mm">${mmInner}</div>
    ${r.schema && r.schema.cum_se_citeste ? `<p class="fig-read">${mdi(r.schema.cum_se_citeste)}</p>` : ""}
  </figure>

  ${isDdx ? tblHtml : ""}

  <div id="exBody" data-level="${state.level}">
    ${teorie.length ? `<section class="grp teorie"><h2 class="grp-h"><span class="dot"></span>Teorie <small>${teorie.length} secțiuni</small></h2>${teorie.map((s, i) => secHtml(s, i + 1, TC[i % 3])).join("")}</section>` : ""}
    ${practica.length ? `<section class="grp practica"><h2 class="grp-h"><span class="dot"></span>Practică <small>aplicare clinică</small></h2>${practica.map((s, i) => secHtml(s, teorie.length + i + 1, PC[i % 2])).join("")}</section>` : ""}
  </div>

  ${t && !isDdx ? tblHtml : ""}

  ${cz ? `<section class="block"><h3 class="block-h">Caz clinic</h3><div class="case"><div class="case-p"><span class="label">Prezentare</span>${mdi(cz.prezentare)}</div>
    ${arr(cz.intrebari).map(q => `<details class="qa"><summary>${mdi(q.intrebare)}</summary><div class="ans">${md(q.raspuns)}</div></details>`).join("")}</div></section>` : ""}

  ${(arr(r.mnemotehnici).length || arr(r.capcane).length) ? `<section class="block two">
    ${arr(r.mnemotehnici).length ? `<div class="card"><h4>Mnemotehnici</h4><ul>${r.mnemotehnici.map(x => `<li>${mdi(x)}</li>`).join("")}</ul></div>` : ""}
    ${arr(r.capcane).length ? `<div class="card pit"><h4>Capcane la examen</h4><ul>${r.capcane.map(x => `<li>${mdi(x)}</li>`).join("")}</ul></div>` : ""}
  </section>` : ""}

  ${arr(r.glosar).length ? `<section class="block"><h3 class="block-h">Glosar</h3><dl class="gloss">${r.glosar.map(g => `<dt>${mdi(g.termen)}</dt><dd>${mdi(g.definitie)}</dd>`).join("")}</dl></section>` : ""}

  ${m.mode === "general" && arr(r.bibliografie).length ? `<section class="block"><div class="card biblio"><h4>Tratate și ghiduri de referință pentru aprofundare</h4><ul>${r.bibliografie.map(b => `<li><b>${mdi(b.titlu)}</b>${b.pentru ? `: ${mdi(b.pentru)}` : ""}</li>`).join("")}</ul><p class="hint" style="margin-top:8px">Listă propusă de AI pentru tema explicată. Verifică ediția recomandată de catedră.</p></div></section>` : ""}
  ${m.mode === "combinat" && arr(r.adaugiri).length ? `<section class="block"><div class="card adds"><h4>Ce am adăugat din afara sursei și de ce</h4><ul>${r.adaugiri.map(a => `<li>${mdi(a.continut)}<span>${mdi(a.motiv)}</span></li>`).join("")}</ul></div></section>` : ""}
  ${m.mode === "sursa" && arr(r.neacoperit).length ? `<section class="block"><div class="card gaps"><h4>Ce nu acoperă sursa</h4><ul>${r.neacoperit.map(a => `<li>${mdi(a)}</li>`).join("")}</ul><p class="hint" style="margin-top:8px">Trece pe modul Combinat dacă vrei ca aceste goluri să fie explicate, marcat separat.</p></div></section>` : ""}

  ${live ? `<p class="hint" style="margin-top:24px">Explicația se scrie în continuare…</p>` : `<div class="next">
    <button class="btn" type="button" id="toQuiz">Fă un quiz din tema asta</button>
    <button class="btn" type="button" id="toPoster">Fă un poster vizual</button>
    <button class="btn" type="button" id="toFlash">Fă flashcards</button>
    <button class="btn" type="button" id="toCaz">Rezolvă un caz clinic</button>
    <button class="btn" type="button" id="toSlides">Fă o prezentare</button>
  </div>

  <section class="ask">
    <span class="label">Nu e clar ceva?</span>
    <div class="ask-row"><input id="askIn" placeholder="Întreabă despre această temă: de ce…, care e diferența dintre…" aria-label="Întrebare suplimentară"><button class="btn" type="button" id="askGo" data-busy>Întreabă</button></div>
    <div class="ask-out prose" id="askOut" hidden></div>
  </section>`}`;

  $$(".seg button", p).forEach(b => b.onclick = () => {
    state.level = b.dataset.lv; $("#exBody").dataset.level = state.level;
    $$(".seg button", p).forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  });
  if (live){ if (code && !cachedSvg) drawSchema(r); return; }
  $("#regen") && ($("#regen").onclick = () => generate({ regen: true }));
  $("#hideSample") && ($("#hideSample").onclick = () => toggleSample(false));
  $("#copyMd").onclick = () => copyText(resultToMd(state.result));
  $("#dlMd").onclick = () => saveDoc(slug(r.titlu), r.titlu, resultToMd(state.result));
  $("#zoomMm").onclick = ev => { const on = $("#mm").classList.toggle("big"); ev.currentTarget.textContent = on ? "Micșorează" : "Mărește"; };
  $("#fixMm").onclick = fixSchema;
  $("#toQuiz").onclick = () => { selectTab("quiz"); if (!state.quiz.list.length || state.quiz.sample) genQuiz(); };
  $("#toSlides").onclick = () => { selectTab("prezentare"); if (!state.slides.list.length || state.slides.sample) genSlides(); };
  $("#toFlash").onclick = () => { selectTab("flash"); if (!state.flash.list.length) genFlash(); };
  $("#toPoster").onclick = () => { selectTab("vis"); if (!state.vis.poster) genPoster(); };
  $("#toCaz").onclick = () => { selectTab("caz"); if (!state.caz.data) genCaz(); };
  $("#askGo").onclick = askFollowup;
  $("#askIn").addEventListener("keydown", ev => { if (ev.key === "Enter") askFollowup(); });
  if (state.busy) $$("[data-busy]", p).forEach(b => b.disabled = true);
  try { linkTerms(p, r.glosar); } catch (e){ console.error(e); }
  loadSectionImages(p);
  drawSchema();
}

function toggleSample(on){
  if (state.busy) return;
  state.result = on ? SAMPLE.result : null;
  state.meta = on ? SAMPLE.meta : null;
  state.histId = null;
  state.quiz = on ? { list: SAMPLE.quiz, answers: {}, checked: false, sample: true } : { list: [], answers: {}, checked: false };
  state.slides = on ? { list: SAMPLE.slides, idx: 0, sample: true } : { list: [], idx: 0 };
  state.flash = emptyFlash(); state.caz = emptyCaz(); state.tools.hy = null; state.vis = emptyVis();
  state.exportSvg = null; state.exportFor = null;
  renderAll(); selectTab("explicatie");
}

function ctxForCurrent(){
  if (state.ctx && state.meta && !state.meta.sample && state.histId === state.ctxHist) return state.ctx;
  return { mode: (state.meta && state.meta.mode) || "general", srcText: "", images: [], imgMap: "" };
}
async function askFollowup(){
  const q = $("#askIn").value.trim(); if (!q || state.busy) return;
  const out = $("#askOut"); out.hidden = false; out.innerHTML = `<p class="hint">Se gândește…</p>`;
  const ctx = ctxForCurrent();
  const prompt = `${ROLE}
${modeRules(ctx.mode)}${ctx.mode !== "general" && !ctx.srcText ? "\n(Sursele originale nu mai sunt disponibile: bazează-te pe explicația de mai jos, păstrând referințele ei.)" : ""}

Studentul a citit explicația de mai jos și are o întrebare. Răspunde clar și precis, la nivelul cerut de întrebare, în 80–250 de cuvinte, în markdown simplu (paragrafe, liste, **bold**), respectând regulile modului de mai sus (referințe și marcaje). Dacă întrebarea nu ține de medicină, spune asta pe scurt.

EXPLICAȚIA:
${resultToMd(state.result, true)}${srcSection(ctx)}

ÎNTREBAREA: ${q}`;
  setBusy(true, "Răspunde la întrebare…");
  try {
    const { text } = await callClaude(prompt, { json: false, tier: "default", images: ctx.images, noCache: true, progress: ({ text }) => { out.innerHTML = md(text); } });
    out.innerHTML = md(text);
  } catch (e){
    if (e && e.code === "cancelled"){ if (!e.text) out.hidden = true; }
    else out.innerHTML = `<p class="hint">${esc(errCopy(e))}</p>`;
  } finally { setBusy(false); }
}
