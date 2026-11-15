/* =====================================================================
   motion.js — Sistem animasi (GSAP + ScrollTrigger)
   ---------------------------------------------------------------------
   API deklaratif lewat atribut HTML:
     data-reveal="up|fade|left|right|scale"  → muncul saat di-scroll
     data-stagger                             → anak-anaknya masuk berurutan
     data-float="10"                          → mengambang pelan (amplitudo px)
     data-tilt                                → kartu sedikit miring mengikuti kursor
     data-count="64"                          → angka naik dari 0 saat terlihat

     data-parallax="0.15"                     → bergeser pelan saat scroll (dekorasi)

   API imperatif (dipanggil fitur lain):
     countUp, tweenValue, pop, shake, confetti, pageLeave,
     enter, slideIn (transisi arah kiri/kanan), staggerIn

   Interaksi global: riak (ripple) pada tombol .btn.
   Performa: semua animasi GSAP & CSS dijeda saat tab tidak terlihat.

   Aturan performa: hanya transform & opacity, semua animasi dibungkus
   gsap.context() agar bisa dibersihkan, dan mode gerak minimal
   dihormati (setelan OS atau preferensi pengguna).
   ===================================================================== */

import * as storage from './storage.js';
import * as loader from './loader.js';
import { $$ } from './dom.js';

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const root = document.documentElement;
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const TRANSITION_FLAG = 'ujap:transition';

let ctx = null;

/* ---------- Preferensi gerak ---------- */

/** 'system' (ikuti OS) atau 'reduced' (selalu minimal) */
export function getMotionPref() {
  return storage.get('prefs', {}).motion === 'reduced' ? 'reduced' : 'system';
}

export function setMotionPref(value) {
  storage.update('prefs', (prefs) => ({ ...prefs, motion: value }), {});
  init();
}

/** true bila animasi dekoratif harus dimatikan */
export function isReduced() {
  return !gsap || getMotionPref() === 'reduced' || reduceQuery.matches;
}

/* ---------- Inisialisasi ---------- */

export function init() {
  const reduced = isReduced();
  root.classList.toggle('reduce-motion', reduced);

  if (gsap) {
    if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    gsap.defaults({ ease: 'power3.out', duration: 0.6 });
    ctx?.revert();                       // bersihkan animasi lama (saat preferensi berubah)
    ctx = gsap.context(() => {
      if (reduced) {
        showFinalValues();
        return;
      }
      setupIntro();
      setupReveals();
      setupCounters();
      setupProgress();
      setupFloat();
      setupParallax();
      return setupTilt();                // fungsi cleanup listener
    });
  } else {
    // GSAP gagal dimuat: tampilkan nilai akhir tanpa animasi
    showFinalValues();
  }

  root.classList.add('motion-ready');
  pageEnter();
}

// Bila pengguna mengubah setelan OS saat halaman terbuka
reduceQuery.addEventListener?.('change', () => init());

/* ---------- Hemat daya: jeda semua animasi saat tab tidak terlihat ----------
   GSAP (timeline global) dijeda, dan kelas .is-hidden menjeda animasi CSS
   (shimmer bar, denyut titik) lewat animations.css.                        */
document.addEventListener('visibilitychange', () => {
  const hidden = document.hidden;
  root.classList.toggle('is-hidden', hidden);
  if (!gsap) return;
  if (hidden) gsap.globalTimeline.pause();
  else gsap.globalTimeline.resume();
});

/* ---------- Riak (ripple) pada tombol ----------
   Satu listener terdelegasi untuk semua .btn (termasuk yang dibuat dinamis).
   Hanya transform & opacity; elemen riak dihapus setelah selesai.          */
document.addEventListener('pointerdown', (event) => {
  const btn = event.target.closest('.btn');
  if (!btn || btn.disabled || btn.classList.contains('btn--ghost') || isReduced()) return;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2.2;
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.setAttribute('aria-hidden', 'true');
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
  btn.append(ripple);
  gsap.fromTo(ripple, { scale: 0, opacity: 0.35 }, {
    scale: 1, opacity: 0, duration: 0.65, ease: 'power2.out',
    onComplete: () => ripple.remove(),
  });
}, { passive: true });

