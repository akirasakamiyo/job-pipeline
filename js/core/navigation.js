/* =====================================================================
   navigation.js — Navigasi global: SIDEBAR KIRI (V3, struktur menu V4)
   ---------------------------------------------------------------------
   Satu implementasi untuk SEMUA halaman. Setiap halaman cukup memiliki
   placeholder <div data-topbar></div>; modul ini merender:
     1. <aside class="appnav">  — sidebar (brand, 5 grup menu, profil,
                                  progres, tombol ciutkan/perluas)
     2. <header class="mobilebar"> — header HP dengan tombol hamburger
     3. backdrop untuk drawer (HP) & overlay (tablet)

   Perilaku per lebar layar (diatur CSS; JS hanya mengelola state):
     ≥1200px   : sidebar penuh (±264px). Bisa diciutkan → ikon saja (80px).
                 Preferensi disimpan di ujap:prefs.sidebar dan dipasang
                 lebih awal oleh skrip boot di <head> (tanpa lompatan layout).
     768–1199px: rel ikon (80px) + tooltip. Tombol perluas membuka sidebar
                 penuh sebagai overlay di atas konten.
     <768px    : drawer off-canvas dari kiri + backdrop. Esc / backdrop /
                 memilih menu menutup drawer. Scroll latar dikunci.

   Status terbuka (overlay/drawer) memakai kelas html.nav-open.
   ===================================================================== */

import { $, $$, h, icon } from './dom.js';
import * as motion from './motion.js';
import * as storage from './storage.js';
import { initRings, setProgress } from './ui.js';

export const HOME_HREF = 'dashboard.html';

/** Struktur menu V4: 5 grup, 8 halaman (satu halaman = satu fungsi). Ikon Lucide. */
export const NAV_GROUPS = [
  { id: 'overview', label: 'Overview', items: [
    { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: 'layout-dashboard' },
  ] },
  { id: 'learning', label: 'Learning', items: [
    { id: 'modules', label: 'Learning Modules', href: 'modules.html', icon: 'book-open' },
    { id: 'practice', label: 'Practice Center', href: 'practice.html', icon: 'dumbbell' },
    { id: 'evaluation', label: 'Evaluation', href: 'evaluation.html', icon: 'clipboard-check' },
  ] },
  { id: 'my-progress', label: 'My Progress', items: [
    { id: 'progress', label: 'Learning Progress', href: 'progress.html', icon: 'chart-combined' },
    { id: 'achievements', label: 'Achievements & XP', href: 'achievements.html', icon: 'lucide-trophy' },
  ] },
  { id: 'resources', label: 'Resources', items: [
    { id: 'resources', label: 'Resources & Guides', href: 'resources.html', icon: 'library' },
  ] },
  { id: 'settings', label: 'Settings', items: [
    { id: 'settings', label: 'Settings', href: 'settings.html', icon: 'settings' },
  ] },
];

/** Kompatibilitas: daftar datar semua menu */
export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** Semua halaman sudah tersedia; dipertahankan agar pemanggil lama tetap jalan */
export const isSoon = () => false;

/* Halaman → menu yang aktif (halaman turunan menandai induknya) */
const PAGE_TO_NAV = { module: 'modules', 'practice-tool': 'practice', quiz: 'evaluation', certificate: 'achievements' };
const currentNav = () => {
  const page = document.body.dataset.page || '';
  return PAGE_TO_NAV[page] || page;
};

const root = document.documentElement;
const mqMobile = window.matchMedia('(max-width: 767px)');
const mqTablet = window.matchMedia('(min-width: 768px) and (max-width: 1199px)');

/** Mode visual saat ini: drawer (HP) · rail (ikon saja) · full */
function navMode() {
  if (mqMobile.matches) return 'drawer';
  if (mqTablet.matches) return root.classList.contains('nav-open') ? 'full' : 'rail';
  return root.dataset.navPref === 'collapsed' ? 'rail' : 'full';
}

let els = {};

/* ---------- Render ---------- */

