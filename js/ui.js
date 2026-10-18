// Petits utilitaires d'interface partagés par les écrans.

import { loadSettings, saveSettings } from './db.js';

export const state = {
  settings: loadSettings(),
};

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  saveSettings(state.settings);
  applyTextSize();
}

export function applyTextSize() {
  document.documentElement.dataset.textSize = state.settings.textSize || 'normal';
}

/** Création d'éléments : h('div', {class: 'x', onclick}, enfant1, 'texte', ...) */
export function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k in node && typeof v !== 'string') node[k] = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(node, c);
    else node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Comme node.append, mais ignore null/false (sinon le navigateur écrit « null »). */
export function add(node, ...children) {
  append(node, children);
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

let toastTimer = null;
export function toast(message, kind = 'info') {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3200);
}

/** Fenêtre modale. Renvoie une fonction de fermeture. */
export function modal(title, content, { onClose, wide = false } = {}) {
  const root = document.getElementById('modal-root');
  const close = () => {
    overlay.remove();
    document.body.classList.remove('modal-open');
    onClose?.();
  };
  const overlay = h(
    'div',
    { class: 'overlay', onclick: (e) => e.target === overlay && close() },
    h(
      'div',
      { class: 'sheet' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-head' }, h('h2', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Fermer', onclick: close }, '✕')),
      h('div', { class: 'sheet-body' }, content)
    )
  );
  root.appendChild(overlay);
  document.body.classList.add('modal-open');
  return close;
}

export function confirmDialog(message, { ok = 'Confirmer', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const close = modal(
      'Confirmation',
      h(
        'div',
        null,
        h('p', null, message),
        h(
          'div',
          { class: 'row gap' },
          h('button', { class: 'btn ghost', onclick: () => { answered = true; close(); resolve(false); } }, 'Annuler'),
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { answered = true; close(); resolve(true); } }, ok)
        )
      ),
      { onClose: () => !answered && resolve(false) }
    );
  });
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(ts, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Date(ts).toLocaleDateString('fr-FR', opts);
}

export function fmtNum(v, digits = 1) {
  if (v == null || Number.isNaN(v)) return '—';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return String(r).replace('.', ',');
}

export function parseNum(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Valeur pour un <input type="datetime-local"> */
export function toLocalInput(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(v) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'label' }, label), input, hint ? h('small', { class: 'hint' }, hint) : null);
}

export function numInput(attrs = {}) {
  return h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', ...attrs });
}

export function chips(options, value, onChange) {
  const wrap = h('div', { class: 'chips', role: 'radiogroup' });
  const render = (current) => {
    clear(wrap);
    for (const o of options) {
      const opt = typeof o === 'string' ? { value: o, label: o } : o;
      wrap.appendChild(
        h(
          'button',
          {
            type: 'button',
            class: 'chip' + (opt.value === current ? ' on' : ''),
            role: 'radio',
            'aria-checked': String(opt.value === current),
            onclick: () => {
              render(opt.value);
              onChange(opt.value);
            },
          },
          opt.label
        )
      );
    }
  };
  render(value);
  return wrap;
}

export function download(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
