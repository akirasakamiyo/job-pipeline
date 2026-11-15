/* =====================================================================
   navigation.js — Navigasi global
   ---------------------------------------------------------------------
   Topbar (desktop), bottom tab bar + sheet "Lainnya" (mobile) dirender
   dari SATU konfigurasi (NAV_ITEMS) agar konsisten di semua halaman.

   ready:false → halaman belum ada: tampil "Segera" & TIDAK bisa diklik.
   soon:true   → halaman sudah ada tetapi fiturnya dibangun di tahap
                 berikutnya (dipakai untuk label jujur di kartu/tile).
   ===================================================================== */

import { $, $$, h, icon } from './dom.js';
import * as motion from './motion.js';
import { initRings, setProgress } from './ui.js';

export const HOME_HREF = 'dashboard.html';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home',    href: 'dashboard.html', icon: 'home',   ready: true, tab: true },
  { id: 'modules',   label: 'Modul',     short: 'Modul',   href: 'modules.html',   icon: 'route',  ready: true, tab: true },
  { id: 'practice',  label: 'Latihan',   short: 'Latihan', href: 'practice.html',  icon: 'spark',  ready: true, tab: true },
  { id: 'tracker',   label: 'Tracker',   short: 'Tracker', href: 'tracker.html',   icon: 'kanban', ready: true, tab: true },
  { id: 'resources', label: 'Resources', short: 'Sumber',  href: 'resources.html', icon: 'book',   ready: true, tab: false },
  { id: 'progress',  label: 'Progres',   short: 'Progres', href: 'progress.html',  icon: 'chart',  ready: true, tab: false },
];

/** true bila fitur halaman tsb. masih dibangun di tahap berikutnya */
export const isSoon = (id) => Boolean(NAV_ITEMS.find((item) => item.id === id)?.soon);

/* Item tambahan khusus menu "Lainnya" di mobile */
const MORE_EXTRA = [
  { id: 'styleguide', label: 'Design System', href: 'styleguide.html', icon: 'grid', ready: true },
];

/* Halaman turunan menandai menu induknya sebagai aktif */
const PAGE_PARENT = { module: 'modules' };
const currentPage = () => {
  const page = document.body.dataset.page || '';
  return PAGE_PARENT[page] || page;
};

/* ---------- Logo ---------- */
function brandMark() {
  // Logo = file favicon yang sama, agar identitas konsisten
  return h('img', { class: 'brand__mark', src: 'assets/images/favicon.svg', alt: '', width: 38, height: 38 });
}

function brand() {
  return h('a', { class: 'brand', href: HOME_HREF, 'aria-label': 'The Ultimate Job Application Pipeline — beranda' },
    brandMark(),
    h('span', { class: 'brand__text' },
      h('span', { class: 'brand__kicker' }, 'The Ultimate Job Application'),
      h('span', { class: 'brand__name' }, 'Pipeline')));
}

/* ---------- Link (aktif / segera) ---------- */
function navLink(item, className) {
  const isCurrent = item.id === currentPage();
  if (!item.ready) {
    return h('span', {
      class: `${className} is-soon`,
      'aria-disabled': 'true',
      title: 'Halaman ini dibangun di tahap berikutnya',
    }, icon(item.icon), item.label,
    h('span', { class: 'soon-tag', 'aria-hidden': 'true' }, 'Segera'),
    h('span', { class: 'sr-only' }, '(segera tersedia)'));
  }
  return h('a', { class: className, href: item.href, 'aria-current': isCurrent ? 'page' : null },
    icon(item.icon), item.label);
}