/** Mode tanpa animasi: angka & bar langsung di nilai akhir */
function showFinalValues() {
  $$('[data-count]').forEach((el) => setCount(el, Number(el.dataset.count)));
  $$('[data-progress]').forEach((el) => el.style.setProperty('--value', Number(el.dataset.progress) || 0));
}

/* ---------- Intro (hero) ----------
   [data-intro="up|fade|scale|left|right"] dianimasikan berurutan
   sesuai urutan DOM begitu halaman siap (tidak menunggu scroll).     */
function setupIntro() {
  const items = $$('[data-intro]');
  if (!items.length) return;
  const tl = gsap.timeline({ delay: root.classList.contains('is-entering') ? 0.35 : 0.05 });
  items.forEach((el, i) => {
    const from = REVEAL_FROM[el.dataset.intro] || REVEAL_FROM.up;
    tl.fromTo(el, from, {
      opacity: 1, x: 0, y: 0, scale: 1,
      duration: el.dataset.intro === 'scale' ? 0.9 : 0.7,
      ease: el.dataset.intro === 'scale' ? 'back.out(1.4)' : 'power3.out',
      clearProps: 'transform',
    }, i * 0.09);
  });
}

/* ---------- Bar progres: terisi saat terlihat ----------
   <div class="bar" data-progress="64"> → --value 0 → 64           */
function setupProgress() {
  $$('[data-progress]').forEach((el) => {
    const target = Number(el.dataset.progress) || 0;
    el.style.setProperty('--value', 0);
    const run = () => gsap.to(el, { '--value': target, duration: 1.1, ease: 'power3.out', delay: 0.15 });
    if (ScrollTrigger) ScrollTrigger.create({ trigger: el, start: 'top 95%', once: true, onEnter: run });
    else run();
  });
}

/* ---------- Reveal saat scroll ---------- */

const REVEAL_FROM = {
  up: { opacity: 0, y: 32 },
  fade: { opacity: 0 },
  left: { opacity: 0, x: -32 },
  right: { opacity: 0, x: 32 },
  scale: { opacity: 0, scale: 0.94 },
};

function setupReveals() {
  const singles = $$('[data-reveal]').filter((el) => !el.closest('[data-stagger]'));
  const groups = $$('[data-stagger]');

  singles.forEach((el) => gsap.set(el, REVEAL_FROM[el.dataset.reveal] || REVEAL_FROM.up));
  groups.forEach((group) => gsap.set(group.children, { opacity: 0, y: 24 }));

  const show = (targets, stagger = 0.08) => gsap.to(targets, {
    opacity: 1, x: 0, y: 0, scale: 1,
    duration: 0.7,
    stagger,
    overwrite: true,
    clearProps: 'transform',
  });

  if (!ScrollTrigger) {                  // tanpa ScrollTrigger: langsung tampil
    show(singles);
    groups.forEach((g) => show(g.children, 0.06));
    return;
  }

  ScrollTrigger.batch(singles, { start: 'top 90%', once: true, onEnter: (batch) => show(batch) });
  groups.forEach((group) => {
    ScrollTrigger.create({
      trigger: group,
      start: 'top 88%',
      once: true,
      onEnter: () => show(group.children, 0.07),
    });
  });
}

/* ---------- Angka naik ---------- */

function setCount(el, value) {
  el.textContent = Math.round(value).toLocaleString('id-ID');
}

function setupCounters() {
  $$('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    setCount(el, 0);
    const run = () => countUp(el, target);
    if (ScrollTrigger) ScrollTrigger.create({ trigger: el, start: 'top 92%', once: true, onEnter: run });
    else run();
  });
}

