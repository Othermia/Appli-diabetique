// Statistiques : temps dans la cible, moyenne, variabilité, profil par heure, glucides et insuline.

import { h, add, state, clear, chips, fmtNum } from './ui.js';
import { getEntries } from './db.js';
import { glucoseStats, hourlyProfile, startOfDay, sumBy, formatBG, unitLabel } from './calc.js';
import { glucoseChart, profileChart, barChart, rangeBar } from './charts.js';

let period = 14;

export async function computePeriod(daysCount) {
  const to = Date.now();
  const from = startOfDay(to) - (daysCount - 1) * 864e5;
  const entries = await getEntries({ from, to });
  const bg = entries.filter((e) => e.type === 'glycemie');
  const meals = entries.filter((e) => e.type === 'repas');
  const insulin = entries.filter((e) => e.type === 'insuline');
  const days = [];
  for (let d = startOfDay(from); d <= to; d += 864e5) {
    const inDay = (e) => e.ts >= d && e.ts < d + 864e5;
    days.push({
      day: d,
      carbs: sumBy(meals.filter(inDay), (e) => e.carbs),
      rapid: sumBy(insulin.filter((e) => inDay(e) && e.kind === 'rapide'), (e) => e.units),
      basal: sumBy(insulin.filter((e) => inDay(e) && e.kind === 'lente'), (e) => e.units),
      readings: bg.filter(inDay).length,
    });
  }
  const hypos = countEpisodes(bg, state.settings.hypo);
  return { from, to, entries, bg, meals, insulin, days, hypos, stats: glucoseStats(bg.map((e) => e.value)), profile: hourlyProfile(bg) };
}

/** Nombre d'épisodes d'hypoglycémie (mesures basses espacées de plus de 2 h). */
function countEpisodes(bg, threshold) {
  const lows = bg.filter((e) => e.value < threshold).sort((a, b) => a.ts - b.ts);
  let n = 0;
  let lastTs = -Infinity;
  for (const e of lows) {
    if (e.ts - lastTs > 2 * 36e5) n++;
    lastTs = e.ts;
  }
  return n;
}

export async function renderStats(root) {
  const s = state.settings;
  const data = await computePeriod(period);
  const st = data.stats;
  const daysWithData = data.days.filter((d) => d.carbs || d.rapid || d.basal);
  const avg = (fn) => (daysWithData.length ? sumBy(daysWithData, fn) / daysWithData.length : 0);

  clear(root);
  add(root, 
    h('header', { class: 'page-head' }, h('h1', null, 'Statistiques'), h('button', { class: 'btn small ghost', onclick: () => import('./report.js').then((m) => m.openReport(period)) }, '📄 Rapport')),
    chips(
      [7, 14, 30, 90].map((d) => ({ value: d, label: `${d} jours` })),
      period,
      (v) => { period = v; renderStats(root); }
    )
  );

  if (!st) {
    add(root, h('section', { class: 'card' }, h('p', { class: 'empty-text' }, 'Pas encore de glycémie sur cette période. Les statistiques apparaîtront dès les premières mesures.')));
    return;
  }

  add(root, 
    h('section', { class: 'card' },
      h('h2', null, 'Temps dans la cible'),
      h('p', { class: 'hint' }, `Cible ${formatBG(s.low, s.unit)}–${formatBG(s.high, s.unit)} ${unitLabel(s.unit)} · objectif habituel : plus de 70 % dans la cible, moins de 4 % en dessous.`),
      rangeBar(st),
      h('div', { class: 'legend' },
        legend('tr-vhigh', 'Très haut', st.veryHigh),
        legend('tr-high', 'Haut', st.high),
        legend('tr-ok', 'Cible', st.inRange),
        legend('tr-low', 'Bas', st.low),
        legend('tr-vlow', 'Très bas', st.veryLow)
      ),
      h('p', { class: 'hint' }, `Calculé sur ${st.n} mesures au doigt ou capteur saisies.`)
    ),
    h('section', { class: 'card' },
      h('div', { class: 'stats-grid' },
        stat(formatBG(st.mean, s.unit), `moyenne (${unitLabel(s.unit)})`),
        stat(`${fmtNum(st.gmi, 1)} %`, 'HbA1c estimée (GMI)'),
        stat(`${fmtNum(st.cv, 0)} %`, 'variabilité (CV, objectif ≤ 36 %)'),
        stat(String(data.hypos), 'épisodes d\'hypo'),
        stat(`${Math.round(avg((d) => d.carbs))} g`, 'glucides / jour'),
        stat(`${fmtNum(avg((d) => d.rapid + d.basal), 1)} U`, 'insuline / jour')
      )
    ),
    h('section', { class: 'card' },
      h('h2', null, 'Courbe des glycémies'),
      glucoseChart(data.bg, { from: data.from, to: data.to, low: s.low, high: s.high, unit: s.unit })
    ),
    h('section', { class: 'card' },
      h('h2', null, 'Journée type'),
      h('p', { class: 'hint' }, 'Médiane par heure et zone où se trouvent la moitié des mesures. Utile pour repérer les moments de la journée à ajuster avec votre médecin.'),
      profileChart(data.profile, { low: s.low, high: s.high, unit: s.unit })
    ),
    h('section', { class: 'card' },
      h('h2', null, 'Glucides par jour'),
      barChart(data.days.slice(-14).map((d) => ({ label: new Date(d.day).toLocaleDateString('fr-FR', { day: 'numeric' }), value: d.carbs })), { unitLabel: '' })
    ),
    h('section', { class: 'card' },
      h('h2', null, 'Insuline par jour'),
      barChart(data.days.slice(-14).map((d) => ({ label: new Date(d.day).toLocaleDateString('fr-FR', { day: 'numeric' }), value: d.rapid + d.basal })), { unitLabel: '' })
    )
  );
}

function stat(value, label) {
  return h('div', { class: 'stat' }, h('strong', null, value), h('span', null, label));
}

function legend(cls, label, value) {
  return h('span', { class: 'legend-item' }, h('i', { class: cls }), `${label} ${fmtNum(value, 1)} %`);
}
