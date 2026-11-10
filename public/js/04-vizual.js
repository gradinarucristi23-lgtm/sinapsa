"use strict";
/* ---------------- VIZUAL: poster, diagrame la cerere, imagini reale ---------------- */
LIB.h2c = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
function emptyVis(){ return { poster: null, posterSvg: "", diagrams: [], imgQ: "", imgList: [], imgSel: -1, imgOut: "", terms: [] }; }
const POSTER_COLORS = { violet: "#4B3FC9", teal: "#0B7F74", rosu: "#B42D3A", chihlimbar: "#A86100" };
const POSTER_SOFT = { violet: "#EEEBFC", teal: "#DDF3F0", rosu: "#FBE6E8", chihlimbar: "#FBF0DC" };
function visMaterial(){
  if (state.result) return `TEMA (explicația existentă):\n${resultToMd(state.result, true)}`;
  const q = $("#q").value.trim();
  return q ? `TEMA: ${q}` : "";
}
function visModeRule(){
  const mode = (state.meta && state.meta.mode) || "general";
  return mode === "sursa" ? "Folosește NUMAI informația din explicația de mai jos (care provine din sursa studentului); nu adăuga fapte noi." : "";
}

/* ---- poster ---- */
function posterVars(){
  const c = POSTER_COLORS[state.visPrefs.color] || POSTER_COLORS.violet;
  return Object.assign({}, LIGHT_VARS, { primaryBorderColor: c, nodeBorder: c, primaryColor: "#FFFFFF", mainBkg: "#FFFFFF", lineColor: c, fontSize: "16px" });
}
/* dacă schema posterului nu se poate desena, posterul folosește schema temei */
async function setPoster(p){
  const V = state.vis; V.poster = p; V.posterSvg = "";
  const tries = [p.schema, state.result && state.result.schema && state.result.schema.mermaid].filter(Boolean);
  for (const code of tries){
    try { V.posterSvg = await renderMermaid(code, posterVars(), false); p.schema = code; break; } catch {}
  }
}
async function genPoster(){
  if (state.busy) return;
  const material = visMaterial();
  if (!material){ toast("Scrie o temă sus sau generează întâi o explicație"); $("#q").focus(); return; }
  const V = state.vis, style = $("#psStyle").value, focus = $("#psFocus").value.trim();
  state.visPrefs.style = style; state.visPrefs.color = $("#psColor").value; state.visPrefs.focus = focus;
  setBusy(true, "Compune posterul…");
  try {
    const p = await callClaude(`${ROLE}
${visModeRule()}
Creează conținutul unui POSTER de studiu, concis și concret, pe tema de mai jos${focus ? `, cu accent pe: ${focus}` : ""}. Stil: ${style === "fisa" ? "fișă de recapitulare densă, pentru ultima zi dinaintea examenului" : "infografic aerisit, ușor de citit dintr-o privire"}.
Reguli: frază telegrafică, fără introduceri; fiecare punct are cel mult 10 cuvinte; doar informații corecte și esențiale (high-yield).
FORMAT: răspunde doar cu un obiect JSON:
{"titlu":"…","subtitlu":"o linie","idee":"ideea centrală, o propoziție","schema":"diagramă Mermaid: flowchart TD cu 5–8 noduri, etichete scurte între ghilimele duble, <br/> pentru rând nou, săgeți A --> B sau A -->|verb| B; fiecare nod are forma ID["Text"], de ex. A["Renină"] -->|activează| B["Angiotensina I"]; nu pune săgeți sau ghilimele în interiorul parantezelor drepte; rândurile separate cu \\n","blocuri":[{"titlu":"…","puncte":["…"]}],"cifre":[{"valoare":"…","eticheta":"…"}],"mnemonic":{"text":"…","cheie":"…"},"atentie":["…"]}
Cantități: ${style === "fisa" ? "6 blocuri a câte 3–5 puncte" : "4 blocuri a câte 2–4 puncte"}; 3–4 cifre-cheie (valori, criterii, doze), sau [] dacă tema nu are; "mnemonic" = null dacă nu există unul bun; 2–3 puncte la "atentie" (capcane sau semne de alarmă).

${material}`, { tier: "default", noCache: true, progress: ({ text }) => { $("#stSub").textContent = `${fmt(text.length)} caractere`; } });
    if (!p || !p.titlu || !arr(p.blocuri).length) throw { code: "invalid_json" };
    await setPoster(p);
    renderVis();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
function posterHtml(p, svg, style, color){
  const li = a => arr(a).map(x => `<li>${mdi(x)}</li>`).join("");
  return `<div class="poster pst-${style}" id="posterSheet" style="--p:${POSTER_COLORS[color] || POSTER_COLORS.violet};--p-soft:${POSTER_SOFT[color] || POSTER_SOFT.violet}">
    <header class="pst-h"><span class="pst-brand">Ghidul studentului USMF</span><h2>${mdi(p.titlu)}</h2>${p.subtitlu ? `<p>${mdi(p.subtitlu)}</p>` : ""}</header>
    ${p.idee ? `<p class="pst-idea">${mdi(p.idee)}</p>` : ""}
    ${svg ? `<div class="pst-schema">${svg}</div>` : ""}
    ${arr(p.cifre).length ? `<div class="pst-stats">${p.cifre.map(c => `<div class="pst-stat"><b>${mdi(c.valoare)}</b><span>${mdi(c.eticheta)}</span></div>`).join("")}</div>` : ""}
    <div class="pst-blocks">${arr(p.blocuri).map((b, i) => `<section><h3><i>${i + 1}</i>${mdi(b.titlu)}</h3><ul>${li(b.puncte)}</ul></section>`).join("")}</div>
    <div class="pst-bottom">
      ${p.mnemonic && p.mnemonic.text ? `<div class="pst-mn"><span>Mnemonic</span><b>${mdi(p.mnemonic.text)}</b>${p.mnemonic.cheie ? `<small>${mdi(p.mnemonic.cheie)}</small>` : ""}</div>` : ""}
      ${arr(p.atentie).length ? `<div class="pst-warn"><span>Atenție</span><ul>${li(p.atentie)}</ul></div>` : ""}
    </div>
    <footer class="pst-f">Generat cu AI în Ghidul studentului USMF (proiect neoficial). Verifică informația cu cursul.</footer>
  </div>`;
}
function fitPoster(){
  const stage = $("#posterStage"), sheet = $("#posterSheet");
  if (!stage || !sheet) return;
  const s = Math.min(1, stage.clientWidth / 794);
  sheet.style.transform = `scale(${s})`;
  stage.style.height = Math.ceil(sheet.offsetHeight * s) + "px";
}
addEventListener("resize", () => { clearTimeout(fitPoster._t); fitPoster._t = setTimeout(fitPoster, 120); });
async function posterPng(){
  const sheet = $("#posterSheet"); if (!sheet) return;
  try {
    await loadScript(LIB.h2c);
    const prev = sheet.style.transform; sheet.style.transform = "none";
    let canvas;
    try { canvas = await window.html2canvas(sheet, { scale: 2, backgroundColor: "#FFFFFF", useCORS: true, logging: false }); }
    finally { sheet.style.transform = prev; }
    const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
    await saveFile(slug("poster " + (state.vis.poster.titlu || "")) + ".png", blob);
  } catch (e){ console.error(e); toast("Posterul nu a putut fi transformat în imagine. Folosește „Salvează PDF”."); }
}
function posterPrint(){
  const sheet = $("#posterSheet"); if (!sheet) return;
  const root = document.createElement("div"); root.id = "printRoot";
  const clone = sheet.cloneNode(true); clone.removeAttribute("id"); clone.style.transform = "none";
  root.appendChild(clone); document.body.appendChild(root); document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); root.remove(); removeEventListener("afterprint", done); };
  addEventListener("afterprint", done);
  setTimeout(() => { window.print(); setTimeout(() => { if (document.body.contains(root)) done(); }, 1500); }, 60);
}

