// Assistant hypoglycémie : règle des 15 (15 g de sucre, 15 minutes, on recontrôle).

import { h, add, state, modal, toast, clear, numInput, parseNum } from './ui.js';
import { addEntry } from './db.js';
import { RESUCRAGE } from './foods.js';
import { formatBG, fromDisplay, unitLabel } from './calc.js';
import { notify } from './reminders.js';

let timer = null;

export function openHypoHelper(mg = null) {
  const s = state.settings;
  const body = h('div', { class: 'hypo' });
  let step = 1;
  let endsAt = null;

  const render = () => {
    clear(body);
    if (step === 1) {
      add(body, 
        mg != null ? h('p', { class: 'hypo-value' }, `Glycémie : ${formatBG(mg, s.unit)} ${unitLabel(s.unit)}`) : null,
        h('div', { class: 'alert danger' }, h('strong', null, 'Si la personne est inconsciente ou ne peut pas avaler : '), 'rien par la bouche, glucagon si prescrit, et appelez le 15 (ou 112).'),
        h('h3', null, '1. Prenez 15 g de sucre rapide'),
        h('ul', { class: 'big-list' }, RESUCRAGE.map((r) => h('li', null, r))),
        h('p', { class: 'hint' }, 'Évitez le chocolat et les biscuits : le gras ralentit la remontée.'),
        h('button', { class: 'btn primary block', onclick: startTimer }, "C'est fait : lancer le minuteur de 15 min"),
        s.emergencyPhone ? h('a', { class: 'btn ghost block', href: 'tel:' + s.emergencyPhone }, `📞 Appeler ${s.emergencyName || 'mon contact'}`) : null,
        h('a', { class: 'btn danger ghost block', href: 'tel:15' }, '📞 Appeler le SAMU (15)')
      );
    } else if (step === 2) {
      const left = Math.max(0, endsAt - Date.now());
      const mm = Math.floor(left / 60000);
      const ss = Math.floor((left % 60000) / 1000);
      add(body, 
        h('h3', null, '2. Patientez au repos'),
        h('div', { class: 'timer', 'aria-live': 'polite' }, `${mm}:${String(ss).padStart(2, '0')}`),
        h('p', null, 'Restez au repos, ne conduisez pas. Recontrôlez votre glycémie à la fin du minuteur.'),
        h('button', { class: 'btn ghost block', onclick: () => { endsAt = Date.now(); tick(); } }, 'Recontrôler maintenant')
      );
    } else {
      const v = numInput({ class: 'big-input', placeholder: s.unit === 'mmol' ? 'ex. 4,5' : 'ex. 85' });
      add(body, 
        h('h3', null, '3. Nouvelle glycémie'),
        h('label', { class: 'field' }, h('span', { class: 'label' }, `Glycémie (${unitLabel(s.unit)})`), v),
        h(
          'button',
          {
            class: 'btn primary block',
            onclick: async () => {
              const n = parseNum(v.value);
              if (n == null) return toast('Entrez la glycémie', 'error');
              const value = fromDisplay(n, s.unit);
              await addEntry({ type: 'glycemie', value, context: 'Malaise' });
              if (value < s.hypo) {
                mg = value;
                step = 1;
                toast('Encore bas : reprenez 15 g de sucre.', 'error');
                render();
              } else {
                clear(body);
                add(body, 
                  h('div', { class: 'alert success' }, 'Glycémie remontée 👍'),
                  h('p', null, 'Si le prochain repas est dans plus d\'une heure, prenez une collation avec des glucides lents (ex. une tranche de pain). Notez la cause possible (effort, repas sauté, dose…).'),
                  h('button', { class: 'btn primary block', onclick: () => close() }, 'Terminer')
                );
              }
            },
          },
          'Enregistrer'
        )
      );
      setTimeout(() => v.focus(), 50);
    }
  };

  async function startTimer() {
    await addEntry({ type: 'repas', name: 'Resucrage', carbs: 15, items: [{ name: 'Sucre rapide', grams: 15, carbs: 15 }], resucrage: true });
    endsAt = Date.now() + 15 * 60000;
    step = 2;
    clearInterval(timer);
    timer = setInterval(tick, 1000);
    render();
  }

  function tick() {
    if (Date.now() >= endsAt) {
      clearInterval(timer);
      step = 3;
      notify('Contrôle glycémie', 'Les 15 minutes sont passées : recontrôlez votre glycémie.');
      if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
      render();
    } else if (step === 2) {
      const t = body.querySelector('.timer');
      if (t) {
        const left = endsAt - Date.now();
        t.textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
      }
    }
  }

  render();
  const close = modal('🍬 Hypoglycémie', body, { onClose: () => clearInterval(timer) });
}
