// Saisie et affichage des entrées du journal (glycémie, insuline, activité, cétones, note).

import { h, state, modal, toast, field, numInput, chips, parseNum, toLocalInput, fromLocalInput, fmtTime, fmtNum, confirmDialog } from './ui.js';
import { addEntry, updateEntry, deleteEntry, getEntries } from './db.js';
import { formatBG, fromDisplay, toDisplay, unitLabel, insulinOnBoard } from './calc.js';
import { openHypoHelper } from './hypo.js';

export const TYPES = {
  glycemie: { icon: '🩸', label: 'Glycémie' },
  insuline: { icon: '💉', label: 'Insuline' },
  repas: { icon: '🍽️', label: 'Repas' },
  activite: { icon: '🚶', label: 'Activité' },
  cetones: { icon: '🧪', label: 'Cétones' },
  note: { icon: '📝', label: 'Note' },
};

export const BG_CONTEXTS = ['Au réveil', 'Avant repas', 'Après repas', 'Avant coucher', 'Nuit', 'Malaise', 'Autre'];

export function bgClass(mgdl) {
  const s = state.settings;
  if (mgdl < s.low) return 'low';
  if (mgdl > s.high) return 'high';
  return 'ok';
}

export function entrySummary(e) {
  const unit = state.settings.unit;
  switch (e.type) {
    case 'glycemie':
      return {
        title: `${formatBG(e.value, unit)} ${unitLabel(unit)}`,
        detail: e.context || '',
        cls: bgClass(e.value),
      };
    case 'insuline':
      return {
        title: `${fmtNum(e.units)} U ${e.kind === 'lente' ? state.settings.basalName : state.settings.rapidName}`,
        detail: e.reason || '',
      };
    case 'repas':
      return {
        title: `${e.name || 'Repas'} · ${Math.round(e.carbs || 0)} g de glucides`,
        detail: (e.items || []).map((i) => i.name).join(', '),
        thumb: e.photo,
        cls: e.resucrage ? 'low' : '',
      };
    case 'activite':
      return { title: `${e.kind || 'Activité'} · ${e.minutes || 0} min`, detail: e.intensity || '' };
    case 'cetones':
      return { title: `${fmtNum(e.value)} mmol/L`, detail: e.value >= 1.5 ? 'Élevées : contactez votre médecin' : e.value >= 0.6 ? 'Légèrement élevées' : 'Normales', cls: e.value >= 0.6 ? 'high' : 'ok' };
    default:
      return { title: e.text || 'Note', detail: '' };
  }
}

export function entryRow(e, { onClick } = {}) {
  const t = TYPES[e.type] || TYPES.note;
  const s = entrySummary(e);
  return h(
    'button',
    { class: 'entry ' + (s.cls ? 'is-' + s.cls : ''), onclick: () => (onClick ? onClick(e) : openEntryEditor(e)) },
    s.thumb ? h('img', { class: 'entry-thumb', src: s.thumb, alt: '' }) : h('span', { class: 'entry-icon', 'aria-hidden': 'true' }, t.icon),
    h('span', { class: 'entry-main' }, h('span', { class: 'entry-title' }, s.title), s.detail ? h('span', { class: 'entry-detail' }, s.detail) : null, e.note ? h('span', { class: 'entry-detail' }, '« ' + e.note + ' »') : null),
    h('span', { class: 'entry-time' }, fmtTime(e.ts))
  );
}

