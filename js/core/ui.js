/* =====================================================================
   ui.js — Komponen UI berbasis JavaScript
   toast · modal (<dialog>) · confirm · ring progres · bar · route ·
   tooltip · achievement (Tahap 6)
   ===================================================================== */

import { $, $$, h, icon } from './dom.js';
import * as motion from './motion.js';

const gsap = window.gsap;

/* =====================================================================
   TOAST
   toast('Tersimpan', { type: 'success', title, action: { label, onClick }, duration })
   ===================================================================== */

const TOAST_ICONS = { success: 'check', info: 'info', warning: 'alert', error: 'alert' };
let toastRegion = null;

function getToastRegion() {
  if (!toastRegion) {
    toastRegion = h('div', { class: 'toast-region', 'aria-live': 'polite', 'aria-relevant': 'additions' });
    document.body.append(toastRegion);
  }
  return toastRegion;
}

export function toast(message, { type = 'info', title = '', action = null, duration = 4500 } = {}) {
  const region = getToastRegion();
  let timer = null;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    if (motion.isReduced()) { el.remove(); return; }
    gsap.to(el, { opacity: 0, y: 12, scale: 0.96, duration: 0.25, ease: 'power2.in', onComplete: () => el.remove() });
  };

  const el = h('div', { class: `toast toast--${type}`, role: type === 'error' ? 'alert' : 'status' },
    h('span', { class: 'toast__icon' }, icon(TOAST_ICONS[type] || 'info')),
    h('div', { class: 'toast__body' },
      title ? h('strong', { class: 'toast__title' }, title) : null,
      h('span', {}, message)),
    action ? h('button', {
      type: 'button',
      class: 'toast__action',
      onclick: () => { action.onClick?.(); close(); },
    }, action.label) : null,
    h('button', { type: 'button', class: 'toast__close', 'aria-label': 'Tutup notifikasi', onclick: close }, icon('x')),
    // Garis sisa waktu (dijeda bersamaan dengan timer saat di-hover/fokus)
    duration > 0 ? h('span', { class: 'toast__timer', 'aria-hidden': 'true', style: { '--toast-dur': `${duration}ms` } }) : null);

  // Batasi maksimal 3 toast agar layar tidak penuh
  while (region.children.length >= 3) region.firstElementChild.remove();
  region.append(el);
  motion.enter(el, { opacity: 0, y: 16, scale: 0.96 });
  // Ikon sukses "membal" sebagai konfirmasi visual
  if (type === 'success') motion.pop($('.toast__icon', el));

  // Jeda timer saat kursor/fokus di toast agar pengguna sempat membaca.
  // Sisa waktu dihitung agar sinkron dengan garis timer CSS.
  let remaining = duration;
  let startedAt = 0;
  const start = () => {
    if (duration <= 0 || closed) return;
    clearTimeout(timer);
    startedAt = Date.now();
    timer = setTimeout(close, remaining);
  };
  const stop = () => {
    if (!startedAt) return;
    clearTimeout(timer);
    remaining = Math.max(400, remaining - (Date.now() - startedAt));
    startedAt = 0;
  };
  el.addEventListener('pointerenter', stop);
  el.addEventListener('pointerleave', start);
  el.addEventListener('focusin', stop);
  el.addEventListener('focusout', start);
  start();

  return { close };
}

/* =====================================================================
   MODAL — memakai <dialog>.showModal():
   fokus terkunci di dalam, Esc menutup, konten di belakang inert.
   ===================================================================== */

