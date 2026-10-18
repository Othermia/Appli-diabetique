// Réglages : unités, cibles, ratios, sensibilité, IA, rappels, sauvegarde des données.

import { h, add, state, updateSettings, clear, field, numInput, chips, parseNum, toast, confirmDialog, download } from './ui.js';
import { SLOTS, toDisplay, fromDisplay, unitLabel } from './calc.js';
import { getAllEntries, getFavorites, importData, clearEntries, uid } from './db.js';
import { askNotificationPermission, remindersToICS } from './reminders.js';
import { exportCSV } from './report.js';
import { analyzeMeal } from './ai.js';

const MODELS = [
  { value: 'claude-opus-5-5', label: 'Précis (Opus)' },
  { value: 'claude-sonnet-5-5', label: 'Équilibré (Sonnet)' },
  { value: 'claude-haiku-5-5', label: 'Économique (Haiku)' },
];

export function renderSettings(root, { onboarding = false } = {}) {
  const s = structuredClone(state.settings);
  const disp = (mg) => String(toDisplay(mg, s.unit)).replace('.', ',');

  const name = h('input', { type: 'text', value: s.name, placeholder: 'ex. Marie' });
  const low = numInput({ value: disp(s.low) });
  const high = numInput({ value: disp(s.high) });
  const target = numInput({ value: disp(s.target) });
  const hypo = numInput({ value: disp(s.hypo) });
  const isf = numInput({ value: disp(s.isf) });
  const ratioInputs = Object.fromEntries(SLOTS.map((x) => [x.id, numInput({ value: String(s.ratios[x.id]).replace('.', ',') })]));
  const duration = numInput({ value: String(s.insulinDuration).replace('.', ',') });
  const maxBolus = numInput({ value: String(s.maxBolus) });
  const rapidName = h('input', { type: 'text', value: s.rapidName });
  const basalName = h('input', { type: 'text', value: s.basalName });
  const basalDose = numInput({ value: s.basalDose ? String(s.basalDose).replace('.', ',') : '', placeholder: 'ex. 18' });
  const emergencyName = h('input', { type: 'text', value: s.emergencyName || '', placeholder: 'ex. Julie (fille)' });
  const emergencyPhone = h('input', { type: 'tel', value: s.emergencyPhone || '', placeholder: '06…' });
  const apiKey = h('input', { type: 'password', value: s.apiKey, placeholder: 'sk-ant-…', autocomplete: 'off' });
  const postDelay = numInput({ value: String(s.postMealDelay), inputmode: 'numeric' });
  const postMeal = h('input', { type: 'checkbox', checked: s.postMealReminder });

  // Les champs dépendants de l'unité sont réécrits quand on change d'unité.
  let unit = s.unit;
  const onUnit = (u) => {
    const conv = (input) => {
      const v = parseNum(input.value);
      if (v == null) return;
      const mg = fromDisplay(v, unit);
      input.value = String(toDisplay(mg, u)).replace('.', ',');
    };
    [low, high, target, hypo, isf].forEach(conv);
    unit = u;
    root.querySelectorAll('.unit-label').forEach((n) => (n.textContent = unitLabel(u)));
  };
  const U = () => h('span', { class: 'unit-label' }, unitLabel(unit));

  let reminders = (s.reminders || []).map((r) => ({ ...r }));
  const remList = h('div', { class: 'reminders' });
  const drawReminders = () => {
    clear(remList);
    if (!reminders.length) add(remList, h('p', { class: 'hint' }, 'Aucun rappel quotidien.'));
    reminders.forEach((r, i) => {
      add(remList, 
        h('div', { class: 'reminder' },
          h('input', { type: 'checkbox', checked: r.enabled, 'aria-label': 'Activer', onchange: (e) => (r.enabled = e.target.checked) }),
          h('input', { type: 'time', value: r.time, onchange: (e) => (r.time = e.target.value) }),
          h('input', { type: 'text', value: r.label, class: 'grow', onchange: (e) => (r.label = e.target.value) }),
          h('button', { class: 'icon-btn', 'aria-label': 'Supprimer le rappel', onclick: () => { reminders.splice(i, 1); drawReminders(); } }, '🗑️')
        )
      );
    });
  };
  drawReminders();

  let textSize = s.textSize;
  let aiModel = s.aiModel;

  const save = () => {
    const mg = (input) => {
      const v = parseNum(input.value);
      return v == null ? null : fromDisplay(v, unit);
    };
    const patch = {
      name: name.value.trim(),
      unit,
      low: mg(low),
      high: mg(high),
      target: mg(target),
      hypo: mg(hypo),
      isf: mg(isf),
      ratios: Object.fromEntries(SLOTS.map((x) => [x.id, parseNum(ratioInputs[x.id].value)])),
      insulinDuration: parseNum(duration.value),
      doseStep: s.doseStep,
      maxBolus: parseNum(maxBolus.value) || 20,
      rapidName: rapidName.value.trim() || 'Insuline rapide',
      basalName: basalName.value.trim() || 'Insuline lente',
      basalDose: parseNum(basalDose.value) || '',
      emergencyName: emergencyName.value.trim(),
      emergencyPhone: emergencyPhone.value.replace(/[^\d+]/g, ''),
      apiKey: apiKey.value.trim(),
      aiModel,
      postMealReminder: postMeal.checked,
      postMealDelay: Math.max(30, Math.min(300, parseNum(postDelay.value) || 120)),
      reminders: reminders.filter((r) => r.time && r.label),
      textSize,
      configured: true,
    };
    const errors = [];
    if (!patch.low || !patch.high || patch.low >= patch.high) errors.push('plage cible');
    if (!patch.target || patch.target < patch.low || patch.target > patch.high) errors.push('objectif de correction (doit être dans la plage cible)');
    if (!patch.hypo || patch.hypo < 50 || patch.hypo > 100) errors.push("seuil d'hypoglycémie (entre 50 et 100 mg/dL)");
    if (!patch.isf || patch.isf < 5 || patch.isf > 400) errors.push('sensibilité');
    if (Object.values(patch.ratios).some((r) => !r || r < 1 || r > 100)) errors.push('ratios');
    if (!patch.insulinDuration || patch.insulinDuration < 2 || patch.insulinDuration > 8) errors.push("durée d'action (2 à 8 h)");
    if (errors.length) return toast('À vérifier : ' + errors.join(', '), 'error');
    updateSettings(patch);
    toast('Réglages enregistrés ✓', 'success');
    if (onboarding) location.hash = '#accueil';
  };

  clear(root);
  add(root, 
    h('header', { class: 'page-head' }, h('h1', null, onboarding ? 'Mes réglages' : 'Réglages')),
    onboarding
      ? h('div', { class: 'alert info' }, 'Remplissez ces valeurs avec votre diabétologue ou à partir de votre protocole. Elles servent au calcul des doses. Vous pourrez les modifier à tout moment.')
      : null,

    section('👤 Profil',
      field('Prénom', name),
      field('Taille du texte', chips([{ value: 'normal', label: 'Normale' }, { value: 'large', label: 'Grande' }, { value: 'xlarge', label: 'Très grande' }], textSize, (v) => { textSize = v; document.documentElement.dataset.textSize = v; }))
    ),

    section('🎯 Glycémie',
      field('Unité', chips([{ value: 'mgdl', label: 'mg/dL' }, { value: 'mmol', label: 'mmol/L' }], unit, onUnit)),
      h('div', { class: 'grid-2' },
        field(h('span', null, 'Cible basse (', U(), ')'), low),
        field(h('span', null, 'Cible haute (', U(), ')'), high)
      ),
      h('div', { class: 'grid-2' },
        field(h('span', null, 'Objectif de correction (', U(), ')'), target, 'Valeur visée par le calcul.'),
        field(h('span', null, 'Seuil d\'hypo (', U(), ')'), hypo)
      )
    ),

    section('💉 Traitement',
      h('p', { class: 'hint' }, 'Ratio = nombre de grammes de glucides couverts par 1 unité d\'insuline rapide.'),
      h('div', { class: 'grid-2' }, SLOTS.map((x) => field(`${x.label} (g/U)`, ratioInputs[x.id]))),
      field(h('span', null, 'Sensibilité : 1 U fait baisser de (', U(), ')'), isf),
      h('div', { class: 'grid-2' },
        field("Durée d'action de la rapide (h)", duration, 'Souvent 3 à 5 h.'),
        field('Dose max. avant alerte (U)', maxBolus)
      ),
      field('Arrondi des doses', chips([{ value: 0.5, label: '0,5 U (demi-unité)' }, { value: 1, label: '1 U' }, { value: 0.1, label: '0,1 U (pompe)' }], s.doseStep, (v) => (s.doseStep = v))),
      h('div', { class: 'grid-2' }, field('Nom de l\'insuline rapide', rapidName), field('Nom de l\'insuline lente', basalName)),
      field('Dose habituelle de lente (U)', basalDose)
    ),

    section('🆘 Contact d\'urgence',
      h('div', { class: 'grid-2' }, field('Nom', emergencyName), field('Téléphone', emergencyPhone)),
      h('p', { class: 'hint' }, 'Un bouton pour l\'appeler apparaît dans l\'aide hypoglycémie.')
    ),

    section('📷 Analyse des photos (IA)',
      h('p', null, "L'analyse utilise l'IA Claude d'Anthropic. Il faut une clé API personnelle : créez un compte sur console.anthropic.com, ajoutez quelques euros de crédit, puis « API Keys » → « Create Key ». Une analyse coûte en général quelques centimes."),
      field('Clé API', apiKey, 'La clé reste sur ce téléphone. Seule la photo du repas est envoyée pour l\'analyse.'),
      field('Modèle', chips(MODELS, aiModel, (v) => (aiModel = v))),
      h('button', { class: 'btn ghost block', onclick: () => testKey(apiKey.value.trim(), aiModel) }, 'Tester la clé')
    ),

    section('⏰ Rappels',
      h('label', { class: 'check' }, postMeal, ' Rappel de contrôle après chaque repas, au bout de ', postDelay, ' min'),
      h('h3', null, 'Rappels quotidiens'),
      remList,
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn ghost', onclick: () => { reminders.push({ id: uid(), time: '20:00', label: `Injection ${basalName.value || 'insuline lente'}`, enabled: true }); drawReminders(); } }, '+ Insuline lente'),
        h('button', { class: 'btn ghost', onclick: () => { reminders.push({ id: uid(), time: '22:30', label: 'Glycémie du coucher', enabled: true }); drawReminders(); } }, '+ Glycémie coucher'),
        h('button', { class: 'btn ghost', onclick: () => { reminders.push({ id: uid(), time: '09:00', label: 'Rappel', enabled: true }); drawReminders(); } }, '+ Autre')
      ),
      h('p', { class: 'hint' }, "Les notifications de l'application fonctionnent quand elle est ouverte ou en arrière-plan récent. Pour des alarmes fiables, ajoutez aussi les rappels à l'agenda du téléphone."),
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn ghost', onclick: async () => (await askNotificationPermission()) && toast('Notifications activées ✓', 'success') }, '🔔 Autoriser les notifications'),
        h('button', { class: 'btn ghost', onclick: () => {
          const list = reminders.filter((r) => r.enabled);
          if (!list.length) return toast('Aucun rappel actif', 'warn');
          download('rappels-diabete.ics', remindersToICS(list), 'text/calendar');
        } }, '📅 Ajouter à l\'agenda')
      )
    ),

    h('button', { class: 'btn primary block big sticky-save', onclick: save }, 'Enregistrer les réglages'),

    section('💾 Mes données',
      h('p', { class: 'hint' }, 'Les données restent uniquement sur ce téléphone. Faites une sauvegarde régulièrement (par exemple une fois par mois) et gardez le fichier en lieu sûr.'),
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn ghost', onclick: backup }, '⬇️ Sauvegarder'),
        h('button', { class: 'btn ghost', onclick: restore }, '⬆️ Restaurer'),
        h('button', { class: 'btn ghost', onclick: exportCSV }, '📊 Export tableur (CSV)')
      ),
      h('button', { class: 'btn danger ghost block', onclick: wipe }, 'Effacer tout le journal')
    ),

    section('ℹ️ À propos',
      h('p', null, "Cette application aide à noter et à calculer, elle ne remplace pas l'avis de l'équipe médicale. Les estimations de glucides par photo sont approximatives : vérifiez-les. Les doses suggérées dépendent entièrement des réglages ci-dessus."),
      h('p', { class: 'hint' }, 'Valeurs nutritionnelles indicatives d\'après la table CIQUAL (Anses).')
    )
  );
}

