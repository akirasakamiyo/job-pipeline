/* =====================================================================
   pages/practice-tool.js — Workspace satu latihan (V4)
   ---------------------------------------------------------------------
   practice-tool.html?id=<id katalog>. Merender blok materi yang SAMA
   (lesson-renderer) atau Email Subject Generator, sehingga skor/XP/status
   tercatat di state yang sama dengan latihan di dalam materi (XP sekali).
   Navigasi: kembali ke Practice Center · latihan sebelumnya/berikutnya ·
   buka bagian materinya di lesson player.
   ===================================================================== */

import { $, h, icon } from '../core/dom.js';
import { loadJSON } from '../core/data.js';
import * as state from '../core/state.js';
import { renderBlocks } from '../features/lesson-renderer.js';
import { PRACTICE_ITEMS, findPractice, findBlock } from '../features/practice-catalog.js';
import { renderSubjectGenerator } from '../features/subject-generator.js';

const STATE_LABEL = { done: 'Selesai', tried: 'Dicoba', todo: 'Belum', free: 'Latihan bebas' };

export async function init() {
  const host = $('[data-practice-tool]');
  const id = new URLSearchParams(window.location.search).get('id');
  const item = findPractice(id);
  if (!item) {
    document.title = 'Latihan tidak ditemukan · The Ultimate Job Application Pipeline';
    host.replaceChildren(h('div', { class: 'empty-state', style: { marginTop: '48px' } },
      h('span', { class: 'empty-state__icon' }, icon('dumbbell')),
      h('h1', { class: 'h3' }, 'Latihan tidak ditemukan'),
      h('p', {}, 'Tautan latihan ini tidak valid. Pilih latihan dari Practice Center.'),
      h('a', { class: 'btn btn--primary', href: 'practice.html' }, 'Buka Practice Center')));
    return;
  }

  const s = state.getSummary();
  const mod = s.modules.find((m) => m.id === item.module);
  document.title = `${item.title} · Practice Center`;
  document.body.dataset.module = item.module;

  const workspace = h('div', { class: 'tool-workspace__body' }, h('div', { class: 'skeleton skeleton--block', 'aria-busy': 'true', 'aria-label': 'Memuat latihan' }));
  const status = h('span', { class: 'chip' });
  const index = PRACTICE_ITEMS.indexOf(PRACTICE_ITEMS.find((x) => x.id === item.id));
  const prev = PRACTICE_ITEMS[index - 1];
  const next = PRACTICE_ITEMS[index + 1];
  const lessonHref = item.source.section ? `module.html?id=${item.module}#${item.source.section}` : null;
  const lessonTitle = item.source.section ? mod?.lessons.find((l) => l.id === item.source.section)?.title : null;

  host.replaceChildren(
    h('nav', { class: 'md-crumbs', 'aria-label': 'Navigasi' }, h('a', { class: 'back-link', href: 'practice.html' }, icon('arrow-left'), 'Practice Center')),
    h('header', { class: 'tool-head' },
      h('span', { class: 'practice-card__icon tool-head__icon' }, icon(item.icon)),
      h('div', { class: 'tool-head__copy' },
        h('p', { class: 'eyebrow' }, h('span', { class: 'code' }, mod?.code || ''), ` ${item.group}`),
        h('h1', { class: 'h2 tool-head__title' }, item.title),
        h('p', { class: 'text-soft' }, item.desc)),
      h('div', { class: 'tool-head__side' }, status,
        lessonHref ? h('a', { class: 'btn btn--ghost btn--sm', href: lessonHref }, icon('book-open', 'icon--lead'), 'Buka di materi', lessonTitle ? h('span', { class: 'sr-only' }, `: ${lessonTitle}`) : null) : null)),
    h('section', { class: 'card tool-workspace', 'aria-label': `Workspace ${item.title}` }, workspace),
    h('nav', { class: 'tool-pager', 'aria-label': 'Latihan lain' },
      prev ? h('a', { class: 'btn btn--ghost', href: `practice-tool.html?id=${prev.id}` }, icon('arrow-left', 'icon--lead'), h('span', {}, h('span', { class: 'tool-pager__hint' }, 'Sebelumnya'), prev.title)) : h('span'),
      next ? h('a', { class: 'btn btn--ghost tool-pager__next', href: `practice-tool.html?id=${next.id}` }, h('span', {}, h('span', { class: 'tool-pager__hint' }, 'Berikutnya'), next.title), icon('arrow-right', 'icon--trail')) : h('span')));

  const updateStatus = (sum) => {
    const st = item.status(sum);
    status.className = `chip practice-chip practice-chip--${st.state}`;
    status.replaceChildren(st.state === 'done' ? icon('check') : '', st.text);
  };
  updateStatus(s);
  state.subscribe(updateStatus);

  try {
    if (item.source.generator) {
      workspace.replaceChildren(renderSubjectGenerator());
      return;
    }
    const content = await loadJSON(`content/${item.module}`);
    const block = findBlock(content, item.source);
    if (!block) throw new Error(`Blok ${item.id} tidak ditemukan`);
    workspace.replaceChildren(renderBlocks([block], { moduleId: item.module, content, references: [], userName: state.getState().user.name, practice: true }));
  } catch (error) {
    console.error(error);
    workspace.replaceChildren(h('div', { class: 'empty-state' }, h('p', { class: 'empty-state__title' }, 'Latihan gagal dimuat'), h('p', {}, 'Muat ulang halaman. Pastikan situs dibuka lewat server (bukan file://).')));
  }
}
