// Écran « Repas » : photo analysée par l'IA, ajout d'aliments, calcul des glucides et du bolus.

import { h, add, state, clear, modal, toast, field, numInput, chips, parseNum, fmtNum, toLocalInput, fromLocalInput, confirmDialog } from './ui.js';
import { addEntry, updateEntry, deleteEntry, getFavorites, saveFavorite, deleteFavorite } from './db.js';
import { analyzeMeal, preparePhoto } from './ai.js';
import { searchFoods, CATEGORIES, FOODS } from './foods.js';
import { suggestBolus, slotFor, SLOTS, formatBG, fromDisplay, toDisplay, unitLabel } from './calc.js';
import { currentIOB, lastGlucose } from './entries.js';
import { scheduleOnce } from './reminders.js';

const emptyMeal = () => ({
  editingId: null,
  ts: Date.now(),
  name: '',
  items: [],
  photo: null, // miniature
  photoData: null, // image pour l'analyse
  analysis: null,
  description: '',
  bgInput: '',
  activity: 0,
  injected: '',
  injectedTouched: false,
});

let meal = emptyMeal();
let container = null;

export function openMealEditor(existing) {
  meal = emptyMeal();
  if (existing) {
    Object.assign(meal, {
      editingId: existing.id,
      original: existing,
      ts: existing.ts,
      name: existing.name || '',
      items: (existing.items || []).map((i) => ({ ...i })),
      photo: existing.photo || null,
      analysis: existing.analysis || null,
    });
  }
  location.hash = '#repas';
  if (container) render();
}

export function renderMealPage(root) {
  container = root;
  render();
}

const totalCarbs = () => Math.round(meal.items.reduce((s, i) => s + (Number(i.carbs) || 0), 0));

