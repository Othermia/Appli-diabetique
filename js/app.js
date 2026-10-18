// Point d'entrée : navigation entre les écrans, écran de bienvenue, service worker.

import { h, state, clear, applyTextSize } from './ui.js';
import { onChange, requestPersistence } from './db.js';
import { renderHome } from './home.js';
import { renderMealPage } from './meal.js';
import { renderJournal } from './journal.js';
import { renderStats } from './stats.js';
import { renderSettings } from './settings.js';
import { startReminderLoop } from './reminders.js';

const ROUTES = {
  accueil: renderHome,
  repas: renderMealPage,
  journal: renderJournal,
  stats: renderStats,
  reglages: (root) => renderSettings(root, { onboarding: !state.settings.configured }),
};

const main = document.getElementById('main');
let current = null;

function route() {
  let name = location.hash.replace('#', '') || 'accueil';
  if (!state.settings.configured && name !== 'reglages') {
    renderWelcome();
    current = 'bienvenue';
    updateNav(null);
    return;
  }
  if (!ROUTES[name]) name = 'accueil';
  current = name;
  updateNav(name);
  main.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
  ROUTES[name](main);
}

function updateNav(name) {
  document.querySelectorAll('.nav a').forEach((a) => {
    const on = a.getAttribute('href') === '#' + name;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function renderWelcome() {
  clear(main);
  main.append(
    h('section', { class: 'welcome' },
      h('img', { src: 'icons/icon.svg', alt: '', class: 'welcome-logo' }),
      h('h1', null, 'Bienvenue sur GlucoSuivi'),
      h('p', { class: 'lead' }, 'Votre carnet de diabète de type 1, simple et au quotidien.'),
      h('ul', { class: 'features' },
        h('li', null, '📷 Photographiez votre assiette : les glucides sont estimés automatiquement'),
        h('li', null, '💉 Calcul de la dose d\'insuline selon vos ratios'),
        h('li', null, '🩸 Carnet de glycémies, insuline, activité'),
        h('li', null, '🍬 Aide pas à pas en cas d\'hypoglycémie'),
        h('li', null, '📊 Statistiques et rapport pour le diabétologue'),
        h('li', null, '🔒 Vos données restent sur votre téléphone')
      ),
      h('div', { class: 'alert info' }, 'Pour commencer, munissez-vous de vos ratios insuline/glucides et de votre sensibilité (indiqués par votre diabétologue).'),
      h('a', { class: 'btn primary block big', href: '#reglages' }, 'Commencer')
    )
  );
}

onChange(() => {
  // Rafraîchit l'écran courant quand le journal change (sauf l'écran repas en cours d'édition).
  if (current && current !== 'repas' && current !== 'reglages' && current !== 'bienvenue') ROUTES[current](main);
});

window.addEventListener('hashchange', route);
applyTextSize();
route();
startReminderLoop();
requestPersistence();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
