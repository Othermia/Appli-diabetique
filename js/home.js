// Écran d'accueil : dernière glycémie, insuline active, résumé du jour, actions rapides.

import { h, add, state, clear, fmtNum, fmtTime, fmtDate } from './ui.js';
import { getEntries } from './db.js';
import { formatBG, unitLabel, glucoseStats, startOfDay, sumBy } from './calc.js';
import { entryRow, openEntryEditor, currentIOB, bgClass } from './entries.js';
import { openHypoHelper } from './hypo.js';
import { glucoseChart } from './charts.js';
import { pendingOnce } from './reminders.js';

export async function renderHome(root) {
  const s = state.settings;
  const now = Date.now();
  const dayStart = startOfDay(now);
  const [today, week, iob] = await Promise.all([
    getEntries({ from: dayStart, to: now + 864e5 }),
    getEntries({ from: now - 7 * 864e5, type: 'glycemie' }),
    currentIOB(now),
  ]);

  const last = week[0];
  const prev = week[1];
  const todayBG = today.filter((e) => e.type === 'glycemie');
  const carbs = sumBy(today.filter((e) => e.type === 'repas'), (e) => e.carbs);
  const rapid = sumBy(today.filter((e) => e.type === 'insuline' && e.kind === 'rapide'), (e) => e.units);
  const basal = sumBy(today.filter((e) => e.type === 'insuline' && e.kind === 'lente'), (e) => e.units);
  const stats7 = glucoseStats(week.map((e) => e.value));

  let trend = '';
  if (last && prev && last.ts - prev.ts < 3 * 36e5) {
    const diff = last.value - prev.value;
    trend = diff > 30 ? '↑' : diff > 10 ? '↗' : diff < -30 ? '↓' : diff < -10 ? '↘' : '→';
  }

  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  clear(root);
  add(root, 
    h('header', { class: 'page-head' },
      h('div', null, h('h1', null, `${hello}${s.name ? ' ' + s.name : ''} 👋`), h('p', { class: 'sub' }, fmtDate(now)))
    ),

    h('section', { class: 'card hero ' + (last ? 'is-' + bgClass(last.value) : '') },
      h('div', { class: 'hero-main' },
        h('span', { class: 'hero-label' }, 'Dernière glycémie'),
        last
          ? h('div', { class: 'hero-value' }, formatBG(last.value, s.unit), h('small', null, ' ' + unitLabel(s.unit)), trend ? h('span', { class: 'trend' }, trend) : null)
          : h('div', { class: 'hero-value muted' }, '—'),
        last ? h('span', { class: 'hero-time' }, agoText(last.ts)) : h('span', { class: 'hero-time' }, 'Aucune mesure récente')
      ),
      h('div', { class: 'hero-side' },
        h('span', { class: 'hero-label' }, 'Insuline active'),
        h('div', { class: 'hero-iob' }, fmtNum(iob, 1), h('small', null, ' U'))
      )
    ),

    last && last.value < s.hypo
      ? h('button', { class: 'btn danger block big', onclick: () => openHypoHelper(last.value) }, '🍬 Glycémie basse : que faire ?')
      : null,

    h('div', { class: 'quick' },
      quick('🩸', 'Glycémie', () => openEntryEditor(null, { type: 'glycemie' })),
      quick('📷', 'Repas', () => (location.hash = '#repas'), 'accent'),
      quick('💉', 'Insuline', () => openEntryEditor(null, { type: 'insuline' })),
      quick('🚶', 'Activité', () => openEntryEditor(null, { type: 'activite' })),
      quick('🧪', 'Cétones', () => openEntryEditor(null, { type: 'cetones' })),
      quick('📝', 'Note', () => openEntryEditor(null, { type: 'note' }))
    ),

    h('button', { class: 'btn sos block', onclick: () => openHypoHelper(null) }, '🍬 Je fais une hypo'),

    h('section', { class: 'card' },
      h('h2', null, "Aujourd'hui"),
      h('div', { class: 'stats-row' },
        stat(`${Math.round(carbs)} g`, 'glucides'),
        stat(`${fmtNum(rapid, 1)} U`, 'rapide'),
        stat(`${fmtNum(basal, 1)} U`, 'lente'),
        stat(String(todayBG.length), 'mesures')
      ),
      glucoseChart(todayBG, { from: dayStart, to: dayStart + 864e5, low: s.low, high: s.high, unit: s.unit, height: 180, meals: today.filter((e) => e.type === 'repas') })
    ),

    stats7
      ? h('section', { class: 'card' },
          h('h2', null, '7 derniers jours'),
          h('div', { class: 'stats-row' },
            stat(`${stats7.inRange} %`, 'dans la cible'),
            stat(formatBG(stats7.mean, s.unit), 'moyenne'),
            stat(`${stats7.low + stats7.veryLow} %`, 'en hypo'),
            stat(`${fmtNum(stats7.gmi, 1)} %`, 'HbA1c estimée')
          ),
          h('button', { class: 'btn ghost block', onclick: () => (location.hash = '#stats') }, 'Voir les statistiques')
        )
      : null,

    renderPending(),

    h('section', { class: 'card' },
      h('h2', null, "Journal du jour"),
      today.length ? h('div', { class: 'entries' }, today.map((e) => entryRow(e))) : h('p', { class: 'empty-text' }, 'Rien de noté aujourd\'hui. Commencez par une glycémie ou un repas.'),
      h('button', { class: 'btn ghost block', onclick: () => (location.hash = '#journal') }, 'Tout le journal')
    )
  );
}

function renderPending() {
  const p = pendingOnce();
  if (!p.length) return null;
  return h('section', { class: 'card soft' },
    h('h2', null, '⏰ Prochains rappels'),
    h('ul', { class: 'plain' }, p.slice(0, 3).map((r) => h('li', null, `${fmtTime(r.at)} — ${r.body}`)))
  );
}

function quick(icon, label, onclick, extra = '') {
  return h('button', { class: 'quick-btn ' + extra, onclick }, h('span', { class: 'quick-icon', 'aria-hidden': 'true' }, icon), h('span', null, label));
}

function stat(value, label) {
  return h('div', { class: 'stat' }, h('strong', null, value), h('span', null, label));
}

function agoText(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `il y a ${hrs} h ${String(min % 60).padStart(2, '0')}`;
  return `le ${fmtDate(ts, { day: 'numeric', month: 'short' })} à ${fmtTime(ts)}`;
}