/** Menganimasikan angka dari nilai sekarang ke `to` */
export function countUp(el, to, { duration = 1.1 } = {}) {
  el.dataset.count = to;
  if (isReduced()) return setCount(el, to);
  const from = Number(String(el.textContent).replace(/\D/g, '')) || 0;
  const state = { v: from };
  return gsap.to(state, {
    v: to,
    duration,
    ease: 'power2.out',
    onUpdate: () => setCount(el, state.v),
  });
}

/**
 * Menganimasikan custom property --value (bar, ring, route).
 * Bila gerak minimal: nilai langsung diset.
 */
export function tweenValue(el, to, { duration = 1 } = {}) {
  if (isReduced()) {
    el.style.setProperty('--value', to);
    return null;
  }
  return gsap.to(el, { '--value': to, duration, ease: 'power3.out' });
}

/* ---------- Mengambang ---------- */

function setupFloat() {
  $$('[data-float]').forEach((el, i) => {
    const amp = Number(el.dataset.float) || 10;
    gsap.to(el, {
      y: `-=${amp}`,
      rotation: gsap.utils.random(-3, 3),
      duration: gsap.utils.random(2.8, 4.6),
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: i * 0.25,
    });
  });
}

/* ---------- Parallax dekorasi latar ----------
   Hanya untuk elemen dekoratif [data-parallax]; scrub mengikuti scroll
   sehingga tidak ada animasi yang berjalan saat halaman diam.          */
function setupParallax() {
  if (!ScrollTrigger) return;
  $$('[data-parallax]').forEach((el) => {
    const speed = Number(el.dataset.parallax) || 0.1;
    gsap.to(el, {
      yPercent: speed * -100,
      ease: 'none',
      scrollTrigger: { start: 0, end: 'max', scrub: 0.6 },
    });
  });
}

/* ---------- Tilt kartu (hanya mouse/trackpad) ---------- */

function setupTilt() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;
  const cleanups = $$('[data-tilt]').map((card) => {
    gsap.set(card, { transformPerspective: 900 });
    const rx = gsap.quickTo(card, 'rotationX', { duration: 0.5, ease: 'power3.out' });
    const ry = gsap.quickTo(card, 'rotationY', { duration: 0.5, ease: 'power3.out' });
    const move = (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      ry(px * 6);
      rx(py * -6);
    };
    const leave = () => { rx(0); ry(0); };
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerleave', leave);
    return () => {
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerleave', leave);
    };
  });
  return () => cleanups.forEach((fn) => fn());
}

/* ---------- Umpan balik mikro ---------- */

/** Efek "membal" — jawaban benar, badge didapat, item dicentang */
export function pop(el) {
  if (isReduced() || !el) return;
  gsap.fromTo(el, { scale: 0.88 }, { scale: 1, duration: 0.5, ease: 'back.out(3)', clearProps: 'scale' });
}

/** Efek "geleng" — jawaban salah, validasi gagal */
export function shake(el) {
  if (isReduced() || !el) return;
  gsap.fromTo(el, { x: 0 }, {
    keyframes: { x: [-8, 8, -6, 6, -3, 0] },
    duration: 0.45,
    ease: 'none',
    clearProps: 'x',
  });
}

/** Menampilkan elemen dengan animasi masuk (modal, panel, completion) */
export function enter(el, from = { opacity: 0, y: 24 }) {
  if (isReduced() || !el) return null;
  return gsap.fromTo(el, from, { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.55, clearProps: 'all' });
}

/**
 * Transisi antarbagian yang sadar arah: maju → masuk dari kanan,
 * mundur → masuk dari kiri. Anak-anak `children` masuk berurutan.
 */
export function slideIn(el, direction = 1, children = []) {
  if (isReduced() || !el) return null;
  const tl = gsap.timeline();
  tl.fromTo(el, { opacity: 0, x: 28 * direction }, { opacity: 1, x: 0, duration: 0.45, ease: 'power3.out', clearProps: 'transform,opacity' });
  if (children.length) {
    tl.fromTo(children, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, clearProps: 'transform,opacity' }, 0.12);
  }
  return tl;
}