let renderToken = 0;
async function render() {
  if (!container || !container.isConnected) return;
  const token = ++renderToken;
  const s = state.settings;
  clear(container);

  add(container, 
    h('header', { class: 'page-head' }, h('h1', null, meal.editingId ? 'Modifier le repas' : 'Mon repas'), meal.items.length || meal.photo ? h('button', { class: 'btn small ghost', onclick: resetMeal }, 'Recommencer') : null)
  );

  // 1. Photo et ajout d'aliments
  const fileCamera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden', onchange: (e) => onPhoto(e.target.files[0]) });
  const fileGallery = h('input', { type: 'file', accept: 'image/*', class: 'hidden', onchange: (e) => onPhoto(e.target.files[0]) });

  const photoCard = h(
    'section',
    { class: 'card' },
    meal.photo
      ? h('div', { class: 'photo-wrap' }, h('img', { src: meal.photo, alt: 'Photo du repas', class: 'meal-photo' }), meal.analyzing ? h('div', { class: 'photo-overlay' }, h('div', { class: 'spinner' }), h('span', null, 'Analyse du repas…')) : null)
      : null,
    h(
      'div',
      { class: 'grid-2' },
      h('button', { class: 'tile accent', onclick: () => fileCamera.click() }, h('span', { class: 'tile-icon' }, '📷'), 'Prendre une photo'),
      h('button', { class: 'tile', onclick: () => fileGallery.click() }, h('span', { class: 'tile-icon' }, '🖼️'), 'Choisir une photo'),
      h('button', { class: 'tile', onclick: openFoodSearch }, h('span', { class: 'tile-icon' }, '🔎'), 'Ajouter un aliment'),
      h('button', { class: 'tile', onclick: openFavorites }, h('span', { class: 'tile-icon' }, '⭐'), 'Mes repas favoris')
    ),
    h('button', { class: 'btn ghost block', onclick: openDescribe }, '✍️ Décrire le repas à l\'IA (sans photo)'),
    fileCamera,
    fileGallery,
    !s.apiKey ? h('p', { class: 'hint' }, "Pour l'analyse automatique des photos, ajoutez une clé API dans Réglages. Sans clé, utilisez « Ajouter un aliment ».") : null
  );
  add(container, photoCard);

  // 2. Résultat de l'analyse
  if (meal.analysis) {
    const a = meal.analysis;
    add(container, 
      h(
        'section',
        { class: 'card' },
        h('h2', null, "🤖 Ce que l'IA a vu"),
        a.commentaire ? h('p', null, a.commentaire) : null,
        a.absorption ? h('p', { class: 'pill-line' }, h('span', { class: 'pill ' + (a.absorption === 'rapide' ? 'warn' : a.absorption === 'lente' ? 'info' : '') }, `Absorption ${a.absorption}`)) : null,
        a.conseils?.length ? h('ul', { class: 'tips' }, a.conseils.map((c) => h('li', null, c))) : null,
        h('p', { class: 'hint' }, "Estimation à vérifier : corrigez les quantités ci-dessous si besoin. En cas de doute, pesez.")
      )
    );
  }

  // 3. Composition
  const list = h('div', { class: 'items' });
  if (!meal.items.length) {
    add(list, h('p', { class: 'empty-text' }, 'Aucun aliment pour le moment.'));
  }
  meal.items.forEach((item, idx) => add(list, itemRow(item, idx)));

  add(container, 
    h(
      'section',
      { class: 'card' },
      h('h2', null, 'Composition'),
      list,
      h('div', { class: 'total' }, h('span', null, 'Total glucides'), h('strong', { id: 'meal-total' }, `${totalCarbs()} g`))
    )
  );

  // 4. Bolus
  const bolusCard = h('section', { class: 'card' });
  add(container, bolusCard);
  await renderBolus(bolusCard);
  if (token !== renderToken) return;

  // 5. Enregistrement
  const nameInput = h('input', { type: 'text', value: meal.name, placeholder: 'ex. Déjeuner, Petit-déj…', oninput: (e) => (meal.name = e.target.value) });
  const tsInput = h('input', { type: 'datetime-local', value: toLocalInput(meal.ts), onchange: (e) => { meal.ts = fromLocalInput(e.target.value); refreshBolus(); } });
  const favBox = h('input', { type: 'checkbox' });
  add(container, 
    h(
      'section',
      { class: 'card' },
      h('h2', null, 'Enregistrer'),
      field('Nom du repas', nameInput),
      field('Date et heure', tsInput),
      h('label', { class: 'check' }, favBox, ' Ajouter à mes repas favoris'),
      h('div', { class: 'row gap' },
        meal.editingId ? h('button', { class: 'btn danger ghost', onclick: removeMeal }, 'Supprimer') : null,
        h('button', { class: 'btn primary grow big', onclick: () => saveMeal(favBox.checked) }, 'Enregistrer le repas')
      )
    )
  );
}

function itemRow(item, idx) {
  const grams = numInput({ value: item.grams != null ? String(item.grams) : '', class: 'small-input', 'aria-label': 'Quantité en grammes' });
  const carbs = numInput({ value: fmtNum(item.carbs, 1), class: 'small-input', 'aria-label': 'Glucides en grammes' });
  grams.addEventListener('input', () => {
    const g = parseNum(grams.value);
    item.grams = g;
    if (g != null && item.carbsPer100 != null) {
      item.carbs = Math.round(((g * item.carbsPer100) / 100) * 10) / 10;
      carbs.value = fmtNum(item.carbs, 1);
    }
    updateTotal();
  });
  carbs.addEventListener('input', () => {
    item.carbs = parseNum(carbs.value) || 0;
    updateTotal();
  });
  return h(
    'div',
    { class: 'item' },
    h('div', { class: 'item-name' }, item.name, item.confidence === 'faible' ? h('span', { class: 'pill warn', title: 'Estimation incertaine' }, 'à vérifier') : null, item.gi === 'élevé' ? h('span', { class: 'pill', title: 'Index glycémique élevé' }, 'IG élevé') : null),
    h('div', { class: 'item-fields' },
      h('label', null, grams, h('span', null, 'g')),
      h('span', { class: 'arrow' }, '→'),
      h('label', null, carbs, h('span', null, 'g gluc.')),
      h('button', { class: 'icon-btn', 'aria-label': 'Retirer ' + item.name, onclick: () => { meal.items.splice(idx, 1); render(); } }, '🗑️')
    )
  );
}

