// Journal : toutes les entrées, regroupées par jour, avec filtre par type.

import { h, add, state, clear, chips, modal, fmtDate, fmtNum } from './ui.js';
import { getEntries } from './db.js';
import { startOfDay, sumBy, glucoseStats, formatBG } from './calc.js';
import { entryRow, openEntryEditor, TYPES } from './entries.js';

let filter = null;
let days = 7;

export async function renderJournal(root) {
  const s = state.settings;
  const from = startOfDay(Date.now()) - (days - 1) * 864e5;
  const entries = await getEntries({ from });
  const shown = filter ? entries.filter((e) => e.type === filter) : entries;

  const groups = new Map();
  for (const e of shown) {
    const d = startOfDay(e.ts);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(e);
  }

  clear(root);
  add(root, 
    h('header', { class: 'page-head' }, h('h1', null, 'Journal'), h('button', { class: 'btn small primary', onclick: openAddMenu }, '+ Ajouter')),
    chips(
      [{ value: null, label: 'Tout' }, ...Object.entries(TYPES).map(([k, t]) => ({ value: k, label: `${t.icon} ${t.label}` }))],
      filter,
      (v) => { filter = v; renderJournal(root); }
    )
  );

  if (!groups.size) {
    add(root, h('p', { class: 'empty-text' }, 'Aucune entrée sur cette période.'));
  }

  for (const [day, list] of groups) {
    const all = entries.filter((e) => startOfDay(e.ts) === day);
    const bg = glucoseStats(all.filter((e) => e.type === 'glycemie').map((e) => e.value));
    const carbs = sumBy(all.filter((e) => e.type === 'repas'), (e) => e.carbs);
    const ins = sumBy(all.filter((e) => e.type === 'insuline'), (e) => e.units);
    add(root, 
      h('section', { class: 'card' },
        h('div', { class: 'day-head' },
          h('h2', null, capitalize(fmtDate(day))),
          h('span', { class: 'day-sum' }, [`${Math.round(carbs)} g gluc.`, `${fmtNum(ins, 1)} U`, bg ? `moy. ${formatBG(bg.mean, s.unit)}` : null].filter(Boolean).join(' · '))
        ),
        h('div', { class: 'entries' }, list.map((e) => entryRow(e)))
      )
    );
  }

  add(root, h('button', { class: 'btn ghost block', onclick: () => { days += 14; renderJournal(root); } }, 'Afficher plus ancien'));
}

function openAddMenu() {
  const close = modal(
    'Ajouter',
    h('div', { class: 'quick' },
      Object.entries(TYPES).map(([k, t]) =>
        h('button', { class: 'quick-btn', onclick: () => { close(); k === 'repas' ? (location.hash = '#repas') : openEntryEditor(null, { type: k }); } },
          h('span', { class: 'quick-icon' }, t.icon), h('span', null, t.label))
      )
    )
  );
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