export function openModal(dialog) {
  if (!dialog || dialog.open) return;
  dialog._returnFocus = document.activeElement;
  // CATATAN: elemen <dialog> sendiri dianimasikan dengan CSS, BUKAN GSAP.
  // GSAP memindahkan elemen sementara saat mengukur transform; pada
  // <dialog> hal itu membuatnya keluar dari "top layer" sehingga
  // fokus, Esc, dan latar inert rusak. ISI dialog (kepala, isi, kaki)
  // aman dianimasikan GSAP karena berada di dalam dialog yang sudah tampil.
  dialog.showModal();
  document.body.style.overflow = 'hidden';
  motion.staggerIn($$('.modal__head, .modal__body, .modal__foot', dialog), { opacity: 0, y: 14 });

  if (!dialog._wired) {
    dialog._wired = true;
    // Esc: animasikan dulu, baru tutup
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(dialog); });
    // Klik di luar panel (backdrop) menutup modal
    dialog.addEventListener('click', (e) => { if (e.target === dialog) closeModal(dialog); });
    // Tombol bertanda data-modal-close
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-modal-close]')) closeModal(dialog);
    });
  }
}

export function closeModal(dialog, returnValue = '') {
  if (!dialog?.open || dialog._closing) return;
  dialog._closing = true;
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    dialog.classList.remove('is-closing');
    dialog._closing = false;
    dialog.close(returnValue);
    document.body.style.overflow = '';
    dialog._returnFocus?.focus?.();
  };
  if (motion.isReduced()) return done();
  dialog.classList.add('is-closing');                 // animasi keluar via CSS
  dialog.addEventListener('animationend', done, { once: true });
  setTimeout(done, 400);                              // cadangan bila animationend tidak terpicu
}

/**
 * Dialog konfirmasi yang dibuat dinamis.
 * const ok = await confirmDialog({ title, message, confirmLabel, danger: true })
 */
export function confirmDialog({ title, message, confirmLabel = 'Ya, lanjutkan', cancelLabel = 'Batal', danger = false } = {}) {
  return new Promise((resolve) => {
    const titleId = `confirm-title-${Date.now()}`;
    const dialog = h('dialog', { class: `modal${danger ? ' modal--danger' : ''}`, 'aria-labelledby': titleId },
      h('div', { class: 'modal__head' },
        h('div', {},
          h('div', { class: 'modal__icon' }, icon(danger ? 'trash' : 'info', 'icon--lg')),
          h('h2', { class: 'h3', id: titleId }, title))),
      h('div', { class: 'modal__body' }, h('p', {}, message)),
      h('div', { class: 'modal__foot' },
        h('button', { type: 'button', class: 'btn btn--secondary', 'data-modal-close': true }, cancelLabel),
        h('button', {
          type: 'button',
          class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
          onclick: () => closeModal(dialog, 'confirm'),
        }, confirmLabel)));

    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'confirm');
      dialog.remove();
    });
    document.body.append(dialog);
    openModal(dialog);
  });
}

/* =====================================================================
   PROGRESS: ring, bar, route
   Markup minimal: <div class="ring" data-ring data-value="64" data-label="Progres"></div>
   ===================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildRingSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 44 44');
  svg.setAttribute('aria-hidden', 'true');
  for (const cls of ['ring__track', 'ring__fill']) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '22');
    c.setAttribute('cy', '22');
    c.setAttribute('r', '18');
    c.setAttribute('pathLength', '100');   // keliling dinormalisasi → 100
    svg.append(c);
  }
  return svg;
}

/** Membangun semua ring di dalam root (dipanggil sekali per halaman/render) */
export function initRings(root = document) {
  $$('[data-ring]', root).forEach((ring) => {
    if (ring._built) return;
    ring._built = true;
    const value = Number(ring.dataset.value) || 0;
    ring.prepend(buildRingSvg());
    if (!$('.ring__label', ring) && ring.dataset.showLabel !== 'false') {
      ring.append(h('span', { class: 'ring__label num' }, `${value}%`));
    }
    ring.setAttribute('role', 'progressbar');
    ring.setAttribute('aria-valuemin', '0');
    ring.setAttribute('aria-valuemax', '100');
    if (ring.dataset.label) ring.setAttribute('aria-label', ring.dataset.label);
    // Animasi awal saat ring pertama kali terlihat
    ring.style.setProperty('--value', 0);
    applyProgress(ring, value, { animate: ring.dataset.animate !== 'false' });
  });
}

