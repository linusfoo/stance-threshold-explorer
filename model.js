// Pure computations shared by the page (and testable in Node): logistic curves, the visitor's threshold fit,
// and the latent ordinal model with its Shapley split of disagreement (paper section 4).
export const sig = x => 1 / (1 + Math.exp(-x));

// Visitor's curve P(stance | s) = sig(k (s - tau)), grid posterior with weak priors so 10 labels still give a sensible answer.
// Prior: tau ~ N(8, 16^2) (between the annotators, wide enough that the labels decide); log k ~ N(log 0.09, 0.6^2) (the annotators' slopes are 0.085 to 0.098).
const TAU = Array.from({ length: 201 }, (_, i) => -25 + i * 0.25);
const K = Array.from({ length: 25 }, (_, i) => Math.exp(Math.log(0.02) + i * (Math.log(0.5) - Math.log(0.02)) / 24));
export function fitCurve(s, y, coarse = false) {
  const taus = coarse ? TAU.filter((_, i) => i % 2 === 0) : TAU, ks = coarse ? K.filter((_, i) => i % 2 === 0) : K;
  const lp = [], lk0 = Math.log(0.09);
  let best = -Infinity;
  for (const t of taus) {
    const row = [];
    for (const k of ks) {
      let v = -((t - 8) ** 2) / (2 * 256) - ((Math.log(k) - lk0) ** 2) / (2 * 0.36);
      for (let i = 0; i < s.length; i++) { const z = k * (s[i] - t); v += y[i] ? -Math.log1p(Math.exp(-z)) : -Math.log1p(Math.exp(z)); }
      row.push(v); if (v > best) best = v;
    }
    lp.push(row);
  }
  const mt = taus.map((_, i) => lp[i].reduce((a, v) => a + Math.exp(v - best), 0));
  const tot = mt.reduce((a, b) => a + b, 0), cdf = [];
  let c = 0; for (const m of mt) { c += m / tot; cdf.push(c); }
  const q = p => taus[cdf.findIndex(v => v >= p)];
  let kb = 0, kw = 0;
  lp.forEach(row => row.forEach((v, j) => { const e = Math.exp(v - best); kb += e * Math.log(ks[j]); kw += e; }));
  return { tau: q(0.5), lo: q(0.1), hi: q(0.9), k: Math.exp(kb / kw) };
}

// Latent ordinal model, M2 of rq1_ordinal.py: theta ~ mixture over topics of N(mu_t, 1); annotator a labels
// O if theta < c1, S if theta > c2 (logistic noise 1/alpha), and reads theta reversed with probability pi.
export function makeGrid(topicMeans, weights, step = 0.0025) {
  const th = [], w = [];
  for (let x = -7; x <= 7.0001; x += step) {
    th.push(x); w.push(topicMeans.reduce((a, m, i) => a + weights[i] * Math.exp(-((x - m) ** 2) / 2), 0));
  }
  const t = w.reduce((a, b) => a + b, 0); return { th, w: w.map(v => v / t) };
}
function probs(g, p) {   // p = {c1, c2, noise, pi} -> [[pO, pN, pS] per grid point]
  const al = 1 / p.noise, f = x => { const pO = sig(al * (p.c1 - x)), pS = sig(-al * (p.c2 - x)); return [pO, Math.max(1 - pO - pS, 1e-12), pS]; };
  return g.th.map(x => { const a = f(x), b = f(-x); return a.map((v, i) => (1 - p.pi) * v + p.pi * b[i]); });
}
export function table(g, px, py) {   // expected joint label distribution, rows x = O,N,S, cols y
  const PX = probs(g, px), PY = probs(g, py), M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  g.w.forEach((w, q) => { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += w * PX[q][i] * PY[q][j]; });
  return M;
}
const disagree = M => 1 - M[0][0] - M[1][1] - M[2][2];
export function shapley(g, px, py) {   // remove: threshold -> both bands at the pair mean; reversal -> pi 0; unstructured -> noise 0.001 (paper script: alpha 100, which leaves ~1% unexplained)
  const D = rem => {
    let x = { ...px }, y = { ...py };
    if (rem.has("threshold")) { const c1 = (x.c1 + y.c1) / 2, c2 = (x.c2 + y.c2) / 2; x = { ...x, c1, c2 }; y = { ...y, c1, c2 }; }
    if (rem.has("reversal")) { x.pi = 0; y.pi = 0; }
    if (rem.has("unstructured")) { x.noise = 0.001; y.noise = 0.001; }
    return disagree(table(g, x, y));
  };
  const comps = ["threshold", "reversal", "unstructured"], phi = { threshold: 0, reversal: 0, unstructured: 0 };
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]], memo = new Map();
  const Dm = rem => { const k = [...rem].sort().join(); if (!memo.has(k)) memo.set(k, D(rem)); return memo.get(k); };
  for (const p of perms) {
    let rem = new Set();
    for (const i of p) { const before = Dm(rem); rem = new Set([...rem, comps[i]]); phi[comps[i]] += (before - Dm(rem)) / 6; }
  }
  return { total: Dm(new Set()), ...phi };
}
export function kappa(a, b) {   // a, b: arrays of "O" | "N" | "S"
  const n = a.length; let po = 0; const ca = { O: 0, N: 0, S: 0 }, cb = { O: 0, N: 0, S: 0 };
  for (let i = 0; i < n; i++) { if (a[i] === b[i]) po++; ca[a[i]]++; cb[b[i]]++; }
  po /= n; const pe = ["O", "N", "S"].reduce((s, k) => s + (ca[k] / n) * (cb[k] / n), 0);
  return (po - pe) / (1 - pe);
}
export function interp(x, xs, ys) {   // piecewise linear, xs non-decreasing, clamped
  if (x <= xs[0]) return ys[0]; if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 1; while (xs[i] < x) i++;
  const d = xs[i] - xs[i - 1]; return d === 0 ? ys[i] : ys[i - 1] + ((x - xs[i - 1]) / d) * (ys[i] - ys[i - 1]);
}
