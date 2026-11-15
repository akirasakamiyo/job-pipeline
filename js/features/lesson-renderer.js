/* =====================================================================
   features/lesson-renderer.js — Mengubah blok konten JSON menjadi DOM
   ---------------------------------------------------------------------
   Konten modul (data/content/<id>.json) ditulis sebagai daftar blok
   bertipe. Menambah/mengubah materi cukup lewat JSON, tanpa ubah JS.

   Tipe blok:
   objectives · p · h · list · callout · compare · steps · dodont · flags
   email · anatomy · flow · tree · stack · table · verify
   checklist · recall · classify · builder   (interaktif → exercises.js)
   2.0: research · practice (fakta riset vs saran praktis)
        scenario · match · order · spot · keywords · worksheet ·
        presend · review · tool          (interaktif → activities.js)
        simulator                        (→ simulator.js)

   Teks mendukung **tebal**. Semua teks dirender lewat textContent (aman).
   ===================================================================== */

import { h, icon } from '../core/dom.js';
import { renderChecklist, renderRecall, renderClassify, renderBuilder } from './exercises.js';
import { renderScenario, renderMatch, renderOrder, renderSpot, renderKeywords, renderWorksheet, renderPresend, renderReview, renderTool } from './activities.js';
import { renderSimulator } from './simulator.js';

/** "**tebal** biasa" → [<strong>, text] */
export function rich(text = '') {
  return String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) =>
    part.startsWith('**') && part.endsWith('**') ? h('strong', {}, part.slice(2, -2)) : part);
}

const CALLOUT_ICON = { tip: 'spark', info: 'info', warn: 'alert', key: 'star' };
const CALLOUT_LABEL = { tip: 'Tips', info: 'Info', warn: 'Perhatian', key: 'Poin kunci' };