/** Mengatur nilai progres (0–100) untuk ring / bar / route */
export function setProgress(el, value, { animate = true } = {}) {
  applyProgress(el, value, { animate });
}

function applyProgress(el, rawValue, { animate }) {
  const value = Math.max(0, Math.min(100, Math.round(rawValue)));
  el.dataset.value = value;
  el.classList.toggle('is-zero', value === 0);

  // ARIA progressbar (ring & bar)
  if (el.getAttribute('role') === 'progressbar') {
    el.setAttribute('aria-valuenow', String(value));
    el.setAttribute('aria-valuetext', `${value}%`);
  }
  const label = $('.ring__label', el);
  if (label) label.textContent = `${value}%`;

  if (animate) motion.tweenValue(el, value);
  else el.style.setProperty('--value', value);
}

/**
 * Peta jalur 5 stasiun.
 * stationIndex: indeks stasiun aktif (0–4); doneCount: jumlah stasiun selesai.
 */
export function setRoute(routeEl, { done = 0, current = 0 } = {}) {
  const stops = $$('.route__stop', routeEl);
  stops.forEach((stop, i) => {
    stop.classList.toggle('is-done', i < done);
    stop.classList.toggle('is-current', i === current && i >= done);
  });
  // Posisi kereta: tiap stasiun = 25% (0, 25, 50, 75, 100)
  const position = Math.min(100, current * 25);
  routeEl.setAttribute('aria-label', `Posisi belajar: stasiun ${current + 1} dari ${stops.length}, ${done} selesai`);
  motion.tweenValue(routeEl, position, { duration: 1.2 });
}

/* =====================================================================
   TOOLTIP (Tahap 6)
   <button data-tooltip="Ubah lamaran">…</button>
   - Muncul saat hover (mouse) dan saat fokus keyboard; Esc menutup
   - Bila teks tooltip berbeda dari aria-label, dihubungkan lewat
     aria-describedby agar pembaca layar ikut membacanya
   - Tidak muncul untuk sentuhan (pada HP label sudah terlihat/ikon jelas)
   ===================================================================== */

let tip = null;
let tipTarget = null;

function getTip() {
  if (!tip) {
    tip = h('div', { class: 'tooltip', role: 'tooltip', id: 'ujap-tooltip' });
    document.body.append(tip);
  }
  return tip;
}

function showTip(target) {
  const text = target.dataset.tooltip;
  if (!text) return;
  // V3: tooltip menu sidebar hanya perlu saat sidebar dalam mode ikon (label tersembunyi)
  if (target.hasAttribute('data-tooltip-rail') && document.documentElement.dataset.navMode !== 'rail') return;
  const el = getTip();
  tipTarget = target;
  el.textContent = text;
  el.classList.remove('is-below');
  el.style.left = '0px';
  el.style.top = '0px';
  el.classList.add('is-visible');

  const r = target.getBoundingClientRect();
  const t = el.getBoundingClientRect();
  el.classList.remove('is-right');
  if (target.dataset.tooltipSide === 'right') {
    // Di sisi kanan target (sidebar), sejajar vertikal
    el.classList.add('is-right');
    el.style.left = `${r.right + 12}px`;
    el.style.top = `${Math.max(8, r.top + r.height / 2 - t.height / 2)}px`;
    if (text !== target.getAttribute('aria-label')) {
      target.setAttribute('aria-describedby', [target.getAttribute('aria-describedby'), 'ujap-tooltip'].filter(Boolean).join(' '));
    }
    return;
  }
  let top = r.top - t.height - 10;
  if (top < 8) { top = r.bottom + 10; el.classList.add('is-below'); }   // tidak cukup ruang di atas
  const center = r.left + r.width / 2;
  const left = Math.min(window.innerWidth - t.width - 8, Math.max(8, center - t.width / 2));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.setProperty('--arrow-x', `${center - left}px`);

  if (text !== target.getAttribute('aria-label')) {
    target.setAttribute('aria-describedby', [target.getAttribute('aria-describedby'), 'ujap-tooltip'].filter(Boolean).join(' '));
  }
}

