/* =====================================================================
   pages/modules.js — Halaman "Learning Modules"
   Daftar 5 modul (kartu yang sama dengan Dashboard) + filter status.
   ===================================================================== */

import { $, $$ } from '../core/dom.js';
import * as state from '../core/state.js';
import * as motion from '../core/motion.js';
import { moduleCard } from '../features/module-card.js';

const LABELS = { all: 'semua', progress: 'sedang dipelajari', done: 'selesai', todo: 'belum mulai' };
let activeFilter = 'all';

export function init() {
  render(state.getSummary(), true);
  $$('[data-filter]').forEach((btn) => btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    $$('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    applyFilter(true);
  }));
  state.subscribe((summary) => render(summary, false));
}

function render(s, first) {
  $('[data-modules-summary]').textContent =
    `${s.completed} selesai · ${s.inProgress} sedang dipelajari · ${s.notStarted} belum mulai`;
  const recommendedId = s.current?.status === 'todo' ? s.current.id : null;
  const grid = $('[data-modules-grid]');
  grid.replaceChildren(...s.modules.map((m) => moduleCard(m, { recommended: m.id === recommendedId, headingLevel: 'h2' })));
  if (!first) $$('[data-progress]', grid).forEach((bar) => bar.style.setProperty('--value', bar.dataset.progress));
  applyFilter(false);
}

function applyFilter(animate) {
  const cards = $$('[data-modules-grid] .module-card');
  const shown = cards.filter((card) => {
    const visible = activeFilter === 'all' || card.dataset.status === activeFilter;
    card.hidden = !visible;
    return visible;
  });
  $('[data-filter-status]').textContent = `Menampilkan ${shown.length} modul (${LABELS[activeFilter]}).`;
  $('[data-filter-empty]').hidden = shown.length > 0;
  if (animate && !motion.isReduced()) {
    window.gsap.fromTo(shown, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, clearProps: 'transform,opacity' });
  }
}