function section(title, ...children) {
  return h('section', { class: 'card' }, h('h2', null, title), children);
}

async function testKey(apiKey, model) {
  if (!apiKey) return toast('Saisissez une clé API', 'error');
  toast('Test en cours…');
  try {
    const r = await analyzeMeal({ apiKey, model, description: 'Une pomme moyenne' });
    toast(`Clé valide ✓ (une pomme ≈ ${r.total_glucides_g} g de glucides)`, 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function backup() {
  const data = {
    app: 'glucosuivi',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...state.settings, apiKey: '' },
    entries: await getAllEntries(),
    favorites: await getFavorites(),
  };
  download(`sauvegarde-diabete-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
}

function restore() {
  const input = h('input', { type: 'file', accept: 'application/json,.json' });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'glucosuivi' || !Array.isArray(data.entries)) throw new Error('format');
      const replace = await confirmDialog(`Restaurer ${data.entries.length} entrées ? Le journal actuel sera remplacé.`, { ok: 'Restaurer' });
      if (!replace) return;
      await importData(data, { replace: true });
      if (data.settings) updateSettings({ ...data.settings, apiKey: state.settings.apiKey });
      toast('Sauvegarde restaurée ✓', 'success');
      location.hash = '#accueil';
    } catch {
      toast('Fichier de sauvegarde invalide', 'error');
    }
  };
  input.click();
}

async function wipe() {
  if (!(await confirmDialog('Effacer définitivement tout le journal ? Pensez à faire une sauvegarde avant.', { ok: 'Tout effacer', danger: true }))) return;
  await clearEntries();
  toast('Journal effacé');
}