/* ---- diagrame la cerere ---- */
const DIAG_TYPES = {
  harta: { nume: "Hartă mentală", reguli: 'Folosește sintaxa mindmap: prima linie este "mindmap", a doua root((Tema scurtă)), apoi ramurile indentate cu câte 2 spații în plus pe fiecare nivel; 4–6 ramuri principale, fiecare cu 2–4 subramuri; textul nodurilor fără paranteze, ghilimele sau două puncte.' },
  algoritm: { nume: "Algoritm de diagnostic / tratament", reguli: 'Folosește flowchart TD: un algoritm cu decizii; nodurile de decizie au forma D{"Întrebare?"}, celelalte A["Pas"]; ramurile de decizie au etichete scurte: D -->|Da| E și D -->|Nu| F; 8–14 noduri.' },
  clasificare: { nume: "Clasificare", reguli: 'Folosește flowchart LR: un arbore de clasificare; rădăcina este tema, apoi categoriile și subtipurile, fiecare nod A["Text"]; 8–16 noduri.' },
  mecanism: { nume: "Mecanism / cascadă", reguli: 'Folosește flowchart TD: o cascadă cauză-efect cu 8–14 noduri A["Text"]; săgeți cu etichete scurte A -->|activează| B; poți grupa pașii în subgraph cu titlu între ghilimele.' }
};
async function genDiagram(){
  if (state.busy) return;
  const material = visMaterial();
  if (!material){ toast("Scrie o temă sus sau generează întâi o explicație"); $("#q").focus(); return; }
  const type = $("#dgType").value, focus = $("#dgFocus").value.trim(), T = DIAG_TYPES[type] || DIAG_TYPES.mecanism;
  state.visPrefs.dgType = type;
  setBusy(true, "Desenează diagrama…");
  try {
    const d = await callClaude(`${ROLE}
${visModeRule()}
Creează o diagramă Mermaid în limba română pentru tema de mai jos. Tip: ${T.nume}.${focus ? ` Concentrează-te pe: ${focus}.` : ""}
${T.reguli}
Reguli generale: cel mult 6 cuvinte pe rând (folosește <br/> pentru rând nou); în textul etichetelor nu folosi ghilimele duble, paranteze drepte sau acolade; fără style, classDef, click sau comentarii. La flowchart, fiecare nod are forma ID["Text"] (la decizii ID{"Întrebare?"}) și nu conține săgeți în interiorul parantezelor.
FORMAT: răspunde doar cu un obiect JSON: {"titlu":"…","mermaid":"codul diagramei, cu rândurile separate prin \\n","explicatie":"2–3 propoziții: cum se citește diagrama și ce trebuie reținut"}

${material}`, { tier: "default", noCache: true });
    if (!d || !d.mermaid) throw { code: "invalid_json" };
    let svg = "";
    try { svg = await renderMermaid(d.mermaid, screenVars(), true); } catch { svg = ""; }
    state.vis.diagrams.unshift({ titlu: d.titlu || T.nume, tip: T.nume, mermaid: d.mermaid, explicatie: d.explicatie || "", svg, key: mmKey(d.mermaid) });
    renderVis();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
async function svgToPngBlob(svgStr){
  const doc = new DOMParser().parseFromString(svgStr, "image/svg+xml"), svg = doc.documentElement;
  const vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  const w = vb[2] || 800, h = vb[3] || 600;
  svg.setAttribute("width", w); svg.setAttribute("height", h); svg.removeAttribute("style");
  if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  await img.decode();
  const sc = Math.max(1, Math.min(3, 2400 / Math.max(w, h)));
  const c = document.createElement("canvas"); c.width = Math.round(w * sc); c.height = Math.round(h * sc);
  const cx = c.getContext("2d"); cx.fillStyle = "#FFFFFF"; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(img, 0, 0, c.width, c.height);
  return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("toBlob")), "image/png"));
}
async function downloadDiagram(i){
  const d = state.vis.diagrams[i]; if (!d) return;
  const name = slug("diagrama " + d.titlu);
  try {
    const svg = await renderMermaid(d.mermaid, LIGHT_VARS, false);
    try { await saveFile(name + ".png", await svgToPngBlob(svg)); }
    catch { await saveFile(name + ".svg", svg); }
  } catch { toast("Diagrama nu a putut fi exportată"); }
}

