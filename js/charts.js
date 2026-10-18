// Graphiques SVG simples, sans bibliothèque. Les couleurs viennent des variables CSS.

import { toDisplay, RANGES } from './calc.js';

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function bgColorClass(v, low, high) {
  if (v < RANGES.veryLow || v < low) return 'pt-low';
  if (v > high) return 'pt-high';
  return 'pt-ok';
}

/**
 * Courbe des glycémies sur une période, avec la plage cible en fond.
 * readings: [{ts, value(mg/dL)}]
 */
export function glucoseChart(readings, { from, to, low, high, unit, height = 220, meals = [] }) {
  const W = 640;
  const H = height;
  const pad = { l: 40, r: 10, t: 12, b: 26 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  const maxV = Math.max(300, ...readings.map((r) => r.value));
  const minV = 40;
  const x = (ts) => pad.l + ((ts - from) / (to - from)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - minV) / (maxV - minV)) * (H - pad.t - pad.b);

  el('rect', { x: pad.l, y: y(high), width: W - pad.l - pad.r, height: y(low) - y(high), class: 'band' }, svg);

  for (const v of [low, high, 250].filter((v) => v < maxV)) {
    el('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }, svg);
    const t = el('text', { x: pad.l - 6, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' }, svg);
    t.textContent = String(toDisplay(v, unit)).replace('.', ',');
  }

  const span = to - from;
  const day = 864e5;
  const ticks = [];
  if (span <= day * 1.01) {
    for (let h = 0; h <= 24; h += 6) ticks.push({ ts: from + h * 36e5, label: `${h % 24}h` });
  } else {
    const step = span > day * 8 ? 2 : 1;
    for (let ts = from, i = 0; ts <= to; ts += day, i++) {
      if (i % step === 0) {
        ticks.push({ ts, label: new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' }) });
      }
    }
  }
  for (const tk of ticks) {
    const tx = x(tk.ts);
    el('line', { x1: tx, x2: tx, y1: pad.t, y2: H - pad.b, class: 'grid light' }, svg);
    const t = el('text', { x: tx, y: H - 8, class: 'axis', 'text-anchor': 'middle' }, svg);
    t.textContent = tk.label;
  }

  for (const m of meals) {
    const mx = x(m.ts);
    el('line', { x1: mx, x2: mx, y1: pad.t, y2: H - pad.b, class: 'meal-line' }, svg);
  }

  const pts = [...readings].sort((a, b) => a.ts - b.ts);
  if (pts.length > 1) {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    el('path', { d, class: 'line' }, svg);
  }
  for (const p of pts) {
    const c = el('circle', { cx: x(p.ts), cy: y(p.value), r: 4.5, class: bgColorClass(p.value, low, high) }, svg);
    const title = el('title', {}, c);
    title.textContent = `${new Date(p.ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} : ${String(toDisplay(p.value, unit)).replace('.', ',')}`;
  }
  if (!pts.length) {
    const t = el('text', { x: W / 2, y: H / 2, class: 'empty', 'text-anchor': 'middle' }, svg);
    t.textContent = 'Aucune glycémie sur cette période';
  }
  return svg;
}

/** Profil par heure : zone 25e-75e percentile et médiane. */
export function profileChart(profile, { low, high, unit }) {
  const W = 640;
  const H = 220;
  const pad = { l: 40, r: 10, t: 12, b: 26 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  const vals = profile.filter((p) => p.n).flatMap((p) => [p.p75]);
  const maxV = Math.max(300, ...vals);
  const minV = 40;
  const x = (h) => pad.l + (h / 23) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - minV) / (maxV - minV)) * (H - pad.t - pad.b);

  el('rect', { x: pad.l, y: y(high), width: W - pad.l - pad.r, height: y(low) - y(high), class: 'band' }, svg);
  for (const v of [low, high]) {
    el('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }, svg);
    const t = el('text', { x: pad.l - 6, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' }, svg);
    t.textContent = String(toDisplay(v, unit)).replace('.', ',');
  }
  for (let h = 0; h < 24; h += 3) {
    const t = el('text', { x: x(h), y: H - 8, class: 'axis', 'text-anchor': 'middle' }, svg);
    t.textContent = `${h}h`;
  }

  const withData = profile.filter((p) => p.n);
  if (withData.length > 1) {
    const top = withData.map((p) => `${x(p.hour)},${y(p.p75)}`);
    const bottom = [...withData].reverse().map((p) => `${x(p.hour)},${y(p.p25)}`);
    el('polygon', { points: [...top, ...bottom].join(' '), class: 'iqr' }, svg);
    const d = withData.map((p, i) => `${i ? 'L' : 'M'}${x(p.hour)},${y(p.median)}`).join(' ');
    el('path', { d, class: 'line' }, svg);
  }
  for (const p of withData) {
    el('circle', { cx: x(p.hour), cy: y(p.median), r: 3.5, class: bgColorClass(p.median, low, high) }, svg);
  }
  if (withData.length < 2) {
    const t = el('text', { x: W / 2, y: H / 2, class: 'empty', 'text-anchor': 'middle' }, svg);
    t.textContent = 'Pas encore assez de mesures';
  }
  return svg;
}

/** Barres simples (ex. glucides par jour). */
export function barChart(items, { unitLabel = '', height = 180 }) {
  const W = 640;
  const H = height;
  const pad = { l: 10, r: 10, t: 22, b: 26 };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  const max = Math.max(1, ...items.map((i) => i.value));
  const bw = (W - pad.l - pad.r) / Math.max(1, items.length);
  items.forEach((it, i) => {
    const h = (it.value / max) * (H - pad.t - pad.b);
    const bx = pad.l + i * bw + bw * 0.18;
    el('rect', { x: bx, y: H - pad.b - h, width: bw * 0.64, height: Math.max(0, h), rx: 4, class: 'bar' }, svg);
    if (it.value) {
      const v = el('text', { x: bx + bw * 0.32, y: H - pad.b - h - 6, class: 'axis', 'text-anchor': 'middle' }, svg);
      v.textContent = `${Math.round(it.value)}${unitLabel}`;
    }
    const t = el('text', { x: bx + bw * 0.32, y: H - 8, class: 'axis', 'text-anchor': 'middle' }, svg);
    t.textContent = it.label;
  });
  return svg;
}

/** Barre empilée du temps dans la cible. */
export function rangeBar(stats) {
  const wrap = document.createElement('div');
  wrap.className = 'rangebar';
  const parts = [
    ['veryHigh', 'tr-vhigh', 'Très haut'],
    ['high', 'tr-high', 'Haut'],
    ['inRange', 'tr-ok', 'Dans la cible'],
    ['low', 'tr-low', 'Bas'],
    ['veryLow', 'tr-vlow', 'Très bas'],
  ];
  for (const [key, cls, label] of parts) {
    if (!stats[key]) continue;
    const seg = document.createElement('div');
    seg.className = 'seg ' + cls;
    seg.style.width = stats[key] + '%';
    seg.title = `${label} : ${stats[key]} %`;
    wrap.appendChild(seg);
  }
  return wrap;
}
