/* =====================================================================
   pages/module-detail.js — Detail modul + LESSON PLAYER (V4)
   ---------------------------------------------------------------------
   Satu URL, dua tampilan:
   - module.html?id=tx            → DETAIL MODUL: ringkasan, progres, daftar
                                    materi & bagian, kuis, ringkasan modul.
   - module.html?id=tx#tx-9       → LESSON PLAYER layar penuh (100dvh):
                                    header ringkas, SATU bagian per layar,
                                    bar bawah tetap: Sebelumnya · 03/25 · Berikutnya.
   Tautan lama (#id-3, #kuis, #selesai, #feedback) tetap bekerja; id modul
   & bagian tidak berubah sehingga progres pengguna tidak perlu migrasi.

   Segmentasi: bagian materi yang lebih tinggi dari layar dipecah otomatis
   menjadi beberapa "layar" per KELOMPOK BLOK (tidak pernah memotong di
   tengah contoh/aktivitas). Teks materi tidak diubah. Jumlah layar bisa
   berbeda di HP & desktop; blok yang sendirinya lebih tinggi dari layar
   bisa di-scroll di dalam panel, sementara bar navigasi tetap terlihat.

   Progres: Berikutnya di layar terakhir sebuah bagian → state.completeLesson
   (XP sekali); kuis → state.recordQuiz; "Tandai modul selesai" →
   state.markModuleComplete. Bagian yang berisi aktivitas bernilai baru bisa
   dilanjutkan setelah aktivitas itu dikerjakan (minimal satu kali).
   Fullscreen browser hanya aktif lewat tombol (tidak otomatis).
   ===================================================================== */

import { $, $$, h, icon } from '../core/dom.js';
import { initRings, setProgress, toast } from '../core/ui.js';
import { loadJSON } from '../core/data.js';
import * as state from '../core/state.js';
import * as feedback from '../core/feedback-store.js';
import * as motion from '../core/motion.js';
import { renderBlocks, rich } from '../features/lesson-renderer.js';
import { createQuiz } from '../features/quiz.js';

const KIND_LABEL = { intro: 'Pengantar', topic: 'Konsep', visual: 'Visual', example: 'Contoh praktis', exercise: 'Latihan', quiz: 'Cek pemahaman', summary: 'Ringkasan' };
const KIND_ICON = { intro: 'flame', topic: 'book', visual: 'eye', example: 'file', exercise: 'spark', quiz: 'target', summary: 'trophy' };
const SCORED = new Set(state.SCORED_ACTIVITIES);
const root = document.documentElement;

let mod = null;          // ringkasan modul dari state.getSummary()
let content = null;      // isi data/content/<id>.json
let references = [];
let sections = [];       // [{ id, kind, title, minutes }]
let topics = [];         // kelompok "Materi" [{ id, title, objective, summary, lessons }]
let topicOf = new Map(); // id bagian → { topic, index, first, last }
let currentId = null;
let host = null;
let els = {};
let screens = [];        // [[elemen blok, ...], ...] untuk bagian yang sedang dibuka
let screenIndex = 0;
let wantFeedback = false;

export async function init() {
  const id = new URLSearchParams(window.location.search).get('id');
  host = $('[data-module-detail]');
  mod = state.getSummary().modules.find((m) => m.id === id);
  if (!mod) return renderNotFound(host);

  host.replaceChildren(h('div', { class: 'learn-skeleton', 'aria-busy': 'true', 'aria-label': 'Memuat materi' },
    h('div', { class: 'skeleton skeleton--title' }),
    h('div', { class: 'skeleton skeleton--line' }),
    h('div', { class: 'skeleton skeleton--line is-short' }),
    h('div', { class: 'skeleton skeleton--block' })));

  try {
    const [c, refs] = await Promise.all([loadJSON(`content/${mod.id}`), loadJSON('references')]);
    content = c;
    references = refs.references.filter((r) => content.references.includes(r.id));
  } catch (error) {
    console.error(error);
    host.replaceChildren(h('div', { class: 'empty-state' }, h('p', { class: 'empty-state__title' }, 'Materi gagal dimuat'),
      h('p', {}, 'Muat ulang halaman. Pastikan situs dibuka lewat server (bukan file://).')));
    return;
  }

  document.body.dataset.module = mod.id;
  sections = [
    ...mod.lessons,
    { id: 'kuis', kind: 'quiz', title: 'Cek pemahaman', minutes: 5 },
    { id: 'selesai', kind: 'summary', title: 'Ringkasan & selesai', minutes: 2 },
  ];
  buildTopics();

  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);
  window.addEventListener('resize', debounce(() => { if (currentId) paginate({ keep: true }); }, 200));
  document.addEventListener('fullscreenchange', syncFullscreen);
  state.subscribe(() => refreshProgress());
  route();
}

/* =====================================================================
   ROUTING: tanpa hash → detail · dengan hash → player
   ===================================================================== */

function sectionFromHash() {
  const hash = decodeURIComponent(window.location.hash.slice(1));
  if (sections.some((s) => s.id === hash)) return hash;
  // #feedback = bagian Ringkasan, lalu gulir ke form feedback
  if (hash === 'feedback') { wantFeedback = true; return 'selesai'; }
  return null;
}

function route() {
  const id = sectionFromHash();
  // hashchange & popstate bisa terpicu bersamaan untuk satu navigasi: abaikan yang kedua
  if (id && id === currentId && els.player?.isConnected && root.classList.contains('player-mode')) return;
  if (!id && currentId === null && host.querySelector('.md-hero')) return;
  if (id) openPlayer(id);
  else renderDetail();
}