/* ---------- Topbar ---------- */
function renderTopbar(host) {
  const progress = h('a', { class: 'nav-progress', href: 'progress.html', hidden: true, 'data-nav-progress': true, 'aria-label': 'Progres — lihat detail progres belajar', 'data-tooltip': 'Progres seluruh modul' },
    // Tahap 7 (WCAG 2.5.3): ring di sini hanya penanda visual — angka persen sudah
    // tertulis di sebelahnya, jadi label di dalam ring tidak ditampilkan & ring
    // disembunyikan dari pembaca layar (tidak diumumkan dua kali).
    h('div', { class: 'ring ring--sm', 'data-ring': true, 'data-value': '0', 'data-show-label': 'false', 'aria-hidden': 'true' }),
    h('span', { class: 'nav-progress__text' },
      h('small', {}, 'Progres'),
      h('strong', { 'data-nav-progress-text': true }, '0%')));

  const header = h('header', { class: 'topbar' },
    h('div', { class: 'topbar__inner' },
      brand(),
      h('nav', { class: 'nav', 'aria-label': 'Navigasi utama' },
        h('ul', { class: 'nav__list', role: 'list' },
          NAV_ITEMS.map((item) => h('li', {}, navLink(item, 'nav__link'))))),
      h('div', { class: 'topbar__actions' }, progress)));

  host.replaceWith(header);
  initRings(header);
  initNavIndicator($('.nav', header));

  // Topbar berubah menjadi kaca buram setelah di-scroll
  let ticking = false;
  const update = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
}

/* ---------- Indikator hover yang meluncur (desktop) ----------
   Pil tipis bergerak ke link yang di-hover/difokus lalu memudar saat
   kursor keluar. Link aktif tetap memakai pil gelap (aria-current).  */
function initNavIndicator(nav) {
  const list = nav && $('.nav__list', nav);
  if (!list) return;
  // Pil diletakkan di <nav> (bukan di dalam <ul>) agar struktur daftar tetap valid
  const pill = h('span', { class: 'nav__hover', 'aria-hidden': 'true' });
  nav.prepend(pill);
  nav.classList.add('has-indicator');
  const gsap = window.gsap;

  const moveTo = (link) => {
    const navRect = nav.getBoundingClientRect();
    const rect = link.getBoundingClientRect();
    const vars = { x: rect.left - navRect.left, width: rect.width, opacity: 1 };
    pill.style.top = `${rect.top - navRect.top}px`;
    pill.style.height = `${rect.height}px`;
    if (!gsap || motion.isReduced()) {
      pill.style.transform = `translateX(${vars.x}px)`;
      pill.style.width = `${vars.width}px`;
      pill.style.opacity = '1';
      return;
    }
    // Saat muncul pertama kali: langsung di posisi, lalu memudar masuk
    if (Number(getComputedStyle(pill).opacity) < 0.05) gsap.set(pill, { x: vars.x, width: vars.width });
    gsap.to(pill, { ...vars, duration: 0.35, ease: 'power3.out', overwrite: true });
  };
  const hide = () => {
    if (!gsap || motion.isReduced()) { pill.style.opacity = '0'; return; }
    gsap.to(pill, { opacity: 0, duration: 0.25, overwrite: 'auto' });
  };

  list.addEventListener('pointerover', (e) => {
    const link = e.target.closest('.nav__link');
    if (link && !link.classList.contains('is-soon') && link.getAttribute('aria-current') !== 'page') moveTo(link);
    else if (link) hide();
  });
  list.addEventListener('pointerleave', hide);
  list.addEventListener('focusin', (e) => {
    const link = e.target.closest('.nav__link');
    if (link && link.getAttribute('aria-current') !== 'page') moveTo(link);
  });
  list.addEventListener('focusout', (e) => { if (!list.contains(e.relatedTarget)) hide(); });
}