function hideTip() {
  if (!tip || !tipTarget) return;
  tip.classList.remove('is-visible');
  const described = (tipTarget.getAttribute('aria-describedby') || '').split(' ').filter((id) => id && id !== 'ujap-tooltip');
  if (described.length) tipTarget.setAttribute('aria-describedby', described.join(' '));
  else tipTarget.removeAttribute('aria-describedby');
  tipTarget = null;
}

/** Dipasang sekali (app.js); bekerja untuk elemen yang dibuat kemudian */
export function initTooltips() {
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const target = e.target.closest('[data-tooltip]');
    if (target && target !== tipTarget) showTip(target);
  });
  document.addEventListener('pointerout', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target && !target.contains(e.relatedTarget)) hideTip();
  });
  document.addEventListener('focusin', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target && target.matches(':focus-visible')) showTip(target);
  });
  document.addEventListener('focusout', (e) => { if (e.target.closest('[data-tooltip]')) hideTip(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  window.addEventListener('scroll', hideTip, { passive: true });
}

/* =====================================================================
   ACHIEVEMENT (Tahap 6)
   Kartu khusus saat badge didapat: segel berputar masuk, kilau, confetti.
   Antrean: beberapa badge ditampilkan bergantian, bukan bertumpuk.
   ===================================================================== */

const achievementQueue = [];
let achievementShowing = false;

export function achievement(badge) {
  achievementQueue.push(badge);
  if (!achievementShowing) nextAchievement();
}

function nextAchievement() {
  const badge = achievementQueue.shift();
  if (!badge) { achievementShowing = false; return; }
  achievementShowing = true;

  let closed = false;
  let timer = null;
  const seal = h('span', { class: 'achievement__seal' }, icon(badge.icon || 'star'));
  const shine = h('span', { class: 'achievement__shine', 'aria-hidden': 'true' });
  const card = h('div', { class: 'achievement', role: 'status', 'aria-live': 'polite', 'data-module': badge.module || null },
    shine,
    seal,
    h('div', { class: 'achievement__body' },
      h('span', { class: 'achievement__kicker' }, 'Achievement unlocked'),
      h('span', { class: 'achievement__name' }, badge.name),
      h('span', { class: 'achievement__desc' }, badge.desc)),
    h('button', { type: 'button', class: 'toast__close', 'aria-label': 'Tutup notifikasi achievement', onclick: () => close() }, icon('x')));

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    const finish = () => { card.remove(); setTimeout(nextAchievement, 250); };
    if (motion.isReduced()) return finish();
    gsap.to(card, { opacity: 0, y: 24, scale: 0.95, duration: 0.3, ease: 'power2.in', onComplete: finish });
  };

  document.body.append(card);
  card.addEventListener('pointerenter', () => clearTimeout(timer));
  card.addEventListener('pointerleave', () => { timer = setTimeout(close, 2500); });
  timer = setTimeout(close, 5500);

  if (motion.isReduced()) return;
  // Timeline: kartu naik → segel berputar & membal → kilau menyapu → confetti
  const tl = gsap.timeline();
  tl.fromTo(card, { opacity: 0, y: 40, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.6)' })
    .fromTo(seal, { scale: 0, rotation: -200 }, { scale: 1, rotation: -6, duration: 0.7, ease: 'back.out(2.2)' }, 0.1)
    .fromTo($$('.achievement__body > *', card), { opacity: 0, x: 12 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.07 }, 0.25)
    .fromTo(shine, { xPercent: -100 }, { xPercent: 100, duration: 0.9, ease: 'power2.inOut' }, 0.45)
    .add(() => motion.confetti(seal, 30), 0.35);
}
