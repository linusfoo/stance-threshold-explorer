import { sig, fitCurve, makeGrid, table, shapley, kappa, interp } from "./model.js";

const D = await (await fetch("data.json")).json();
const C = D.comments, NC = C.s.length, A = ["A1", "A2", "A3"];
const COL = { A1: "var(--a1)", A2: "var(--a2)", A3: "var(--a3)", You: "var(--you)" };
const NAME = { A1: "Avery", A2: "Jack", A3: "Michael", You: "You" }, nm = a => NAME[a];   // made-up names, shown in place of A1-A3
const TAU = Object.fromEntries(A.map(a => [a, D.curves[a].tau]));
const SMIN = -21, SMAX = 21;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = id => document.getElementById(id);
const fmt = v => (Math.abs(v) < 0.05 ? "0" : (v > 0 ? "+" : "−") + Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0));
const pct = v => Math.round(v * 100) + "%";
const NSVG = "http://www.w3.org/2000/svg";
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NSVG, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function txt(parent, x, y, s, attrs = {}) { const t = el("text", { x, y, ...attrs }, parent); t.textContent = s; return t; }
function canvas(fig, H, minW = 320) {
  const W = Math.max(minW, Math.round(fig.clientWidth || 720));
  fig.innerHTML = ""; return [el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, fig), W];
}
const tip = $("tip");
function showTip(ev, html) { tip.innerHTML = html; tip.classList.remove("hidden"); moveTip(ev); }
function moveTip(ev) { const x = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 8); tip.style.left = x + "px"; tip.style.top = ev.clientY + 14 + "px"; }
function hideTip() { tip.classList.add("hidden"); }
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
function radio(container, items, current, onPick, cls) {
  container.innerHTML = "";
  for (const it of items) {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(it.value === current));
    if (it.color) { b.style.setProperty("--c", it.color); b.innerHTML = `<span class="sw"></span>${it.label}`; } else b.textContent = it.label;
    b.onclick = () => { [...container.children].forEach(c => c.setAttribute("aria-checked", "false")); b.setAttribute("aria-checked", "true"); onPick(it.value); };
    container.appendChild(b);
  }
  container.onkeydown = ev => {   // arrow keys move within the group
    if (!["ArrowLeft", "ArrowRight"].includes(ev.key)) return;
    const bs = [...container.children], i = bs.indexOf(document.activeElement); if (i < 0) return;
    const j = (i + (ev.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length; bs[j].focus(); bs[j].click(); ev.preventDefault();
  };
}
const topicShare = lab => D.topics.map((_, t) => { let n = 0, k = 0; for (let i = 0; i < NC; i++) if (C.t[i] === t) { n++; if (lab[i] !== "N") k++; } return k / n; });
const SHARE = Object.fromEntries(A.map(a => [a, topicShare(C[a])]));
const STANCE = Object.fromEntries(A.map(a => [a, [...C[a]].filter(c => c !== "N").length / NC]));

/* ---------------- hero: the 1,000 comments in each annotator's lanes ---------------- */
const hero = { who: "A1", nodes: null, W: 0 };
const LANE = { S: "Support", N: "Neutral", O: "Oppose" };
const TAG = { A1: "Spots a side early", A2: "Waits for a clear stance", A3: "Spots a side earliest" };
// the ringed comment: a minimum wage comment the two early annotators call Oppose and Jack calls Neutral
const SPOT = (() => { const mw = D.topics.findIndex(t => t.key === "minimum_wage"); let best = 0, bd = 1e9;
  for (let i = 0; i < NC; i++) if (C.t[i] === mw && C.A2[i] === "N" && C.A1[i] !== "N" && C.A1[i] === C.A3[i] && Math.abs(C.s[i] - 11) < bd) { best = i; bd = Math.abs(C.s[i] - 11); }
  return best; })();
const jit = (() => { const r = rng(11); return Array.from({ length: NC }, () => r()); })();
// scores are capped near +-20.7, so about 150 comments share the end values: spread those across the last unit so they stay visible
const HX = (() => { const r = rng(29); return C.s.map(s => (s > 20.5 ? 20 + r() : s < -20.5 ? -21 + r() : s)); })();
function drawHero() {
  const fig = $("fig-hero"), H = 336;
  const [svg, W] = canvas(fig, H); hero.W = W;
  const L = W < 500 ? 66 : 78, R = W - 12, x = v => L + ((v - SMIN) / (SMAX - SMIN)) * (R - L);
  const lanes = { S: [22, 104], N: [122, 180], O: [198, 280] };
  el("clipPath", { id: "hero-clip" }, el("defs", {}, svg)).appendChild(el("rect", { x: L, y: 0, width: R - L, height: H }));
  hero.zone = el("rect", { class: "zone", x: 0, y: 8, width: R - L, height: 284, opacity: 0.1 }, el("g", { "clip-path": "url(#hero-clip)" }, svg));
  hero.counts = {};
  for (const k of ["S", "N", "O"]) {
    const [y0, y1] = lanes[k];
    if (k !== "O") el("line", { x1: L, x2: R, y1: y1 + 9, y2: y1 + 9, stroke: "var(--field-rule)" }, svg);
    txt(svg, 0, (y0 + y1) / 2 - 1, LANE[k], { class: "lane-name" });
    hero.counts[k] = txt(svg, 0, (y0 + y1) / 2 + 14, "", { class: "lane-count" });
  }
  // axis: what left to right means
  const ay = 306;
  el("line", { x1: L, x2: R - 2, y1: ay, y2: ay, stroke: "var(--field-ink)", "stroke-opacity": 0.35 }, svg);
  el("path", { d: `M${R - 8},${ay - 4}L${R - 1},${ay}L${R - 8},${ay + 4}`, fill: "none", stroke: "var(--field-ink)", "stroke-opacity": 0.5, "stroke-width": 1.5 }, svg);
  txt(svg, L, ay + 20, W < 560 ? "← no clear stance" : "← the AI model reads no clear stance", { class: "axis-l" });
  txt(svg, R, ay + 20, W < 560 ? "clear stance →" : "a clear stance →", { class: "axis-l", "text-anchor": "end" });
  const gate = hero.gate = el("g", { class: "gate" }, svg);
  hero.gateLine = el("line", { x1: 0, x2: 0, y1: 8, y2: 292, "stroke-width": 2.5 }, gate);
  hero.gateText = txt(gate, 0, 16, "", { "font-weight": 600 });
  const g = el("g", {}, svg);
  hero.nodes = C.s.map((s, i) => el("circle", { class: "c", r: W < 500 ? 1.9 : 2.4, cx: 0, cy: 0 }, g));
  const sg = el("g", { class: "spot-ring" }, svg);
  el("circle", { r: 7.5, class: "spot-pulse" }, sg); el("circle", { r: 7.5, fill: "none", stroke: "var(--field-ink)", "stroke-width": 2 }, sg);
  hero.spot = sg;
  hero.x = x; hero.lanes = lanes; hero.L = L; hero.R = R;
  setHero(hero.who, true);
}
const heroY = (i, lab) => { const [y0, y1] = hero.lanes[lab]; return y0 + jit[i] * (y1 - y0); };
function setHero(who, instant) {
  hero.who = who;
  const lab = C[who], { x } = hero;
  hero.nodes.forEach((n, i) => {
    n.style.transform = `translate(${x(HX[i]).toFixed(1)}px, ${heroY(i, lab[i]).toFixed(1)}px)`;
    n.style.fill = lab[i] === "N" ? "var(--field-dim)" : COL[who];
    n.style.transition = instant ? "none" : "";
  });
  hero.spot.style.transition = instant ? "none" : "";
  hero.spot.style.transform = `translate(${x(HX[SPOT]).toFixed(1)}px, ${heroY(SPOT, lab[SPOT]).toFixed(1)}px)`;
  for (const k of ["S", "N", "O"]) hero.counts[k].textContent = [...lab].filter(l => l === k).length + (hero.W < 500 ? "" : " comments");
  const gx = x(TAU[who]);
  for (const e of [hero.gate, hero.zone]) { e.style.transition = instant ? "none" : ""; e.style.transform = `translateX(${gx.toFixed(1)}px)`; }
  hero.gateLine.style.stroke = COL[who]; hero.zone.style.fill = COL[who];
  hero.gateText.textContent = `${nm(who)}'s threshold`;
  hero.gateText.style.fill = COL[who];
  const flip = gx > hero.R - 140; hero.gateText.setAttribute("x", flip ? -8 : 8); hero.gateText.setAttribute("text-anchor", flip ? "end" : "start");
  const ro = $("hero-readout"); ro.style.setProperty("--c", COL[who]);
  const mw = D.topics.findIndex(t => t.key === "minimum_wage");
  ro.innerHTML = `${nm(who)} calls <span class="pct">${pct(STANCE[who])}</span> of these comments a stance, and ${pct(SHARE[who][mw])} of the minimum wage debate.`;
  $("hero-spot").innerHTML = `<span class="ring"></span>The ringed comment is about the minimum wage. Same words, three readers:
    <span class="chips">${A.map(a => `<span class="chip${a === who ? " on" : ""}" style="--c:${COL[a]}"><span class="sw"></span>${nm(a)}: <b>${LANE[C[a][SPOT]]}</b></span>`).join("")}</span>`;
  for (const b of $("hero-who").children) {
    b.setAttribute("aria-checked", String(b.dataset.a === who)); b.tabIndex = b.dataset.a === who ? 0 : -1;
    if (b.dataset.a === who) { const t = b.querySelector(".pc-tick"), t2 = t.cloneNode(); t.replaceWith(t2); }   // restart the dwell bar
  }
}
// persona cards; they take turns on their own until someone picks one
const DWELL = 5200, auto = { on: !reduced, t: 0, seen: true };
function stopAuto() { auto.on = false; clearTimeout(auto.t); $("hero-who").classList.remove("auto"); }
function autoNext() { if (!auto.on) return; if (auto.seen) setHero(A[(A.indexOf(hero.who) + 1) % A.length]); auto.t = setTimeout(autoNext, DWELL); }
function buildPersonaCards() {
  const box = $("hero-who"); box.innerHTML = ""; box.style.setProperty("--dwell", DWELL + "ms");
  for (const a of A) {
    const share = k => [...C[a]].filter(l => l === k).length / NC;
    const b = document.createElement("button");
    b.type = "button"; b.className = "pcard"; b.dataset.a = a; b.setAttribute("role", "radio"); b.style.setProperty("--c", COL[a]);
    b.innerHTML = `<span class="pc-name"><span class="sw"></span>${nm(a)}</span><span class="pc-tag">${TAG[a]}</span>
      <span class="pc-bar" title="Support, Neutral, Oppose"><i style="flex:${share("S")}"></i><i class="n" style="flex:${share("N")}"></i><i style="flex:${share("O")}"></i></span>
      <span class="pc-num"><b>${pct(STANCE[a])}</b> take a side<span class="thr"> · threshold ${fmt(TAU[a])}</span></span><span class="pc-tick"></span>`;
    b.onclick = () => { stopAuto(); setHero(a); };
    box.appendChild(b);
  }
  box.onkeydown = ev => {   // arrow keys move within the group
    if (!["ArrowLeft", "ArrowRight"].includes(ev.key)) return;
    const bs = [...box.children], i = bs.indexOf(document.activeElement); if (i < 0) return;
    const j = (i + (ev.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length; bs[j].focus(); bs[j].click(); ev.preventDefault();
  };
  if (auto.on) box.classList.add("auto");
}
buildPersonaCards();
new IntersectionObserver(es => { auto.seen = es[0].isIntersecting; }).observe($("fig-hero"));

/* ---------------- 1. be the annotator ---------------- */
const PARA = [...D.paraphrases].sort((a, b) => a.s - b.s);
const NOPTS = [10, 20, 30, 40];
const ann = { n: 20, items: [], labels: [], i: 0, fit: null };
const pickItems = (n, r) => {
  const idx = [...new Set(Array.from({ length: n }, (_, j) => Math.round((j * (PARA.length - 1)) / (n - 1))))];
  const it = idx.map(i => PARA[i]);
  for (let j = it.length - 1; j > 0; j--) { const k = Math.floor(r() * (j + 1)); [it[j], it[k]] = [it[k], it[j]]; }
  return it;
};
const precision = {};
function estimatePrecision() {   // simulated annotators like A1-A3 labelling n comments: typical error of the threshold estimate
  const r = rng(5);
  for (const n of NOPTS) {
    const errs = [];
    for (let k = 0; k < 40; k++) {
      const a = A[k % 3], cv = D.curves[a], items = pickItems(n, r);
      const y = items.map(p => r() < sig(cv.b * (p.s - cv.tau)));
      const f = fitCurve(items.map(p => p.s), y, true); errs.push((f.hi - f.lo) / 2);   // half-width of the 80% range
    }
    errs.sort((p, q) => p - q); precision[n] = errs[Math.floor(errs.length / 2)];
  }
  renderNChoice();
}
function renderNChoice() {
  radio($("ann-n"), NOPTS.map(n => ({ value: n, label: `${n} comments` })), ann.n, n => { ann.n = n; updatePrecisionHint(); });
  updatePrecisionHint();
}
function updatePrecisionHint() {
  const p = precision[ann.n];
  $("ann-precision").textContent = p == null ? "More comments give a more precise estimate of your threshold."
    : `With ${ann.n} comments your threshold is typically pinned down to within about ±${p.toFixed(0)} on the ruler, where ${nm("A2")} and ${nm("A3")} sit 14 apart. More comments make it more precise.`;
}
function startAnnotate() {
  ann.items = pickItems(ann.n, rng(Date.now() % 100000)); ann.labels = []; ann.i = 0;
  $("ann-setup").classList.add("hidden"); $("ann-result").classList.add("hidden"); $("ann-task").classList.remove("hidden");
  showItem(); $("ann-task").querySelector(".choice").focus();
}
function showItem() {
  const it = ann.items[ann.i], n = ann.items.length;
  $("ann-count").textContent = `Comment ${ann.i + 1} of ${n}`;
  $("ann-topic").textContent = D.topics[it.t].phrase;
  $("ann-text").textContent = it.text;
  $("ann-bar").style.width = (100 * ann.i) / n + "%";
  $("ann-back").disabled = ann.i === 0; $("ann-back").style.visibility = ann.i === 0 ? "hidden" : "visible";
}
function choose(l) {
  if ($("ann-task").classList.contains("hidden")) return;
  ann.labels[ann.i] = l; ann.i++;
  if (ann.i < ann.items.length) showItem(); else finishAnnotate();
}
document.querySelectorAll(".choice").forEach(b => (b.onclick = () => choose(b.dataset.l)));
$("ann-back").onclick = () => { if (ann.i > 0) { ann.i--; showItem(); } };
document.addEventListener("keydown", ev => {
  if ($("ann-task").classList.contains("hidden") || ev.target.matches("input, textarea, select")) return;
  const k = ev.key.toUpperCase(); if (["S", "N", "O"].includes(k)) { choose(k); ev.preventDefault(); }
  if (ev.key === "Backspace") { $("ann-back").click(); ev.preventDefault(); }
});
$("ann-start").onclick = startAnnotate;
$("ann-again").onclick = () => { $("ann-result").classList.add("hidden"); $("ann-setup").classList.remove("hidden"); $("ann-start").focus(); };
function finishAnnotate() {
  $("ann-bar").style.width = "100%";
  const s = ann.items.map(p => p.s), y = ann.labels.map(l => l !== "N");
  ann.fit = fitCurve(s, y);
  $("ann-task").classList.add("hidden"); $("ann-result").classList.remove("hidden");
  renderVerdict(); drawCurves(); drawYouTopics(); if (typed.last) renderTyped(typed.last);
  $("ann-result").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}
function renderVerdict() {
  const f = ann.fit, k = ann.labels.filter(l => l !== "N").length, n = ann.labels.length;
  const looser = A.filter(a => TAU[a] < f.tau), stricter = A.filter(a => TAU[a] > f.tau);
  const list = xs => (xs = xs.map(nm), xs.length === 1 ? xs[0] : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
  const rel = !looser.length ? `You call a comment a stance sooner than all three annotators.`
    : !stricter.length ? `You need more evidence than all three annotators before calling something a stance.`
      : `You need more evidence than ${list(looser)}, and less than ${list(stricter)}.`;
  const close = A.reduce((b, a) => (Math.abs(TAU[a] - f.tau) < Math.abs(TAU[b] - f.tau) ? a : b));
  const wide = f.hi - f.lo > 14 ? " Label more comments to pin it down." : "";
  $("ann-summary").innerHTML = `Your threshold is about <span class="you">${fmt(f.tau)}</span>, likely between ${fmt(f.lo)} and ${fmt(f.hi)}. ${rel} Your threshold is closest to ${nm(close)}'s.${wide} <span style="font-weight:400;color:var(--ink2)">You called ${k} of ${n} comments a stance.</span>`;
  $("curve-legend").innerHTML = [...A, "You"].map(a => `<span style="--c:${COL[a]}"><i></i>${nm(a)} ${fmt(a === "You" ? f.tau : TAU[a])}</span>`).join("");
}
function axisX(svg, x, y, ticks, label, W) {
  for (const t of ticks) { el("line", { x1: x(t), x2: x(t), y1: y, y2: y + 5, stroke: "var(--muted)" }, svg); txt(svg, x(t), y + 18, t > 0 ? "+" + t : String(t).replace("-", "−"), { "text-anchor": "middle" }); }
  if (label) txt(svg, W / 2, y + 36, label, { "text-anchor": "middle" });
}
function drawCurves() {
  const fig = $("fig-curves"), H = 300, [svg, W] = canvas(fig, H), f = ann.fit;
  const L = 44, R = W - 10, T = 18, B = H - 52, x = v => L + ((v - SMIN) / (SMAX - SMIN)) * (R - L), y = p => B - p * (B - T);
  for (const p of [0, 0.5, 1]) { el("line", { x1: L, x2: R, y1: y(p), y2: y(p), stroke: "var(--rule)" }, svg); txt(svg, L - 8, y(p) + 4, pct(p), { "text-anchor": "end" }); }
  el("rect", { x: x(f.lo), width: Math.max(2, x(f.hi) - x(f.lo)), y: T, height: B - T, fill: "var(--you-wash)" }, svg);
  const path = (b, tau) => Array.from({ length: 121 }, (_, i) => { const v = SMIN + (i * (SMAX - SMIN)) / 120; return `${i ? "L" : "M"}${x(v).toFixed(1)},${y(sig(b * (v - tau))).toFixed(1)}`; }).join("");
  for (const a of A) el("path", { d: path(D.curves[a].b, TAU[a]), fill: "none", "stroke-width": 2.5, style: `stroke:${COL[a]}` }, svg);
  el("path", { d: path(f.k, f.tau), fill: "none", "stroke-width": 4, style: `stroke:${COL.You}` }, svg);
  for (const a of [...A, "You"]) el("circle", { cx: x(a === "You" ? f.tau : TAU[a]), cy: y(0.5), r: 5, style: `fill:${COL[a]};stroke:var(--paper);stroke-width:2` }, svg);
  const r = rng(3);
  ann.items.forEach((it, i) => {
    const st = ann.labels[i] !== "N", cy = st ? T - 2 - r() * 10 : B + 2 + r() * 10;
    const c = el("circle", { cx: x(it.s), cy, r: 5, style: st ? `fill:${COL.You}` : `fill:var(--paper);stroke:${COL.You};stroke-width:2`, tabindex: 0 }, svg);
    const lab = { S: "Support", N: "Neutral", O: "Oppose" }[ann.labels[i]];
    const html = `<b>You: ${lab}</b> · ruler ${fmt(it.s)}<br>${esc(it.text.slice(0, 160))}${it.text.length > 160 ? "…" : ""}`;
    c.onmouseenter = ev => showTip(ev, html); c.onmousemove = moveTip; c.onmouseleave = hideTip;
    c.onfocus = () => { const b = c.getBoundingClientRect(); showTip({ clientX: b.right, clientY: b.bottom }, html); }; c.onblur = hideTip;
  });
  axisX(svg, x, B + 14, [-20, -10, 0, 10, 20], "Ruler score: how strongly the model reads a side", W);
}
function topicChart(fig, series, opts = {}) {   // series: [{name, color, values[9], shape}] ; optional bars: values[9]
  const rowH = 26, gH = 22, H = 24 + D.topics.length * rowH + 3 * gH + 30, [svg, W] = canvas(fig, H);
  const L = W < 520 ? 150 : 190, R = W - 16, x = v => L + v * (R - L);
  for (const v of [0, 0.25, 0.5, 0.75, 1]) { el("line", { x1: x(v), x2: x(v), y1: 14, y2: H - 30, stroke: "var(--rule)" }, svg); txt(svg, x(v), H - 12, pct(v), { "text-anchor": "middle" }); }
  let yy = 18, g0 = null;
  D.topics.forEach((t, i) => {
    if (t.genre !== g0) { g0 = t.genre; yy += gH; txt(svg, 0, yy - 6, t.genre, { class: "genre" }); }
    const cy = yy + rowH / 2 - 4;
    txt(svg, 10, cy + 4, t.name, { class: "t-ink" });
    el("line", { x1: x(0), x2: x(1), y1: cy, y2: cy, stroke: "var(--rule)" }, svg);
    if (opts.bars) el("rect", { x: x(0), y: cy - 8, width: Math.max(0, x(opts.bars[i]) - x(0)), height: 16, rx: 3, style: `fill:${opts.barColor}`, opacity: 0.9 }, svg);
    for (const s of series) {
      const v = s.values[i], cx = x(v);
      const m = s.shape === "diamond" ? el("path", { d: `M${cx},${cy - 7}L${cx + 7},${cy}L${cx},${cy + 7}L${cx - 7},${cy}Z`, style: `fill:${s.color};stroke:var(--paper);stroke-width:1.5` }, svg)
        : s.shape === "tick" ? el("line", { x1: cx, x2: cx, y1: cy - 10, y2: cy + 10, "stroke-width": 3, style: `stroke:${s.color}` }, svg)
          : el("circle", { cx, cy, r: 5.5, style: `fill:${s.color};stroke:var(--paper);stroke-width:1.5` }, svg);
      m.onmouseenter = ev => showTip(ev, `<b>${s.name}</b>, ${esc(t.name)}: ${pct(v)} take a side`); m.onmousemove = moveTip; m.onmouseleave = hideTip;
    }
    yy += rowH;
  });
  return svg;
}
function drawYouTopics() {
  const f = ann.fit, you = D.topics.map((_, t) => { let n = 0, v = 0; for (let i = 0; i < NC; i++) if (C.t[i] === t) { n++; v += sig(f.k * (C.s[i] - f.tau)); } return v / n; });
  ann.topicShare = you;
  topicChart($("fig-you-topics"), [...A.map(a => ({ name: nm(a), color: COL[a], values: SHARE[a] })), { name: "You", color: COL.You, values: you, shape: "diamond" }]);
}

/* ---------------- 2. typed comment ---------------- */
const typed = { nli: null, loading: null, last: null };
const BR = D.browser, REPO = BR.model, QM = BR.quantile_map;
$("typed-topic").innerHTML = D.topics.map((t, i) => `<option value="${i}">${t.phrase}</option>`).join("");
// Tested 2026-10-22 against onnxruntime in Python on the same file: transformers.js 3.8.1 on the CPU (WASM) reproduces the
// scores exactly (~0.5 s per comment); WebGPU (4.2.0) runs but its half-precision maths shifts the logits by 1-2, and 4.2.0
// cannot open the file on the CPU. So every visitor uses 3.8.1 on the CPU and gets the scores the curves were fitted on.
const TJS = { wasm: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1" };
async function loadNLI() {
  const status = $("typed-status"), files = {};
  const progress = p => {
    if (p.status === "progress" && p.total) { files[p.file] = [p.loaded, p.total];
      const [l, t] = Object.values(files).reduce((a, v) => [a[0] + v[0], a[1] + v[1]], [0, 0]);
      status.textContent = `Downloading the model: ${(l / 1e6).toFixed(0)} of ${(t / 1e6).toFixed(0)} MB`; }
  };
  status.textContent = "Loading the model…";
  let last;
  for (const device of ["wasm"]) {
    try {
      const T = await import(TJS[device]); T.env.allowLocalModels = false;
      const tok = await T.AutoTokenizer.from_pretrained(REPO, { progress_callback: progress });
      const model = await T.AutoModelForSequenceClassification.from_pretrained(REPO, { device, dtype: "q4f16", progress_callback: progress });
      return { tok, model, device };
    } catch (e) { last = e; console.warn("model load failed on", device, e); }
  }
  throw last;
}
async function scoreText(text, phrase) {
  const { tok, model } = typed.nli, hyps = BR.hypotheses.map(h => h.replace("{topic}", phrase));
  const inputs = await tok([text, text], { text_pair: hyps, padding: true, truncation: true, max_length: 512 });
  const logits = (await model(inputs)).logits.tolist();
  const ent = logits.map(r => { const m = Math.max(...r), e = r.map(v => Math.exp(v - m)), s = e.reduce((a, b) => a + b, 0); return e[0] / s; });   // label 0 = entailment
  const e = Math.min(Math.max(Math.max(...ent), 1e-6), 1 - 1e-6);
  const lg = p => { const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6); return Math.log(q) - Math.log1p(-q); };
  // side_margin_check.py: on the 1,000 annotated comments the side agrees with the annotators only 49-65% of the time unless the
  // supports/opposes logits are at least 5 apart (about a fifth of comments, 67-76% agreement), so below that the side is not shown
  return { sb: Math.log(e) - Math.log1p(-e), side: ent[0] >= ent[1] ? "S" : "O", sideClear: Math.abs(lg(ent[0]) - lg(ent[1])) >= 5, ent };
}
$("typed-go").onclick = async () => {
  const text = $("typed-text").value.trim(), t = +$("typed-topic").value, btn = $("typed-go"), status = $("typed-status");
  if (text.length < 15) { status.textContent = "Write at least a sentence so there is something to score."; $("typed-text").focus(); return; }
  btn.disabled = true;
  try {
    if (!typed.nli) typed.nli = await (typed.loading ||= loadNLI());
    status.textContent = "Scoring…";
    const r = await scoreText(text.slice(0, 2000), D.topics[t].phrase);
    typed.last = { ...r, t, text };
    renderTyped(typed.last);
    status.textContent = "Scored in your browser. Change the text or topic and score again.";
  } catch (e) {
    console.error(e); typed.loading = null;
    status.textContent = "The model could not run in this browser. Try a recent version of Chrome, Edge, Firefox or Safari.";
  } finally { btn.disabled = false; }
};
function renderTyped({ sb, side, sideClear }) {
  $("typed-result").classList.remove("hidden");
  const sq = interp(sb, QM.browser, QM.qwen);   // where it would sit on the main ruler (quantile map)
  const fig = $("fig-typed"), H = 120, [svg, W] = canvas(fig, H), L = 10, R = W - 10, x = v => L + ((v - SMIN) / (SMAX - SMIN)) * (R - L), y0 = 64;
  el("line", { x1: L, x2: R, y1: y0, y2: y0, stroke: "var(--ink)", "stroke-width": 2 }, svg);
  txt(svg, L, y0 + 22, "Neutral side", {}); txt(svg, R, y0 + 22, "Stance side", { "text-anchor": "end" });
  const gates = A.map(a => [a, TAU[a]]); if (ann.fit) gates.push(["You", ann.fit.tau]);
  gates.forEach(([a, v], k) => { el("line", { x1: x(v), x2: x(v), y1: y0 - 14, y2: y0 + 6, "stroke-width": 3, style: `stroke:${COL[a]}` }, svg); txt(svg, x(v), y0 - 18 - (k % 2) * 12, nm(a), { "text-anchor": "middle", style: `fill:${COL[a]}`, "font-weight": 600 }); });
  el("path", { d: `M${x(sq)},${y0 - 2}l-8,-16h16z`, style: "fill:var(--ink)" }, svg);
  txt(svg, x(sq), 14, "Your comment", { "text-anchor": x(sq) > W - 80 ? "end" : x(sq) < 80 ? "start" : "middle", class: "t-strong" });
  const sideName = side === "S" ? "Support" : "Oppose";
  const kb = A.reduce((s, a) => s + BR.annotators[a].b, 0) / 3, kq = A.reduce((s, a) => s + D.curves[a].b, 0) / 3;
  const cards = A.map(a => [a, sig(BR.annotators[a].b * (sb - BR.annotators[a].tau))]);
  if (ann.fit) cards.push(["You", sig(((ann.fit.k * kb) / kq) * (sb - interp(ann.fit.tau, QM.qwen, QM.browser)))]);
  $("typed-personas").innerHTML = cards.map(([a, p]) => `<div class="persona" style="--c:${COL[a]}"><div class="who-n">${a === "You" ? "You (from section 1)" : nm(a)}</div>
    <div class="lab">${p >= 0.5 ? (sideClear ? sideName : "Takes a side") : "Neutral"}</div><div class="p">${Math.round(p * 100)}% chance of a stance${p >= 0.5 && !sideClear ? ", side unclear" : ""}</div></div>`).join("");
}

/* ---------------- 3. playground ---------------- */
const pg = { cut: 0 };
const modelLab = cut => C.s.map((s, i) => (s >= cut ? C.side[i] : "N"));
function drawRuler() {
  const fig = $("fig-ruler"), H = 210, [svg, W] = canvas(fig, H), L = 12, R = W - 12, T = 40, B = H - 50;
  const x = v => L + ((v - SMIN) / (SMAX - SMIN)) * (R - L), inv = px => SMIN + ((px - L) / (R - L)) * (SMAX - SMIN);
  const bins = Array.from({ length: 42 }, (_, i) => ({ lo: SMIN + i, n: 0 }));
  C.s.forEach(s => { bins[Math.min(41, Math.max(0, Math.floor(s - SMIN)))].n++; });
  const top = Math.max(...bins.map(b => b.n)), h = n => (Math.sqrt(n) / Math.sqrt(top)) * (B - T);
  pg.bars = bins.map(b => el("rect", { x: x(b.lo) + 1, width: x(b.lo + 1) - x(b.lo) - 2, y: B - h(b.n), height: h(b.n), rx: 2 }, svg));
  pg.binLo = bins.map(b => b.lo);
  A.forEach((a, k) => { const gx = x(TAU[a]); el("line", { x1: gx, x2: gx, y1: B + 4, y2: B + 14, "stroke-width": 3, style: `stroke:${COL[a]}` }, svg); txt(svg, gx, B + 27 + (k === 2 ? 12 : 0), nm(a), { "text-anchor": "middle", "font-weight": 600, style: `fill:${COL[a]}` }); });
  txt(svg, L, H - 4, "← reads as Neutral", {}); txt(svg, R, H - 4, "reads as taking a side →", { "text-anchor": "end" });
  const g = el("g", { class: "handle", tabindex: 0, role: "slider", "aria-label": "Threshold", "aria-valuemin": SMIN, "aria-valuemax": SMAX }, svg);
  el("rect", { x: -14, y: T - 30, width: 28, height: B - T + 36, fill: "transparent" }, g);
  el("line", { x1: 0, x2: 0, y1: T - 22, y2: B + 2, "stroke-width": 3, style: "stroke:var(--you)" }, g);
  el("rect", { x: -26, y: T - 34, width: 52, height: 22, rx: 11, style: "fill:var(--you)" }, g);
  pg.lab = txt(g, 0, T - 19, "", { "text-anchor": "middle", style: "fill:#fff", "font-weight": 600 });
  pg.handle = g; pg.x = x;
  let drag = false;
  const set = ev => { const b = svg.getBoundingClientRect(); setCut(Math.round(inv(((ev.clientX - b.left) / b.width) * W) * 2) / 2); };
  svg.addEventListener("pointerdown", ev => { drag = true; svg.setPointerCapture(ev.pointerId); set(ev); g.focus(); });
  svg.addEventListener("pointermove", ev => drag && set(ev));
  svg.addEventListener("pointerup", () => (drag = false));
  svg.style.touchAction = "pan-y";
  g.addEventListener("keydown", ev => {
    const d = { ArrowLeft: -0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowUp: 0.5, PageDown: -5, PageUp: 5 }[ev.key];
    if (d) { setCut(pg.cut + d); ev.preventDefault(); }
  });
  setCut(pg.cut, true);
}
function setCut(v, init) {
  pg.cut = Math.max(SMIN, Math.min(SMAX, v));
  pg.handle.setAttribute("transform", `translate(${pg.x(pg.cut)},0)`);
  pg.handle.setAttribute("aria-valuenow", pg.cut); pg.handle.setAttribute("aria-valuetext", `threshold ${fmt(pg.cut)}`);
  pg.lab.textContent = fmt(pg.cut);
  pg.bars.forEach((b, i) => { b.style.fill = pg.binLo[i] + 0.5 >= pg.cut ? "var(--model)" : "var(--neutral)"; });
  [...$("pg-snaps").children].forEach(b => b.classList.toggle("on", Math.abs(+b.dataset.v - pg.cut) < 0.26));
  const lab = modelLab(pg.cut), share = topicShare(lab), neu = lab.filter(l => l === "N").length / NC;
  $("pg-stats").innerHTML = `<div class="stat"><div class="k">Labelled Neutral</div><div class="v">${pct(neu)}</div><div class="sub">${A.map(a => `${nm(a)} ${pct(1 - STANCE[a])}`).join(", ")}</div></div>` +
    A.map(a => { let ok = 0; for (let i = 0; i < NC; i++) if (lab[i] === C[a][i]) ok++; return `<div class="stat"><div class="k"><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COL[a]}"></span>Matches ${nm(a)}</div><div class="v">${pct(ok / NC)}</div><div class="sub">κ = ${kappa(lab, [...C[a]]).toFixed(2)}</div></div>`; }).join("");
  topicChart($("fig-pg-topics"), A.map(a => ({ name: nm(a), color: COL[a], values: SHARE[a], shape: "tick" })), { bars: share, barColor: "var(--neutral)" });
  const mw = D.topics.findIndex(t => t.key === "minimum_wage"), sv = D.topics.findIndex(t => t.key === "surveillance");
  $("pg-caption").textContent = `Grey bars: each topic's stance share with the line at ${fmt(pg.cut)}. Coloured ticks: each annotator's own stance share. At this line ${pct(share[mw])} of the minimum wage comments and ${pct(share[sv])} of the mass surveillance comments take a side.`;
}
function buildSnaps() {
  const items = [...A.map(a => ({ v: TAU[a], label: `${nm(a)}'s threshold`, color: COL[a] })), { v: 0, label: "Model's own default" }];
  $("pg-snaps").innerHTML = "";
  for (const it of items) {
    const b = document.createElement("button"); b.type = "button"; b.dataset.v = it.v;
    b.innerHTML = (it.color ? `<span class="sw" style="--c:${it.color}"></span>` : "") + it.label;
    b.onclick = () => setCut(Math.round(it.v * 2) / 2); $("pg-snaps").appendChild(b);
  }
}

/* ---------------- 4. toy model ---------------- */
const cnt = D.topics.map((_, i) => C.t.filter(x => x === i).length);
const GRID = makeGrid(D.topics.map(t => D.ordinal.topic_mean[t.key]), cnt.map(c => c / NC));
const OA = D.ordinal.annotators;
const toPar = o => ({ width: +(o.c2 - o.c1).toFixed(2), centre: +((o.c1 + o.c2) / 2).toFixed(2), noise: +o.noise.toFixed(2), pi: +o.pi.toFixed(3) });
const PRESETS = [["A1", "A2"], ["A1", "A3"], ["A2", "A3"]];
const toy = { names: ["A1", "A2"], x: toPar(OA.A1), y: toPar(OA.A2) };
const SL = [["width", "Neutral band width", 0.2, 4, 0.05, v => v.toFixed(2)], ["centre", "Band centre", -1.5, 1.5, 0.05, v => fmt(v)],
  ["noise", "Noise", 0.02, 1.2, 0.01, v => v.toFixed(2)], ["pi", "Reads the side reversed", 0, 0.3, 0.005, v => pct(v)]];
function buildToyControls() {
  for (const [key, side] of [["x", 0], ["y", 1]]) {
    const box = $(key === "x" ? "toy-x" : "toy-y"), name = toy.names[side], c = COL[name];
    box.style.setProperty("--c", c);
    box.innerHTML = `<h4><span class="sw"></span>${nm(name)}</h4>` + SL.map(([k, lab, mn, mx, st]) => `<label class="slider"><span>${lab}</span><output id="o-${key}-${k}"></output>
      <input type="range" min="${mn}" max="${mx}" step="${st}" value="${toy[key][k]}" data-k="${k}" aria-label="${nm(name)} ${lab}"></label>`).join("");
    box.querySelectorAll("input").forEach(inp => (inp.oninput = () => { toy[key][inp.dataset.k] = +inp.value; scheduleToy(); }));
  }
  renderToy();
}
let toyFrame = 0;   // one redraw per animation frame while a slider is dragged
const scheduleToy = () => { if (!toyFrame) toyFrame = requestAnimationFrame(() => { toyFrame = 0; renderToy(); }); };
const fromPar = p => ({ c1: p.centre - p.width / 2, c2: p.centre + p.width / 2, noise: p.noise, pi: p.pi });
function renderToy() {
  for (const key of ["x", "y"]) for (const [k, , , , , f] of SL) $(`o-${key}-${k}`).textContent = f(toy[key][k]);
  const px = fromPar(toy.x), py = fromPar(toy.y), M = table(GRID, px, py), sp = shapley(GRID, px, py);
  // bands on the hidden scale
  { const fig = $("fig-toy-bands"), H = 150, [svg, W] = canvas(fig, H), L = 60, R = W - 10, x = v => L + ((v + 3) / 6) * (R - L);
    const dens = GRID.th.map((t, i) => [t, GRID.w[i]]).filter(([t], i) => t >= -3 && t <= 3 && i % 10 === 0), top = Math.max(...dens.map(d => d[1]));
    el("path", { d: "M" + dens.map(([t, w]) => `${x(t).toFixed(1)},${(44 - (w / top) * 34).toFixed(1)}`).join("L"), fill: "none", stroke: "var(--muted)", "stroke-width": 1.5 }, svg);
    txt(svg, L, 56, "← opposes", {}); txt(svg, R, 56, "supports →", { "text-anchor": "end" }); txt(svg, (L + R) / 2, 56, "hidden position of a comment", { "text-anchor": "middle" });
    [[px, toy.names[0], 80], [py, toy.names[1], 118]].forEach(([p, n, y]) => {
      txt(svg, 0, y + 5, nm(n), { "font-weight": 600, style: `fill:${COL[n]}` });
      el("line", { x1: L, x2: R, y1: y, y2: y, stroke: "var(--rule)", "stroke-width": 8, "stroke-linecap": "round" }, svg);
      const a = Math.max(-3, p.c1), b = Math.min(3, p.c2);
      el("rect", { x: x(a), y: y - 9, width: Math.max(0, x(b) - x(a)), height: 18, rx: 9, style: `fill:${COL[n]}`, opacity: 0.85 }, svg);
      txt(svg, (x(a) + x(b)) / 2, y + 4, "Neutral", { "text-anchor": "middle", style: "fill:#fff", "font-weight": 600 });
    }); }
  // table
  { const fig = $("fig-toy-table"), cs0 = Math.min(64, ((fig.clientWidth || 300) - 70) / 3), [svg, W] = canvas(fig, 40 + 3 * cs0 + 34, 240), cs = Math.min(64, (W - 70) / 3), L = 60, T = 40, labs = ["Oppose", "Neutral", "Support"];
    txt(svg, L + 1.5 * cs, 12, `${nm(toy.names[1])} says`, { "text-anchor": "middle", "font-weight": 600, style: `fill:${COL[toy.names[1]]}` });
    labs.forEach((l, j) => txt(svg, L + (j + 0.5) * cs, T - 8, l, { "text-anchor": "middle" }));
    labs.forEach((l, i) => txt(svg, L - 6, T + (i + 0.5) * cs + 4, l, { "text-anchor": "end" }));
    const mx = Math.max(...M.flat());
    M.forEach((row, i) => row.forEach((v, j) => {
      const diag = i === j;
      el("rect", { x: L + j * cs + 1, y: T + i * cs + 1, width: cs - 2, height: cs - 2, rx: 6, style: diag ? `fill:var(--a3);opacity:${0.15 + 0.85 * v / mx}` : `fill:var(--you);opacity:${0.1 + 0.9 * Math.sqrt(v / mx)}` }, svg);
      txt(svg, L + (j + 0.5) * cs, T + (i + 0.5) * cs + 5, (v * 100).toFixed(0), { "text-anchor": "middle", class: "t-strong", "font-size": 15 });
    }));
    txt(svg, 0, T + 3 * cs + 22, `${nm(toy.names[0])} says (rows). Green: agree; pink: disagree.`, {}); }
  // split
  { const fig = $("fig-toy-split"), [svg, W] = canvas(fig, 230, 260), L = 0, R = W, y = 70, tot = sp.total;
    const agree = 1 - tot, nvs = M[0][1] + M[1][0] + M[1][2] + M[2][1], opp = M[0][2] + M[2][0];
    txt(svg, 0, 18, `They disagree on ${pct(tot)} of comments`, { class: "t-strong", "font-size": 16 });
    txt(svg, 0, 38, `${pct(nvs / tot)} of that is Neutral versus a stance; ${pct(opp / tot)} is opposite sides.`, {});
    const parts = [["threshold", "Threshold", "var(--ink)"], ["reversal", "Reversed side", "var(--a2)"], ["unstructured", "Unstructured", "var(--neutral)"]];
    let x0 = L; const sum = Math.max(1e-9, parts.reduce((s, [k]) => s + Math.max(0, sp[k]), 0));
    parts.forEach(([k, lab, col], i) => {
      const w = (Math.max(0, sp[k]) / sum) * (R - L);
      el("rect", { x: x0, y, width: Math.max(0, w - 2), height: 34, rx: 4, style: `fill:${col}` }, svg);
      const share = sp[k] / tot;
      const row = el("g", {}, svg);
      el("rect", { x: 0, y: y + 52 + i * 24, width: 12, height: 12, rx: 3, style: `fill:${col}` }, row);
      txt(row, 20, y + 62 + i * 24, `${lab}: ${pct(share)}`, { class: "t-ink" });
      x0 += w;
    });
    txt(svg, 0, y + 140, `Agree on ${pct(agree)}.`, {}); }
}
function buildPresets() {
  const items = PRESETS.map(([a, b]) => ({ value: `${a}-${b}`, label: `${nm(a)} and ${nm(b)}` })).concat([{ value: "same", label: "Same band, noise only" }]);
  radio($("toy-presets"), items, "A1-A2", v => {
    if (v === "same") { toy.names = ["A1", "A3"]; toy.x = toPar(OA.A1); toy.y = { ...toPar(OA.A1) }; }
    else { const [a, b] = v.split("-"); toy.names = [a, b]; toy.x = toPar(OA[a]); toy.y = toPar(OA[b]); }
    buildToyControls();
  });
}

/* ---------------- boot ---------------- */
drawHero(); buildSnaps(); drawRuler(); buildPresets(); buildToyControls(); renderNChoice();
setTimeout(estimatePrecision, 50);
if (!reduced) {   // one orchestrated moment: comments start Neutral, then settle into A1's lanes, then the personas take turns
  hero.nodes.forEach((n, i) => { n.style.transition = "none"; n.style.transform = `translate(${hero.x(HX[i]).toFixed(1)}px, ${heroY(i, "N").toFixed(1)}px)`; n.style.fill = "var(--field-dim)"; });
  hero.spot.style.transition = "none"; hero.spot.style.transform = `translate(${hero.x(HX[SPOT]).toFixed(1)}px, ${heroY(SPOT, "N").toFixed(1)}px)`;
  requestAnimationFrame(() => requestAnimationFrame(() => setHero("A1")));
  auto.t = setTimeout(autoNext, DWELL);
}
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => {
  drawHero(); drawRuler(); renderToy(); if (ann.fit && !$("ann-result").classList.contains("hidden")) { drawCurves(); drawYouTopics(); } if (typed.last) renderTyped(typed.last);
}, 150); });