/** Ouvre le formulaire d'ajout ou de modification d'une entrée. */
export function openEntryEditor(existing, { type, preset = {} } = {}) {
  const kind = existing?.type || type;
  if (kind === 'repas') {
    import('./meal.js').then((m) => m.openMealEditor(existing));
    return;
  }
  const s = state.settings;
  const data = { ts: Date.now(), ...preset, ...(existing || {}) };
  const tsInput = h('input', { type: 'datetime-local', value: toLocalInput(data.ts) });
  const noteInput = h('input', { type: 'text', value: data.note || '', placeholder: 'Facultatif' });
  let body;
  let collect;

  if (kind === 'glycemie') {
    const v = numInput({ value: data.value != null ? String(toDisplay(data.value, s.unit)).replace('.', ',') : '', placeholder: s.unit === 'mmol' ? 'ex. 6,5' : 'ex. 120', class: 'big-input', autofocus: true });
    let context = data.context || guessContext();
    body = [field(`Glycémie (${unitLabel(s.unit)})`, v), field('Moment', chips(BG_CONTEXTS, context, (c) => (context = c)))];
    collect = () => {
      const n = parseNum(v.value);
      const mg = n == null ? null : fromDisplay(n, s.unit);
      if (mg == null || mg < 20 || mg > 600) return toast('Valeur de glycémie invalide', 'error');
      return { value: mg, context };
    };
  } else if (kind === 'insuline') {
    const u = numInput({ value: data.units != null ? String(data.units).replace('.', ',') : '', placeholder: 'ex. 4', class: 'big-input', autofocus: true });
    let ik = data.kind || 'rapide';
    let reason = data.reason || 'Repas';
    body = [
      field("Nombre d'unités", u),
      field(
        'Type',
        chips(
          [
            { value: 'rapide', label: s.rapidName },
            { value: 'lente', label: s.basalName },
          ],
          ik,
          (k) => (ik = k)
        )
      ),
      field('Raison', chips(['Repas', 'Correction', 'Repas + correction', 'Basale', 'Autre'], reason, (r) => (reason = r))),
    ];
    collect = () => {
      const n = parseNum(u.value);
      if (n == null || n <= 0 || n > 100) return toast("Nombre d'unités invalide", 'error');
      return { units: n, kind: ik, reason };
    };
  } else if (kind === 'activite') {
    let ak = data.kind || 'Marche';
    let intensity = data.intensity || 'Modérée';
    const m = numInput({ value: data.minutes || '', placeholder: 'ex. 30', inputmode: 'numeric' });
    body = [
      field('Activité', chips(['Marche', 'Vélo', 'Natation', 'Jardinage', 'Ménage', 'Gym', 'Course', 'Autre'], ak, (k) => (ak = k))),
      field('Durée (minutes)', m),
      field('Intensité', chips(['Légère', 'Modérée', 'Intense'], intensity, (i) => (intensity = i))),
      h('p', { class: 'hint' }, "Astuce : l'activité fait baisser la glycémie pendant et jusqu'à 24 h après. Contrôlez avant, pendant si l'effort est long, et au coucher."),
    ];
    collect = () => {
      const n = parseNum(m.value);
      if (n == null || n <= 0) return toast('Durée invalide', 'error');
      return { kind: ak, minutes: Math.round(n), intensity };
    };
  } else if (kind === 'cetones') {
    const v = numInput({ value: data.value != null ? String(data.value).replace('.', ',') : '', placeholder: 'ex. 0,3', class: 'big-input' });
    body = [
      field('Cétonémie (mmol/L)', v),
      h('p', { class: 'hint' }, '< 0,6 : normal · 0,6 à 1,5 : resucrer si besoin, boire, corriger, recontrôler · > 1,5 : appelez votre médecin · > 3 : urgences (15).'),
    ];
    collect = () => {
      const n = parseNum(v.value);
      if (n == null || n < 0 || n > 10) return toast('Valeur invalide', 'error');
      return { value: n };
    };
  } else {
    const t = h('textarea', { rows: 4, placeholder: 'Ex. : stress, maladie, oubli de dose, changement de site…' }, data.text || '');
    body = [field('Note', t)];
    collect = () => {
      if (!t.value.trim()) return toast('La note est vide', 'error');
      return { text: t.value.trim() };
    };
  }

  const save = async () => {
    const values = collect();
    if (!values) return;
    const entry = { ...(existing || {}), type: kind, ...values, ts: fromLocalInput(tsInput.value), note: noteInput.value.trim() || undefined };
    if (existing) await updateEntry(entry);
    else await addEntry(entry);
    close();
    toast('Enregistré ✓', 'success');
    if (kind === 'glycemie') afterGlucose(entry.value);
    if (kind === 'cetones' && entry.value >= 1.5) {
      toast('Cétones élevées : contactez votre médecin ou le diabétologue de garde.', 'error');
    }
  };

  const remove = async () => {
    if (await confirmDialog('Supprimer cette entrée ?', { ok: 'Supprimer', danger: true })) {
      await deleteEntry(existing.id);
      close();
      toast('Supprimé');
    }
  };

  const content = h(
    'form',
    { class: 'form', onsubmit: (e) => { e.preventDefault(); save(); } },
    body,
    kind !== 'note' ? field('Note', noteInput) : null,
    field('Date et heure', tsInput),
    h('div', { class: 'row gap' }, existing ? h('button', { type: 'button', class: 'btn danger ghost', onclick: remove }, 'Supprimer') : null, h('button', { type: 'submit', class: 'btn primary grow' }, 'Enregistrer'))
  );
  const close = modal((existing ? 'Modifier · ' : 'Ajouter · ') + TYPES[kind].label, content);
  setTimeout(() => content.querySelector('.big-input')?.focus(), 50);
}

function guessContext() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9) return 'Au réveil';
  if (hour >= 22 || hour < 2) return 'Avant coucher';
  if (hour >= 2 && hour < 5) return 'Nuit';
  return 'Avant repas';
}

function afterGlucose(mg) {
  const s = state.settings;
  if (mg < s.hypo) {
    openHypoHelper(mg);
  } else if (mg > 250) {
    toast('Glycémie élevée : pensez à contrôler les cétones et à boire de l\'eau.', 'warn');
  }
}

export async function currentIOB(now = Date.now()) {
  const s = state.settings;
  const from = now - s.insulinDuration * 36e5;
  const doses = await getEntries({ from, to: now, type: 'insuline' });
  return insulinOnBoard(doses, now, s.insulinDuration, s.insulinPeak);
}

export async function lastGlucose(maxAgeMinutes = 60 * 24 * 7) {
  const list = await getEntries({ from: Date.now() - maxAgeMinutes * 60000, type: 'glycemie' });
  return list[0] || null;
}
