/* =====================================================================
   pages/practice.js — Practice Center (V4: direktori latihan)
   ---------------------------------------------------------------------
   Satu halaman = satu fungsi: DAFTAR latihan per modul (tab). Setiap
   kartu membuka workspace sendiri (practice-tool.html?id=…). Daftar
   berasal dari features/practice-catalog.js; status dihitung dari data
   nyata (aktivitas bernilai, lembar kerja, checklist, simulator, dan
   latihan bebas yang pernah diselesaikan). Kuis & Evaluasi Akhir ada di
   halaman Evaluation (latihan dan evaluasi formal dipisah).
   ===================================================================== */

import { $, h, icon } from '../core/dom.js';
import { initTabs } from '../core/ui.js';
import * as state from '../core/state.js';
import { PRACTICE_GROUPS, PRACTICE_ITEMS } from '../features/practice-catalog.js';

const STATE_LABEL = { done: 'Selesai', tried: 'Dicoba', todo: 'Belum', free: 'Latihan bebas' };

export function init() {
  const s = state.getSummary();
  const tablist = $('[data-practice-tablist]');
  const panels = $('[data-practice-panels]');
  PRACTICE_GROUPS.forEach((g, i) => {
    const mod = s.modules.find((m) => m.id === g.module);
    tablist.append(h('button', { type: 'button', role: 'tab', class: 'tabs__tab', id: `tab-${g.module}`, 'aria-controls': `panel-${g.module}`, 'aria-selected': String(i === 0), tabindex: i === 0 ? null : '-1', 'data-module': g.module },
      h('span', { class: 'code' }, mod?.code || g.module.toUpperCase()), ' ', h('span', { class: 'practice-tab__label' }, g.title.replace(' Practice', '')), h('span', { class: 'practice-tab__count', 'data-tab-count': g.module })));
    panels.append(h('section', { class: 'tabs__panel', role: 'tabpanel', id: `panel-${g.module}`, 'aria-labelledby': `tab-${g.module}`, tabindex: '0', hidden: i !== 0, 'data-module': g.module },
      h('div', { class: 'practice-panel__head' },
        h('h2', { class: 'h4' }, g.title),
        mod ? h('a', { class: 'link-more', href: mod.href }, `Materi Modul ${String(mod.number).padStart(2, '0')}`, icon('arrow-right', 'icon--sm')) : null),
      h('ul', { class: 'practice-grid', role: 'list', 'data-practice-grid': g.module })));
  });
  render(s);
  initTabs($('[data-tabs]'), { storageKey: 'practice-tab' });
  state.subscribe((summary) => render(summary));
}

function render(s) {
  const done = PRACTICE_ITEMS.filter((item) => item.status(s).state === 'done').length;
  $('[data-practice-summary]').textContent = `${done} dari ${PRACTICE_ITEMS.length} latihan selesai · ${s.activitiesPassed}/${s.activitiesTotal} aktivitas bernilai lulus.`;
  PRACTICE_GROUPS.forEach((g) => {
    const items = g.items;
    $(`[data-tab-count="${g.module}"]`).textContent = `${items.filter((it) => it.status(s).state === 'done').length}/${items.length}`;
    $(`[data-practice-grid="${g.module}"]`).replaceChildren(...items.map((item) => {
      const st = item.status(s);
      const titleId = `pr-${item.id}`;
      return h('li', { class: `practice-card is-${st.state}`, 'data-module': g.module },
        h('div', { class: 'practice-card__top' },
          h('span', { class: 'practice-card__icon' }, icon(item.icon)),
          h('span', { class: `chip practice-chip practice-chip--${st.state}` }, st.state === 'done' ? icon('check') : null, STATE_LABEL[st.state])),
        h('h3', { class: 'practice-card__title', id: titleId }, item.title),
        h('p', { class: 'practice-card__desc' }, item.desc),
        h('p', { class: 'practice-card__status' }, st.text),
        h('a', { class: `btn btn--sm ${st.state === 'done' ? 'btn--secondary' : 'btn--primary'} practice-card__cta`, href: `practice-tool.html?id=${item.id}`, 'aria-describedby': titleId },
          st.state === 'done' ? 'Ulangi' : st.state === 'tried' ? 'Lanjutkan' : 'Mulai', icon('arrow-right', 'icon--trail')));
    }));
  });
}
