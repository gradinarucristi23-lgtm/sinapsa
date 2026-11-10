"use strict";
/* ---------------- v10: 3D cu denumiri, imagini alese, insight-uri, vizualizare pe sisteme ---------------- */
const VIEWER_JS = "https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js";
let M3API = null;
function m3Models(id){ return id.startsWith("sys:") ? (SYS3D[id.slice(4)] || []) : (M3D_FULL[id] || []); }
model3dHtml = function(id){
  const L = labState(), list = m3Models(id);
  if (!list.length) return `<p class="hint">Pentru acest organ nu am încă un model 3D.</p>`;
  const mine = L.m3 && L.m3.org === id, k = mine ? Math.min(L.m3.k || 0, list.length - 1) : 0;
  const on = mine ? L.m3.on !== false : id !== "corp";
  const [uid, title, names] = list[k];
  return `<h4 class="m3-title">${esc(title)}</h4>
    <div class="m3-box">${on
      ? `<iframe data-uid="${uid}" title="${esc(title)}" allow="autoplay; fullscreen; xr-spatial-tracking" allowfullscreen></iframe>`
      : `<button type="button" class="m3-start" data-act="m3-on" data-org="${id}"><span class="m3-ic">3D</span><b>Pornește modelul 3D</b></button>`}</div>
    ${list.length > 1 ? `<div class="m3-pick">${list.map(([u, n, hs], i) => `<button type="button" class="chip${i === k ? " on" : ""}" data-act="m3-pick" data-m="${id}" data-i="${i}">${esc(n)}${hs.length ? ` · ${hs.length} structuri` : ""}</button>`).join("")}</div>` : ""}
    ${names.length ? `<div class="m3-labels"><div class="row"><b>Structuri denumite pe model (${names.length})</b><span class="hint">Apasă pe o denumire și modelul se rotește spre ea.</span></div>
      <ol>${names.map((n, i) => `<li><button type="button" data-act="m3-ann" data-i="${i}">${esc(n)}</button></li>`).join("")}</ol></div>`
      : `<p class="hint">La acest model, denumirile sunt scrise direct pe structuri.</p>`}
    <p class="hint">Rotești cu mouse-ul sau cu un deget, mărești cu rotița sau cu două degete. Modele 3D de pe Sketchfab, ale autorilor lor.</p>`;
};
async function initM3(){
  const f = document.querySelector(".m3-box iframe[data-uid]:not([data-init])"); if (!f) return;
  f.dataset.init = "1"; M3API = null;
  const uid = f.dataset.uid, plain = () => { f.src = `https://sketchfab.com/models/${uid}/embed?autostart=1&preload=1&ui_theme=dark&dnt=1`; };
  try { await loadScript(VIEWER_JS); } catch {}
  if (!window.Sketchfab || !f.isConnected){ if (f.isConnected) plain(); return; }
  try {
    new window.Sketchfab(f).init(uid, { autostart: 1, preload: 1, ui_theme: "dark", ui_hint: 0, dnt: 1,
      success: api => { api.start(); api.addEventListener("viewerready", () => { if (f.isConnected) M3API = api; }); },
      error: plain });
  } catch { plain(); }
}
const _renderLab1 = renderLab;
renderLab = function(){ _renderLab1(); initM3(); };

