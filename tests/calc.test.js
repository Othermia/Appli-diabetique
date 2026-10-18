import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  iobFraction, insulinOnBoard, suggestBolus, glucoseStats, toDisplay, fromDisplay, slotFor, roundToStep, hourlyProfile,
} from '../js/calc.js';
import { searchFoods, FOODS } from '../js/foods.js';

const settings = {
  ratios: { matin: 8, midi: 10, gouter: 12, soir: 10, nuit: 10 },
  isf: 50, target: 110, hypo: 70, doseStep: 0.5, maxBolus: 20,
};

test("fraction d'insuline active : 100 % au départ, 0 % à la fin, décroissante", () => {
  assert.equal(iobFraction(0), 1);
  assert.equal(iobFraction(240), 0);
  let prev = 1;
  for (let t = 10; t < 240; t += 10) {
    const f = iobFraction(t);
    assert.ok(f <= prev + 1e-9, `non décroissant à ${t} min`);
    assert.ok(f > 0 && f < 1);
    prev = f;
  }
  // À mi-parcours, il reste une part significative mais moins de la moitié
  const mid = iobFraction(120);
  assert.ok(mid > 0.2 && mid < 0.5, `IOB à 2 h = ${mid}`);
});

test('insuline active : ignore la lente et les doses anciennes', () => {
  const now = Date.now();
  const doses = [
    { kind: 'rapide', units: 4, ts: now },
    { kind: 'lente', units: 20, ts: now },
    { kind: 'rapide', units: 6, ts: now - 5 * 36e5 },
  ];
  assert.equal(insulinOnBoard(doses, now, 4), 4);
});

test('bolus repas simple sans glycémie', () => {
  const r = suggestBolus({ carbs: 60, slot: 'midi', settings });
  assert.ok(r.ok);
  assert.equal(r.meal, 6);
  assert.equal(r.rounded, 6);
});

test('ratio différent selon le moment', () => {
  const r = suggestBolus({ carbs: 40, slot: 'matin', settings });
  assert.equal(r.meal, 5);
});

test('correction ajoutée si glycémie haute, insuline active déduite', () => {
  const r = suggestBolus({ carbs: 50, bg: 210, iob: 0.5, slot: 'midi', settings });
  // repas 5 U + correction (210-110)/50 = 2 U - 0,5 U active = 1,5 U
  assert.equal(r.meal, 5);
  assert.equal(r.correction, 1.5);
  assert.equal(r.rounded, 6.5);
});

test("l'insuline active ne rend pas la correction négative", () => {
  const r = suggestBolus({ carbs: 50, bg: 160, iob: 3, slot: 'midi', settings });
  assert.equal(r.correction, 0);
  assert.equal(r.rounded, 5);
});

test('glycémie sous la cible : bolus réduit', () => {
  const r = suggestBolus({ carbs: 50, bg: 85, slot: 'midi', settings });
  // 5 U - 0,5 U
  assert.equal(r.rounded, 4.5);
});

test("hypoglycémie : pas de bolus proposé", () => {
  const r = suggestBolus({ carbs: 50, bg: 60, slot: 'midi', settings });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'hypo');
});

test('activité : réduction en pourcentage', () => {
  const r = suggestBolus({ carbs: 60, slot: 'midi', activityReduction: 50, settings });
  assert.equal(r.rounded, 3);
});

test('dose jamais négative', () => {
  const r = suggestBolus({ carbs: 0, bg: 75, slot: 'midi', settings });
  assert.equal(r.rounded, 0);
});

test('paramètres manquants', () => {
  const r = suggestBolus({ carbs: 60, settings: { ...settings, isf: 0 } });
  assert.equal(r.ok, false);
});

test('alerte cétones si glycémie > 250', () => {
  const r = suggestBolus({ carbs: 0, bg: 300, slot: 'midi', settings });
  assert.ok(r.warnings.some((w) => w.includes('cétones')));
});

test('arrondi', () => {
  assert.equal(roundToStep(4.24, 0.5), 4);
  assert.equal(roundToStep(4.26, 0.5), 4.5);
  assert.equal(roundToStep(4.26, 1), 4);
});

test('conversion mg/dL ↔ mmol/L', () => {
  assert.equal(toDisplay(180, 'mmol'), 10);
  assert.equal(fromDisplay(5.5, 'mmol'), 99);
  assert.equal(toDisplay(123, 'mgdl'), 123);
});

test('statistiques glycémiques', () => {
  const s = glucoseStats([50, 65, 100, 120, 150, 200, 300]);
  assert.equal(s.n, 7);
  assert.equal(s.veryLow, 14.3);
  assert.equal(s.low, 14.3);
  assert.equal(s.inRange, 42.9);
  assert.equal(s.high, 14.3);
  assert.equal(s.veryHigh, 14.3);
  // GMI pour une moyenne de 154 mg/dL ≈ 7,0 %
  assert.equal(glucoseStats([154]).gmi, 7);
});

test('moment de la journée', () => {
  const at = (h) => new Date(2026, 0, 1, h, 0).getTime();
  assert.equal(slotFor(at(7)), 'matin');
  assert.equal(slotFor(at(12)), 'midi');
  assert.equal(slotFor(at(16)), 'gouter');
  assert.equal(slotFor(at(20)), 'soir');
  assert.equal(slotFor(at(2)), 'nuit');
});

test('profil horaire', () => {
  const day = new Date(2026, 0, 1, 8).getTime();
  const p = hourlyProfile([{ ts: day, value: 100 }, { ts: day + 6e4, value: 140 }]);
  assert.equal(p[8].median, 120);
  assert.equal(p[9].n, 0);
});

test('recherche d’aliments sans accents', () => {
  assert.ok(searchFoods('pates').some((f) => f.name.startsWith('Pâtes')));
  assert.ok(searchFoods('oeuf').some((f) => f.name === 'Œuf'));
  for (const f of FOODS) {
    assert.ok(f.carbsPer100 >= 0 && f.carbsPer100 <= 100, f.name);
    assert.ok(f.portionGrams > 0, f.name);
  }
});