function brand(className, { compact = false } = {}) {
  // Nama tautan diambil dari teks yang terlihat (WCAG 2.5.3) + keterangan tujuan untuk pembaca layar
  return h('a', { class: className, href: HOME_HREF },
    h('img', { class: 'brand__mark', src: 'assets/images/favicon.svg', alt: '', width: 38, height: 38 }),
    h('span', { class: 'appnav__brandtext' },
      h('span', { class: 'appnav__brandname' }, 'Job Pipeline'),
      compact ? null : h('span', { class: 'appnav__brandsub' }, 'Career Learning Platform')),
    h('span', { class: 'sr-only' }, ' — ke Dashboard'));
}

function navLink(item) {
  const active = item.id === currentNav();
  return h('a', {
    class: 'appnav__link',
    href: item.href,
    'aria-current': active ? 'page' : null,
    'aria-label': item.label,              // nama aksesibel tetap ada saat label disembunyikan (mode ikon)
    'data-tooltip': item.label,
    'data-tooltip-side': 'right',
    'data-tooltip-rail': '',               // tooltip hanya tampil di mode ikon (ui.js)
  },
  h('span', { class: 'appnav__icon' }, icon(item.icon)),
  h('span', { class: 'appnav__label' }, item.label));
}

function render(host) {
  const groups = NAV_GROUPS.map((g) => h('div', { class: 'appnav__group' },
    h('p', { class: 'appnav__grouptitle', id: `nav-g-${g.id}` }, h('span', { class: 'appnav__grouptext' }, g.label)),
    h('ul', { class: 'appnav__list', role: 'list', 'aria-labelledby': `nav-g-${g.id}` }, g.items.map((item) => h('li', {}, navLink(item))))));

  // Profil (nama dari state; diisi setNavUser) & progres ringkas (setNavProgress)
  els.avatar = h('span', { class: 'appnav__avatar', 'aria-hidden': 'true' }, '?');
  els.userName = h('span', { class: 'appnav__username' }, 'Profil belajar');
  els.profile = h('a', {
    class: 'appnav__profile', href: 'dashboard.html#profil',
    'aria-label': 'Profil belajar — ubah nama dan status', 'data-tooltip': 'Profil belajar', 'data-tooltip-side': 'right', 'data-tooltip-rail': '',
  }, els.avatar, h('span', { class: 'appnav__profiletext' }, els.userName, h('span', { class: 'appnav__usersub' }, 'Ubah profil')));

  els.progress = h('a', {
    class: 'appnav__progress', href: 'progress.html', 'data-nav-progress': true, hidden: true,
    'aria-label': 'Progres belajar — lihat detail', 'data-tooltip': 'Progres seluruh modul', 'data-tooltip-side': 'right', 'data-tooltip-rail': '',
  },
  h('div', { class: 'ring ring--sm', 'data-ring': true, 'data-value': '0', 'data-show-label': 'false', 'aria-hidden': 'true' }),
  h('span', { class: 'appnav__progresstext' },
    h('span', { class: 'appnav__progresslabel' }, 'Progres belajar'),
    h('span', { class: 'appnav__progressbar' }, h('span', { class: 'bar bar--thin', 'data-nav-progress-bar': true }, h('span', { class: 'bar__fill' }))),
    h('strong', { 'data-nav-progress-text': true }, '0%')));

  els.toggle = h('button', {
    type: 'button', class: 'appnav__toggle', 'aria-controls': 'app-nav',
    'data-tooltip-side': 'right', 'data-tooltip-rail': '',
  }, icon('arrow-left', 'appnav__toggleicon'), h('span', { class: 'appnav__label' }, 'Ciutkan menu'));

  els.close = h('button', { type: 'button', class: 'btn btn--ghost btn--icon appnav__close', 'aria-label': 'Tutup menu' }, icon('x'));

  els.aside = h('aside', { class: 'appnav', id: 'app-nav', 'aria-label': 'Navigasi utama' },
    h('div', { class: 'appnav__head' }, brand('appnav__brand'), els.close),
    h('nav', { class: 'appnav__nav', 'aria-label': 'Menu utama' }, groups),
    h('div', { class: 'appnav__foot' }, els.profile, els.progress, els.toggle));

  els.backdrop = h('div', { class: 'appnav-backdrop', hidden: true });

  // Header HP: hamburger + brand + progres
  els.burger = h('button', {
    type: 'button', class: 'btn btn--ghost btn--icon mobilebar__menu', 'aria-controls': 'app-nav', 'aria-expanded': 'false', 'aria-label': 'Buka menu navigasi',
  }, icon('menu'));
  els.mobilePct = h('a', { class: 'mobilebar__progress', href: 'progress.html', hidden: true, 'aria-label': 'Progres — lihat detail progres belajar' },
    h('div', { class: 'ring ring--sm', 'data-ring': true, 'data-value': '0', 'data-show-label': 'false', 'aria-hidden': 'true' }),
    h('strong', { 'data-nav-progress-text': true }, '0%'));
  const mobilebar = h('header', { class: 'mobilebar' }, els.burger, brand('mobilebar__brand', { compact: true }), els.mobilePct);

  host.replaceWith(mobilebar);
  // Sidebar diletakkan SETELAH skip link agar Tab pertama tetap "Lewati ke konten utama"
  const skip = $('.skip-link');
  if (skip) skip.after(els.aside, els.backdrop); else document.body.prepend(els.aside, els.backdrop);
  initRings(els.aside);
  initRings(mobilebar);
}

