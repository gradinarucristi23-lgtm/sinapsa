"use strict";
/* ---------------- quiz ---------------- */
function quizPrompt(n, kind, diff){
  const ctx = ctxForCurrent();
  const basis = ctx.mode === "sursa"
    ? `Întrebările se bazează EXCLUSIV pe ${ctx.srcText ? "SURSE" : "explicația de mai jos (extrasă din sursă)"}; fiecare are în "ref" trimiterea [S1 p.4]. Nu introduce fapte din afara materialului.`
    : ctx.mode === "combinat"
      ? `Întrebările se bazează în principal pe surse (cu "ref"); poți include și întrebări despre conceptele explicative adăugate (marcate {+ +} în explicație), caz în care "adaugire": true.`
      : `Întrebările se bazează pe explicația de mai jos și pe cunoștințele medicale consacrate. "ref" rămâne "".`;
  const kindLine = kind === "CS" ? "Toate întrebările sunt CS." : kind === "CM" ? "Toate întrebările sunt CM." : "Amestecă aproximativ jumătate CS și jumătate CM.";
  return `${ROLE}

Ești examinator. Creează ${n} întrebări-grilă în stilul testelor de la USMF „Nicolae Testemițanu” (Republica Moldova):
- CS (complement simplu): 5 variante A–E, exact UN răspuns corect.
- CM (complement multiplu): 5 variante A–E, între 2 și 4 răspunsuri corecte.
${kindLine} Dificultate: ${diff}.
${basis}
Acoperă proporțional teoria și practica. Pentru FIECARE variantă scrie în "de_ce" de ce este corectă sau greșită, cu mecanismul sau criteriul care o decide, nu doar „este fals”. Distractori plauzibili, fără „toate variantele” sau „niciuna dintre variante”, fără formulări ambigue sau duble negații.

FORMAT: răspunde doar cu un array JSON:
[{"tip":"CS","enunt":"…","variante":{"A":"…","B":"…","C":"…","D":"…","E":"…"},"corecte":["B"],"de_ce":{"A":"de ce A este corectă sau greșită, o propoziție","B":"…","C":"…","D":"…","E":"…"},"explicatie":"raționamentul pe scurt, 1–2 propoziții","ref":"","adaugire":false}]

EXPLICAȚIA:
${resultToMd(state.result, true)}${srcSection(ctx)}`;
}
async function genQuiz(){
  if (state.busy) return;
  if (!state.result){ toast("Generează întâi o explicație"); return; }
  const n = +($("#qzN")?.value || 10), kind = $("#qzK")?.value || "mixt", diff = $("#qzD")?.value || "nivel de examen";
  state.qzOpts = { n: String(n), kind, diff };
  selectTab("quiz");
  setBusy(true, "Pregătește grila…");
  try {
    const ctx = ctxForCurrent();
    const list = await callClaude(quizPrompt(n, kind, diff), { tier: "default", images: ctx.images, noCache: true, progress: ({ text }) => { $("#stSub").textContent = `${(text.match(/"enunt"/g) || []).length} întrebări scrise`; } });
    const qs = arr(Array.isArray(list) ? list : list && list.intrebari).filter(q => q && q.enunt && q.variante && arr(q.corecte).length)
      .map(q => ({ ...q, tip: String(q.tip || "").toUpperCase() === "CM" || q.corecte.length > 1 ? "CM" : "CS", corecte: q.corecte.map(c => String(c).trim().toUpperCase()) }));
    if (!qs.length) throw { code: "invalid_json" };
    state.quiz = { list: qs, answers: {}, checked: false };
    saveHistory(); renderQuiz(); updateCounts();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
function renderQuiz(){
  const p = $("#p-quiz"), Q = state.quiz;
  const settings = `<div class="q-settings">
    <div class="field"><span class="label">Întrebări</span><select id="qzN"><option>5</option><option selected>10</option><option>15</option><option>20</option></select></div>
    <div class="field"><span class="label">Tip</span><select id="qzK"><option value="mixt">Mixt CS + CM</option><option value="CS">Doar CS</option><option value="CM">Doar CM</option></select></div>
    <div class="field"><span class="label">Dificultate</span><select id="qzD"><option value="ușor, pentru fixarea noțiunilor de bază">Ușor</option><option value="nivel de examen" selected>Examen</option><option value="greu, nivel rezidențiat">Rezidențiat</option></select></div>
    <span class="grow"></span>
    <button class="btn primary" type="button" id="qzGo" data-busy>${Q.list.length && !Q.sample ? "Generează altă grilă" : "Generează grila"}</button></div>`;
  if (!Q.list.length){
    p.innerHTML = settings + `<div class="placeholder"><h3>Grila apare aici</h3><p>Întrebări CS (un singur răspuns corect) și CM (2–4 răspunsuri corecte), cu explicații, din tema curentă${state.meta && state.meta.mode !== "general" ? " și din sursele tale" : ""}.</p></div>`;
  } else {
    let score = 0;
    const items = Q.list.map((q, i) => {
      const chosen = Q.answers[i] || [];
      const correct = q.corecte;
      const ok = chosen.length === correct.length && chosen.every(c => correct.includes(c));
      if (Q.checked && ok) score++;
      const opts = ["A", "B", "C", "D", "E"].filter(L => q.variante[L] != null).map(L => {
        const sel = chosen.includes(L), cor = correct.includes(L);
        let cls = sel ? "sel" : "";
        if (Q.checked) cls = cor && sel ? "right" : (!cor && sel ? "wrong" : (cor ? "missed" : ""));
        return `<label class="opt ${cls}"><input type="${q.tip === "CM" ? "checkbox" : "radio"}" name="q${i}" value="${L}" ${sel ? "checked" : ""} ${Q.checked ? "disabled" : ""}><span class="L">${L}</span><span>${mdi(q.variante[L])}${Q.checked && q.de_ce && q.de_ce[L] ? `<span class="why">${mdi(q.de_ce[L])}</span>` : ""}</span></label>`;
      }).join("");
      return `<li class="qq" data-i="${i}">
        <div class="qq-h"><span class="qq-n">${i + 1}/${Q.list.length}</span><span class="qtype ${q.tip === "CM" ? "cm" : ""}">${q.tip}</span>${q.adaugire ? `<span class="badge m-combinat">din adăugiri</span>` : ""}
          ${Q.checked ? `<span class="verdict ${ok ? "ok" : "no"}">${ok ? "Corect" : "Greșit"}</span>` : ""}</div>
        <p class="qq-t">${mdi(q.enunt)}</p><div class="opts">${opts}</div>
        ${Q.checked ? `<div class="qx"><b>Răspuns: ${correct.join(", ")}</b> ${q.ref ? mdi(q.ref) : ""}<br>${mdi(q.explicatie)}</div>` : ""}
      </li>`;
    }).join("");
    const answered = Object.keys(Q.answers).filter(k => (Q.answers[k] || []).length).length;
    p.innerHTML = settings + `
      ${Q.sample ? `<p class="notice" style="margin-top:16px">Grilă de exemplu pentru tema de exemplu. Generează o temă proprie, apoi grila ei.</p>` : ""}
      <div class="q-score">${Q.checked ? `<span><b>${score}/${Q.list.length}</b> &nbsp;răspunsuri complet corecte (${Math.round(score / Q.list.length * 100)}%)</span>` : `<span>${answered}/${Q.list.length} întrebări răspunse · CS = un răspuns, CM = 2–4 răspunsuri</span>`}
        <span class="row">${Q.checked ? `<button class="btn sm" type="button" id="qzReset">Reia grila</button>` : `<button class="btn sm primary" type="button" id="qzCheck">Verifică răspunsurile</button>`}</span></div>
      <ol class="qs ${Q.checked ? "checked" : ""}">${items}</ol>
      <div class="q-foot"><button class="btn sm dl" type="button" id="qzCsv">Exportă CSV (Anki)</button><button class="btn sm dl" type="button" id="qzMd">Descarcă (Word)</button><button class="btn sm" type="button" id="qzCopy">Copiază grila</button></div>`;
  }
  if (state.qzOpts){ $("#qzN").value = state.qzOpts.n; $("#qzK").value = state.qzOpts.kind; $("#qzD").value = state.qzOpts.diff; }
  $("#qzGo").onclick = genQuiz;
  $("#qzCheck") && ($("#qzCheck").onclick = () => { Q.checked = true; if (!Q.sample){ const cx = curTopicCtx(); Q.list.forEach((q, i) => progRecord(q, Q.answers[i] || [], "quiz", cx)); } renderQuiz(); p.scrollIntoView({ block: "start", behavior: "smooth" }); });
  $("#qzReset") && ($("#qzReset").onclick = () => { Q.checked = false; Q.answers = {}; Q.exam = null; if (!Q.sample) Q.list = Q.list.map(shuffleOptions); renderQuiz(); });
  $("#qzCsv") && ($("#qzCsv").onclick = () => saveFile(slug(state.result && state.result.titlu) + "-grila.csv", quizCsv()));
  $("#qzMd") && ($("#qzMd").onclick = () => saveDoc(slug(state.result && state.result.titlu) + "-grila", "Grilă: " + stripMarks((state.result && state.result.titlu) || ""), quizMd(true)));
  $("#qzCopy") && ($("#qzCopy").onclick = () => copyText(quizMd(true)));
  p.querySelector(".qs")?.addEventListener("change", ev => {
    const li = ev.target.closest(".qq"); if (!li) return;
    const i = +li.dataset.i;
    Q.answers[i] = $$("input:checked", li).map(x => x.value);
    $$(".opt", li).forEach(o => o.classList.toggle("sel", $("input", o).checked));
    const answered = Object.keys(Q.answers).filter(k => (Q.answers[k] || []).length).length;
    const sp = $(".q-score > span", p); if (sp && !Q.checked) sp.textContent = `${answered}/${Q.list.length} întrebări răspunse · CS = un răspuns, CM = 2–4 răspunsuri`;
  });
  if (state.busy) $$("[data-busy]", p).forEach(b => b.disabled = true);
}
function quizMd(withAnswers){
  const L = [`# Grilă: ${stripMarks(state.result && state.result.titlu)}`, ""];
  state.quiz.list.forEach((q, i) => {
    L.push(`**${i + 1}. (${q.tip})** ${stripMarks(q.enunt)}`, "");
    ["A", "B", "C", "D", "E"].forEach(k => q.variante[k] != null && L.push(`- ${k}. ${stripMarks(q.variante[k])}`));
    if (withAnswers) L.push("", `> Răspuns: ${q.corecte.join(", ")}. ${stripMarks(q.explicatie)} ${q.ref || ""}`.trim());
    if (withAnswers && q.de_ce) ["A", "B", "C", "D", "E"].forEach(k => q.de_ce[k] && L.push(`> ${k}: ${stripMarks(q.de_ce[k])}`));
    L.push("");
  });
  return L.join("\n");
}
function quizCsv(){
  const c = s => '"' + String(s ?? "").replace(/"/g, '""') + '"';
  const rows = state.quiz.list.map(q => {
    const front = `(${q.tip}) ${stripMarks(q.enunt)}<br>` + ["A", "B", "C", "D", "E"].filter(k => q.variante[k] != null).map(k => `${k}. ${stripMarks(q.variante[k])}`).join("<br>");
    const back = `<b>${q.corecte.join(", ")}</b><br>${stripMarks(q.explicatie)} ${q.ref || ""}` + (q.de_ce ? "<br>" + ["A", "B", "C", "D", "E"].filter(k => q.de_ce[k]).map(k => `${k}: ${stripMarks(q.de_ce[k])}`).join("<br>") : "");
    return c(front) + "," + c(back);
  });
  return "﻿" + rows.join("\r\n");
}

/* ---------------- slides ---------------- */
function slidesPrompt(n, aud){
  const ctx = ctxForCurrent();
  const rule = ctx.mode === "sursa" ? "Folosește exclusiv conținutul explicației (bazată pe sursă); pune trimiterile [S1 p.4] în \"note\"."
    : ctx.mode === "combinat" ? "Păstrează marcajul {+ … +} pentru punctele care vin din adăugirile explicative, ca să rămână vizibile; trimiterile la sursă merg în \"note\"."
    : "Bazează-te pe explicația de mai jos.";
  return `${ROLE}

Creează o prezentare de ${n} slide-uri în limba română pe tema de mai jos, pentru ${aud}. ${rule}
Structură: primul slide "titlu"; exact un slide "schema" (diagrama temei se inserează automat; tu dai titlul și 2–3 puncte care ghidează citirea ei); cel puțin un slide de teorie și unul de practică; un slide "comparatie" dacă tema are ceva de comparat; un slide "caz" dacă tema are aplicare clinică; ultimul slide "concluzii".
Pe fiecare slide 3–5 puncte, maximum 14 cuvinte fiecare, fără punct la final. "note" = ce spune prezentatorul, 2–4 propoziții.

FORMAT: răspunde doar cu un array JSON:
[{"tip":"titlu|puncte|schema|comparatie|caz|concluzii","titlu":"…","subtitlu":"doar la tip titlu","puncte":["…"],"stanga":{"titlu":"…","puncte":["…"]},"dreapta":{"titlu":"…","puncte":["…"]},"note":"…"}]
("stanga"/"dreapta" doar la comparatie.)

EXPLICAȚIA:
${resultToMd(state.result, true)}`;
}
async function genSlides(){
  if (state.busy) return;
  if (!state.result){ toast("Generează întâi o explicație"); return; }
  const n = +($("#slN")?.value || 8), aud = $("#slA")?.value || "colegii de an, la seminar sau lucrări practice";
  state.slOpts = { n: String(n), aud };
  selectTab("prezentare");
  setBusy(true, "Construiește prezentarea…");
  try {
    let kbText = "";
    if (KB.on && state.meta && state.meta.mode === "general"){ $("#stText").textContent = "Consultă biblioteca comună…"; kbText = await kbContext(await kbSearch(state.result.titlu, 4).then(h => h.filter(x => x.score >= 0.34)), state.result.titlu); }
    const list = await callClaude(slidesPrompt(n, aud) + (kbText ? "\n\n" + kbText + "\nPoți face legături cu temele din baza de cunoștințe pe un slide de concluzii sau de corelații, dacă ajută." : ""), { tier: "default", noCache: true, progress: ({ text }) => { $("#stSub").textContent = `${(text.match(/"tip"/g) || []).length} slide-uri scrise`; } });
    const sl = arr(Array.isArray(list) ? list : list && list.slides).filter(s => s && s.titlu);
    if (!sl.length) throw { code: "invalid_json" };
    state.slides = { list: sl, idx: 0 };
    saveHistory(); renderSlides(); updateCounts();
    kbSaveSlides();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
function bullets(list){ return `<ul>${arr(list).map(x => `<li>${inl(x)}</li>`).join("")}</ul>`; }
function slideHtml(s, i, n, svg){
  const disc = esc((state.result && state.result.disciplina) || "");
  let body;
  if (s.tip === "titlu") body = `<div class="sl-title"><span class="bar"></span><h3>${inl(s.titlu)}</h3>${s.subtitlu ? `<p>${inl(s.subtitlu)}</p>` : ""}</div>`;
  else if (s.tip === "schema") body = `<h3>${inl(s.titlu)}</h3><div class="sl-split"><div class="sl-fig">${svg || `<span class="sl-ph">Se pregătește schema…</span>`}</div>${bullets(s.puncte)}</div>`;
  else if (s.tip === "comparatie") body = `<h3>${inl(s.titlu)}</h3><div class="sl-cols">${[s.stanga, s.dreapta].map(c => `<div class="sl-col"><h4>${inl(c && c.titlu)}</h4>${bullets(c && c.puncte)}</div>`).join("")}</div>`;
  else body = `<h3>${inl(s.titlu)}</h3><div class="${s.tip === "caz" ? "sl-caz" : ""}">${bullets(s.puncte)}</div>`;
  return `<div class="slide"><div class="sl-in"><div class="sl-top">Ghidul studentului USMF${disc ? " · " + disc : ""}</div>${body}</div><div class="sl-num">${i + 1} / ${n}</div></div>`;
}
async function renderSlides(){
  const p = $("#p-prezentare"), S = state.slides;
  const settings = `<div class="s-settings">
    <div class="field"><span class="label">Slide-uri</span><select id="slN"><option>6</option><option selected>8</option><option>10</option><option>12</option></select></div>
    <div class="field"><span class="label">Public</span><select id="slA"><option value="colegii de an, la seminar sau lucrări practice">Seminar / LP</option><option value="o comisie de examen oral; accent pe definiții, clasificări și raționament">Examen oral</option><option value="un cerc studențesc; accent pe mecanisme și noutăți">Cerc studențesc</option></select></div>
    <span class="grow"></span>
    <button class="btn primary" type="button" id="slGo" data-busy>${S.list.length && !S.sample ? "Generează din nou" : "Generează prezentarea"}</button></div>`;
  if (!S.list.length){
    p.innerHTML = settings + `<div class="placeholder"><h3>Prezentarea apare aici</h3><p>Slide-uri formatate cu schema temei inclusă, note pentru prezentator și export .pptx pentru PowerPoint sau Google Slides.</p></div>`;
  } else {
    const n = S.list.length, cur = S.list[S.idx] || S.list[0];
    p.innerHTML = settings + `
      ${S.sample ? `<p class="notice" style="margin-top:16px">Prezentare de exemplu. Generează o temă proprie, apoi prezentarea ei.</p>` : ""}
      <div class="stage-wrap">
        <div class="stage" id="stage" tabindex="0" aria-label="Slide curent">${slideHtml(cur, S.idx, n, state.exportFor === state.result ? state.exportSvg : null)}</div>
        <div class="s-nav"><button class="btn sm" type="button" id="slPrev" aria-label="Slide anterior">←</button><span class="pos">${S.idx + 1} / ${n}</span><button class="btn sm" type="button" id="slNext" aria-label="Slide următor">→</button>
          <span class="grow"></span><button class="btn sm" type="button" id="slFs">Ecran complet</button><button class="btn sm dl" type="button" id="slPptx" data-busy>Descarcă .pptx</button><button class="btn sm" type="button" id="slCopy">Copiază schița</button></div>
        ${cur.note ? `<div class="notes"><b>Note pentru prezentator</b>${inl(cur.note)}</div>` : ""}
        <div class="thumbs">${S.list.map((s, i) => `<button class="thumb" type="button" data-i="${i}" aria-current="${i === S.idx}"><i>${i + 1} · ${esc(s.tip)}</i><span>${inl(s.titlu)}</span></button>`).join("")}</div>
      </div>`;
    const go = d => { S.idx = Math.max(0, Math.min(n - 1, S.idx + d)); renderSlides(); };
    $("#slPrev").onclick = () => go(-1); $("#slNext").onclick = () => go(1);
    $("#stage").addEventListener("keydown", ev => { if (ev.key === "ArrowRight" || ev.key === " ") { ev.preventDefault(); go(1); } if (ev.key === "ArrowLeft") go(-1); });
    $("#stage").addEventListener("click", () => { if (document.fullscreenElement) go(1); });
    $$(".thumb", p).forEach(t => t.onclick = () => { S.idx = +t.dataset.i; renderSlides(); });
    $("#slFs").onclick = async () => { try { await $("#stage").requestFullscreen(); $("#stage").focus(); } catch { toast("Ecranul complet nu este disponibil aici"); } };
    $("#slPptx").onclick = buildPptx;
    $("#slCopy").onclick = () => copyText(slidesMd());
    if (cur.tip === "schema" && !(state.exportFor === state.result && state.exportSvg)){
      getExportSvg().then(svg => { const fig = $(".sl-fig"); if (fig && state.slides === S) fig.innerHTML = svg || `<span class="sl-ph">Schema nu a putut fi desenată.</span>`; });
    }
  }
  if (state.slOpts){ $("#slN").value = state.slOpts.n; $("#slA").value = state.slOpts.aud; }
  $("#slGo").onclick = genSlides;
  if (state.busy) $$("[data-busy]", p).forEach(b => b.disabled = true);
}
document.addEventListener("keydown", ev => {
  if (!document.fullscreenElement) return;
  const S = state.slides; const n = S.list.length;
  if (ev.key === "ArrowRight" || ev.key === "PageDown"){ S.idx = Math.min(n - 1, S.idx + 1); refreshStage(); }
  if (ev.key === "ArrowLeft" || ev.key === "PageUp"){ S.idx = Math.max(0, S.idx - 1); refreshStage(); }
});
function refreshStage(){ const st = $("#stage"); const S = state.slides; if (st) st.innerHTML = slideHtml(S.list[S.idx], S.idx, S.list.length, state.exportFor === state.result ? state.exportSvg : null); const pos = $(".s-nav .pos"); if (pos) pos.textContent = `${S.idx + 1} / ${S.list.length}`; }
function slidesMd(){
  return state.slides.list.map((s, i) => {
    const L = [`## ${i + 1}. ${stripMarks(s.titlu)}`];
    if (s.subtitlu) L.push(stripMarks(s.subtitlu));
    arr(s.puncte).forEach(x => L.push("- " + stripMarks(x)));
    if (s.stanga) { L.push(`**${stripMarks(s.stanga.titlu)}**`); arr(s.stanga.puncte).forEach(x => L.push("- " + stripMarks(x))); }
    if (s.dreapta) { L.push(`**${stripMarks(s.dreapta.titlu)}**`); arr(s.dreapta.puncte).forEach(x => L.push("- " + stripMarks(x))); }
    if (s.note) L.push("", `> Note: ${stripMarks(s.note)}`);
    return L.join("\n");
  }).join("\n\n");
}
async function schemaPng(){
  const svgStr = await getExportSvg(); if (!svgStr) return null;
  try {
    const doc = new DOMParser().parseFromString(svgStr, "image/svg+xml");
    const svg = doc.documentElement;
    const vb = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
    const w = vb[2] || 800, h = vb[3] || 600;
    svg.setAttribute("width", w); svg.setAttribute("height", h); svg.removeAttribute("style");
    if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const str = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
    await img.decode();
    const scale = Math.max(1, Math.min(3, 2400 / Math.max(w, h)));
    const c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const cx = c.getContext("2d"); cx.fillStyle = "#FFFFFF"; cx.fillRect(0, 0, c.width, c.height);
    cx.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/png"), w, h };
  } catch { return null; }
}
async function buildPptx(){
  const sl = state.slides.list; if (!sl.length || state.busy) return;
  setBusy(true, "Construiește fișierul .pptx…");
  try {
    await loadScript(LIB.pptx);
    const P = new window.PptxGenJS(); P.layout = "LAYOUT_WIDE"; P.title = stripMarks(state.result && state.result.titlu) || "Prezentare"; P.author = "Ghidul studentului USMF";
    const C = { ink: "1D1A38", mute: "5B5975", hema: "3D379A", eosin: "B82B66", soft: "EEEEF7", line: "D8DAE7" };
    const disc = String((state.result && state.result.disciplina) || "").toUpperCase();
    const png = sl.some(s => s.tip === "schema") ? await schemaPng() : null;
    const runs = (list, size) => arr(list).map(t => ({ text: stripMarks(t), options: { bullet: { indent: 18 }, color: /\{\+/.test(t) ? C.eosin : C.ink, fontSize: size, breakLine: true, paraSpaceAfter: 8 } }));
    sl.forEach((s, i) => {
      const x = P.addSlide(); x.background = { color: "FFFFFF" };
      x.addText("GHIDUL STUDENTULUI USMF" + (disc ? " · " + disc : ""), { x: 0.6, y: 0.22, w: 9, h: 0.35, fontFace: "Consolas", fontSize: 10, color: C.mute, charSpacing: 2 });
      x.addText(`${i + 1} / ${sl.length}`, { x: 11.3, y: 6.95, w: 1.45, h: 0.35, fontFace: "Consolas", fontSize: 10, color: C.mute, align: "right" });
      if (s.tip === "titlu"){
        x.addShape(P.ShapeType.rect, { x: 0.8, y: 2.3, w: 0.95, h: 0.09, fill: { color: C.eosin }, line: { color: C.eosin } });
        x.addText(stripMarks(s.titlu), { x: 0.8, y: 2.5, w: 11.7, h: 1.8, fontFace: "Georgia", fontSize: 40, bold: true, color: C.ink, valign: "top", fit: "shrink" });
        if (s.subtitlu) x.addText(stripMarks(s.subtitlu), { x: 0.8, y: 4.4, w: 11.7, h: 0.8, fontFace: "Calibri", fontSize: 20, color: C.hema });
      } else {
        x.addText(stripMarks(s.titlu), { x: 0.6, y: 0.6, w: 12.1, h: 0.95, fontFace: "Georgia", fontSize: 28, bold: true, color: C.ink, valign: "bottom", fit: "shrink" });
        x.addShape(P.ShapeType.line, { x: 0.6, y: 1.62, w: 12.1, h: 0, line: { color: C.line, width: 1 } });
        if (s.tip === "schema"){
          if (png){
            const bw = 8.0, bh = 5.0, ratio = png.w / png.h;
            let iw = bw, ih = bw / ratio; if (ih > bh){ ih = bh; iw = bh * ratio; }
            x.addImage({ data: png.data, x: 0.6 + (bw - iw) / 2, y: 1.85 + (bh - ih) / 2, w: iw, h: ih });
          } else x.addText("Schema nu a putut fi inserată automat.", { x: 0.6, y: 3.5, w: 8, h: 0.6, fontSize: 14, color: C.mute });
          x.addText(runs(s.puncte, 16), { x: 8.9, y: 1.95, w: 3.85, h: 4.8, valign: "top", fontFace: "Calibri" });
        } else if (s.tip === "comparatie"){
          [s.stanga, s.dreapta].forEach((col, k) => {
            const cx = 0.6 + k * 6.2;
            x.addShape(P.ShapeType.rect, { x: cx, y: 1.9, w: 5.9, h: 4.85, fill: { color: k ? "FFFFFF" : C.soft }, line: { color: C.line, width: 1 } });
            x.addText(stripMarks(col && col.titlu), { x: cx + 0.3, y: 2.05, w: 5.3, h: 0.6, fontFace: "Georgia", fontSize: 20, bold: true, color: C.hema });
            x.addText(runs(col && col.puncte, 16), { x: cx + 0.3, y: 2.75, w: 5.3, h: 3.85, valign: "top", fontFace: "Calibri" });
          });
        } else {
          if (s.tip === "caz") x.addShape(P.ShapeType.rect, { x: 0.6, y: 1.9, w: 12.1, h: 4.85, fill: { color: C.soft }, line: { color: C.soft } });
          x.addText(runs(s.puncte, 20), { x: 0.85, y: 2.05, w: 11.6, h: 4.6, valign: "top", fontFace: "Calibri" });
        }
      }
      if (s.note) x.addNotes(stripMarks(s.note));
    });
    const blob = await P.write({ outputType: "blob" });
    setBusy(false);
    await saveFile(slug(state.result && state.result.titlu) + ".pptx", blob);
  } catch (e){ showNotice("Fișierul .pptx nu a putut fi construit. " + ((e && e.message) || ""), "err"); }
  finally { setBusy(false); }
}

/* ---------------- flashcards ---------------- */
function emptyFlash(){ return { list: [], idx: 0, flipped: false, known: {}, only: false }; }
function emptyCaz(){ return { data: null, answer: "", eval: null, revealed: false }; }
function needResult(){ if (!state.result){ toast("Generează întâi o explicație sau deschide exemplul"); return true; } return false; }

function flashPrompt(n){
  const ctx = ctxForCurrent();
  const basis = ctx.mode === "sursa" ? `Folosește EXCLUSIV ${ctx.srcText ? "SURSELE" : "explicația de mai jos (extrasă din sursă)"}; pune în "ref" trimiterea [S1 p.4].`
    : ctx.mode === "combinat" ? `Baza sunt sursele (cu "ref"); poți folosi și conceptele explicative marcate {+ +}.`
    : `Bazează-te pe explicația de mai jos și pe cunoștințele medicale consacrate; "ref" rămâne "".`;
  return `${ROLE}

Creează ${n} flashcards (cartonașe) pentru repetiție distanțată (Anki), în limba română, pe tema de mai jos. ${basis}
Reguli: o singură idee pe cartonaș; "fata" = o întrebare scurtă și precisă, care nu conține răspunsul; "spate" = răspunsul esențial, cel mult 35 de cuvinte. Acoperă definiții, mecanisme, criterii, valori de laborator, semne clinice, tratament și capcane, cu accent pe ce se cere la examen (high-yield). "tag" = un singur cuvânt dintre: definitie, mecanism, clinic, laborator, tratament, farmacologie, anatomie, capcana.
FORMAT: răspunde doar cu un array JSON: [{"fata":"…","spate":"…","tag":"…","ref":""}]

EXPLICAȚIA:
${resultToMd(state.result, true)}${srcSection(ctx)}`;
}
async function genFlash(){
  if (state.busy || needResult()) return;
  const n = +($("#flN")?.value || 20); state.flOpts = String(n);
  selectTab("flash");
  setBusy(true, "Pregătește flashcards…");
  try {
    const ctx = ctxForCurrent();
    const list = await callClaude(flashPrompt(n), { tier: "default", images: ctx.images, noCache: true, progress: ({ text }) => { $("#stSub").textContent = `${(text.match(/"fata"/g) || []).length} cartonașe scrise`; } });
    const cards = arr(Array.isArray(list) ? list : list && list.cards).filter(c => c && c.fata && c.spate);
    if (!cards.length) throw { code: "invalid_json" };
    state.flash = Object.assign(emptyFlash(), { list: cards });
    saveHistory(); renderFlash(); updateCounts();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
function flashOrder(){ const F = state.flash; return F.list.map((c, i) => i).filter(i => !F.only || !F.known[i]); }
function flashExportRow(){
  return `<div class="q-foot"><button class="btn sm dl" type="button" id="flCsv">Exportă CSV pentru Anki</button><button class="btn sm" type="button" id="flCopy">Copiază lista</button>
    <span class="hint" style="align-self:center">În Anki: File → Import → alegi fișierul. Coloanele sunt Față, Spate, Etichete.</span></div>`;
}
function flashCsv(){
  const c = s => '"' + String(s ?? "").replace(/"/g, '""') + '"';
  const topic = slug(state.result && state.result.titlu);
  return "﻿" + state.flash.list.map(k => [c(stripMarks(k.fata)), c(stripMarks(k.spate) + (k.ref ? " " + k.ref : "")), c(`usmf ${topic} ${slug(k.tag || "")}`.trim())].join(",")).join("\r\n");
}
function renderFlash(){
  const p = $("#p-flash"), F = state.flash;
  const settings = `<div class="q-settings">
    <div class="field"><span class="label">Cartonașe</span><select id="flN"><option>10</option><option selected>20</option><option>30</option><option>40</option></select></div>
    <p class="hint grow" style="min-width:200px;margin:0;align-self:center">Întrebarea pe față, răspunsul pe spate. Fiecare cartonaș răspuns intră în repetiția ta zilnică și revine când e pe cale să-l uiți.</p>
    <button class="btn primary" type="button" id="flGo" data-busy>${F.list.length ? "Generează altele" : "Generează flashcards"}</button></div>`;
  if (!F.list.length){
    p.innerHTML = settings + `<div class="placeholder"><h3>Flashcards pentru memorare</h3><p>Cartonașe high-yield din tema curentă${state.meta && state.meta.mode !== "general" ? " și din cursul tău" : ""}, gata de repetat aici sau de importat în Anki, pentru repetiție distanțată.</p></div>`;
  } else {
    const order = flashOrder();
    const knownN = Object.values(F.known).filter(Boolean).length;
    if (!order.length){
      p.innerHTML = settings + `<div class="placeholder"><h3>Le știi pe toate (${F.list.length}/${F.list.length})</h3><p>Poți relua setul întreg sau îl poți exporta în Anki.</p><div class="row"><button class="btn" type="button" id="flAll">Reia toate cartonașele</button></div></div>` + flashExportRow();
    } else {
      if (F.idx >= order.length) F.idx = 0;
      const i = order[F.idx], c = F.list[i];
      p.innerHTML = settings + `
      <div class="fc-wrap">
        <div class="fc-meta"><span>${F.idx + 1} / ${order.length}${F.only ? " neștiute" : ""}</span><span>${knownN} știute din ${F.list.length}</span></div>
        <button class="fc${F.flipped ? " back" : ""}" type="button" id="fcCard" aria-label="Întoarce cartonașul">
          <span class="fc-tag">${esc(c.tag || "")}${c.ref ? " · " + esc(c.ref) : ""}</span>
          <span class="fc-side">${F.flipped ? "Răspuns" : "Întrebare"}</span>
          <span class="fc-text"><span>${mdi(F.flipped ? c.spate : c.fata)}</span></span>
          <span class="fc-hint">${F.flipped ? "Te-ai descurcat?" : "Apasă pe cartonaș sau Space ca să vezi răspunsul"}</span>
        </button>
        <div class="fc-actions">
          <button class="btn" type="button" id="fcNo" ${F.flipped ? "" : "disabled"}>Nu știu încă</button>
          <button class="btn primary" type="button" id="fcYes" ${F.flipped ? "" : "disabled"}>Știu</button>
        </div>
        <label class="fc-only"><input type="checkbox" id="fcOnly" ${F.only ? "checked" : ""}> Arată doar cartonașele neștiute</label>
      </div>` + flashExportRow();
      const next = known => { try { if (!(state.meta && state.meta.sample)) cardRate(c, known, curTopicCtx()); } catch {} F.known[i] = known; F.flipped = false; if (!(F.only && known)) F.idx++; renderFlash(); $("#fcCard")?.focus(); };
      $("#fcCard").onclick = () => { F.flipped = !F.flipped; renderFlash(); $("#fcCard").focus(); };
      $("#fcNo").onclick = () => next(false);
      $("#fcYes").onclick = () => next(true);
      $("#fcOnly").onchange = ev => { F.only = ev.target.checked; F.idx = 0; F.flipped = false; renderFlash(); };
    }
    $("#flAll") && ($("#flAll").onclick = () => { F.known = {}; F.only = false; F.idx = 0; renderFlash(); });
    $("#flCsv").onclick = () => saveFile(slug(state.result && state.result.titlu) + "-flashcards.csv", flashCsv());
    $("#flCopy").onclick = () => copyText(F.list.map((c, k) => `${k + 1}. ${stripMarks(c.fata)}\n   → ${stripMarks(c.spate)}`).join("\n"));
  }
  const nDue = (() => { try { return dueCards().length; } catch { return 0; } })();
  if (nDue) p.insertAdjacentHTML("afterbegin", `<div class="notice kb-hit fl-due"><span>Ai <b>${nDue} ${nDue === 1 ? "cartonaș" : "cartonașe"}</b> de repetat azi, din temele învățate înainte.</span><span class="row"><button class="btn sm primary" type="button" id="flDue">Repetă acum</button></span></div>`);
  $("#flDue") && ($("#flDue").onclick = () => openProg("cards"));
  if (state.flOpts) $("#flN").value = state.flOpts;
  $("#flGo").onclick = genFlash;
  if (state.busy) $$("[data-busy]", p).forEach(b => b.disabled = true);
}

/* ---------------- caz clinic interactiv (vignete) ---------------- */
function cazPrompt(diff){
  const ctx = ctxForCurrent();
  const basis = ctx.mode === "sursa" ? "Construiește cazul din informațiile din surse (tabloul clinic, investigațiile și tratamentul descrise acolo)."
    : ctx.mode === "combinat" ? "Pornește de la surse; poți completa cu date clinice realiste ca să fie un caz complet." : "";
  return `${ROLE}

Creează o vignetă clinică fictivă și realistă, pentru antrenarea raționamentului clinic, pe tema de mai jos. Dificultate: ${diff}. ${basis}
Cazul NU numește diagnosticul și nu dă indicii evidente de tipul „tipic pentru X”, dar datele trebuie să permită ajungerea la diagnostic. Valorile de laborator au unități și intervale de referință uzuale.
FORMAT: răspunde doar cu un obiect JSON:
{"pacient":"sex, vârstă, ocupație dacă e relevantă","motiv":"motivul prezentării","istoric":"istoricul bolii, antecedente, medicație, fumat sau alcool (markdown scurt)","semne_vitale":{"TA":"","AV":"","FR":"","T":"","SpO2":""},"examen":"examenul obiectiv relevant","laborator":[{"analiza":"","valoare":"","referinta":"","flag":"H, L sau N"}],"paraclinic":"ECG, imagistică etc. sau șir gol","intrebare":"Care este diagnosticul cel mai probabil?","diagnostic":"diagnosticul corect, precis","diferentiale":[{"diagnostic":"","de_ce_nu":"o propoziție"}],"rationament":"pașii raționamentului, listă markdown","investigatii":"ce investigații urmează și de ce","tratament":"conduita terapeutică pe scurt"}

TEMA:
${resultToMd(state.result, true)}${srcSection(ctx)}`;
}
async function genCaz(){
  if (state.busy || needResult()) return;
  const diff = $("#czD")?.value || "medie, nivel de examen"; state.czOpts = diff;
  selectTab("caz");
  setBusy(true, "Construiește cazul clinic…");
  try {
    const ctx = ctxForCurrent();
    const d = await callClaude(cazPrompt(diff), { tier: "default", images: ctx.images, noCache: true });
    if (!d || !d.diagnostic || !d.pacient) throw { code: "invalid_json" };
    state.caz = Object.assign(emptyCaz(), { data: d });
    saveHistory(); renderCaz();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
async function checkCaz(){
  const C = state.caz; const ans = $("#czAns").value.trim();
  if (!ans){ toast("Scrie întâi diagnosticul tău"); $("#czAns").focus(); return; }
  if (state.busy) return;
  C.answer = ans;
  setBusy(true, "Evaluează răspunsul…");
  try {
    const ev = await callClaude(`Ești profesor de medicină. Evaluează răspunsul unui student la o vignetă clinică.
Diagnosticul corect: ${C.data.diagnostic}
Diagnostice diferențiale relevante: ${arr(C.data.diferentiale).map(d => d.diagnostic).join("; ")}
Răspunsul studentului: ${ans}
Acceptă sinonimele și formulările echivalente. "partial" înseamnă că direcția e bună, dar lipsește precizia (tipul, cauza sau stadiul).
Răspunde doar cu JSON: {"verdict":"corect, partial sau gresit","feedback":"2–3 propoziții în română, adresate studentului: ce a fost bine și ce lipsește"}`, { tier: "default", noCache: true });
    const v = String((ev && ev.verdict) || "").toLowerCase();
    C.eval = { verdict: v.startsWith("corect") ? "corect" : v.startsWith("partial") || v.startsWith("parțial") ? "partial" : "gresit", feedback: (ev && ev.feedback) || "" };
    C.revealed = true;
    renderCaz();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
function renderCaz(){
  const p = $("#p-caz"), C = state.caz, d = C.data;
  const settings = `<div class="q-settings">
    <div class="field"><span class="label">Dificultate</span><select id="czD"><option value="ușoară, prezentare tipică">Ușor</option><option value="medie, nivel de examen" selected>Examen</option><option value="ridicată, nivel rezidențiat, cu prezentare atipică">Rezidențiat</option></select></div>
    <p class="hint grow" style="min-width:200px;margin:0;align-self:center">Primești un pacient fictiv. Pui diagnosticul, apoi vezi raționamentul complet.</p>
    <button class="btn primary" type="button" id="czGo" data-busy>${d ? "Alt caz" : "Generează un caz"}</button></div>`;
  if (!d){
    p.innerHTML = settings + `<div class="placeholder"><h3>Antrenează raționamentul clinic</h3><p>Un caz fictiv construit din tema curentă${state.meta && state.meta.mode !== "general" ? " și din cursul tău" : ""}: vârstă, simptome, semne vitale, analize. Tu pui diagnosticul, AI-ul îți evaluează răspunsul și îți arată raționamentul și diagnosticul diferențial.</p></div>`;
  } else {
    const vit = Object.entries(d.semne_vitale || {}).filter(([, v]) => v);
    const labs = arr(d.laborator).filter(l => l && l.analiza);
    const V = C.eval && C.eval.verdict;
    p.innerHTML = settings + `
    <article class="case" style="margin-top:18px">
      <div class="case-p"><span class="label">Pacient</span><b>${mdi(d.pacient)}</b><br>${mdi(d.motiv)}</div>
      <div class="case-body">
        ${d.istoric ? `<div><span class="label">Istoric</span><div class="prose">${md(d.istoric)}</div></div>` : ""}
        ${vit.length ? `<div><span class="label">Semne vitale</span><div class="vitals">${vit.map(([k, v]) => `<div class="vital"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div></div>` : ""}
        ${d.examen ? `<div><span class="label">Examen obiectiv</span><div class="prose">${md(d.examen)}</div></div>` : ""}
        ${labs.length ? `<div><span class="label">Laborator</span><div class="tbl-wrap"><table><thead><tr><th>Analiză</th><th>Valoare</th><th>Referință</th></tr></thead><tbody>${labs.map(l => { const f = String(l.flag || "N").trim().toUpperCase().charAt(0); return `<tr><td>${esc(l.analiza)}</td><td class="flag-${f}">${esc(l.valoare)}${f === "H" ? '<span class="flagmark">↑</span>' : f === "L" ? '<span class="flagmark">↓</span>' : ""}</td><td>${esc(l.referinta)}</td></tr>`; }).join("")}</tbody></table></div></div>` : ""}
        ${d.paraclinic ? `<div><span class="label">Investigații paraclinice</span><div class="prose">${md(d.paraclinic)}</div></div>` : ""}
      </div>
    </article>
    <div class="cz-q">
      <label for="czAns" class="block-h" style="margin:0">${mdi(d.intrebare || "Care este diagnosticul cel mai probabil?")}</label>
      <textarea id="czAns" placeholder="Scrie diagnosticul tău și, opțional, pe ce te bazezi…" ${C.revealed ? "readonly" : ""}>${esc(C.answer)}</textarea>
      ${C.revealed ? "" : `<div class="row"><button class="btn primary" type="button" id="czCheck" data-busy>Verifică răspunsul</button><button class="btn" type="button" id="czShow">Arată soluția fără să răspund</button></div>`}
    </div>
    ${V ? `<div class="verdict-box ${V === "corect" ? "ok" : V === "partial" ? "partial" : "bad"}"><b>${V === "corect" ? "Corect" : V === "partial" ? "Parțial corect" : "Nu este diagnosticul corect"}</b>${mdi(C.eval.feedback)}</div>` : ""}
    ${C.revealed ? `<section class="sol">
      <div class="card"><h4>Diagnostic</h4><p class="sol-dx">${mdi(d.diagnostic)}</p></div>
      ${d.rationament ? `<div><h3 class="block-h">Raționament</h3><div class="prose">${md(d.rationament)}</div></div>` : ""}
      ${arr(d.diferentiale).length ? `<div class="card"><h4>Diagnostic diferențial</h4><ul>${d.diferentiale.map(x => `<li><b>${mdi(x.diagnostic)}</b>: ${mdi(x.de_ce_nu)}</li>`).join("")}</ul></div>` : ""}
      ${d.investigatii ? `<div><h3 class="block-h">Investigații următoare</h3><div class="prose">${md(d.investigatii)}</div></div>` : ""}
      ${d.tratament ? `<div><h3 class="block-h">Conduită terapeutică</h3><div class="prose">${md(d.tratament)}</div></div>` : ""}
    </section>` : ""}`;
    $("#czCheck") && ($("#czCheck").onclick = checkCaz);
    $("#czShow") && ($("#czShow").onclick = () => { C.revealed = true; C.answer = $("#czAns").value; renderCaz(); });
    $("#czAns").oninput = ev => { C.answer = ev.target.value; };
  }
  if (state.czOpts) $("#czD").value = state.czOpts;
  $("#czGo").onclick = genCaz;
  if (state.busy) $$("[data-busy]", p).forEach(b => b.disabled = true);
}

/* ---------------- instrumente: rezumat high-yield și mnemonice ---------------- */
function hySourceLabel(){
  const act = activeSources();
  if (act.length) return `sursele active (${act.map(s => s.id).join(", ")})`;
  if (state.result) return `tema „${esc(stripMarks(state.result.titlu))}”`;
  return "tema scrisă sus, în caseta principală";
}
async function genHy(){
  if (state.busy) return;
  let mode = "general", material = "", ctx = null;
  if (activeSources().length){ ctx = buildCtx("sursa"); mode = "sursa"; }
  else if (state.result) material = `EXPLICAȚIA:\n${resultToMd(state.result, true)}`;
  else {
    const q = $("#q").value.trim();
    if (!q){ toast("Scrie o temă sus sau adaugă un curs"); $("#q").focus(); return; }
    material = `TEMA: ${q}`;
  }
  setBusy(true, "Extrage esențialul…");
  try {
    const prompt = `${ROLE}
${modeRules(mode)}

Fă un rezumat HIGH-YIELD pentru examen. Elimină umplutura academică (istoricul descoperirilor, formulările introductive, repetițiile) și păstrează doar ce se cere frecvent la examen: ideile-cheie, buzzwords (indicii clasice care duc la un diagnostic sau concept), cifrele și criteriile de reținut și capcanele.${mode === "sursa" ? " Pune la finalul fiecărui element trimiterea la sursă, de exemplu [S1 p.4]." : ""}
FORMAT: răspunde doar cu un obiect JSON:
{"titlu":"…","esential":["8–15 idei-cheie, câte o propoziție scurtă"],"buzzwords":[{"indiciu":"…","inseamna":"…"}],"cifre":["valori, criterii, doze sau clasificări de reținut"],"capcane":["…"]}

${material}${ctx ? srcSection(ctx) : ""}`;
    const r = await callClaude(prompt, { tier: "default", images: ctx ? ctx.images : [], noCache: true, progress: ({ text }) => { $("#stSub").textContent = `${fmt(text.length)} caractere`; } });
    if (!r || !arr(r.esential).length) throw { code: "invalid_json" };
    state.tools.hy = r; renderTools();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
function hyMd(h){
  const L = [`# High-Yield: ${stripMarks(h.titlu)}`, "", "## Esențial", ...arr(h.esential).map(x => "- " + stripMarks(x)), ""];
  if (arr(h.buzzwords).length) L.push("## Buzzwords", ...h.buzzwords.map(b => `- ${stripMarks(b.indiciu)} → **${stripMarks(b.inseamna)}**`), "");
  if (arr(h.cifre).length) L.push("## Cifre și criterii", ...h.cifre.map(x => "- " + stripMarks(x)), "");
  if (arr(h.capcane).length) L.push("## Capcane", ...h.capcane.map(x => "- " + stripMarks(x)), "");
  return L.join("\n");
}
function hyHtml(h){
  return `<div class="tool-out">
    <h4 class="block-h" style="margin:0">${mdi(h.titlu)}</h4>
    <div class="card"><h4>Esențial</h4><ul>${arr(h.esential).map(x => `<li>${mdi(x)}</li>`).join("")}</ul></div>
    ${arr(h.buzzwords).length ? `<div class="card"><h4>Buzzwords: indiciu → înseamnă</h4><div class="bz">${h.buzzwords.map(b => `<span>${mdi(b.indiciu)}</span><i>→</i><b>${mdi(b.inseamna)}</b>`).join("")}</div></div>` : ""}
    ${(arr(h.cifre).length || arr(h.capcane).length) ? `<div class="two">
      ${arr(h.cifre).length ? `<div class="card"><h4>Cifre și criterii</h4><ul>${h.cifre.map(x => `<li>${mdi(x)}</li>`).join("")}</ul></div>` : ""}
      ${arr(h.capcane).length ? `<div class="card pit"><h4>Capcane</h4><ul>${h.capcane.map(x => `<li>${mdi(x)}</li>`).join("")}</ul></div>` : ""}
    </div>` : ""}
    <div class="row"><button class="btn sm" type="button" id="hyCopy">Copiază</button><button class="btn sm dl" type="button" id="hyDl">Descarcă (Word)</button></div>
  </div>`;
}
async function genMn(){
  const q = $("#mnIn").value.trim();
  if (!q){ toast("Scrie ce vrei să memorezi"); $("#mnIn").focus(); return; }
  if (state.busy) return;
  state.tools.mnQ = q;
  setBusy(true, "Inventează mnemonice…");
  try {
    const r = await callClaude(`${ROLE}

Creează mnemonice în limba română pentru a memora: „${q}”.
Dacă textul e doar numele unei liste, scrie întâi lista corectă și completă, așa cum apare în manualele consacrate. Propune 2–3 variante: un acronim (inițialele formează un cuvânt sau o expresie ușor de reținut; dacă există un acronim consacrat în engleză, de exemplu „I GET SMASHED”, include-l și pe acela), o propoziție-mnemonică și, dacă ajută, o asociere vizuală. Nu deforma și nu scurta lista ca să iasă acronimul.
FORMAT: răspunde doar cu un obiect JSON:
{"lista":["elementele de memorat, în ordine"],"mnemonice":[{"tip":"acronim, propoziție sau asociere","mnemonic":"…","cheie":["literă sau cuvânt → element"]}]}`, { tier: "default", noCache: true });
    if (!r || !arr(r.mnemonice).length) throw { code: "invalid_json" };
    state.tools.mn = r; renderTools();
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
function mnHtml(m){
  return `<div class="tool-out">
    ${arr(m.lista).length ? `<div class="card"><h4>De memorat</h4><ol class="mn-list">${m.lista.map(x => `<li>${mdi(x)}</li>`).join("")}</ol></div>` : ""}
    <div class="mn-grid">${arr(m.mnemonice).map(x => `<div class="mn"><span class="label">${esc(x.tip || "")}</span><div class="big">${mdi(x.mnemonic)}</div>${arr(x.cheie).length ? `<ul>${x.cheie.map(k => `<li>${mdi(k)}</li>`).join("")}</ul>` : ""}</div>`).join("")}</div>
  </div>`;
}
function renderTools(){
  const p = $("#p-tools"), T = state.tools;
  p.innerHTML = `
  <section class="tool">
    <div class="tool-h"><div><h3>Rezumat High-Yield</h3><p class="hint">Filtrează umplutura și păstrează ce se cere la examen: idei-cheie, buzzwords, cifre și capcane. Pornește de la ${hySourceLabel()}.</p></div>
      <button class="btn primary" type="button" id="hyGo" data-busy>${T.hy ? "Generează din nou" : "Fă rezumatul"}</button></div>
    ${T.hy ? hyHtml(T.hy) : ""}
  </section>
  <section class="tool">
    <div class="tool-h"><div><h3>Generator de mnemonice</h3><p class="hint">Scrie lista de memorat sau doar numele ei. Primești acronime și propoziții ușor de reținut.</p></div></div>
    <div class="ask-row"><textarea id="mnIn" rows="2" placeholder="De exemplu: cauzele pancreatitei acute; ramurile arterei carotide externe; efectele adverse ale amiodaronei">${esc(T.mnQ || "")}</textarea><button class="btn primary" type="button" id="mnGo" data-busy>Creează mnemonice</button></div>
    ${T.mn ? mnHtml(T.mn) : ""}
  </section>
  ${ixSectionHtml()}`;
  $("#ixFile").onchange = ev => pickIx(ev.target.files && ev.target.files[0]);
  $("#ixQ").oninput = ev => { T.ixQ = ev.target.value; };
  $("#ixGo").onclick = genIx;
  $("#hyGo").onclick = genHy;
  $("#mnGo").onclick = genMn;
  $("#mnIn").oninput = ev => { T.mnQ = ev.target.value; };
  $("#mnIn").addEventListener("keydown", ev => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) genMn(); });
  $("#hyCopy") && ($("#hyCopy").onclick = () => copyText(hyMd(T.hy)));
  $("#hyDl") && ($("#hyDl").onclick = () => saveDoc(slug("high-yield " + (T.hy.titlu || "")), "High-Yield: " + (T.hy.titlu || ""), hyMd(T.hy)));
  if (state.busy) $$("[data-busy]", p).forEach(b => b.disabled = true);
}

/* ---------------- dicționar integrat: termeni din glosar + „Definește” pe text selectat ---------------- */
function linkTerms(root, glosar){
  const terms = arr(glosar).filter(g => g && g.termen && g.definitie && String(g.termen).trim().length > 1)
    .sort((a, b) => String(b.termen).length - String(a.termen).length);
  if (!terms.length) return;
  const blocks = $$(".prose, .lede, td, .case-p", root);
  for (const block of blocks){
    for (const g of terms){
      const term = String(g.termen).trim();
      let re;
      try { re = new RegExp("(^|[^\\p{L}\\p{N}])(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![\\p{L}\\p{N}])", "iu"); } catch { continue; }
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && n.parentElement.closest(".term, .ref, .lv-tag, .label, h3") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      let node;
      while ((node = walker.nextNode())){
        const m = re.exec(node.nodeValue);
        if (!m) continue;
        const hit = node.splitText(m.index + m[1].length);
        hit.splitText(m[2].length);
        const span = document.createElement("span");
        span.className = "term"; span.tabIndex = 0;
        span.dataset.term = term; span.dataset.def = stripMarks(g.definitie);
        span.textContent = hit.nodeValue;
        hit.replaceWith(span);
        break;
      }
    }
  }
}
const tipEl = document.createElement("div"); tipEl.className = "tip"; tipEl.hidden = true; tipEl.setAttribute("role", "tooltip"); document.body.appendChild(tipEl);
const defBtn = document.createElement("button"); defBtn.className = "def-btn"; defBtn.type = "button"; defBtn.hidden = true; document.body.appendChild(defBtn);
const defCache = {};
let defRect = null;
function showTipAt(rect, title, text){
  tipEl.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
  tipEl.hidden = false;
  const w = Math.min(320, innerWidth - 24);
  tipEl.style.maxWidth = w + "px";
  const x = Math.max(scrollX + 12, Math.min(rect.left + scrollX, scrollX + innerWidth - w - 12));
  tipEl.style.left = x + "px";
  tipEl.style.top = (rect.bottom + scrollY + 8) + "px";
}
function hideTip(){ tipEl.hidden = true; }
function hideDefBtn(){ defBtn.hidden = true; }
const termOf = ev => ev.target && ev.target.closest ? ev.target.closest(".term") : null;
document.addEventListener("mouseover", ev => { const t = termOf(ev); if (t) showTipAt(t.getBoundingClientRect(), t.dataset.term, t.dataset.def); });
document.addEventListener("mouseout", ev => { if (termOf(ev)) hideTip(); });
document.addEventListener("focusin", ev => { const t = termOf(ev); if (t) showTipAt(t.getBoundingClientRect(), t.dataset.term, t.dataset.def); });
document.addEventListener("focusout", ev => { if (termOf(ev)) hideTip(); });
document.addEventListener("click", ev => {
  const t = termOf(ev);
  if (t){ showTipAt(t.getBoundingClientRect(), t.dataset.term, t.dataset.def); return; }
  if (!ev.target.closest || !ev.target.closest(".tip, .def-btn")) hideTip();
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape"){ hideTip(); hideDefBtn(); } });
function checkSelection(){
  const sel = window.getSelection();
  const t = sel ? String(sel).trim() : "";
  if (!t || t.length < 3 || t.length > 60 || /\n/.test(t) || !sel.rangeCount){ hideDefBtn(); return; }
  const a = sel.anchorNode; const el = a && (a.nodeType === 1 ? a : a.parentElement);
  if (!el || !el.closest("#p-explicatie, #p-caz, #p-tools, #p-flash, #p-quiz")){ hideDefBtn(); return; }
  defRect = sel.getRangeAt(0).getBoundingClientRect();
  defBtn.textContent = `Definește „${t.length > 28 ? t.slice(0, 26) + "…" : t}”`;
  defBtn.dataset.term = t;
  defBtn.hidden = false;
  defBtn.style.left = Math.max(scrollX + 8, Math.min(defRect.left + scrollX, scrollX + innerWidth - 240)) + "px";
  defBtn.style.top = (defRect.bottom + scrollY + 6) + "px";
}
document.addEventListener("mouseup", ev => { if (ev.target !== defBtn) setTimeout(checkSelection, 0); });
document.addEventListener("touchend", ev => { if (ev.target !== defBtn) setTimeout(checkSelection, 300); });
defBtn.addEventListener("mousedown", ev => ev.preventDefault());
defBtn.onclick = async () => {
  const term = defBtn.dataset.term, rect = defRect;
  hideDefBtn();
  try { window.getSelection().removeAllRanges(); } catch {}
  const key = term.toLowerCase() + "|" + (state.result ? state.result.titlu : "");
  if (defCache[key]){ showTipAt(rect, term, defCache[key]); return; }
  showTipAt(rect, term, "Se caută definiția…");
  try {
    const s = await sampleP;
    const { text } = await s(`Definește pe scurt, în limba română, termenul medical „${term}”${state.result ? ` în contextul temei „${stripMarks(state.result.titlu)}”` : ""}. Cel mult două propoziții, fără introducere și fără formatare. Dacă nu e un termen medical, explică pe scurt sensul lui în context.`, { modelTier: "quick" });
    defCache[key] = stripMarks(text).trim();
    showTipAt(rect, term, defCache[key]);
  } catch (e){ showTipAt(rect, term, errCopy(e)); }
};


/* ---------------- întrebări fulger după fiecare secțiune ---------------- */
const ICON_BOLT = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 2 4 14h7l-1.5 8L19 10h-7z"/></svg>';
const fqMap = new WeakMap();
function fqStore(r){ if (!fqMap.has(r)) fqMap.set(r, {}); return fqMap.get(r); }
function fqHtml(f, gi, ans){
  const c = Math.max(0, Math.min(arr(f.variante).length - 1, Number(f.corect) || 0)), done = ans !== undefined;
  return `<div class="fq" data-gi="${gi}"><span class="fq-tag">${ICON_BOLT}Întrebare fulger</span><p class="fq-q">${mdi(f.intrebare)}</p>
    <div class="fq-opts">${arr(f.variante).map((v, k) => `<button type="button" class="fq-o${done && k === c ? " right" : ""}${done && k === ans && k !== c ? " wrong" : ""}" data-k="${k}" ${done ? "disabled" : ""}>${mdi(v)}</button>`).join("")}</div>
    ${done ? `<p class="fq-x"><b class="${ans === c ? "" : "no"}">${ans === c ? "Corect." : "Nu chiar."}</b> ${mdi(f.explicatie)}</p>` : ""}</div>`;
}
document.addEventListener("click", ev => {
  const b = ev.target.closest && ev.target.closest(".fq-o");
  if (!b || b.disabled) return;
  const card = b.closest(".fq"), gi = +card.dataset.gi, r = state.result;
  const s = r && arr(r.sectiuni)[gi]; if (!s || !s.fulger) return;
  fqStore(r)[gi] = +b.dataset.k;
  if (!(state.meta && state.meta.sample)) progRecord(fqToQ(s.fulger), [LETTERS[+b.dataset.k]], "fulger", curTopicCtx());
  card.outerHTML = fqHtml(s.fulger, gi, +b.dataset.k);
});

/* exemplul are și el întrebări fulger și imagini */
[
  { intrebare: "Care este rolul principal al SRAA?", variante: ["Reglarea glicemiei", "Apărarea volemiei și a tensiunii arteriale", "Reglarea temperaturii corporale"], corect: 1, explicatie: "SRAA intervine când perfuzia renală scade și readuce volemia și tensiunea la normal." },
  { intrebare: "Care dintre acestea NU stimulează eliberarea de renină?", variante: ["Scăderea presiunii în arteriola aferentă", "Stimularea β1-adrenergică", "Creșterea peptidului natriuretic atrial"], corect: 2, explicatie: "Peptidul natriuretic atrial inhibă secreția de renină; ceilalți doi factori o stimulează." },
  { intrebare: "Ce enzimă transformă angiotensina I în angiotensina II?", variante: ["ECA", "Renina", "ECA2"], corect: 0, explicatie: "ECA (kininaza II), mai ales din endoteliul pulmonar. ECA2 produce angiotensina 1–7." },
  { intrebare: "Pe ce arteriolă acționează predominant angiotensina II la rinichi?", variante: ["Aferentă", "Eferentă", "Arcuată"], corect: 1, explicatie: "Contracția arteriolei eferente menține presiunea de filtrare și RFG când perfuzia scade." },
  { intrebare: "Ce face aldosteronul cu potasiul?", variante: ["Crește secreția lui", "Crește reabsorbția lui", "Nu îl influențează"], corect: 0, explicatie: "În tubul colector Na⁺ este reabsorbit, iar K⁺ este secretat, prin ENaC și Na⁺/K⁺-ATPază." },
  { intrebare: "De ce sartanii nu dau tuse?", variante: ["Blochează direct bradikinina", "Nu inhibă ECA, deci bradikinina nu se acumulează", "Scad mai puțin aldosteronul"], corect: 1, explicatie: "Tusea la IECA vine din bradikinina nedegradată; sartanii acționează pe receptorul AT1." },
  { intrebare: "Ce profil hormonal are sindromul Conn?", variante: ["Aldosteron crescut, renină scăzută", "Aldosteron crescut, renină crescută", "Aldosteron scăzut, renină crescută"], corect: 0, explicatie: "Aldosteronul în exces expandează volemia și supresează renina." }
].forEach((f, i) => { if (SAMPLE.result.sectiuni[i]) SAMPLE.result.sectiuni[i].fulger = f; });
SAMPLE.result.sectiuni[1].imagine = "juxtaglomerular apparatus";
SAMPLE.result.sectiuni[2].imagine = "renin angiotensin aldosterone system";

/* ---------------- imagini din Wikimedia Commons, cu explicație AI ---------------- */
const imgCache = new Map(), imgExpCache = new Map();
function htmlText(h){ try { return new DOMParser().parseFromString(String(h || ""), "text/html").body.textContent.replace(/\s+/g, " ").trim(); } catch { return ""; } }
function commonsSearch(q){
  if (imgCache.has(q)) return imgCache.get(q);
  const pr = (async () => {
    const url = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
      action: "query", generator: "search", gsrsearch: q + " filetype:bitmap|drawing", gsrnamespace: "6", gsrlimit: "10",
      prop: "imageinfo", iiprop: "url|extmetadata|mime", iiurlwidth: "960", iiextmetadatafilter: "Artist|LicenseShortName", format: "json", origin: "*"
    });
    const d = await (await fetch(url)).json();
    const pages = Object.values((d.query && d.query.pages) || {}).sort((a, b) => a.index - b.index);
    return pages.map(p => {
      const ii = (p.imageinfo || [])[0] || {}, mt = ii.extmetadata || {};
      return { title: String(p.title || "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " "), thumb: ii.thumburl, page: ii.descriptionurl,
        author: htmlText(mt.Artist && mt.Artist.value).slice(0, 80), license: htmlText(mt.LicenseShortName && mt.LicenseShortName.value), mime: ii.mime || "" };
    }).filter(x => x.thumb && /^image\/(jpeg|png|svg\+xml|gif|webp)$/.test(x.mime)
      && !/[-_ (](zh|ja|ko|ru|uk|ar|fa|he|el|bg|sr|th|hi|ka|hy|vi)\)?$/i.test(x.title) && !/[^\u0000-ɏ\s]/.test(x.title)).slice(0, 6);
  })();
  imgCache.set(q, pr);
  pr.catch(() => imgCache.delete(q));
  return pr;
}
function showImgCandidate(fig, k){
  const list = fig._list, c = list[k];
  fig.dataset.k = k;
  fig.innerHTML = `<div class="img-box"><img src="${esc(c.thumb)}" alt="${esc(c.title)}" loading="lazy"></div>
    <figcaption><b>${esc(c.title)}</b><span>${c.author ? esc(c.author) + " · " : ""}${c.license ? esc(c.license) + " · " : ""}<a href="${esc(c.page)}" target="_blank" rel="noopener">Wikimedia Commons</a>${state.meta && state.meta.mode === "combinat" ? " · imagine din afara sursei" : ""}</span></figcaption>
    <div class="img-act"><button class="btn sm" type="button" data-img="explain">Explică imaginea</button>${list.length > 1 ? `<button class="btn sm" type="button" data-img="next">Altă imagine (${k + 1}/${list.length})</button>` : ""}</div>
    <div class="img-exp prose"${imgExpCache.has(c.thumb) ? "" : " hidden"}>${imgExpCache.has(c.thumb) ? md(imgExpCache.get(c.thumb)) : ""}</div>`;
}
function loadSectionImages(root){
  $$(".sec-img", root).forEach(fig => {
    commonsSearch(fig.dataset.q).then(list => {
      if (!fig.isConnected) return;
      if (!list.length){ fig.remove(); return; }
      fig._list = list; showImgCandidate(fig, 0);
    }).catch(() => fig.remove());
  });
}
async function explainImg(fig, btn){
  const c = fig._list[+fig.dataset.k], out = $(".img-exp", fig);
  out.hidden = false;
  if (imgExpCache.has(c.thumb)){ out.innerHTML = md(imgExpCache.get(c.thumb)); return; }
  const r = state.result, sec = r && arr(r.sectiuni)[+fig.closest(".sec-img").dataset.gi];
  btn.disabled = true;
  out.innerHTML = `<p class="hint">Se analizează imaginea…</p>`;
  try {
    const blob = await (await fetch(c.thumb)).blob();
    const s = await sampleP;
    const { text } = await s(`Ești tutore de medicină pentru studenți. Imaginea atașată („${c.title}”, de pe Wikimedia Commons) ilustrează secțiunea „${stripMarks(sec ? sec.titlu : "")}” din tema „${stripMarks(r ? r.titlu : "")}”.
Explică în limba română ce se vede: structurile și etichetele, ce arată imaginea în legătură cu tema și ce trebuie reținut. 80–160 de cuvinte, markdown simplu (un paragraf scurt și o listă). Dacă etichetele sunt în altă limbă, tradu-le în română. Dacă imaginea nu are legătură cu tema, spune asta într-o propoziție.`, { modelTier: "default", images: [blob], onText: ({ text }) => { out.innerHTML = md(text); } });
    imgExpCache.set(c.thumb, text);
    out.innerHTML = md(text);
  } catch (e){
    out.innerHTML = `<p class="hint">${esc(e && e.code ? errCopy(e) : "Imaginea nu a putut fi pregătită pentru analiză. Încearcă altă imagine.")}</p>`;
  } finally { btn.disabled = false; }
}
document.addEventListener("click", ev => {
  const b = ev.target.closest && ev.target.closest("[data-img]");
  if (!b) return;
  const fig = b.closest(".sec-img"); if (!fig || !fig._list) return;
  if (b.dataset.img === "next") showImgCandidate(fig, (+fig.dataset.k + 1) % fig._list.length);
  else explainImg(fig, b);
});

/* ---------------- instrument: explică o imagine încărcată ---------------- */
async function pickIx(file){
  if (!file) return;
  try {
    const bmp = await createImageBitmap(file);
    const sc = Math.min(1, Math.sqrt(1600000 / (bmp.width * bmp.height)));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    const cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.88));
    const T = state.tools;
    if (T.ixUrl) URL.revokeObjectURL(T.ixUrl);
    T.ixBlob = blob; T.ixUrl = URL.createObjectURL(blob); T.ixOut = "";
    renderTools();
  } catch { toast("Imaginea nu poate fi citită. Folosește JPG sau PNG."); }
}
async function genIx(){
  const T = state.tools;
  if (!T.ixBlob){ toast("Alege întâi o imagine"); return; }
  if (state.busy) return;
  const q = ($("#ixQ").value || "").trim(); T.ixQ = q;
  const out = $("#ixOut");
  setBusy(true, "Analizează imaginea…");
  try {
    const { text } = await callClaude(`${ROLE}

Analizează imaginea medicală atașată, în scop educativ, pentru un student la medicină.${q ? ` Întrebarea studentului: ${q}` : ""}${state.result ? ` Tema la care lucrează: „${stripMarks(state.result.titlu)}”.` : ""}
Răspunde în markdown, 150–300 de cuvinte, cu această structură:
**Ce tip de imagine este** (de ex. secțiune histologică și colorația probabilă, ECG, radiografie, CT, piesă anatomică, schemă de curs).
**Ce se vede**: descriere sistematică, în ordinea în care s-ar prezenta la examen.
**Interpretare**: elementele-cheie și ce sugerează; dacă e un caz clinic, diagnosticul cel mai probabil și 1–2 diferențiale, formulate prudent.
**De reținut**: 2–4 puncte.
Dacă imaginea nu e medicală sau nu se poate interpreta, spune asta pe scurt.`, { json: false, tier: "default", images: [T.ixBlob], noCache: true, progress: ({ text }) => { if (out) out.innerHTML = md(text); } });
    T.ixOut = text; if (out) out.innerHTML = md(text);
  } catch (e){ if (!e || e.code !== "cancelled") showNotice(errCopy(e), "err"); }
  finally { setBusy(false); }
}
function ixSectionHtml(){
  const T = state.tools;
  return `<section class="tool">
    <div class="tool-h"><div><h3>Explică o imagine</h3><p class="hint">Încarcă o lamă de histologie, un ECG, o radiografie sau o schemă din curs. Primești o descriere sistematică și ce trebuie reținut. Nu încărca imagini cu date care identifică pacienți.</p></div></div>
    <div class="ask-row">
      <label class="btn" for="ixFile">${T.ixBlob ? "Schimbă imaginea" : "Alege imaginea"}</label><input type="file" id="ixFile" accept="image/*" hidden>
      <input id="ixQ" placeholder="Opțional: ce vrei să afli? (de ex. ce țesut este?)" value="${esc(T.ixQ || "")}">
      <button class="btn primary" type="button" id="ixGo" data-busy ${T.ixBlob ? "" : "disabled"}>Explică imaginea</button>
    </div>
    ${T.ixUrl ? `<div class="ix-row"><img class="ix-prev" src="${T.ixUrl}" alt="Imaginea încărcată"><div class="prose ix-out" id="ixOut">${T.ixOut ? md(T.ixOut) : `<p class="hint">Apasă „Explică imaginea”.</p>`}</div></div>` : ""}
  </section>`;
}