function go(id, opts = {}) {
  if (`#${id}` === window.location.hash) openPlayer(id, opts);
  else { pendingOpts = opts; window.location.hash = id; }   // hashchange → route()
}
let pendingOpts = {};

function exitPlayer() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  history.pushState(null, '', `${window.location.pathname}${window.location.search}`);
  route();
}

/** Bagian berikutnya yang disarankan dari detail modul */
function resumeId() {
  const m = currentModule();
  if (m.nextLesson) return m.nextLesson.id;
  if (!m.quizPassed) return 'kuis';
  return m.status === 'done' ? sections[0].id : 'selesai';
}

/* =====================================================================
   DETAIL MODUL
   ===================================================================== */

function renderDetail({ quiet = false } = {}) {
  currentId = null;
  root.classList.remove('player-mode', 'focus-mode');
  document.title = `${mod.title} · The Ultimate Job Application Pipeline`;
  const m = currentModule();
  mod = { ...mod, ...m };
  const resume = resumeId();
  const resumeSection = sections.find((x) => x.id === resume);
  const ctaLabel = m.status === 'done' ? 'Ulas dari awal' : m.lessonsDone === 0 && !m.quizAttempts ? 'Mulai belajar' : 'Lanjutkan belajar';
  const ring = h('div', { class: 'ring ring--lg', 'data-ring': true, 'data-value': m.pct, 'data-label': `Progres modul ${mod.title}` });

  const topicRows = topics.map((t, index) => {
    const done = t.lessons.filter((lid) => isLessonDone(lid)).length;
    const complete = done === t.lessons.length;
    const target = t.lessons.find((lid) => !isLessonDone(lid)) || t.lessons[0];
    return h('li', { class: `md-topic${complete ? ' is-done' : ''}` },
      h('details', {},
        h('summary', { class: 'md-topic__head' },
          h('span', { class: 'md-topic__num', 'aria-hidden': 'true' }, complete ? icon('check') : String(index + 1)),
          h('span', { class: 'md-topic__body' },
            h('span', { class: 'md-topic__title' }, t.title),
            h('span', { class: 'md-topic__meta' }, `Materi ${index + 1} · ${done}/${t.lessons.length} bagian${complete ? ' · selesai' : ''}`)),
          h('span', { class: 'md-topic__toggle', 'aria-hidden': 'true' }, icon('arrow-right'))),
        h('ol', { class: 'md-lessons', role: 'list' }, t.lessons.map((lid) => {
          const sec = sections.find((x) => x.id === lid);
          const ok = isLessonDone(lid);
          return h('li', {}, h('a', { class: `md-lesson${ok ? ' is-done' : ''}`, href: `#${lid}` },
            h('span', { class: 'md-lesson__dot', 'aria-hidden': 'true' }, ok ? icon('check') : ''),
            h('span', { class: 'md-lesson__title' }, sec?.title || lid),
            h('span', { class: 'md-lesson__min' }, sec?.minutes ? `±${sec.minutes} mnt` : ''),
            h('span', { class: 'sr-only' }, ok ? '(selesai)' : '(belum selesai)')));
        }))),
      h('a', { class: 'btn btn--ghost btn--sm md-topic__open', href: `#${target}` }, complete ? 'Ulas' : done ? 'Lanjut' : 'Buka', h('span', { class: 'sr-only' }, ` materi ${t.title}`)));
  });

  const quizText = m.quizAttempts ? `Skor terbaik ${m.quizBest} · ${m.quizAttempts}× percobaan${m.quizPassed ? ' · lulus' : ` · nilai lulus ${state.getPassScore()}`}` : `${content.quiz.length} soal · nilai lulus ${state.getPassScore()}`;
  const fb = feedback.get(mod.id);

  host.replaceChildren(
    h('nav', { class: 'md-crumbs', 'aria-label': 'Navigasi' },
      h('a', { class: 'back-link', href: 'modules.html' }, icon('arrow-left'), 'Semua modul')),
    h('header', { class: 'card md-hero', 'aria-labelledby': 'md-title' },
      h('div', { class: 'md-hero__copy' },
        h('div', { class: 'cluster' }, h('span', { class: 'code' }, mod.code), h('span', { class: 'eyebrow' }, `Modul ${String(mod.number).padStart(2, '0')} · ${mod.tagline}`)),
        h('h1', { class: 'h1 md-hero__title', id: 'md-title', tabindex: '-1' }, mod.title),
        h('p', { class: 'md-hero__desc' }, mod.description),
        h('p', { class: 'md-hero__meta' }, icon('clock'), `±${mod.minutes + 7} menit`, h('span', { 'aria-hidden': 'true' }, '·'), `${topics.length} materi`, h('span', { 'aria-hidden': 'true' }, '·'), `${mod.lessons.length} bagian + kuis`),
        h('div', { class: 'md-hero__cta' },
          h('a', { class: 'btn btn--primary', href: `#${resume}` }, ctaLabel, icon('arrow-right', 'icon--trail')),
          m.status !== 'done' && resumeSection ? h('span', { class: 'text-soft text-sm' }, `Berikutnya: ${resumeSection.title}`) : null)),
      h('div', { class: 'md-hero__progress' }, ring,
        h('dl', { class: 'md-hero__stats' },
          h('div', {}, h('dt', {}, 'Bagian'), h('dd', {}, `${m.lessonsDone}/${m.lessonsTotal}`)),
          h('div', {}, h('dt', {}, 'Kuis'), h('dd', {}, m.quizBest == null ? '—' : String(m.quizBest))),
          h('div', {}, h('dt', {}, 'Status'), h('dd', {}, m.status === 'done' ? 'Selesai' : m.readyToComplete ? 'Siap ditutup' : m.status === 'progress' ? 'Berjalan' : 'Belum mulai')))),
      h('img', { class: 'md-hero__art', src: mod.illustration, alt: '', width: 400, height: 300, decoding: 'async' })),
    h('div', { class: 'md-grid' },
      h('section', { class: 'card md-topics', 'aria-labelledby': 'md-topics-title' },
        h('h2', { class: 'h4', id: 'md-topics-title' }, 'Materi & bagian'),
        h('p', { class: 'text-soft text-sm' }, 'Buka sebuah materi untuk melihat bagiannya. Setiap bagian tampil satu layar di lesson player.'),
        h('ol', { class: 'md-topic-list', role: 'list' }, topicRows)),
      h('aside', { class: 'md-side', 'aria-label': 'Evaluasi modul' },
        h('a', { class: `card md-step${m.quizPassed ? ' is-done' : ''}`, href: '#kuis' },
          h('span', { class: 'md-step__icon' }, icon(m.quizPassed ? 'check' : 'target')),
          h('span', { class: 'md-step__body' }, h('strong', {}, 'Kuis modul'), h('span', {}, quizText)), icon('arrow-right')),
        h('a', { class: `card md-step${m.status === 'done' ? ' is-done' : ''}`, href: '#selesai' },
          h('span', { class: 'md-step__icon' }, icon(m.status === 'done' ? 'check' : 'trophy')),
          h('span', { class: 'md-step__body' }, h('strong', {}, 'Ringkasan & selesai'),
            h('span', {}, m.status === 'done' ? 'Modul sudah ditandai selesai' : m.readyToComplete ? 'Siap ditandai selesai' : 'Tandai selesai setelah semua bagian + kuis lulus')), icon('arrow-right')),
        m.status === 'done' ? h('a', { class: 'card md-step', href: '#feedback' },
          h('span', { class: 'md-step__icon' }, icon('edit')),
          h('span', { class: 'md-step__body' }, h('strong', {}, 'Feedback modul'), h('span', {}, fb ? 'Sudah diisi · ubah atau hapus' : 'Opsional · 3 pertanyaan singkat')), icon('arrow-right')) : null,
        h('a', { class: 'btn btn--ghost btn--sm', href: 'evaluation.html' }, icon('clipboard-check', 'icon--lead'), 'Semua kuis di Evaluation'))));
  initRings(host);
  if (!quiet) {
    window.scrollTo({ top: 0 });
    if (document.activeElement === document.body || !document.contains(document.activeElement)) $('#md-title', host)?.focus({ preventScroll: true });
  }
}