/* ---------- Buka / tutup (overlay tablet & drawer HP) ---------- */

let lastFocus = null;

function open() {
  if (root.classList.contains('nav-open')) return;
  lastFocus = document.activeElement;
  root.classList.add('nav-open');
  els.backdrop.hidden = false;
  els.aside.inert = false;
  els.aside.removeAttribute('aria-hidden');
  if (mqMobile.matches) {
    els.aside.setAttribute('role', 'dialog');
    els.aside.setAttribute('aria-modal', 'true');
  }
  document.body.style.overflow = 'hidden';            // cegah scroll latar
  sync();
  // Animasi geser & lebar memakai transisi CSS (otomatis mati di mode gerak minimal)
  ($('[aria-current="page"]', els.aside) || $('.appnav__link', els.aside))?.focus({ preventScroll: true });
}

function close({ restoreFocus = true } = {}) {
  if (!root.classList.contains('nav-open')) return;
  const finish = () => {
    root.classList.remove('nav-open');
    els.backdrop.hidden = true;
    els.aside.removeAttribute('role');
    els.aside.removeAttribute('aria-modal');
    document.body.style.overflow = '';
    sync();
    if (restoreFocus) (mqMobile.matches ? els.burger : els.toggle)?.focus?.();
  };
  finish();
}

/** Ciutkan/perluas di desktop (disimpan) atau buka/tutup overlay di tablet */
function toggle() {
  if (mqTablet.matches) { root.classList.contains('nav-open') ? close() : open(); return; }
  const collapsed = root.dataset.navPref !== 'collapsed';
  if (collapsed) root.dataset.navPref = 'collapsed'; else delete root.dataset.navPref;
  storage.update('prefs', (p) => ({ ...p, sidebar: collapsed ? 'collapsed' : 'expanded' }), {});
  sync();
  window.ScrollTrigger?.refresh?.();
}

/** Menyelaraskan label tombol, ARIA, inert, dan mode untuk tooltip */
function sync() {
  const mode = navMode();
  root.dataset.navMode = mode;
  const isOpen = root.classList.contains('nav-open');
  const drawerClosed = mqMobile.matches && !isOpen;
  els.aside.inert = drawerClosed;                     // drawer tertutup: tidak bisa difokus
  if (drawerClosed) els.aside.setAttribute('aria-hidden', 'true'); else els.aside.removeAttribute('aria-hidden');
  els.burger.setAttribute('aria-expanded', String(mqMobile.matches && isOpen));

  const expandedNow = mode === 'full';
  const label = mqTablet.matches
    ? (isOpen ? 'Tutup menu lengkap' : 'Tampilkan menu lengkap')
    : (expandedNow ? 'Ciutkan menu' : 'Perluas menu');
  els.toggle.setAttribute('aria-label', label);
  els.toggle.setAttribute('aria-expanded', String(expandedNow));
  els.toggle.dataset.tooltip = label;
  $('.appnav__label', els.toggle).textContent = label;
}

