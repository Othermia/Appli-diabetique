// Calculs purs (sans accès au DOM) : conversions, insuline active, bolus, statistiques.
// Toutes les glycémies sont stockées en mg/dL ; la conversion se fait à l'affichage.

export const MMOL_FACTOR = 18.0182;

export function toDisplay(mgdl, unit) {
  if (mgdl == null || Number.isNaN(mgdl)) return null;
  return unit === 'mmol' ? Math.round((mgdl / MMOL_FACTOR) * 10) / 10 : Math.round(mgdl);
}

export function fromDisplay(value, unit) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  return unit === 'mmol' ? Math.round(v * MMOL_FACTOR) : Math.round(v);
}

export function formatBG(mgdl, unit) {
  const v = toDisplay(mgdl, unit);
  if (v == null) return '—';
  return unit === 'mmol' ? v.toFixed(1).replace('.', ',') : String(v);
}

export function unitLabel(unit) {
  return unit === 'mmol' ? 'mmol/L' : 'mg/dL';
}

// Moments de la journée utilisés pour les ratios insuline/glucides.
export const SLOTS = [
  { id: 'matin', label: 'Petit-déjeuner', from: 5, to: 11 },
  { id: 'midi', label: 'Déjeuner', from: 11, to: 15 },
  { id: 'gouter', label: 'Goûter', from: 15, to: 18 },
  { id: 'soir', label: 'Dîner', from: 18, to: 23 },
  { id: 'nuit', label: 'Nuit', from: 23, to: 5 },
];

export function slotFor(date) {
  const h = new Date(date).getHours();
  for (const s of SLOTS) {
    if (s.from < s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to) return s.id;
  }
  return 'midi';
}

/**
 * Fraction d'insuline rapide encore active `minutes` après l'injection.
 * Modèle exponentiel (utilisé par OpenAPS / Loop), pic d'action `peak` minutes,
 * durée totale d'action `duration` minutes.
 */
export function iobFraction(minutes, duration = 240, peak = 75) {
  if (minutes <= 0) return 1;
  if (minutes >= duration) return 0;
  const td = duration;
  const tp = Math.min(peak, td / 2 - 1);
  const tau = (tp * (1 - tp / td)) / (1 - (2 * tp) / td);
  const a = (2 * tau) / td;
  const S = 1 / (1 - a + (1 + a) * Math.exp(-td / tau));
  const t = minutes;
  const f = 1 - S * (1 - a) * ((t * t / (tau * td * (1 - a)) - t / tau - 1) * Math.exp(-t / tau) + 1);
  return Math.max(0, Math.min(1, f));
}

/** Insuline active (U) à l'instant `now` à partir des injections d'insuline rapide. */
export function insulinOnBoard(doses, now, durationHours = 4, peakMinutes = 75) {
  const duration = durationHours * 60;
  let total = 0;
  for (const d of doses) {
    if (d.kind !== 'rapide') continue;
    const minutes = (now - d.ts) / 60000;
    if (minutes < 0 || minutes >= duration) continue;
    total += d.units * iobFraction(minutes, duration, peakMinutes);
  }
  return Math.round(total * 100) / 100;
}

export function roundToStep(value, step) {
  if (!step || step <= 0) return value;
  return Math.round(value / step) * step;
}

/**
 * Suggestion de bolus. Retourne le détail du calcul pour que la personne
 * puisse le vérifier. Les paramètres DOIVENT venir de son équipe médicale.
 *
 * settings : { ratios: {slot: g/U}, isf (mg/dL par U), target (mg/dL),
 *              hypo (mg/dL), doseStep (U) }
 */
export function suggestBolus({ carbs = 0, bg = null, iob = 0, slot = 'midi', activityReduction = 0, settings }) {
  const ratio = Number(settings.ratios?.[slot]) || Number(settings.ratios?.midi) || 0;
  const isf = Number(settings.isf) || 0;
  const target = Number(settings.target) || 110;
  const warnings = [];

  if (!ratio || !isf) {
    return { ok: false, reason: 'parametres', warnings: ['Renseignez vos ratios et votre sensibilité dans les Réglages.'] };
  }

  if (bg != null && bg < (settings.hypo || 70)) {
    return {
      ok: false,
      reason: 'hypo',
      warnings: ["Glycémie basse : traitez d'abord l'hypoglycémie (15 g de sucre rapide), ne faites pas de bolus maintenant."],
    };
  }

  const meal = carbs > 0 ? carbs / ratio : 0;
  let correction = 0;
  let correctionRaw = 0;
  if (bg != null) {
    correctionRaw = (bg - target) / isf;
    if (correctionRaw > 0) {
      // L'insuline encore active est déduite de la correction seulement.
      correction = Math.max(0, correctionRaw - iob);
    } else {
      // Glycémie sous la cible : on réduit le bolus repas.
      correction = correctionRaw;
    }
  } else if (iob > 0) {
    warnings.push('Sans glycémie, la correction et l\'insuline active ne sont pas prises en compte.');
  }

  let total = Math.max(0, meal + correction);
  const reductionPct = Math.max(0, Math.min(100, Number(activityReduction) || 0));
  if (reductionPct > 0) total = total * (1 - reductionPct / 100);

  const rounded = Math.max(0, roundToStep(total, settings.doseStep || 0.5));

  if (bg != null && bg > 250) {
    warnings.push('Glycémie > 250 mg/dL : pensez à contrôler les cétones.');
  }
  if (rounded > (settings.maxBolus || 20)) {
    warnings.push('Dose inhabituellement élevée : vérifiez les glucides saisis.');
  }

  return {
    ok: true,
    ratio,
    meal: round2(meal),
    correctionRaw: round2(correctionRaw),
    correction: round2(correction),
    iob: round2(iob),
    reductionPct,
    total: round2(total),
    rounded,
    warnings,
  };
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

// ---------- Statistiques ----------

export const RANGES = {
  veryLow: 54,
  low: 70,
  high: 180,
  veryHigh: 250,
};

export function glucoseStats(values) {
  const n = values.length;
  if (!n) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : 0;
  const count = (fn) => values.filter(fn).length;
  const pct = (c) => Math.round((c / n) * 1000) / 10;
  return {
    n,
    mean: Math.round(mean),
    sd: Math.round(sd),
    cv: mean ? Math.round((sd / mean) * 1000) / 10 : 0,
    min: Math.min(...values),
    max: Math.max(...values),
    // Glucose Management Indicator (HbA1c estimée), Bergenstal 2018
    gmi: Math.round((3.31 + 0.02392 * mean) * 10) / 10,
    veryLow: pct(count((v) => v < RANGES.veryLow)),
    low: pct(count((v) => v >= RANGES.veryLow && v < RANGES.low)),
    inRange: pct(count((v) => v >= RANGES.low && v <= RANGES.high)),
    high: pct(count((v) => v > RANGES.high && v <= RANGES.veryHigh)),
    veryHigh: pct(count((v) => v > RANGES.veryHigh)),
  };
}

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Profil glycémique par heure (médiane, 25e et 75e percentiles). */
export function hourlyProfile(readings) {
  const buckets = Array.from({ length: 24 }, () => []);
  for (const r of readings) buckets[new Date(r.ts).getHours()].push(r.value);
  return buckets.map((b, hour) => {
    const s = [...b].sort((x, y) => x - y);
    return { hour, n: s.length, p25: percentile(s, 0.25), median: percentile(s, 0.5), p75: percentile(s, 0.75) };
  });
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function sumBy(items, fn) {
  return items.reduce((a, i) => a + (Number(fn(i)) || 0), 0);
}