const RENDERERS = {
  objectives: (b, ctx) => h('div', { class: 'objectives' },
    h('p', { class: 'eyebrow' }, 'Tujuan belajar'),
    h('ul', { class: 'outcomes', role: 'list' }, ctx.content.objectives.map((o) => h('li', {}, icon('target'), o)))),

  p: (b) => h('p', { class: 'learn-p' }, rich(b.text)),

  h: (b) => h('h3', { class: 'learn-h' }, b.text),

  list: (b) => h(b.ordered ? 'ol' : 'ul', { class: 'learn-list' }, b.items.map((item) => h('li', {}, rich(item)))),

  callout: (b) => h('aside', { class: `callout callout--${b.tone || 'info'}`, 'aria-label': CALLOUT_LABEL[b.tone] || 'Info' },
    h('span', { class: 'callout__icon' }, icon(CALLOUT_ICON[b.tone] || 'info')),
    h('div', {}, b.title ? h('p', { class: 'callout__title' }, b.title) : null, h('p', {}, rich(b.text)))),

  verify: (b) => h('aside', { class: 'callout callout--verify', 'aria-label': 'Perlu verifikasi' },
    h('span', { class: 'callout__icon' }, icon('search')),
    h('div', {},
      h('p', { class: 'callout__title' }, h('span', { class: 'verify-tag' }, 'Perlu verifikasi'), ' sebelum dipublikasikan'),
      h('p', {}, rich(b.text)))),

  // Fakta riset: temuan studi/buku + sumber + batasan interpretasi
  research: (b, ctx) => {
    const ref = (ctx.references || []).find((r) => r.id === b.source);
    return h('aside', { class: 'research', 'aria-label': 'Fakta riset' },
      h('p', { class: 'research__tag' }, icon('chart'), 'Fakta riset'),
      h('p', { class: 'research__text' }, rich(b.text)),
      b.caveat ? h('p', { class: 'research__caveat' }, h('strong', {}, 'Cara membacanya: '), b.caveat) : null,
      ref ? h('p', { class: 'research__source' }, 'Sumber: ', ref.citation, ref.verified ? null : h('span', { class: 'verify-tag' }, 'Perlu verifikasi')) : null);
  },

  // Saran praktis: praktik umum yang bisa berbeda antarperusahaan
  practice: (b) => h('aside', { class: 'callout callout--practice', 'aria-label': 'Saran praktis' },
    h('span', { class: 'callout__icon' }, icon('briefcase')),
    h('div', {}, h('p', { class: 'callout__title' }, h('span', { class: 'practice-tag' }, 'Saran praktis'), b.title ? ` ${b.title}` : ''), h('p', {}, rich(b.text)))),

  compare: (b) => h('div', { class: 'compare' }, b.items.map((item) =>
    h('div', { class: `compare__card compare__card--${item.tone || 'neutral'}` },
      h('p', { class: 'compare__label' },
        item.tone === 'good' ? icon('check') : item.tone === 'bad' ? icon('x') : icon('grid'),
        item.label),
      h('ul', { class: 'compare__lines', role: 'list' }, item.lines.map((line) => h('li', {}, rich(line))))))),

  steps: (b) => h('ol', { class: 'steps', role: 'list' }, b.items.map((item, i) =>
    h('li', { class: 'steps__item' },
      h('span', { class: 'steps__num', 'aria-hidden': 'true' }, String(i + 1)),
      h('div', {}, h('p', { class: 'steps__title' }, item.title), item.text ? h('p', { class: 'steps__text' }, rich(item.text)) : null)))),

  dodont: (b) => h('div', { class: 'dodont' },
    h('div', { class: 'dodont__col dodont__col--do' },
      h('p', { class: 'dodont__head' }, icon('check'), 'Lakukan'),
      h('ul', { role: 'list' }, b.do.map((t) => h('li', {}, rich(t))))),
    h('div', { class: 'dodont__col dodont__col--dont' },
      h('p', { class: 'dodont__head' }, icon('x'), 'Hindari'),
      h('ul', { role: 'list' }, b.dont.map((t) => h('li', {}, rich(t)))))),

  flags: (b) => h('div', { class: 'flags' },
    h('div', { class: 'flags__col flags__col--green' },
      h('p', { class: 'flags__head' }, h('span', { class: 'flags__flag', 'aria-hidden': 'true' }), 'Green flags'),
      h('ul', { role: 'list' }, b.green.map((t) => h('li', {}, rich(t))))),
    h('div', { class: 'flags__col flags__col--red' },
      h('p', { class: 'flags__head' }, h('span', { class: 'flags__flag', 'aria-hidden': 'true' }), 'Red flags'),
      h('ul', { role: 'list' }, b.red.map((t) => h('li', {}, rich(t)))))),

  email: (b) => renderEmail(b),

  anatomy: (b) => h('figure', { class: 'diagram diagram--anatomy' },
    b.title ? h('figcaption', { class: 'diagram__title' }, icon('eye'), b.title) : null,
    h('div', { class: 'anatomy__line' }, b.parts.map((part, i) =>
      h('span', { class: `anatomy__part${part.label ? '' : ' is-plain'}`, 'data-tone': i % 5 }, part.text))),
    h('ol', { class: 'anatomy__legend', role: 'list' }, b.parts.filter((p) => p.label).map((part) => {
      const i = b.parts.indexOf(part);
      return h('li', { 'data-tone': i % 5 },
        h('span', { class: 'anatomy__swatch', 'aria-hidden': 'true' }),
        h('span', {}, h('strong', {}, part.label), part.note ? ` — ${part.note}` : ''));
    }))),

  flow: (b) => h('figure', { class: 'diagram diagram--flow' },
    b.title ? h('figcaption', { class: 'diagram__title' }, icon('route'), b.title) : null,
    h('ol', { class: 'flow', role: 'list' }, b.steps.map((step, i) =>
      h('li', { class: 'flow__step', 'data-tone': i % 5 },
        h('span', { class: 'flow__num', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'flow__label' }, step.label),
        step.note ? h('span', { class: 'flow__note' }, step.note) : null)))),

  tree: (b) => h('figure', { class: 'diagram diagram--tree' },
    b.title ? h('figcaption', { class: 'diagram__title' }, icon('folder'), b.title) : null,
    h('ul', { class: 'tree', role: 'tree', 'aria-label': b.title || 'Struktur folder' },
      h('li', { role: 'treeitem', 'aria-expanded': 'true' },
        h('span', { class: 'tree__node tree__node--root' }, icon('folder'), b.root),
        h('ul', { role: 'group' }, (b.children || []).map((child) => treeNode(child)))))),

  stack: (b) => h('figure', { class: 'diagram diagram--stack' },
    b.title ? h('figcaption', { class: 'diagram__title' }, icon('chart'), b.title) : null,
    h('ol', { class: 'stack-diagram', role: 'list' }, b.levels.map((level, i) =>
      h('li', { style: { '--i': i }, 'data-tone': i % 5 },
        h('span', { class: 'stack-diagram__label' }, level.label),
        h('span', { class: 'stack-diagram__note' }, level.note))))),

  table: (b) => h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Tabel (geser bila perlu)' },
    h('table', { class: 'learn-table' },
      h('thead', {}, h('tr', {}, b.head.map((cell) => h('th', { scope: 'col' }, cell)))),
      h('tbody', {}, b.rows.map((row) => h('tr', {}, row.map((cell) => h('td', {}, rich(cell)))))))),

  checklist: (b, ctx) => renderChecklist(b, ctx),
  recall: (b) => renderRecall(b),
  classify: (b) => renderClassify(b),
  builder: (b, ctx) => renderBuilder(b, ctx),
  scenario: (b) => renderScenario(b),
  match: (b) => renderMatch(b),
  order: (b) => renderOrder(b),
  spot: (b) => renderSpot(b),
  keywords: (b) => renderKeywords(b),
  worksheet: (b) => renderWorksheet(b),
  presend: () => renderPresend(),
  review: () => renderReview(),
  tool: (b) => renderTool(b),
  simulator: () => {
    const host = h('div', { class: 'card card--flat exercise activity-card' });
    renderSimulator(host);
    return host;
  },
};