function updateTotal() {
  const t = document.getElementById('meal-total');
  if (t) t.textContent = `${totalCarbs()} g`;
  clearTimeout(updateTotal.timer);
  updateTotal.timer = setTimeout(refreshBolus, 400);
}

let bolusCardRef = null;
function refreshBolus() {
  if (bolusCardRef?.isConnected) renderBolus(bolusCardRef);
}

async function renderBolus(card) {
  bolusCardRef = card;
  const s = state.settings;
  const now = meal.editingId ? meal.ts : Date.now();
  const iob = meal.editingId ? 0 : await currentIOB(now);
  const last = await lastGlucose(30);
  if (meal.bgInput === '' && last && !meal.editingId) {
    meal.bgInput = String(toDisplay(last.value, s.unit)).replace('.', ',');
    meal.bgFromLast = true;
  }
  const slot = slotFor(meal.ts);
  const bgVal = parseNum(meal.bgInput);
  const bg = bgVal == null ? null : fromDisplay(bgVal, s.unit);
  const res = suggestBolus({ carbs: totalCarbs(), bg, iob, slot, activityReduction: meal.activity, settings: s });

  if (!meal.injectedTouched && res.ok) meal.injected = fmtNum(res.rounded, 1);

  const bgInput = numInput({
    value: meal.bgInput,
    placeholder: s.unit === 'mmol' ? 'ex. 7,2' : 'ex. 130',
    class: 'small-input',
    onchange: (e) => { meal.bgInput = e.target.value; meal.bgFromLast = false; refreshBolus(); },
  });

  clear(card);
  add(card, 
    h('h2', null, '💉 Calcul de la dose'),
    field(`Glycémie avant le repas (${unitLabel(s.unit)})`, bgInput, meal.bgFromLast ? 'Dernière mesure de moins de 30 min, reprise automatiquement.' : 'Facultatif mais recommandé pour la correction.'),
    field('Activité physique prévue', chips(
      [
        { value: 0, label: 'Aucune' },
        { value: 25, label: 'Légère (-25 %)' },
        { value: 50, label: 'Intense (-50 %)' },
      ],
      meal.activity,
      (v) => { meal.activity = v; refreshBolus(); }
    ), 'Pourcentages à valider avec votre médecin.')
  );

  if (!res.ok) {
    add(card, h('div', { class: 'alert ' + (res.reason === 'hypo' ? 'danger' : 'warn') }, res.warnings.join(' ')));
    if (res.reason === 'hypo') {
      add(card, h('button', { class: 'btn danger block', onclick: () => import('./hypo.js').then((m) => m.openHypoHelper(bg)) }, 'Ouvrir l\'aide hypoglycémie'));
    }
    return;
  }

  const slotLabel = SLOTS.find((x) => x.id === slot)?.label;
  add(card, 
    h('div', { class: 'dose' }, h('span', null, 'Dose suggérée'), h('strong', null, `${fmtNum(res.rounded, 1)} U`)),
    h(
      'details',
      { class: 'calc-detail' },
      h('summary', null, 'Voir le détail du calcul'),
      h('ul', null,
        h('li', null, `Repas : ${totalCarbs()} g ÷ ${res.ratio} g/U (${slotLabel}) = ${fmtNum(res.meal, 2)} U`),
        bg != null ? h('li', null, `Correction : (${formatBG(bg, s.unit)} − ${formatBG(s.target, s.unit)}) ÷ ${formatBG(s.isf, s.unit)} = ${fmtNum(res.correctionRaw, 2)} U`) : h('li', null, 'Correction : pas de glycémie saisie'),
        res.iob > 0 ? h('li', null, `Insuline encore active : −${fmtNum(res.iob, 2)} U (déduite de la correction)`) : null,
        res.reductionPct ? h('li', null, `Activité : −${res.reductionPct} %`) : null,
        h('li', null, `Total : ${fmtNum(res.total, 2)} U, arrondi au pas de ${fmtNum(s.doseStep, 1)} U`)
      )
    ),
    res.warnings.length ? h('div', { class: 'alert warn' }, res.warnings.join(' ')) : null,
    field(
      "Dose réellement injectée (U)",
      numInput({ value: meal.injected, class: 'small-input', oninput: (e) => { meal.injected = e.target.value; meal.injectedTouched = true; } }),
      'Laissez vide si vous ne voulez pas enregistrer d\'injection.'
    ),
    h('p', { class: 'disclaimer' }, "Suggestion calculée avec vos réglages : vérifiez toujours avant d'injecter. En cas de doute, suivez les consignes de votre équipe médicale.")
  );
}

