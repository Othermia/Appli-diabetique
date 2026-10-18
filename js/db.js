// Stockage local : IndexedDB pour le journal et les favoris, localStorage pour les réglages.
// Rien ne quitte le téléphone, sauf la photo envoyée pour analyse si l'IA est activée.

const DB_NAME = 'glucosuivi';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) {
        const store = db.createObjectStore('entries', { keyPath: 'id' });
        store.createIndex('ts', 'ts');
        store.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains('favorites')) {
        db.createObjectStore('favorites', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        let result;
        Promise.resolve(fn(store)).then((r) => (result = r));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function addEntry(entry) {
  const e = { id: uid(), ts: Date.now(), ...entry };
  await tx('entries', 'readwrite', (s) => s.put(e));
  notifyChange();
  return e;
}

export async function updateEntry(entry) {
  await tx('entries', 'readwrite', (s) => s.put(entry));
  notifyChange();
  return entry;
}

export async function deleteEntry(id) {
  await tx('entries', 'readwrite', (s) => s.delete(id));
  notifyChange();
}

export async function getEntry(id) {
  return tx('entries', 'readonly', (s) => reqP(s.get(id)));
}

/** Entrées entre `from` et `to` (timestamps), triées de la plus récente à la plus ancienne. */
export async function getEntries({ from = 0, to = Date.now() + 864e5, type = null } = {}) {
  const all = await tx('entries', 'readonly', (s) => reqP(s.index('ts').getAll(IDBKeyRange.bound(from, to))));
  return all.filter((e) => !type || e.type === type).sort((a, b) => b.ts - a.ts);
}

export async function getAllEntries() {
  return tx('entries', 'readonly', (s) => reqP(s.getAll()));
}

export async function clearEntries() {
  await tx('entries', 'readwrite', (s) => s.clear());
  notifyChange();
}

export async function getFavorites() {
  const all = await tx('favorites', 'readonly', (s) => reqP(s.getAll()));
  return all.sort((a, b) => (b.used || 0) - (a.used || 0));
}

export async function saveFavorite(fav) {
  const f = { id: fav.id || uid(), used: 0, ...fav };
  await tx('favorites', 'readwrite', (s) => s.put(f));
  return f;
}

export async function deleteFavorite(id) {
  await tx('favorites', 'readwrite', (s) => s.delete(id));
}

export async function importData({ entries = [], favorites = [] }, { replace = false } = {}) {
  if (replace) await clearEntries();
  await tx('entries', 'readwrite', (s) => entries.forEach((e) => s.put(e)));
  await tx('favorites', 'readwrite', (s) => favorites.forEach((f) => s.put(f)));
  notifyChange();
}

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyChange() {
  listeners.forEach((fn) => fn());
}

// ---------- Réglages ----------

export const DEFAULT_SETTINGS = {
  configured: false,
  name: '',
  unit: 'mgdl',
  target: 110, // mg/dL, cible pour les corrections
  low: 70, // bornes de la plage cible (affichage, statistiques)
  high: 180,
  hypo: 70,
  ratios: { matin: 10, midi: 10, gouter: 10, soir: 10, nuit: 10 }, // g de glucides couverts par 1 U
  isf: 50, // mg/dL de baisse pour 1 U
  insulinDuration: 4, // heures
  insulinPeak: 75, // minutes
  doseStep: 0.5,
  maxBolus: 20,
  rapidName: 'Insuline rapide',
  basalName: 'Insuline lente',
  basalDose: '',
  apiKey: '',
  aiModel: 'claude-opus-5-5',
  postMealReminder: true,
  postMealDelay: 120, // minutes
  reminders: [],
  textSize: 'normal',
};

const SETTINGS_KEY = 'glucosuivi.settings';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const saved = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_SETTINGS), ...saved, ratios: { ...DEFAULT_SETTINGS.ratios, ...(saved.ratios || {}) } };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // stockage indisponible (navigation privée) : on continue sans persister
  }
}

/** Demande au navigateur de ne pas effacer les données en cas de manque d'espace. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* sans importance */
  }
}