/** Anak-anak masuk berurutan (dipakai isi modal, daftar dinamis) */
export function staggerIn(elements, from = { opacity: 0, y: 12 }) {
  if (isReduced() || !elements?.length) return null;
  return gsap.fromTo(elements, from, { opacity: 1, x: 0, y: 0, duration: 0.4, stagger: 0.05, delay: 0.05, clearProps: 'transform,opacity' });
}

/* ---------- Confetti ringan (tanpa library tambahan) ---------- */

const CONFETTI_COLORS = ['#FFC83D', '#3B5BDB', '#FF7A1A', '#12A4A4', '#D6336C', '#8FB82E'];

/**
 * Ledakan confetti dari sebuah elemen atau titik {x, y}.
 * ~28 partikel, dihapus otomatis setelah selesai.
 */
export function confetti(origin = null, count = 28) {
  if (isReduced()) return;
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  if (origin instanceof Element) {
    const r = origin.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  } else if (origin) {
    ({ x, y } = origin);
  }

  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);

  const tl = gsap.timeline({ onComplete: () => layer.remove() });
  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement('span');
    piece.className = `confetti-piece${i % 3 === 0 ? ' is-round' : ''}`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    layer.append(piece);

    const angle = gsap.utils.random(-Math.PI, 0);          // menyebar ke atas
    const dist = gsap.utils.random(90, 220);
    tl.fromTo(piece,
      { x: 0, y: 0, rotation: 0, opacity: 1 },
      {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        rotation: gsap.utils.random(-260, 260),
        duration: 0.6,
        ease: 'power3.out',
      }, 0)
      .to(piece, {
        y: `+=${gsap.utils.random(160, 280)}`,
        opacity: 0,
        duration: gsap.utils.random(0.8, 1.2),
        ease: 'power1.in',
      }, 0.55);
  }
}

/* ---------- Transisi antarhalaman ----------
   Keluar: 5 strip warna jalur naik menutup layar → pindah halaman.
   Masuk : skrip inline di <head> menutup layar (html.is-entering),
           lalu strip turun membuka konten.                            */

function getCurtain() {
  let curtain = document.querySelector('.curtain');
  if (!curtain) {
    curtain = document.createElement('div');
    curtain.className = 'curtain';
    curtain.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 5; i += 1) curtain.append(document.createElement('i'));
    document.body.append(curtain);
  }
  return curtain;
}

export function pageLeave(href) {
  loader.start();                         // umpan balik: halaman sedang dimuat
  if (isReduced()) {
    window.location.href = href;
    return;
  }
  const stripes = getCurtain().children;
  gsap.fromTo(stripes,
    { scaleY: 0, transformOrigin: 'bottom' },
    {
      scaleY: 1,
      duration: 0.42,
      ease: 'power3.inOut',
      stagger: 0.05,
      onComplete: () => {
        try { sessionStorage.setItem(TRANSITION_FLAG, '1'); } catch { /* abaikan */ }
        window.location.href = href;
      },
    });
}

function pageEnter() {
  try { sessionStorage.removeItem(TRANSITION_FLAG); } catch { /* abaikan */ }
  if (!root.classList.contains('is-entering')) return;

  if (isReduced()) {
    root.classList.remove('is-entering');
    return;
  }
  const stripes = getCurtain().children;
  gsap.set(stripes, { scaleY: 1, transformOrigin: 'top' });
  root.classList.remove('is-entering');      // ganti penutup CSS dengan strip GSAP
  gsap.to(stripes, {
    scaleY: 0,
    duration: 0.5,
    ease: 'power3.inOut',
    stagger: 0.05,
    delay: 0.05,
  });
}

// Kembali dengan tombol Back (bfcache): pastikan tirai tidak menutupi layar
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  root.classList.remove('is-entering');
  const curtain = document.querySelector('.curtain');
  if (curtain && gsap) gsap.set(curtain.children, { scaleY: 0 });
  loader.done();
});