async function onPhoto(file) {
  if (!file) return;
  try {
    const p = await preparePhoto(file);
    meal.photo = p.thumb;
    meal.photoData = p;
  } catch {
    toast("Impossible de lire cette photo.", 'error');
    return;
  }
  if (!state.settings.apiKey) {
    render();
    toast("Photo ajoutée. Ajoutez une clé API dans Réglages pour l'analyse automatique.", 'warn');
    return;
  }
  runAnalysis();
}

function openDescribe() {
  const ta = h('textarea', { rows: 4, placeholder: 'ex. Une assiette de spaghetti bolognaise, une pomme et un yaourt nature' }, meal.description);
  const close = modal(
    'Décrire le repas',
    h('div', { class: 'form' },
      field(meal.photo ? 'Précisions pour la photo' : 'Qu\'avez-vous mangé ?', ta, 'Plus vous donnez de détails (quantités, marques), meilleure est l\'estimation.'),
      h('button', { class: 'btn primary block', onclick: () => {
        meal.description = ta.value.trim();
        if (!meal.description && !meal.photoData) return toast('Décrivez le repas', 'error');
        close();
        runAnalysis();
      } }, 'Analyser')
    )
  );
  setTimeout(() => ta.focus(), 50);
}

async function runAnalysis() {
  meal.analyzing = true;
  render();
  try {
    const res = await analyzeMeal({
      apiKey: state.settings.apiKey,
      model: state.settings.aiModel,
      image: meal.photoData ? { data: meal.photoData.data, mediaType: meal.photoData.mediaType } : null,
      description: meal.description,
    });
    meal.analysis = { commentaire: res.commentaire, conseils: res.conseils, absorption: res.absorption };
    // On remplace les éléments issus d'une analyse précédente, on garde les ajouts manuels.
    meal.items = meal.items.filter((i) => i.source !== 'ia');
    for (const a of res.aliments) {
      meal.items.push({
        name: a.nom,
        grams: a.quantite_g,
        carbsPer100: a.glucides_pour_100g,
        carbs: a.glucides_g,
        gi: a.index_glycemique,
        confidence: a.confiance,
        source: 'ia',
      });
    }
    meal.injectedTouched = false;
    if (!res.aliments.length) toast('Aucun aliment reconnu. Ajoutez-les manuellement.', 'warn');
    else toast(`${res.total_glucides_g} g de glucides estimés`, 'success');
  } catch (err) {
    toast(err.message || "Erreur pendant l'analyse", 'error');
  } finally {
    meal.analyzing = false;
    render();
  }
}