function bindEvents() {
  els.burger.addEventListener('click', open);
  els.close.addEventListener('click', () => close());
  els.toggle.addEventListener('click', toggle);
  els.backdrop.addEventListener('click', () => close());

  // Memilih menu menutup drawer/overlay (navigasi tetap berjalan)
  els.aside.addEventListener('click', (e) => {
    if (e.target.closest('a[href]') && root.classList.contains('nav-open')) close({ restoreFocus: false });
  });

  document.addEventListener('keydown', (e) => {
    if (!root.classList.contains('nav-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    // Kunci fokus di dalam sidebar selama drawer/overlay terbuka
    if (e.key === 'Tab') {
      const focusables = $$('a[href], button:not([disabled])', els.aside).filter((el) => el.offsetParent !== null);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Pindah breakpoint: tutup drawer/overlay agar tidak "menggantung"
  const onBreakpoint = () => { if (root.classList.contains('nav-open')) close({ restoreFocus: false }); sync(); };
  mqMobile.addEventListener('change', onBreakpoint);
  mqTablet.addEventListener('change', onBreakpoint);
}

/* ---------- Transisi halaman untuk link internal ---------- */
function bindPageTransitions() {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;   // buka tab baru, dsb.
    const link = event.target.closest('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download') || link.dataset.noTransition !== undefined) return;

    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;                               // tautan eksternal
    const samePage = url.pathname === window.location.pathname && url.search === window.location.search;
    if (samePage && url.hash) return;                                               // anchor di halaman yang sama
    if (!/\.html$|\/$/.test(url.pathname)) return;

    event.preventDefault();
    motion.pageLeave(url.href);
  });
}

/* ---------- API publik ---------- */

/** Merender sidebar + header HP ke placeholder [data-topbar] */
export function initNavigation() {
  const host = $('[data-topbar]');
  $('[data-bottombar]')?.remove();                    // bottom bar lama tidak dipakai lagi
  if (host) {
    render(host);
    bindEvents();
    sync();
  }
  bindPageTransitions();
}

/** Menampilkan & memperbarui progres total di sidebar dan header HP */
export function setNavProgress(value) {
  const pct = Math.round(value);
  $$('[data-nav-progress], .mobilebar__progress').forEach((wrap) => { wrap.hidden = false; });
  $$('.appnav__progress .ring, .mobilebar__progress .ring').forEach((ring) => setProgress(ring, pct));
  const bar = $('[data-nav-progress-bar]');
  if (bar) setProgress(bar, pct);
  $$('[data-nav-progress-text]').forEach((el) => { el.textContent = `${pct}%`; });
  // Nama aksesibel memuat teks yang terlihat ("Progres 40%") — WCAG 2.5.3
  $('[data-nav-progress]')?.setAttribute('aria-label', `Progres belajar ${pct}% — lihat detail`);
  $('.mobilebar__progress')?.setAttribute('aria-label', `${pct}% progres belajar — lihat detail`);
}

/** Nama & inisial pengguna di bagian bawah sidebar */
export function setNavUser(user = {}) {
  if (!els.userName) return;
  const name = String(user.name || '').trim();
  els.userName.textContent = name || 'Profil belajar';
  els.avatar.textContent = name ? name.charAt(0).toUpperCase() : '?';
  els.profile.setAttribute('aria-label', `${name || 'Profil belajar'} — ubah profil`);
  els.profile.dataset.tooltip = name || 'Profil belajar';
}