/* ---- imagini reale (Wikimedia Commons) ---- */
async function searchImages(q){
  const V = state.vis;
  q = (q || $("#imQ").value || "").trim();
  if (!q){ toast("Scrie ce imagine cauți (merge cel mai bine în engleză)"); return; }
  V.imgQ = q; V.imgSel = -1; V.imgOut = ""; V.imgList = null; renderVis();
  try { V.imgList = await commonsSearch(q); } catch { V.imgList = []; }
  if (V.imgQ === q) renderVis();
}
async function suggestTerms(){
  if (state.busy) return;
  const material = visMaterial();
  if (!material){ toast("Scrie o temă sus sau generează întâi o explicație"); return; }
  setBusy(true, "Caută termeni pentru imagini…");
  try {
    const t = await callClaude(`Pentru tema medicală de mai jos, propune 6 căutări în ENGLEZĂ pentru imagini educative pe Wikimedia Commons (diagrame anatomice, histologie, imagistică, semne clinice). Fiecare căutare are 2–5 cuvinte, specifice, fără ghilimele.
Răspunde doar cu un array JSON de șiruri.

${material.slice(0, 6000)}`, { tier: "default", noCache: true });
    state.vis.terms = arr(t).map(String).filter(Boolean).slice(0, 8);
    renderVis();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
async function explainGalleryImage(btn){
  const V = state.vis, c = V.imgList && V.imgList[V.imgSel]; if (!c) return;
  const out = $("#imOut"); out.hidden = false;
  if (imgExpCache.has(c.thumb)){ V.imgOut = imgExpCache.get(c.thumb); out.innerHTML = md(V.imgOut); return; }
  btn.disabled = true; out.innerHTML = `<p class="hint">Se analizează imaginea…</p>`;
  try {
    const blob = await (await fetch(c.thumb)).blob();
    const s = await sampleP;
    const { text } = await s(`Ești tutore de medicină pentru studenți. Imaginea atașată („${c.title}”, de pe Wikimedia Commons) a fost găsită căutând „${V.imgQ}”${state.result ? ` pentru tema „${stripMarks(state.result.titlu)}”` : ""}.
Explică în limba română ce se vede: tipul imaginii, structurile și etichetele (tradu-le în română), ce arată în legătură cu tema și ce trebuie reținut. 100–180 de cuvinte, markdown simplu (un paragraf scurt și o listă). Dacă imaginea nu e relevantă, spune asta într-o propoziție.`, { modelTier: "default", images: [blob], onText: ({ text }) => { out.innerHTML = md(text); } });
    imgExpCache.set(c.thumb, text); V.imgOut = text; out.innerHTML = md(text);
  } catch (e){ out.innerHTML = `<p class="hint">${esc(e && e.code ? errCopy(e) : "Imaginea nu a putut fi pregătită pentru analiză. Încearcă alta.")}</p>`; }
  finally { btn.disabled = false; }
}

/* ---- randare tab Vizual ---- */
function renderVis(){
  const p = $("#p-vis"); if (!p) return;
  const V = state.vis, P = state.visPrefs;
  const topic = state.result ? `tema „${esc(stripMarks(state.result.titlu))}”` : "tema scrisă sus";
  const secTerms = state.result ? arr(state.result.sectiuni).map(s => String(s.imagine || "").trim()).filter(Boolean) : [];
  const chips = [...new Set([...secTerms, ...V.terms])];
  const sel = V.imgList && V.imgSel >= 0 ? V.imgList[V.imgSel] : null;
  p.innerHTML = `
  <section class="tool vis-tool">
    <div class="tool-h"><div><h3>Poster vizual</h3><p class="hint">Un poster concis pentru ${topic}: schemă, cifre-cheie, idei pe blocuri, mnemonic și capcane. Îl descarci ca imagine sau PDF.</p></div></div>
    <div class="row vis-row">
      <div class="field"><span class="label">Stil</span><select id="psStyle"><option value="infografic">Infografic</option><option value="fisa">Fișă de recapitulare</option></select></div>
      <div class="field"><span class="label">Culoare</span><select id="psColor"><option value="violet">Violet</option><option value="teal">Turcoaz</option><option value="rosu">Roșu</option><option value="chihlimbar">Chihlimbar</option></select></div>
      <div class="field grow"><span class="label">Accent (opțional)</span><input id="psFocus" class="vis-in" placeholder="de ex. doar tratamentul, sau diagnosticul diferențial" value="${esc(P.focus || "")}"></div>
      <button class="btn primary" type="button" id="psGo" data-busy>${V.poster ? "Generează alt poster" : "Generează posterul"}</button>
    </div>
    ${V.poster ? `<div class="poster-stage" id="posterStage">${posterHtml(V.poster, V.posterSvg, P.style, P.color)}</div>
      <div class="row"><button class="btn sm dl" type="button" id="psPng">Descarcă PNG</button><button class="btn sm" type="button" id="psPdf">Salvează PDF / printează</button></div>` : ""}
  </section>

  <section class="tool vis-tool">
    <div class="tool-h"><div><h3>Diagramă la cerere</h3><p class="hint">Alege tipul de diagramă și, opțional, partea din temă pe care o vrei desenată.</p></div></div>
    <div class="row vis-row">
      <div class="field"><span class="label">Tip</span><select id="dgType">${Object.entries(DIAG_TYPES).map(([k, t]) => `<option value="${k}">${t.nume}</option>`).join("")}</select></div>
      <div class="field grow"><span class="label">Despre ce (opțional)</span><input id="dgFocus" class="vis-in" placeholder="de ex. conduita în criza hipertensivă"></div>
      <button class="btn primary" type="button" id="dgGo" data-busy>Desenează</button>
    </div>
    ${V.diagrams.map((d, i) => `<figure class="dg">
      <figcaption><span class="label">${esc(d.tip)}</span><b>${mdi(d.titlu)}</b></figcaption>
      <div class="mm dg-mm" data-i="${i}">${d.svg || `<div class="mm-wait">Diagrama nu a putut fi desenată. Apasă din nou „Desenează”.</div>`}</div>
      ${d.explicatie ? `<p class="fig-read">${mdi(d.explicatie)}</p>` : ""}
      <div class="row dg-act"><button class="btn sm dl" type="button" data-dg="png" data-i="${i}">Descarcă PNG</button><button class="btn sm" type="button" data-dg="del" data-i="${i}">Șterge</button></div>
    </figure>`).join("")}
  </section>

  <section class="tool vis-tool">
    <div class="tool-h"><div><h3>Imagini reale</h3><p class="hint">Diagrame anatomice, histologie, imagistică și semne clinice din Wikimedia Commons, cu licență liberă. Căutarea merge cel mai bine în engleză.</p></div>
      <button class="btn sm" type="button" id="imSuggest" data-busy>Sugerează căutări</button></div>
    ${chips.length ? `<div class="examples">${chips.map(t => `<button class="chip" type="button" data-term="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
    <div class="ask-row"><input id="imQ" placeholder="de ex. nephron diagram, liver histology, chest x-ray pneumonia" value="${esc(V.imgQ || "")}"><button class="btn primary" type="button" id="imGo">Caută</button></div>
    ${V.imgList === null ? `<p class="hint">Se caută…</p>` : V.imgQ && !arr(V.imgList).length ? `<p class="hint">Nu am găsit imagini pentru „${esc(V.imgQ)}”. Încearcă alți termeni, în engleză.</p>` : ""}
    ${arr(V.imgList).length ? `<div class="gal">${V.imgList.map((c, i) => `<button type="button" class="gal-i${i === V.imgSel ? " on" : ""}" data-gi="${i}" title="${esc(c.title)}"><img src="${esc(c.thumb)}" alt="${esc(c.title)}" loading="lazy"></button>`).join("")}</div>` : ""}
    ${sel ? `<figure class="sec-img gal-sel"><div class="img-box"><img src="${esc(sel.thumb)}" alt="${esc(sel.title)}"></div>
      <figcaption><b>${esc(sel.title)}</b><span>${sel.author ? esc(sel.author) + " · " : ""}${sel.license ? esc(sel.license) + " · " : ""}<a href="${esc(sel.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></span></figcaption>
      <div class="img-act"><button class="btn sm" type="button" id="imExplain">Explică imaginea</button></div>
      <div class="img-exp prose" id="imOut"${V.imgOut ? "" : " hidden"}>${V.imgOut ? md(V.imgOut) : ""}</div></figure>` : ""}
  </section>

  <p class="hint vis-note">De ce nu desenăm imagini cu AI? Generatoarele gratuite de imagini produc organe și structuri greșite din punct de vedere anatomic, iar textul din imagini iese deformat. Pentru învățat, posterele, diagramele și imaginile reale de mai sus sunt corecte și verificabile.</p>`;

  $("#psStyle").value = P.style; $("#psColor").value = P.color; $("#dgType").value = P.dgType || "harta";
  $("#psGo").onclick = genPoster;
  $("#psFocus").oninput = ev => { P.focus = ev.target.value; };
  ["psStyle", "psColor"].forEach(id => $("#" + id).onchange = async ev => {
    if (id === "psStyle") P.style = ev.target.value; else P.color = ev.target.value;
    if (V.poster && id === "psColor" && V.poster.schema){
      try { V.posterSvg = await renderMermaid(V.poster.schema, posterVars(), false); } catch {}
    }
    if (V.poster) renderVis();
  });
  $("#psPng") && ($("#psPng").onclick = posterPng);
  $("#psPdf") && ($("#psPdf").onclick = posterPrint);
  $("#dgGo").onclick = genDiagram;
  $("#dgType").onchange = ev => { P.dgType = ev.target.value; };
  $$("[data-dg]", p).forEach(b => b.onclick = () => {
    const i = +b.dataset.i;
    if (b.dataset.dg === "del"){ V.diagrams.splice(i, 1); renderVis(); } else downloadDiagram(i);
  });
  $("#imGo").onclick = () => searchImages();
  $("#imQ").addEventListener("keydown", ev => { if (ev.key === "Enter") searchImages(); });
  $("#imSuggest").onclick = suggestTerms;
  $$("[data-term]", p).forEach(b => b.onclick = () => searchImages(b.dataset.term));
  $$(".gal-i", p).forEach(b => b.onclick = () => { V.imgSel = +b.dataset.gi; V.imgOut = imgExpCache.get(V.imgList[V.imgSel].thumb) || ""; renderVis(); $(".gal-sel")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
  $("#imExplain") && ($("#imExplain").onclick = ev => explainGalleryImage(ev.currentTarget));
  if (state.busy) $$("[data-busy]", p).forEach(b => b.disabled = true);
  requestAnimationFrame(fitPoster);
  /* diagramele desenate cu altă temă de culori se redesenează */
  V.diagrams.forEach((d, i) => {
    if (d.key !== mmKey(d.mermaid)) renderMermaid(d.mermaid, screenVars(), true).then(svg => { d.svg = svg; d.key = mmKey(d.mermaid); const box = $(`.dg-mm[data-i="${i}"]`); if (box) box.innerHTML = svg; }).catch(() => {});
  });
}