/* ---------- Bottom bar + sheet (mobile) ---------- */
function renderBottombar(host) {
  const tabs = NAV_ITEMS.filter((item) => item.tab);
  const moreItems = [...NAV_ITEMS.filter((item) => !item.tab), ...MORE_EXTRA];
  const moreActive = moreItems.some((item) => item.id === currentPage());

  const tabEl = (item) => {
    const isCurrent = item.id === currentPage();
    const inner = [h('span', { class: 'tab__pill' }, icon(item.icon)), item.short];
    if (!item.ready) {
      return h('span', { class: 'tab is-soon', 'aria-disabled': 'true', title: 'Segera tersedia' }, ...inner);
    }
    return h('a', { class: 'tab', href: item.href, 'aria-current': isCurrent ? 'page' : null }, ...inner);
  };

  const moreBtn = h('button', {
    type: 'button',
    class: 'tab',
    'aria-expanded': 'false',
    'aria-controls': 'more-sheet',
    'aria-current': moreActive ? 'page' : null,
  }, h('span', { class: 'tab__pill' }, icon('more')), 'Lainnya');

  const bar = h('nav', { class: 'bottombar', 'aria-label': 'Navigasi utama (seluler)' },
    h('ul', { class: 'bottombar__list', role: 'list' },
      tabs.map((item) => h('li', {}, tabEl(item))),
      h('li', {}, moreBtn)));

  const sheetLink = (item) => {
    const isCurrent = item.id === currentPage();
    const content = [h('span', { class: 'icon-tile' }, icon(item.icon)), item.label];
    if (!item.ready) {
      return h('span', { class: 'sheet__link is-soon', 'aria-disabled': 'true' }, ...content, h('span', { class: 'soon-tag' }, 'Segera'));
    }
    return h('a', { class: 'sheet__link', href: item.href, 'aria-current': isCurrent ? 'page' : null }, ...content);
  };

  const panel = h('div', { class: 'sheet__panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'more-sheet-title' },
    h('div', { class: 'sheet__handle', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet__head' },
      h('h2', { class: 'h3', id: 'more-sheet-title' }, 'Menu lainnya'),
      h('button', { type: 'button', class: 'btn btn--ghost btn--icon', 'aria-label': 'Tutup menu', 'data-sheet-close': true }, icon('x'))),
    h('ul', { class: 'sheet__list', role: 'list' }, moreItems.map((item) => h('li', {}, sheetLink(item)))));

  const sheet = h('div', { class: 'sheet', id: 'more-sheet', hidden: true },
    h('div', { class: 'sheet__backdrop', 'data-sheet-close': true }),
    panel);

  host.replaceWith(bar);
  document.body.append(sheet);

  const gsap = window.gsap;
  const openSheet = () => {
    sheet.hidden = false;
    moreBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    if (!motion.isReduced()) {
      gsap.fromTo(panel, { yPercent: 100 }, { yPercent: 0, duration: 0.45, ease: 'power3.out' });
      gsap.fromTo(sheet.firstElementChild, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    }
    $('a, button', panel)?.focus();
  };
  const closeSheet = () => {
    const finish = () => {
      sheet.hidden = true;
      moreBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      moreBtn.focus();
    };
    if (motion.isReduced()) return finish();
    gsap.to(panel, { yPercent: 100, duration: 0.3, ease: 'power2.in', onComplete: finish });
    gsap.to(sheet.firstElementChild, { opacity: 0, duration: 0.25 });
  };

  moreBtn.addEventListener('click', () => (sheet.hidden ? openSheet() : closeSheet()));
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) closeSheet(); });
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
    // Kunci fokus di dalam panel
    if (e.key === 'Tab') {
      const focusables = $$('a[href], button:not([disabled])', panel);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
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

/** Merender kerangka navigasi ke placeholder [data-topbar] & [data-bottombar] */
export function initNavigation() {
  const top = $('[data-topbar]');
  const bottom = $('[data-bottombar]');
  if (top) renderTopbar(top);
  if (bottom) renderBottombar(bottom);
  bindPageTransitions();
}

/** Menampilkan & memperbarui progres total di topbar (dipakai state.js nanti) */
export function setNavProgress(value) {
  const wrap = $('[data-nav-progress]');
  if (!wrap) return;
  wrap.hidden = false;
  setProgress($('.ring', wrap), value);
  $('[data-nav-progress-text]', wrap).textContent = `${Math.round(value)}%`;
  // Nama aksesibel memuat teks yang terlihat ("Progres 40%") — WCAG 2.5.3
  wrap.setAttribute('aria-label', `Progres ${Math.round(value)}% — lihat detail progres belajar`);
}