/* =====================================================================
   LESSON PLAYER
   ===================================================================== */

function buildPlayer() {
  els.progressBar = h('div', { class: 'bar bar--thin player__bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Progres modul' }, h('span', { class: 'bar__fill' }));
  els.headTitle = h('p', { class: 'player__section' });
  els.headCount = h('p', { class: 'player__count mono' });
  els.tocBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--icon player__tool', 'aria-expanded': 'false', 'aria-controls': 'player-toc', 'aria-label': 'Daftar bagian', 'data-tooltip': 'Daftar bagian', onclick: () => toggleToc() }, icon('list'));
  els.focusBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--icon player__tool player__focus', 'aria-pressed': 'false', 'aria-label': 'Mode fokus (sembunyikan sidebar)', 'data-tooltip': 'Mode fokus', onclick: toggleFocus }, icon('panel-left-close'));
  els.fsBtn = document.fullscreenEnabled
    ? h('button', { type: 'button', class: 'btn btn--ghost btn--icon player__tool', 'aria-pressed': 'false', 'aria-label': 'Layar penuh', 'data-tooltip': 'Layar penuh', onclick: toggleFullscreen }, icon('maximize'))
    : null;
  els.toc = h('nav', { class: 'player__toc', id: 'player-toc', 'aria-label': 'Daftar bagian modul', hidden: true },
    h('div', { class: 'player__tochead' },
      h('p', { class: 'eyebrow' }, 'Daftar bagian'),
      h('button', { type: 'button', class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': 'Tutup daftar bagian', onclick: () => toggleToc(false) }, icon('x'))),
    els.tocList = h('div', { class: 'learn-nav' }));
  els.stage = h('article', { class: 'player__stage', tabindex: '-1', 'aria-labelledby': 'player-title' });
  els.prev = h('button', { type: 'button', class: 'btn btn--secondary player__prev', 'aria-label': 'Sebelumnya', onclick: prev }, icon('arrow-left', 'icon--lead'), h('span', { 'aria-hidden': 'true' }, 'Sebelumnya'));
  els.next = h('button', { type: 'button', class: 'btn btn--primary player__next', 'aria-label': 'Berikutnya', onclick: next }, h('span', { 'data-next-label': true, 'aria-hidden': 'true' }, 'Berikutnya'), icon('arrow-right', 'icon--trail'));
  els.counter = h('p', { class: 'player__counter', 'aria-live': 'polite' });
  els.gate = h('p', { class: 'player__gate', role: 'status' });

  els.player = h('div', { class: 'player', 'data-module': mod.id },
    h('header', { class: 'player__head' },
      h('a', { class: 'btn btn--ghost btn--sm player__exit', href: `module.html?id=${mod.id}`, onclick: (e) => { e.preventDefault(); exitPlayer(); } }, icon('arrow-left', 'icon--lead'), h('span', { class: 'player__exittext' }, 'Modul')),
      h('div', { class: 'player__titles' },
        h('p', { class: 'player__module' }, h('span', { class: 'code' }, mod.code), h('span', { class: 'player__modname' }, `Modul ${String(mod.number).padStart(2, '0')} · ${mod.title}`)),
        els.headTitle),
      h('div', { class: 'player__meta' }, els.headCount, els.progressBar),
      h('div', { class: 'player__tools' }, els.tocBtn, els.focusBtn, els.fsBtn)),
    h('div', { class: 'player__body' }, els.toc, els.stage),
    h('footer', { class: 'player__nav' },
      els.prev,
      h('div', { class: 'player__mid' }, els.counter, els.gate),
      els.next));
}

function openPlayer(id, opts = pendingOpts) {
  pendingOpts = {};
  if (!els.player || !els.player.isConnected) {
    buildPlayer();
    host.replaceChildren(els.player);
    try { if (sessionStorage.getItem('ujap:focus') === '1') setFocus(true); } catch { /* abaikan */ }
  }
  root.classList.add('player-mode');
  const prevIndex = sections.findIndex((s) => s.id === currentId);
  const direction = sections.findIndex((s) => s.id === id) >= prevIndex ? 1 : -1;
  const first = currentId === null;
  currentId = id;
  const index = sections.findIndex((s) => s.id === id);
  const section = sections[index];
  state.visit(mod.id, section.kind === 'quiz' || section.kind === 'summary' ? null : section.id);
  document.title = `${section.title} · ${mod.title}`;

  const body = h('div', { class: 'learn-stage__body player__blocks' });
  if (section.kind === 'quiz') renderQuiz(body);
  else if (section.kind === 'summary') renderSummary(body);
  else {
    const place = topicOf.get(section.id);
    if (place?.first && place.topic.objective) body.append(topicObjective(place));
    body.append(renderBlocks(content.sections[section.id]?.blocks || [], {
      moduleId: mod.id,
      content,
      references,
      userName: state.getState().user.name,
    }));
    if (place?.last && place.topic.summary?.length) body.append(topicSummary(place));
  }

  const place = topicOf.get(section.id);
  const title = h('h1', { class: 'h2 learn-stage__title', id: 'player-title', tabindex: '-1' }, section.title);
  els.stage.dataset.kind = section.kind;
  els.stage.replaceChildren(
    h('header', { class: 'learn-stage__head player__stagehead' },
      h('p', { class: 'learn-stage__eyebrow' },
        h('span', { class: 'learn-kind' }, icon(KIND_ICON[section.kind]), KIND_LABEL[section.kind]),
        place ? h('span', { class: 'learn-topic-tag' }, `Materi ${place.index + 1} · ${place.topic.title}`) : null,
        section.minutes ? h('span', { class: 'eyebrow' }, `±${section.minutes} menit`) : null,
        h('span', { 'data-section-status': true })),
      title),
    body);
  els.body = body;
  els.headTitle.textContent = section.title;
  els.headCount.textContent = `Bagian ${String(index + 1).padStart(2, '0')}/${String(sections.length).padStart(2, '0')}`;
  toggleToc(false, { silent: true });

  paginate({ startAtEnd: Boolean(opts.startAtEnd) });
  refreshProgress();

  if (!first) motion.slideIn(els.stage, direction, $$('.player__blocks > .learn-block:not(.is-offscreen)', els.stage).slice(0, 4));
  if (!first) title.focus({ preventScroll: true });
  if (wantFeedback && section.kind === 'summary') {
    wantFeedback = false;
    const fb = $('#feedback', els.stage);
    if (fb && !fb.hidden) {
      const i = screens.findIndex((group) => group.includes(fb));
      if (i >= 0) showScreen(i);
      requestAnimationFrame(() => { fb.scrollIntoView({ block: 'start' }); $('#fb-title', fb)?.focus({ preventScroll: true }); });
    }
  }
}

/* ---------- Segmentasi layar (per kelompok blok) ---------- */

function paginate({ keep = false, startAtEnd = false } = {}) {
  if (!els.body?.isConnected) return;
  const anchor = keep ? screens[screenIndex]?.[0] : null;
  const blocks = [...els.body.children];
  blocks.forEach((b) => b.classList.remove('is-offscreen'));
  // Ruang tersedia = tinggi panel − judul bagian − padding
  const stage = els.stage;
  const cs = getComputedStyle(stage);
  const head = $('.player__stagehead', stage);
  const gap = parseFloat(getComputedStyle(els.body).rowGap) || 24;
  const avail = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - (head?.offsetHeight || 0) - gap;
  screens = [];
  let group = [];
  let used = 0;
  blocks.forEach((b) => {
    const hgt = b.offsetHeight;
    const need = used ? used + gap + hgt : hgt;
    if (group.length && need > avail) {
      // Judul kecil (blok "h") tidak boleh tertinggal sendirian di akhir layar: ikut ke layar berikutnya
      const carry = [];
      while (group.length > 1 && /^H[2-4]$/.test(group[group.length - 1].tagName)) carry.unshift(group.pop());
      screens.push(group);
      group = [...carry, b];
      used = group.reduce((sum, el, i) => sum + el.offsetHeight + (i ? gap : 0), 0);
    } else { group.push(b); used = need; }
  });
  if (group.length) screens.push(group);
  if (!screens.length) screens = [[]];
  let target = startAtEnd ? screens.length - 1 : 0;
  if (anchor) target = Math.max(0, screens.findIndex((g) => g.includes(anchor)));
  showScreen(target, { silent: true });
}

function showScreen(i, { silent = false } = {}) {
  screenIndex = Math.max(0, Math.min(i, screens.length - 1));
  // Kelas khusus (bukan atribut hidden) agar tidak bentrok dengan blok yang memang disembunyikan
  screens.forEach((group, gi) => group.forEach((b) => b.classList.toggle('is-offscreen', gi !== screenIndex)));
  // Judul bagian hanya di layar pertama agar layar berikutnya lega
  const head = $('.player__stagehead', els.stage);
  if (head) head.classList.toggle('is-compact', screenIndex > 0);
  els.stage.scrollTop = 0;
  updateNav();
  if (!silent) {
    motion.staggerIn($$('.player__blocks > .learn-block:not(.is-offscreen)', els.stage).slice(0, 4), { opacity: 0, y: 12 });
    els.stage.focus({ preventScroll: true });
  }
}

/* ---------- Navigasi bawah ---------- */

/** Aktivitas bernilai di bagian ini yang belum pernah dikerjakan */
function pendingActivities(section) {
  if (!section || ['quiz', 'summary'].includes(section.kind)) return [];
  const blocks = content.sections[section.id]?.blocks || [];
  const acts = state.getState().activities;
  return blocks.filter((b) => b.id && SCORED.has(b.id) && !acts[b.id]);
}

function updateNav() {
  const index = sections.findIndex((s) => s.id === currentId);
  const section = sections[index];
  const lastScreen = screenIndex >= screens.length - 1;
  const lastSection = index === sections.length - 1;
  const pending = lastScreen ? pendingActivities(section) : [];

  els.prev.disabled = index === 0 && screenIndex === 0;
  const label = $('[data-next-label]', els.next);
  label.textContent = lastScreen && lastSection ? 'Selesai' : lastScreen && !['quiz', 'summary'].includes(section.kind) && !isLessonDone(section.id) ? 'Selesai & lanjut' : 'Berikutnya';
  els.next.setAttribute('aria-label', label.textContent);   // nama aksesibel = teks tombol (tetap ada saat teks disembunyikan di HP)
  els.next.disabled = pending.length > 0;
  els.next.classList.toggle('btn--primary', true);

  els.counter.replaceChildren(
    h('span', { class: 'player__counter-main mono' }, `${String(index + 1).padStart(2, '0')} / ${String(sections.length).padStart(2, '0')}`),
    screens.length > 1
      ? h('span', { class: 'player__dots', 'aria-label': `Layar ${screenIndex + 1} dari ${screens.length}` },
        screens.map((_, i) => h('span', { class: `player__dot${i === screenIndex ? ' is-active' : ''}`, 'aria-hidden': 'true' })),
        h('span', { class: 'player__screen' }, `Layar ${screenIndex + 1}/${screens.length}`))
      : null);
  els.gate.textContent = pending.length
    ? `Kerjakan ${pending.length > 1 ? 'aktivitas' : `"${pending[0].title || 'aktivitas'}"`} di layar ini untuk lanjut.`
    : '';
}

function next() {
  if (screenIndex < screens.length - 1) { showScreen(screenIndex + 1); return; }
  const index = sections.findIndex((s) => s.id === currentId);
  const section = sections[index];
  if (pendingActivities(section).length) { updateNav(); return; }
  if (!['quiz', 'summary'].includes(section.kind) && !isLessonDone(section.id)) {
    state.completeLesson(mod.id, section.id);
    toast(`"${section.title}" selesai.`, { type: 'success', title: `+${state.XP.lesson} XP`, duration: 2500 });
  }
  if (index === sections.length - 1) { exitPlayer(); return; }
  go(sections[index + 1].id);
}

function prev() {
  if (screenIndex > 0) { showScreen(screenIndex - 1); return; }
  const index = sections.findIndex((s) => s.id === currentId);
  if (index > 0) go(sections[index - 1].id, { startAtEnd: true });
}

/* ---------- Daftar bagian, mode fokus, layar penuh ---------- */

function toggleToc(force, { silent = false } = {}) {
  if (!els.toc) return;
  const open = typeof force === 'boolean' ? force : els.toc.hidden;
  els.toc.hidden = !open;
  els.tocBtn.setAttribute('aria-expanded', String(open));
  els.player.classList.toggle('toc-open', open);
  if (open) $('.learn-nav__link.is-active', els.toc)?.scrollIntoView({ block: 'center' });
  if (open && !silent) $('.learn-nav__link.is-active', els.toc)?.focus();
}

function setFocus(on) {
  root.classList.toggle('focus-mode', on);
  els.focusBtn?.setAttribute('aria-pressed', String(on));
  try { sessionStorage.setItem('ujap:focus', on ? '1' : '0'); } catch { /* abaikan */ }
  if (currentId) requestAnimationFrame(() => paginate({ keep: true }));
}
function toggleFocus() { setFocus(!root.classList.contains('focus-mode')); }

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else root.requestFullscreen?.().catch(() => toast('Layar penuh tidak diizinkan oleh browser ini.', { type: 'error' }));
}
function syncFullscreen() {
  if (!els.fsBtn) return;
  const on = Boolean(document.fullscreenElement);
  els.fsBtn.setAttribute('aria-pressed', String(on));
  els.fsBtn.setAttribute('aria-label', on ? 'Keluar dari layar penuh' : 'Layar penuh');
  els.fsBtn.dataset.tooltip = on ? 'Keluar layar penuh' : 'Layar penuh';
  els.fsBtn.replaceChildren(icon(on ? 'minimize' : 'maximize'));
  if (currentId) requestAnimationFrame(() => paginate({ keep: true }));
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* =====================================================================
   MATERI, KUIS, RINGKASAN (dipakai ulang dari versi sebelumnya)
   ===================================================================== */

function buildTopics() {
  const lessonIds = mod.lessons.map((l) => l.id);
  topics = Array.isArray(mod.topics) && mod.topics.length
    ? mod.topics.map((t) => ({ ...t, lessons: t.lessons.filter((id) => lessonIds.includes(id)) })).filter((t) => t.lessons.length)
    : [{ id: 'm1', title: mod.title, objective: '', summary: [], lessons: lessonIds }];
  topicOf = new Map();
  topics.forEach((topic, index) => topic.lessons.forEach((id, i) => {
    topicOf.set(id, { topic, index, first: i === 0, last: i === topic.lessons.length - 1 });
  }));
}

const topicLabel = (index) => `Materi ${index + 1}`;

/* ---------- Kotak tujuan & ringkasan materi ---------- */

function topicObjective({ topic, index }) {
  return h('aside', { class: 'topic-box topic-box--goal learn-block', 'aria-label': `Tujuan ${topicLabel(index)}` },
    h('span', { class: 'topic-box__icon' }, icon('target')),
    h('div', {},
      h('p', { class: 'topic-box__eyebrow' }, `${topicLabel(index)} dari ${topics.length} · Tujuan`),
      h('p', { class: 'topic-box__title' }, topic.title),
      h('p', { class: 'topic-box__text' }, topic.objective)));
}

function topicSummary({ topic, index }) {
  const next = topics[index + 1];
  return h('aside', { class: 'topic-box topic-box--summary learn-block', 'aria-label': `Ringkasan ${topicLabel(index)}` },
    h('span', { class: 'topic-box__icon' }, icon('check')),
    h('div', {},
      h('p', { class: 'topic-box__eyebrow' }, `Ringkasan ${topicLabel(index)}`),
      h('p', { class: 'topic-box__title' }, topic.title),
      h('ul', { class: 'topic-box__list', role: 'list' }, topic.summary.map((t) => h('li', {}, rich(t)))),
      h('p', { class: 'topic-box__next' }, next ? `Berikutnya: ${topicLabel(index + 1)} · ${next.title}` : 'Berikutnya: cek pemahaman lewat kuis modul.')));
}

/* ---------- Kuis ---------- */

function renderQuiz(body) {
  const ms = state.getState().modules[mod.id];
  const intro = h('p', { class: 'learn-p' }, 'Uji pemahamanmu tanpa melihat materi dulu—mengingat kembali (active recall) membantu materi lebih melekat.');
  const host = h('div', { class: 'quiz-host' });
  body.append(intro, host);
  createQuiz(host, {
    questions: content.quiz,
    passScore: state.getPassScore(),
    best: ms?.quiz?.best ?? null,
    onFinish: (score, passed) => {
      const before = state.getState().modules[mod.id]?.quiz?.passedAt;
      state.recordQuiz(mod.id, score);
      if (passed && !before) toast('Kuis lulus! Kamu bisa menandai modul selesai di bagian Ringkasan.', { type: 'success', title: `+${state.XP.quiz} XP` });
    },
  });
}

/* ---------- Ringkasan + Mark as completed ---------- */

function renderSummary(body) {
  const summary = currentModule();
  const check = state.canComplete(mod.id);
  const nextModule = state.getSummary().modules.find((m) => m.number === mod.number + 1);

  // 9. MODULE SUMMARY
  body.append(
    h('section', { class: 'learn-summary', 'aria-labelledby': 'sum-title' },
      h('h3', { class: 'learn-h', id: 'sum-title' }, 'Poin penting'),
      h('ol', { class: 'takeaways', role: 'list' }, content.summary.takeaways.map((t) => h('li', {}, rich(t))))));

  // Peta materi: status penyelesaian tiap materi
  body.append(h('section', { class: 'learn-topics', 'aria-labelledby': 'topics-title' },
    h('h3', { class: 'learn-h', id: 'topics-title' }, 'Materi di modul ini'),
    h('ol', { class: 'topic-map', role: 'list' }, topics.map((t, index) => {
      const done = t.lessons.filter((id) => isLessonDone(id)).length;
      const complete = done === t.lessons.length;
      return h('li', { class: `topic-map__item${complete ? ' is-done' : ''}` },
        h('span', { class: 'topic-map__num', 'aria-hidden': 'true' }, complete ? icon('check') : String(index + 1)),
        h('span', { class: 'topic-map__body' },
          h('a', { href: `#${t.lessons.find((id) => !isLessonDone(id)) || t.lessons[0]}` }, t.title),
          h('span', { class: 'topic-map__meta' }, `${done}/${t.lessons.length} bagian${complete ? ' · selesai' : ''}`)));
    }))));

  // 10. MARK AS COMPLETED
  const completeBox = h('section', { class: 'complete-box', 'aria-labelledby': 'complete-title' });
  body.append(completeBox);
  renderCompleteBox(completeBox, summary, check, nextModule);

  // Final UX: feedback opsional, hanya setelah modul selesai
  const fbBox = h('section', { class: 'fb-box', id: 'feedback', 'aria-labelledby': 'fb-title' });
  body.append(fbBox);
  renderFeedbackBox(fbBox);

  // REFERENCES
  body.append(h('section', { class: 'learn-refs', 'aria-labelledby': 'refs-title' },
    h('h3', { class: 'learn-h', id: 'refs-title' }, 'Resources & references'),
    h('ul', { class: 'ref-list', role: 'list' }, references.map((r) => h('li', { class: 'ref-item' },
      h('p', { class: 'ref-item__cite' }, r.citation),
      h('p', { class: 'ref-item__about' }, r.about),
      h('div', { class: 'cluster', style: { '--cluster-gap': '8px' } },
        r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', class: 'ref-item__link' }, r.urlLabel, icon('external', 'icon--sm'), h('span', { class: 'sr-only' }, '(membuka tab baru)')) : null,
        r.verified ? null : h('span', { class: 'verify-tag' }, 'Perlu verifikasi')))))));
}

function renderCompleteBox(box, summary, check, nextModule) {
  if (summary.status === 'done') {
    box.className = 'completion complete-box';
    box.dataset.module = mod.id;
    box.replaceChildren(
      h('div', { class: 'completion__stamp' }, icon('trophy')),
      h('p', { class: 'eyebrow' }, `Modul ${String(mod.number).padStart(2, '0')} · Selesai`),
      h('h3', { class: 'h2 completion__title', id: 'complete-title' }, 'Stasiun ini sudah kamu lewati!'),
      h('p', { class: 'completion__text' }, content.summary.next),
      h('dl', { class: 'completion__stats' },
        h('div', {}, h('dt', {}, 'Skor kuis'), h('dd', { class: 'num' }, String(summary.quizBest ?? '—'))),
        h('div', {}, h('dt', {}, 'Bagian'), h('dd', { class: 'num' }, `${summary.lessonsDone}/${summary.lessonsTotal}`)),
        h('div', {}, h('dt', {}, 'Progres'), h('dd', { class: 'num' }, `${summary.pct}%`))),
      h('div', { class: 'cluster', style: { justifyContent: 'center' } },
        nextModule
          ? h('a', { class: 'btn btn--primary', href: nextModule.href }, `Lanjut ke Modul ${String(nextModule.number).padStart(2, '0')}`, icon('arrow-right', 'icon--trail'))
          : h('a', { class: 'btn btn--primary', href: 'progress.html' }, 'Lihat pencapaian', icon('arrow-right', 'icon--trail')),
        h('a', { class: 'btn btn--ghost', href: 'dashboard.html' }, 'Kembali ke Dashboard')));
    return;
  }

  const lessonsLeft = check.lessonsLeft;
  box.className = 'complete-box card card--flat';
  const btn = h('button', { type: 'button', class: 'btn btn--primary btn--lg', disabled: !check.ok }, icon('check', 'icon--lead'), 'Tandai modul selesai');
  btn.addEventListener('click', () => {
    if (!state.markModuleComplete(mod.id)) return;
    const updated = currentModule();
    renderCompleteBox(box, updated, state.canComplete(mod.id), nextModule);
    motion.enter(box, { opacity: 0, scale: 0.96 });
    motion.confetti($('.completion__stamp', box), 40);
    toast(`Modul ${mod.title} selesai!`, { type: 'success', title: `+${state.XP.module} XP` });
    refreshProgress();
    const fbBox = $('#feedback');
    if (fbBox) renderFeedbackBox(fbBox);
  });

  box.replaceChildren(
    h('h3', { class: 'learn-h', id: 'complete-title' }, 'Selesaikan modul'),
    h('ul', { class: 'complete-reqs', role: 'list' },
      h('li', { class: lessonsLeft.length ? '' : 'is-ok' }, icon(lessonsLeft.length ? 'clock' : 'check'),
        lessonsLeft.length ? `${lessonsLeft.length} bagian belum ditandai selesai` : 'Semua bagian selesai'),
      h('li', { class: check.quizPassed ? 'is-ok' : '' }, icon(check.quizPassed ? 'check' : 'clock'),
        check.quizPassed ? 'Kuis lulus' : `Kuis belum lulus (nilai minimal ${state.getPassScore()})`)),
    lessonsLeft.length ? h('p', { class: 'text-sm text-soft' }, 'Belum selesai: ',
      ...lessonsLeft.slice(0, 4).flatMap((l, i) => [i ? ', ' : '', h('a', { href: `#${l.id}` }, l.title)]),
      lessonsLeft.length > 4 ? ', …' : '') : null,
    !check.quizPassed ? h('a', { class: 'btn btn--secondary btn--sm', href: '#kuis' }, 'Kerjakan kuis') : null,
    btn);
}

/* ---------- Feedback modul (Final UX) ----------
   Opsional, tersimpan lokal (feedback-store.js). Bisa diubah & dihapus di
   sini atau di halaman Learning Progress.                               */
function renderFeedbackBox(box) {
  const done = currentModule().status === 'done';
  box.hidden = !done;
  if (!done) { box.replaceChildren(); return; }
  const saved = feedback.get(mod.id);
  const status = h('p', { class: 'fb-box__status text-sm', role: 'status' });
  const counter = h('span', { class: 'field__hint', id: 'fb-improve-count' });
  const textarea = h('textarea', { class: 'input fb-box__text', id: 'fb-improve', name: 'improve', rows: '3', maxlength: String(feedback.IMPROVE_MAX), 'aria-describedby': 'fb-improve-count' });
  textarea.value = saved?.improve || '';
  const count = () => { counter.textContent = `${textarea.value.length}/${feedback.IMPROVE_MAX} karakter`; };
  textarea.addEventListener('input', count);
  count();

  const form = h('form', { class: 'fb-box__form', novalidate: true },
    ...feedback.QUESTIONS.map((q) => h('fieldset', { class: 'fb-q' },
      h('legend', { class: 'fb-q__text' }, q.text),
      h('div', { class: 'segmented' }, Object.entries(feedback.ANSWERS).map(([value, label]) =>
        h('label', {}, h('input', { type: 'radio', name: q.id, value, checked: saved?.[q.id] === value || null }), h('span', {}, label)))))),
    h('div', { class: 'field' },
      h('label', { class: 'field__label', for: 'fb-improve' }, 'Bagian apa yang perlu diperbaiki? (opsional)'),
      textarea, counter),
    h('div', { class: 'cluster' },
      h('button', { type: 'submit', class: 'btn btn--secondary' }, icon('check', 'icon--lead'), saved ? 'Simpan perubahan' : 'Kirim feedback'),
      saved ? h('button', { type: 'button', class: 'btn btn--ghost', 'data-fb-remove': true }, icon('trash', 'icon--lead'), 'Hapus feedback') : ''),
    status);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const entry = {
      ...Object.fromEntries(feedback.QUESTIONS.map((q) => [q.id, data.get(q.id) || ''])),
      improve: String(data.get('improve') || '').trim(),
    };
    // Form kosong tidak disimpan (hapus feedback memakai tombol "Hapus feedback")
    if (!feedback.QUESTIONS.some((q) => entry[q.id]) && !entry.improve) {
      status.classList.add('is-error');
      status.textContent = 'Isi minimal satu jawaban atau catatan sebelum menyimpan.';
      return;
    }
    feedback.save(mod.id, entry);
    renderFeedbackBox(box);
    $('.fb-box__status', box).textContent = 'Feedback tersimpan di perangkat ini. Terima kasih!';
    $('#fb-title', box)?.focus();
  });
  form.addEventListener('click', (event) => {
    if (!event.target.closest('[data-fb-remove]')) return;
    feedback.remove(mod.id);
    renderFeedbackBox(box);
    $('.fb-box__status', box).textContent = 'Feedback dihapus.';
    $('#fb-title', box)?.focus();
  });

  box.replaceChildren(
    h('h3', { class: 'learn-h', id: 'fb-title', tabindex: '-1' }, 'Feedback untuk modul ini'),
    h('p', { class: 'text-sm text-soft' }, 'Opsional. Jawabanmu hanya tersimpan di perangkat ini (tidak dikirim ke server) dan bisa diubah atau dihapus kapan saja, juga dari halaman Learning Progress.'),
    form);
}

function currentModule() {
  return state.getSummary().modules.find((m) => m.id === mod.id);
}

function isLessonDone(id) {
  return (state.getState().modules[mod.id]?.lessonsDone || []).includes(id);
}

function sectionDone(section) {
  if (section.kind === 'quiz') return currentModule().quizPassed;
  if (section.kind === 'summary') return currentModule().status === 'done';
  return isLessonDone(section.id);
}

/* ---------- Sinkron progres (player & detail) ---------- */

function refreshProgress() {
  const m = currentModule();
  if (!m) return;
  mod = { ...mod, ...m };
  if (!currentId) {                       // tampilan detail: render ulang tanpa memindah fokus
    if (host?.querySelector('.md-hero')) renderDetailQuiet();
    return;
  }
  setProgress(els.progressBar, m.pct);
  els.progressBar.setAttribute('aria-valuenow', String(m.pct));

  const link = (s) => {
    const i = sections.indexOf(s);
    const done = sectionDone(s);
    const current = s.id === currentId;
    return h('li', {},
      h('a', {
        class: `sidebar__link learn-nav__link${current ? ' is-active' : ''}${done ? ' is-done' : ''}`,
        href: `#${s.id}`,
        'aria-current': current ? 'step' : null,
      },
      h('span', { class: 'learn-nav__dot', 'aria-hidden': 'true' }, done ? icon('check') : String(i + 1)),
      h('span', { class: 'learn-nav__text' }, s.title),
      h('span', { class: 'sr-only' }, done ? '(selesai)' : '(belum selesai)')));
  };
  const groups = [
    ...topics.map((t, index) => ({ key: t.id, label: `Materi ${index + 1}`, title: t.title, items: t.lessons.map((id) => sections.find((s) => s.id === id)) })),
    { key: 'eval', label: 'Evaluasi', title: 'Kuis & ringkasan', items: sections.filter((s) => s.kind === 'quiz' || s.kind === 'summary') },
  ];
  els.tocList.replaceChildren(...groups.map((g) => {
    const doneCount = g.items.filter(sectionDone).length;
    const headId = `nav-${g.key}`;
    return h('div', { class: `learn-nav__group${g.items.some((s) => s.id === currentId) ? ' is-current' : ''}` },
      h('p', { class: 'learn-nav__heading', id: headId },
        h('span', { class: 'learn-nav__label' }, g.label),
        h('span', { class: 'learn-nav__title' }, g.title),
        h('span', { class: 'learn-nav__count' }, `${doneCount}/${g.items.length}`)),
      h('ol', { class: 'sidebar__list', role: 'list', 'aria-labelledby': headId }, g.items.map(link)));
  }));

  const statusEl = $('[data-section-status]', els.stage);
  const section = sections.find((s) => s.id === currentId);
  if (statusEl && section) statusEl.replaceChildren(sectionDone(section) ? h('span', { class: 'chip chip--done' }, icon('check'), 'Selesai') : '');
  // Ringkasan: form feedback muncul setelah modul ditandai selesai → hitung ulang layar
  if (section?.kind === 'summary') requestAnimationFrame(() => paginate({ keep: true }));
  updateNav();
}

/** Render ulang detail modul (mis. progres berubah di tab lain) tanpa memindah fokus/scroll */
function renderDetailQuiet() {
  const y = window.scrollY;
  const active = document.activeElement;
  renderDetail({ quiet: true });
  window.scrollTo({ top: y });
  if (active && document.contains(active)) active.focus({ preventScroll: true });
}

/* ---------- Modul tidak ditemukan ---------- */

function renderNotFound(host) {
  document.title = 'Modul tidak ditemukan · The Ultimate Job Application Pipeline';
  host.replaceChildren(h('div', { class: 'empty-state', style: { marginTop: '48px' } },
    h('span', { class: 'empty-state__icon' }, icon('route')),
    h('h1', { class: 'h3' }, 'Modul tidak ditemukan'),
    h('p', {}, 'Tautan modul ini tidak valid. Pilih modul dari daftar.'),
    h('a', { class: 'btn btn--primary', href: 'modules.html' }, 'Lihat semua modul')));
}