function treeNode(node) {
  if (typeof node === 'string') {
    return h('li', { role: 'treeitem' }, h('span', { class: 'tree__node tree__node--file' }, icon('file'), node));
  }
  return h('li', { role: 'treeitem', 'aria-expanded': node.children ? 'true' : null },
    h('span', { class: 'tree__node' }, icon('folder'), node.name),
    node.children ? h('ul', { role: 'group' }, node.children.map((c) => treeNode(c))) : null);
}

/** Mock email / pesan LinkedIn / tanda tangan / satu paragraf */
function renderEmail(b) {
  const variant = b.variant || 'email';
  if (variant === 'signature') {
    return h('figure', { class: 'mail mail--signature' },
      h('figcaption', { class: 'mail__caption' }, icon('user'), 'Contoh tanda tangan email'),
      h('div', { class: 'mail__signature' }, h('span', { class: 'mail__sigline', 'aria-hidden': 'true' }, '—'),
        b.signature.map((line, i) => h('p', { class: i === 0 ? 'mail__signame' : null }, line))));
  }
  if (variant === 'paragraph') {
    return h('figure', { class: 'mail mail--paragraph' },
      h('figcaption', { class: 'mail__caption' }, icon('mail'), b.label || 'Contoh paragraf'),
      b.body.map((p) => h('p', {}, p)));
  }
  if (variant === 'message') {
    return h('figure', { class: 'mail mail--message' },
      h('figcaption', { class: 'mail__caption' }, icon('users'), `Contoh pesan · kepada ${b.to}`),
      h('div', { class: 'mail__bubble' }, b.body.map((p) => h('p', {}, p))));
  }
  // annotate: tampilkan nomor bagian (1–10) sesuai anatomi email di Modul 4
  const tag = (n, label) => (b.annotate ? h('span', { class: 'mail__tag', title: label }, h('span', { 'aria-hidden': 'true' }, String(n)), h('span', { class: 'sr-only' }, `Bagian ${n}: ${label}. `)) : null);
  const bodyParts = ['Opening', 'Main Content', 'Attachment Information'];
  return h('figure', { class: `mail${b.annotate ? ' mail--annotated' : ''}` },
    h('figcaption', { class: 'mail__caption' }, icon('mail'), b.annotate ? 'Contoh email dengan penanda bagian' : 'Contoh email'),
    h('dl', { class: 'mail__meta' },
      b.from ? h('div', {}, h('dt', {}, 'Dari'), h('dd', {}, b.from)) : null,
      b.to ? h('div', {}, h('dt', {}, tag(1, 'Recipient'), 'Kepada'), h('dd', {}, b.to)) : null,
      b.cc ? h('div', {}, h('dt', {}, tag(2, 'CC'), 'CC'), h('dd', {}, b.cc)) : null,
      b.bcc ? h('div', {}, h('dt', {}, tag(3, 'BCC'), 'BCC'), h('dd', {}, b.bcc)) : null,
      b.subject ? h('div', { class: 'mail__subject' }, h('dt', {}, tag(4, 'Subject'), 'Subjek'), h('dd', {}, b.subject)) : null),
    h('div', { class: 'mail__body' },
      b.greeting ? h('p', {}, tag(5, 'Greeting'), b.greeting) : null,
      (b.body || []).map((p, i) => h('p', {}, b.annotate && bodyParts[i] ? tag(6 + i, bodyParts[i]) : null, p)),
      b.closing ? String(b.closing).split('\n\n').map((p, i) => h('p', {}, i === 0 ? tag(9, 'Closing') : null, p)) : null,
      b.signature ? h('div', { class: 'mail__signature' }, tag(10, 'Email Signature'), b.signature.map((line, i) => h('p', { class: i === 0 ? 'mail__signame' : null }, line))) : null),
    b.attachments?.length ? h('ul', { class: 'mail__attachments', role: 'list', 'aria-label': 'Lampiran' },
      b.attachments.map((file) => h('li', {}, icon('file'), file))) : null);
}

/** Render daftar blok menjadi DocumentFragment */
export function renderBlocks(blocks = [], ctx = {}) {
  const fragment = document.createDocumentFragment();
  blocks.forEach((block) => {
    const renderer = RENDERERS[block.type];
    if (!renderer) {
      console.warn('[lesson] tipe blok tidak dikenal:', block.type);
      return;
    }
    const el = renderer(block, ctx);
    if (el) {
      el.classList?.add('learn-block');
      fragment.append(el);
    }
  });
  return fragment;
}
