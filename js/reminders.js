// Rappels : notifications tant que l'application est ouverte, et export vers
// l'agenda du téléphone (fichier .ics) pour des alarmes fiables même appli fermée.

import { state, toast } from './ui.js';

const PENDING_KEY = 'glucosuivi.pending';
const FIRED_KEY = 'glucosuivi.fired';

export async function askNotificationPermission() {
  if (!('Notification' in window)) {
    toast("Les notifications ne sont pas disponibles ici. Utilisez l'export vers l'agenda.", 'warn');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  const p = await Notification.requestPermission();
  return p === 'granted';
}

export async function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: title });
      else new Notification(title, { body });
      return;
    }
  } catch {
    /* repli sur le message dans l'application */
  }
  toast(`${title} — ${body}`, 'warn');
}

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible */
  }
}

/** Programme un rappel ponctuel (ex. contrôle 2 h après le repas). */
export function scheduleOnce(at, title, body) {
  const list = readJSON(PENDING_KEY, []);
  list.push({ at, title, body });
  writeJSON(PENDING_KEY, list);
}

export function pendingOnce() {
  return readJSON(PENDING_KEY, []).filter((p) => p.at > Date.now());
}

function check() {
  const now = Date.now();
  // Rappels ponctuels
  const pending = readJSON(PENDING_KEY, []);
  const due = pending.filter((p) => p.at <= now);
  if (due.length) {
    // On ignore les rappels manqués depuis plus d'une heure
    due.filter((p) => now - p.at < 36e5).forEach((p) => notify(p.title, p.body));
    writeJSON(PENDING_KEY, pending.filter((p) => p.at > now));
  }
  // Rappels quotidiens
  const fired = readJSON(FIRED_KEY, {});
  const today = new Date().toDateString();
  const d = new Date();
  const hm = d.getHours() * 60 + d.getMinutes();
  for (const r of state.settings.reminders || []) {
    if (!r.enabled) continue;
    const [hh, mm] = r.time.split(':').map(Number);
    const t = hh * 60 + mm;
    const key = r.id + '|' + today;
    if (hm >= t && hm - t < 30 && !fired[key]) {
      fired[key] = true;
      notify('Rappel', r.label);
    }
  }
  // Nettoyage des anciennes clés
  for (const k of Object.keys(fired)) if (!k.endsWith(today)) delete fired[k];
  writeJSON(FIRED_KEY, fired);
}

export function startReminderLoop() {
  check();
  setInterval(check, 30000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
}

/** Fichier agenda avec les rappels quotidiens et une alarme à l'heure dite. */
export function remindersToICS(reminders) {
  const p = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}00Z`;
  const day = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GlucoSuivi//FR', 'CALSCALE:GREGORIAN'];
  for (const r of reminders.filter((r) => r.enabled)) {
    const [hh, mm] = r.time.split(':');
    const label = r.label.replace(/[,;\\]/g, (c) => '\\' + c);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@glucosuivi`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${day}T${p(hh)}${p(mm)}00`,
      'DURATION:PT5M',
      'RRULE:FREQ=DAILY',
      `SUMMARY:${label}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${label}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