function openFoodSearch() {
  const results = h('div', { class: 'food-results' });
  let category = null;
  const input = h('input', { type: 'search', placeholder: 'Rechercher : pâtes, pomme, pain…', oninput: () => show() });
  const show = () => {
    clear(results);
    let list = input.value.trim() ? searchFoods(input.value, 40) : FOODS;
    if (category && !input.value.trim()) list = list.filter((f) => f.category === category);
    else if (!input.value.trim()) list = list.slice(0, 0);
    if (!input.value.trim() && !category) {
      add(results, h('p', { class: 'hint' }, 'Tapez un nom ou choisissez une catégorie.'));
      return;
    }
    if (!list.length) {
      add(results, h('p', { class: 'hint' }, 'Aucun résultat.'), h('button', { class: 'btn ghost block', onclick: () => { close(); openCustomFood(input.value.trim()); } }, '➕ Ajouter un aliment personnalisé'));
      return;
    }
    for (const f of list) {
      add(results, 
        h('button', { class: 'food', onclick: () => { close(); openQuantity(f); } },
          h('span', { class: 'food-name' }, f.name),
          h('span', { class: 'food-meta' }, `${fmtNum(f.carbsPer100, 1)} g / 100 g · ${f.portionLabel} ≈ ${Math.round((f.carbsPer100 * f.portionGrams) / 100)} g`)
        )
      );
    }
  };
  const close = modal(
    'Ajouter un aliment',
    h('div', null,
      input,
      chips([{ value: null, label: 'Tout' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))], null, (c) => { category = c; input.value = ''; show(); }),
      results,
      h('button', { class: 'btn ghost block', onclick: () => { close(); openCustomFood(''); } }, '➕ Aliment personnalisé (étiquette)')
    ),
    { wide: true }
  );
  show();
  setTimeout(() => input.focus(), 50);
}

function openQuantity(food) {
  const grams = numInput({ value: String(food.portionGrams), class: 'big-input' });
  const out = h('p', { class: 'calc-out' });
  const upd = () => {
    const g = parseNum(grams.value) || 0;
    out.textContent = `= ${fmtNum((g * food.carbsPer100) / 100, 1)} g de glucides`;
  };
  grams.addEventListener('input', upd);
  upd();
  const close = modal(
    food.name,
    h('div', { class: 'form' },
      h('p', { class: 'hint' }, `${fmtNum(food.carbsPer100, 1)} g de glucides pour 100 g. Portion type : ${food.portionLabel} (${food.portionGrams} g).`),
      h('div', { class: 'chips' },
        [0.5, 1, 1.5, 2, 3].map((m) =>
          h('button', { type: 'button', class: 'chip', onclick: () => { grams.value = String(Math.round(food.portionGrams * m)); upd(); } }, `${fmtNum(m, 1)} portion${m > 1 ? 's' : ''}`)
        )
      ),
      field('Quantité (g ou mL)', grams),
      out,
      h('button', { class: 'btn primary block', onclick: () => {
        const g = parseNum(grams.value);
        if (!g) return toast('Quantité invalide', 'error');
        meal.items.push({ name: food.name, grams: g, carbsPer100: food.carbsPer100, carbs: Math.round(((g * food.carbsPer100) / 100) * 10) / 10, source: 'table' });
        meal.injectedTouched = false;
        close();
        render();
      } }, 'Ajouter au repas')
    )
  );
}

function openCustomFood(name) {
  const n = h('input', { type: 'text', value: name, placeholder: 'Nom' });
  const per100 = numInput({ placeholder: 'ex. 60' });
  const grams = numInput({ placeholder: 'ex. 40' });
  const direct = numInput({ placeholder: 'ex. 25' });
  const close = modal(
    'Aliment personnalisé',
    h('div', { class: 'form' },
      field('Nom', n),
      h('p', { class: 'hint' }, "Lisez l'étiquette « Glucides » (pas « dont sucres »)."),
      h('div', { class: 'grid-2' }, field('Glucides pour 100 g', per100), field('Quantité mangée (g)', grams)),
      h('p', { class: 'hint center' }, '— ou —'),
      field('Glucides totaux connus (g)', direct),
      h('button', { class: 'btn primary block', onclick: () => {
        const p = parseNum(per100.value);
        const g = parseNum(grams.value);
        const d = parseNum(direct.value);
        let carbs = d;
        if (carbs == null && p != null && g != null) carbs = Math.round(((p * g) / 100) * 10) / 10;
        if (carbs == null) return toast('Indiquez les glucides', 'error');
        meal.items.push({ name: n.value.trim() || 'Aliment', grams: g, carbsPer100: p, carbs, source: 'manuel' });
        meal.injectedTouched = false;
        close();
        render();
      } }, 'Ajouter au repas')
    )
  );
}