/* ---- imagini alese (fără repetări, mai multe perspective) ---- */
const IMG_CAT_LABEL = { anat: "anatomie", hist: "histologie", imag: "imagistică" };
for (const [org, cats] of Object.entries(CUR_IMG)) for (const [cat, list] of Object.entries(cats)) GAL.set(org + ":" + cat, list);
galHtml = function(o){
  const cat = labState().galCat || "3d";
  if (cat === "3d") return model3dHtml(o.id);
  const st = GAL.get(o.id + ":" + cat);
  if (!st || st === "loading"){ if (!st) loadGal(o); return `<p class="hint">Se caută imagini…</p>`; }
  if (!st.length) return `<p class="hint">Nu am încă imagini potrivite pentru această categorie.</p>`;
  return `<div class="gal-grid">${st.map((c, i) => `<button type="button" class="gal-it" data-act="gal-open" data-i="${i}" title="${esc(c.v || c.title)}"><img src="${esc(c.thumb)}" alt="${esc(c.v || c.title)}" loading="lazy">${c.v ? `<span class="gal-cap">${esc(c.v)}</span>` : ""}</button>`).join("")}</div>
    <p class="hint">Apasă pe o imagine ca s-o vezi mare și s-o explice ghidul.</p>`;
};
/* fereastra cu imaginea mare: listă generică (organ sau sistem) */
let IVL = null;
function ivOpen(list, i, label){
  if (!list || !list[i]) return;
  IVL = { list, label }; labState().galSel = i;
  const c = list[i], exp = imgExpCache.get(c.thumb), big = String(c.thumb).replace(/\/(\d+)px-/, "/1280px-");
  imgOv.innerHTML = `<div class="acct-box img-box-lg" role="dialog" aria-modal="true" aria-label="${esc(c.v || c.title)}">
    <button class="icon-btn ac-x" type="button" data-iv="close" aria-label="Închide"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
    <div class="iv-img"><img src="${esc(big)}" alt="${esc(c.v || c.title)}" onerror="this.onerror=null;this.src='${esc(c.thumb)}'"></div>
    <p class="iv-cap"><b>${esc(c.v || c.title)}</b><span>${esc(c.title)}${c.author ? " · " + esc(c.author) : ""}${c.lic ? " · " + esc(c.lic) : ""} · <a href="${esc(c.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></span></p>
    <div class="row"><button class="btn" type="button" data-iv="prev" ${i ? "" : "disabled"}>← Anterioara</button><span class="hint">${i + 1} / ${list.length}</span><button class="btn" type="button" data-iv="next" ${i < list.length - 1 ? "" : "disabled"}>Următoarea →</button><span class="grow"></span><button class="btn primary" type="button" data-iv="explain">Explică imaginea</button></div>
    <div class="iv-exp prose" id="ivExp"${exp ? "" : " hidden"}>${exp ? md(exp) : ""}</div></div>`;
  imgOv.hidden = false;
}
openGalImg = function(i){
  if (IVL && !imgOv.hidden) return ivOpen(IVL.list, i, IVL.label);
  const L = labState(), o = ORGANS.find(x => x.id === L.organ), cat = L.galCat || "anat", list = o && GAL.get(o.id + ":" + cat);
  if (Array.isArray(list)) ivOpen(list, i, `${o.nume}, ${IMG_CAT_LABEL[cat] || ""}`);
};
explainOrganImg = async function(btn){
  const L = labState(), c = IVL && IVL.list[L.galSel]; if (!c) return;
  const out = $("#ivExp"); out.hidden = false;
  if (imgExpCache.has(c.thumb)){ out.innerHTML = md(imgExpCache.get(c.thumb)); return; }
  btn.disabled = true; out.innerHTML = `<p class="hint">Se analizează imaginea…</p>`;
  try {
    const blob = await (await fetch(c.thumb)).blob();
    const s = await sampleP;
    const { text } = await s(`Ești tutore de medicină pentru studenți. Imaginea atașată („${c.title}”, Wikimedia Commons) arată: ${c.v || ""} — ${IVL.label}.
Explică în limba română, detaliat: tipul imaginii (planșă anatomică, preparat histologic și colorația, imagistică și planul de secțiune), perspectiva, apoi structurile vizibile și etichetele, traduse în română (listă). Încheie cu ce e important pentru examen și o greșeală frecventă de interpretare. 150–250 de cuvinte, markdown simplu.`, { modelTier: "default", images: [blob], onText: ({ text }) => { out.innerHTML = md(text); } });
    imgExpCache.set(c.thumb, text); out.innerHTML = md(text);
  } catch (e){ out.innerHTML = `<p class="hint">${esc(e && e.code ? errCopy(e) : "Imaginea nu a putut fi pregătită pentru analiză. Încearcă alta.")}</p>`; }
  finally { btn.disabled = false; }
};

/* ---- vizualizare pe sisteme ---- */
function sysPanelHtml(s){
  const L = labState(), imgs = SYS_IMG[s] || [], views = imgs.map((im, i) => [String(i), im.v]).concat(SYS3D[s] && SYS3D[s].length ? [["3d", "3D"]] : []);
  let v = L.sysView == null ? (views[0] ? views[0][0] : "3d") : String(L.sysView);
  if (!views.some(x => x[0] === v)) v = views[0] ? views[0][0] : "3d";
  const organs = ORGANS.filter(o => o.sis === s);
  const body = v === "3d" ? model3dHtml("sys:" + s) : (() => { const im = imgs[+v]; const big = String(im.thumb).replace(/\/(\d+)px-/, "/1024px-");
    return `<button type="button" class="sys-img" data-act="sys-open" data-i="${v}" title="Mărește"><img src="${esc(big)}" alt="${esc(im.v)}" onerror="this.onerror=null;this.src='${esc(im.thumb)}'"></button>
      <p class="iv-cap"><b>${esc(im.v)}</b><span>${esc(im.title)}${im.author ? " · " + esc(im.author) : ""}${im.lic ? " · " + esc(im.lic) : ""} · <a href="${esc(im.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></span></p>`; })();
  return `<div class="org-info sys-panel" style="--oc:var(--${SYS[s].c})">
    <span class="org-sys"><i class="dot"></i>Sistem</span><h3>Sistemul ${esc(SYS[s].nume.toLowerCase())}</h3>
    <p class="hint">În desen rămân doar organele acestui sistem. Mai jos îl vezi pe corpul întreg, cu fiecare parte denumită, din mai multe perspective.</p>
    ${views.length ? `<div class="seg gal-tabs">${views.map(([k, t]) => `<button type="button" data-act="sys-view" data-v="${k}" aria-pressed="${k === v}">${esc(t)}</button>`).join("")}</div>` : ""}
    ${body}
    <h4 class="org-h4">Organele sistemului</h4>
    <div class="sys-orgs">${organs.map(o => `<button type="button" class="chip" data-org="${o.id}"><i class="dot"></i>${esc(o.nume)}</button>`).join("") || `<span class="hint">Organele acestui sistem nu sunt marcate în desen.</span>`}</div>
  </div>`;
}

