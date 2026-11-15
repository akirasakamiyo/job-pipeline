/* =====================================================================
   features/module-card.js — Render kartu modul dari data ringkasan
   ---------------------------------------------------------------------
   Memakai komponen .module-card dari design system (components.css).
   Dipakai di Dashboard dan halaman Modul, agar tampilannya identik.
   ===================================================================== */

import { h, icon } from '../core/dom.js';

const STATUS = {
  done: { label: 'Selesai', chip: 'chip--done', icon: 'check', cta: 'Ulas kembali', btn: 'btn--secondary' },
  progress: { label: 'Sedang dipelajari', chip: 'chip--progress', icon: null, cta: 'Lanjutkan', btn: 'btn--primary' },
  ready: { label: 'Siap ditandai selesai', chip: 'chip--warn', icon: 'star', cta: 'Tandai selesai', btn: 'btn--primary' },
  todo: { label: 'Belum mulai', chip: '', icon: null, cta: 'Mulai modul', btn: 'btn--secondary' },
};

/**
 * @param {object} mod        satu item dari state.getSummary().modules
 * @param {object} options    { recommended: boolean, headingLevel: 'h3' }
 */
export function moduleCard(mod, { recommended = false, headingLevel = 'h3' } = {}) {
  const s = mod.readyToComplete ? STATUS.ready : STATUS[mod.status];
  const titleId = `mod-title-${mod.id}`;
  const isPrimary = mod.status === 'progress' || recommended;

  const chip = recommended && mod.status === 'todo'
    ? h('span', { class: 'chip chip--warn' }, icon('star'), 'Disarankan')
    : h('span', { class: `chip ${s.chip}` }, s.icon ? icon(s.icon) : null, s.label);

  return h('article', {
    class: 'card card--interactive module-card',
    'data-module': mod.id,
    'data-status': mod.status,
    'data-tilt': true,
    'aria-labelledby': titleId,
  },
  h('span', { class: 'module-card__line', 'aria-hidden': 'true' }),
  h('div', { class: 'module-card__head' }, h('span', { class: 'code' }, mod.code), chip),
  h('div', { class: 'module-card__art' }, h('img', { src: mod.illustration, alt: '', width: 400, height: 300, loading: 'lazy', decoding: 'async' })),
  h('div', { class: 'stack', style: { '--stack-gap': '6px' } },
    h('span', { class: 'module-card__num' }, `MODUL ${String(mod.number).padStart(2, '0')} · ${mod.tagline.toUpperCase()}`),
    h(headingLevel, { class: 'module-card__title', id: titleId }, mod.title),
    h('p', { class: 'module-card__desc' }, mod.description)),
  h('div', { class: 'module-card__meta' },
    h('span', {}, icon('book'), `${mod.lessonsDone}/${mod.lessonsTotal} bagian`),
    h('span', {}, icon('clock'), mod.status === 'done' ? `${mod.minutes} menit` : `±${mod.minutesLeft || mod.minutes} menit lagi`),
    mod.quizBest !== null ? h('span', {}, icon('target'), `Kuis ${mod.quizBest}`) : null),
  h('div', { class: 'module-card__foot' },
    h('div', {
      class: `bar${mod.status === 'progress' ? ' bar--live' : ''}`,
      'data-progress': mod.pct,
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(mod.pct),
      'aria-label': `Progres modul ${mod.number}`,
    }, h('span', { class: 'bar__fill' })),
    h('span', { class: 'module-card__pct' }, `${mod.pct}%`)),
  h('a', {
    class: `btn ${isPrimary ? 'btn--primary' : s.btn} btn--block`,
    href: mod.readyToComplete ? `${mod.href}#selesai` : mod.href,
    'aria-describedby': titleId,
  }, s.cta, icon('arrow-right', 'icon--trail')));
}