async function openFavorites() {
  const favs = await getFavorites();
  const body = h('div', null);
  if (!favs.length) {
    add(body, h('p', { class: 'hint' }, 'Aucun favori pour le moment. Cochez « Ajouter à mes repas favoris » en enregistrant un repas que vous mangez souvent.'));
  }
  for (const f of favs) {
    add(body, 
      h('div', { class: 'fav' },
        h('button', { class: 'food grow', onclick: async () => {
          meal.items.push(...f.items.map((i) => ({ ...i })));
          if (!meal.name) meal.name = f.name;
          await saveFavorite({ ...f, used: (f.used || 0) + 1 });
          meal.injectedTouched = false;
          close();
          render();
        } },
          h('span', { class: 'food-name' }, f.name),
          h('span', { class: 'food-meta' }, `${Math.round(f.items.reduce((s, i) => s + (i.carbs || 0), 0))} g · ${f.items.map((i) => i.name).join(', ')}`)
        ),
        h('button', { class: 'icon-btn', 'aria-label': 'Supprimer le favori', onclick: async () => {
          if (await confirmDialog(`Supprimer le favori « ${f.name} » ?`, { ok: 'Supprimer', danger: true })) {
            await deleteFavorite(f.id);
            close();
            openFavorites();
          }
        } }, '🗑️')
      )
    );
  }
  const close = modal('⭐ Mes repas favoris', body, { wide: true });
}

async function saveMeal(asFavorite) {
  const s = state.settings;
  if (!meal.items.length) return toast('Ajoutez au moins un aliment', 'error');
  const carbs = totalCarbs();
  const name = meal.name.trim() || SLOTS.find((x) => x.id === slotFor(meal.ts))?.label || 'Repas';
  const items = meal.items.map(({ name, grams, carbsPer100, carbs, gi, confidence, source }) => ({ name, grams, carbsPer100, carbs, gi, confidence, source }));
  const record = {
    type: 'repas',
    ts: meal.ts,
    name,
    items,
    carbs,
    photo: meal.photo,
    analysis: meal.analysis,
  };

  if (meal.editingId) {
    await updateEntry({ ...meal.original, ...record });
  } else {
    await addEntry(record);
    const bgVal = parseNum(meal.bgInput);
    if (bgVal != null && !meal.bgFromLast) {
      await addEntry({ type: 'glycemie', ts: meal.ts - 60000, value: fromDisplay(bgVal, s.unit), context: 'Avant repas' });
    }
    const units = parseNum(meal.injected);
    if (units && units > 0) {
      await addEntry({ type: 'insuline', ts: meal.ts, units, kind: 'rapide', reason: 'Repas' });
    }
    if (s.postMealReminder && Date.now() - meal.ts < 60 * 60000) {
      scheduleOnce(meal.ts + s.postMealDelay * 60000, 'Contrôle après repas', `Pensez à mesurer votre glycémie (repas : ${name}).`);
    }
  }
  if (asFavorite) await saveFavorite({ name, items });
  toast('Repas enregistré ✓', 'success');
  meal = emptyMeal();
  location.hash = '#accueil';
}

async function removeMeal() {
  if (await confirmDialog('Supprimer ce repas du journal ?', { ok: 'Supprimer', danger: true })) {
    await deleteEntry(meal.editingId);
    meal = emptyMeal();
    toast('Repas supprimé');
    location.hash = '#journal';
  }
}

async function resetMeal() {
  if (await confirmDialog('Effacer le repas en cours ?', { ok: 'Effacer' })) {
    meal = emptyMeal();
    render();
  }
}
