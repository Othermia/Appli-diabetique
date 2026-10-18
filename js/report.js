// Rapport à imprimer ou enregistrer en PDF pour le rendez-vous chez le diabétologue.

import { h, state, modal, fmtNum, fmtTime, fmtDate, download } from './ui.js';
import { computePeriod } from './stats.js';
import { formatBG, unitLabel, SLOTS, startOfDay } from './calc.js';
import { glucoseChart, profileChart, rangeBar } from './charts.js';
import { getAllEntries } from './db.js';

export async function openReport(period = 14) {
  const s = state.settings;
  const data = await computePeriod(period);
  const st = data.stats;

  const report = h('div', { class: 'report' },
    h('h1', null, 'Carnet de suivi du diabète'),
    h('p', null,
      s.name ? h('strong', null, s.name + ' · ') : null,
      `Du ${fmtDate(data.from, { day: 'numeric', month: 'long', year: 'numeric' })} au ${fmtDate(data.to, { day: 'numeric', month: 'long', year: 'numeric' })} (${period} jours)`
    ),
    h('h2', null, 'Réglages utilisés'),
    h('p', null,
      `Cible ${formatBG(s.low, s.unit)}–${formatBG(s.high, s.unit)} ${unitLabel(s.unit)} · objectif de correction ${formatBG(s.target, s.unit)} · sensibilité 1 U = ${formatBG(s.isf, s.unit)} ${unitLabel(s.unit)} · ratios (g/U) : ` +
        SLOTS.map((x) => `${x.label} ${s.ratios[x.id]}`).join(', ') +
        (s.basalDose ? ` · basale habituelle ${s.basalDose} U` : '')
    ),
    st
      ? [
          h('h2', null, 'Synthèse'),
          h('table', { class: 'tbl' },
            h('tbody', null,
              row('Nombre de mesures', st.n),
              row('Glycémie moyenne', `${formatBG(st.mean, s.unit)} ${unitLabel(s.unit)}`),
              row('HbA1c estimée (GMI)', `${fmtNum(st.gmi, 1)} %`),
              row('Coefficient de variation', `${fmtNum(st.cv, 1)} %`),
              row('Temps dans la cible', `${fmtNum(st.inRange, 1)} %`),
              row('Temps en dessous (< 70 / < 54)', `${fmtNum(st.low, 1)} % / ${fmtNum(st.veryLow, 1)} %`),
              row('Temps au-dessus (> 180 / > 250)', `${fmtNum(st.high, 1)} % / ${fmtNum(st.veryHigh, 1)} %`),
              row("Épisodes d'hypoglycémie", data.hypos)
            )
          ),
          rangeBar(st),
          h('h2', null, 'Courbe'),
          glucoseChart(data.bg, { from: data.from, to: data.to, low: s.low, high: s.high, unit: s.unit }),
          h('h2', null, 'Journée type'),
          profileChart(data.profile, { low: s.low, high: s.high, unit: s.unit }),
        ]
      : h('p', null, 'Aucune glycémie sur la période.'),
    h('h2', null, 'Détail par jour'),
    dailyTable(data)
  );

  const close = modal('Rapport médecin', h('div', null,
    h('div', { class: 'row gap no-print' },
      h('button', { class: 'btn primary grow', onclick: () => window.print() }, '🖨️ Imprimer / PDF'),
      h('button', { class: 'btn ghost', onclick: exportCSV }, 'CSV')
    ),
    h('p', { class: 'hint no-print' }, 'Sur téléphone : « Imprimer » puis « Enregistrer en PDF » pour l\'envoyer par e-mail au médecin.'),
    report
  ), { wide: true });
  return close;
}

function row(label, value) {
  return h('tr', null, h('th', null, label), h('td', null, String(value)));
}

function dailyTable(data) {
  const s = state.settings;
  const rows = [];
  for (const d of [...data.days].reverse()) {
    const inDay = (e) => e.ts >= d.day && e.ts < d.day + 864e5;
    const bg = data.bg.filter(inDay).sort((a, b) => a.ts - b.ts);
    const meals = data.meals.filter(inDay).sort((a, b) => a.ts - b.ts);
    const ins = data.insulin.filter(inDay).sort((a, b) => a.ts - b.ts);
    if (!bg.length && !meals.length && !ins.length) continue;
    rows.push(
      h('tr', null,
        h('td', null, fmtDate(d.day, { weekday: 'short', day: 'numeric', month: 'numeric' })),
        h('td', null, bg.map((e) => `${fmtTime(e.ts)} ${formatBG(e.value, s.unit)}`).join(' · ')),
        h('td', null, meals.map((e) => `${fmtTime(e.ts)} ${Math.round(e.carbs)} g`).join(' · ')),
        h('td', null, ins.map((e) => `${fmtTime(e.ts)} ${fmtNum(e.units, 1)} U${e.kind === 'lente' ? ' (L)' : ''}`).join(' · '))
      )
    );
  }
  return h('table', { class: 'tbl small' },
    h('thead', null, h('tr', null, h('th', null, 'Jour'), h('th', null, `Glycémies (${unitLabel(s.unit)})`), h('th', null, 'Glucides'), h('th', null, 'Insuline'))),
    h('tbody', null, rows.length ? rows : h('tr', null, h('td', { colspan: 4 }, 'Aucune donnée')))
  );
}

export async function exportCSV() {
  const s = state.settings;
  const all = (await getAllEntries()).sort((a, b) => a.ts - b.ts);
  const esc = (v) => {
    const t = v == null ? '' : String(v);
    return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const lines = [['date', 'heure', 'type', `glycemie_${s.unit === 'mmol' ? 'mmol' : 'mgdl'}`, 'glucides_g', 'insuline_u', 'type_insuline', 'detail', 'note'].join(';')];
  for (const e of all) {
    const d = new Date(e.ts);
    lines.push(
      [
        d.toLocaleDateString('fr-FR'),
        fmtTime(e.ts),
        e.type,
        e.type === 'glycemie' ? formatBG(e.value, s.unit) : '',
        e.type === 'repas' ? Math.round(e.carbs) : '',
        e.type === 'insuline' ? String(e.units).replace('.', ',') : '',
        e.type === 'insuline' ? e.kind : '',
        e.type === 'repas' ? [e.name, ...(e.items || []).map((i) => i.name)].join(', ') : e.type === 'glycemie' ? e.context : e.type === 'activite' ? `${e.kind} ${e.minutes} min` : e.type === 'cetones' ? String(e.value).replace('.', ',') : e.text || e.reason || '',
        e.note || '',
      ].map(esc).join(';')
    );
  }
  download(`journal-diabete-${new Date(startOfDay(Date.now())).toISOString().slice(0, 10)}.csv`, '﻿' + lines.join('\n'), 'text/csv');
}