/* ---- insight-uri la temele de studiu ---- */
const INS_KEY = "ghid.insights.v1";
function insRead(){ try { return JSON.parse(localStorage.getItem(INS_KEY) || "{}") || {}; } catch { return {}; } }
function insWrite(t, v){ try { const o = insRead(); o[t] = v; const ks = Object.keys(o); while (ks.length > 150) delete o[ks.shift()]; localStorage.setItem(INS_KEY, JSON.stringify(o)); } catch {} }
const ICON_BULB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/></svg>';
function insBody(topic, text, loading){
  return `${loading && !text ? `<p class="hint">Se pregătește insight-ul…</p>` : `<div class="prose">${md(text)}</div>`}
    <div class="row ins-act"><button type="button" class="btn sm primary" data-act="explain-deep" data-q="${esc(topic)}">Explicație completă, detaliată →</button>${loading ? "" : `<button type="button" class="btn sm" data-act="ins-new" data-q="${esc(topic)}">Alt insight</button>`}</div>`;
}
async function showInsight(topic, box, fresh){
  if (!box) return;
  const o = ORGANS.find(x => x.id === labState().organ), cached = !fresh && insRead()[topic];
  box.hidden = false;
  if (cached){ box.innerHTML = insBody(topic, cached); return; }
  box.innerHTML = insBody(topic, "", true);
  try {
    const s = await sampleP;
    const { text } = await s(`Ești tutore de medicină pentru studenți la USMF. Dă UN SINGUR insight despre tema „${topic}”${o ? ` (organul: ${o.nume})` : ""}: ideea-cheie care face tema să aibă sens sau legătura pe care studenții o ratează (de la mecanism la consecința clinică).
Reguli: 2–3 propoziții, maximum 55 de cuvinte, în română. Fără introducere, fără titlu, fără liste, fără să explici toată tema. Îngroașă cu ** un singur termen-cheie.${fresh ? " Alege alt unghi decât cel mai evident." : ""}`, { modelTier: "quick", onText: ({ text }) => { if (box.isConnected) box.innerHTML = insBody(topic, text, true); } });
    insWrite(topic, text);
    if (box.isConnected) box.innerHTML = insBody(topic, text);
  } catch (e){ if (box.isConnected) box.innerHTML = `<p class="hint">${esc(e && e.code ? errCopy(e) : "Insight-ul nu a putut fi generat. Încearcă din nou.")}</p>`; }
}
onLab("click", ev => {
  const b = ev.target.closest("[data-act]"); if (!b) return;
  const L = labState(), a = b.dataset.act;
  if (a === "insight"){
    const box = b.parentElement.querySelector(".ins"), open = !box.hidden;
    $$(".org-ti .ins").forEach(x => { if (x !== box) x.hidden = true; });
    $$(".org-ti .org-t").forEach(x => x.setAttribute("aria-expanded", "false"));
    if (open){ box.hidden = true; return; }
    b.setAttribute("aria-expanded", "true"); showInsight(b.dataset.q, box);
  }
  else if (a === "ins-new") showInsight(b.dataset.q, b.closest(".ins"), true);
  else if (a === "explain-deep") labExplain(b.dataset.q, b.dataset.disc, true);
  else if (a === "org-ins"){ const v = ($("#orgQ").value || "").trim(); if (!v){ toast("Scrie o temă"); return; } showInsight(v, $("#orgOwnIns")); }
  else if (a === "m3-ann"){
    if (!M3API){ toast("Modelul 3D încă se încarcă"); return; }
    try { M3API.gotoAnnotation(+b.dataset.i, { preventCameraAnimation: false, preventCameraMove: false }); } catch {}
    $$(".m3-labels button.on").forEach(x => x.classList.remove("on")); b.classList.add("on");
  }
  else if (a === "sys-view"){ L.sysView = b.dataset.v; renderLab(); }
  else if (a === "sys-open"){ const s = L.sys, imgs = SYS_IMG[s] || []; ivOpen(imgs, +b.dataset.i, `Sistemul ${SYS[s].nume.toLowerCase()}`); }
});
$("#p-lab").addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.id === "orgQ"){ ev.preventDefault(); const b = $('[data-act="org-ins"]'); if (b) b.click(); } });
