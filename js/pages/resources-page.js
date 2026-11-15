/* =====================================================================
   pages/resources-page.js — Halaman "Resources & references" (Tahap 7)
   ---------------------------------------------------------------------
   Menggabungkan dua sumber data:
   - data/resources.json  → panduan praktis (artikel bantuan resmi)
   - data/references.json → referensi materi yang dipakai di modul
   Fitur: saring per modul, saring per jenis, pencarian, status jumlah
   hasil (aria-live), filter tersimpan di URL (?modul=cv&jenis=ref&q=...).

   Keamanan tautan eksternal: target="_blank" + rel="noopener noreferrer"
   dan hanya URL https:// yang dirender sebagai tautan.
   Kejujuran data: item dengan verified:false selalu diberi label
   "Perlu verifikasi" (lihat catatan di masing-masing file JSON).
   ===================================================================== */

import { $, $$, h, icon, debounce } from '../core/dom.js';
import * as state from '../core/state.js';
import * as motion from '../core/motion.js';
import { loadJSON } from '../core/data.js';

const KINDS = { all: 'Semua jenis', guide: 'Panduan resmi', ref: 'Referensi materi' };
const filters = { module: 'all', kind: 'all', q: '' };
let items = [];

/** Hanya URL https yang boleh menjadi tautan (cegah javascript:, data:, dll.) */
const safeUrl = (url) => {
  try { return new URL(url).protocol === 'https:' ? url : null; } catch { return null; }
};

export async function init() {
  const list = $('[data-resource-list]');
  try {
    const [res, refs] = await Promise.all([loadJSON('resources'), loadJSON('references')]);
    items = [
      ...res.resources.map((r) => ({
        id: r.id, kind: 'guide', title: r.title, about: r.about || '', source: `${r.type} · ${r.source}`,
        url: safeUrl(r.url), urlLabel: r.urlLabel || r.source, modules: [r.module], verified: r.verified === true,
      })),
      ...refs.references.map((r) => ({
        id: r.id, kind: 'ref', title: r.citation, about: r.about || '', source: 'Referensi materi',
        url: r.url ? safeUrl(r.url) : null, urlLabel: r.urlLabel, modules: r.modules || [], verified: r.verified === true,
      })),
    ];
  } catch (error) {
    console.error('[resources] gagal memuat data:', error);
    list.replaceChildren(h('li', { class: 'empty-state' },
      h('span', { class: 'empty-state__icon' }, icon('alert')),
      h('p', { class: 'empty-state__title' }, 'Daftar resources gagal dimuat'),
      h('p', {}, 'Muat ulang halaman. Bila tetap gagal, pastikan situs dibuka lewat server (bukan file://).')));
    return;
  }

  readUrl();
  buildFilters();
  $('[data-total]').textContent = `${items.length} sumber · ${items.filter((i) => !i.verified).length} masih perlu diverifikasi`;

  const search = $('[data-search]');
  search.value = filters.q;
  search.addEventListener('input', debounce(() => { filters.q = search.value.trim(); apply(true); }, 180));
  $('[data-clear]').addEventListener('click', () => {
    filters.module = 'all'; filters.kind = 'all'; filters.q = '';
    search.value = '';
    syncPressed();
    apply(true);
    search.focus();
  });
  apply(false);
}

/* ---------- Filter ---------- */

function readUrl() {
  const params = new URLSearchParams(location.search);
  const mod = params.get('modul');
  const kind = params.get('jenis');
  if (mod && state.getModuleMeta(mod)) filters.module = mod;
  if (kind && KINDS[kind]) filters.kind = kind;
  filters.q = (params.get('q') || '').slice(0, 80);
}

function writeUrl() {
  const params = new URLSearchParams();
  if (filters.module !== 'all') params.set('modul', filters.module);
  if (filters.kind !== 'all') params.set('jenis', filters.kind);
  if (filters.q) params.set('q', filters.q);
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

function buildFilters() {
  const modules = state.getCatalog();
  $('[data-module-filter]').replaceChildren(
    chipBtn('module', 'all', 'Semua modul'),
    ...modules.map((m) => chipBtn('module', m.id, `${m.code} · ${m.title}`)));
  $('[data-kind-filter]').replaceChildren(...Object.entries(KINDS).map(([id, label]) => chipBtn('kind', id, label)));
  syncPressed();
}

function chipBtn(group, value, label) {
  return h('button', {
    type: 'button', class: 'chip chip-btn', 'aria-pressed': 'false', dataset: { group, value },
    onclick: () => { filters[group] = value; syncPressed(); apply(true); },
  }, label);
}

function syncPressed() {
  $$('[data-group]').forEach((btn) => btn.setAttribute('aria-pressed', String(filters[btn.dataset.group] === btn.dataset.value)));
}

function matches(item) {
  if (filters.module !== 'all' && !item.modules.includes(filters.module)) return false;
  if (filters.kind !== 'all' && item.kind !== filters.kind) return false;
  if (filters.q) {
    const hay = `${item.title} ${item.about} ${item.source} ${item.urlLabel || ''}`.toLowerCase();
    if (!filters.q.toLowerCase().split(/\s+/).every((word) => hay.includes(word))) return false;
  }
  return true;
}

function apply(animate) {
  const shown = items.filter(matches);
  const list = $('[data-resource-list]');
  list.replaceChildren(...shown.map(card));
  $('[data-empty]').hidden = shown.length > 0;
  const active = filters.module !== 'all' || filters.kind !== 'all' || filters.q;
  $('[data-clear]').hidden = !active;
  $('[data-result]').textContent = `Menampilkan ${shown.length} dari ${items.length} sumber.`;
  writeUrl();
  if (animate && shown.length && !motion.isReduced()) {
    window.gsap?.fromTo(list.children, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.04, clearProps: 'transform,opacity' });
  }
}

/* ---------- Kartu ---------- */

function card(item) {
  const primary = state.getModuleMeta(item.modules[0]);
  return h('li', { class: 'res-card', 'data-module': primary?.id || null },
    h('div', { class: 'res-card__top' },
      h('span', { class: 'res-card__icon' }, icon(item.kind === 'guide' ? 'book' : 'file')),
      h('span', { class: 'chip' }, KINDS[item.kind]),
      item.verified ? null : h('span', { class: 'verify-tag' }, 'Perlu verifikasi')),
    h('h2', { class: 'res-card__title' }, item.title),
    item.about ? h('p', { class: 'res-card__about' }, item.about) : null,
    h('p', { class: 'res-card__source' }, item.source),
    h('div', { class: 'res-card__modules' },
      h('span', { class: 'sr-only' }, 'Dipakai di modul: '),
      item.modules.map((id) => {
        const m = state.getModuleMeta(id);
        return m ? h('a', { class: 'res-card__mod', href: `module.html?id=${m.id}`, 'data-module': m.id, 'data-tooltip': m.title, 'aria-label': `${m.code} — buka modul ${m.title}` }, h('span', { class: 'code' }, m.code)) : null;
      })),
    h('div', { class: 'res-card__foot' },
      item.url
        ? h('a', { class: 'btn btn--secondary btn--sm', href: item.url, target: '_blank', rel: 'noopener noreferrer' },
          'Buka sumber', icon('external', 'icon--trail'), h('span', { class: 'sr-only' }, ` (${item.urlLabel}, membuka tab baru)`))
        : h('span', { class: 'text-soft text-sm' }, 'Buku cetak · tanpa tautan'),
      item.url ? h('span', { class: 'res-card__host mono' }, new URL(item.url).hostname.replace(/^www\./, '')) : null));
}
