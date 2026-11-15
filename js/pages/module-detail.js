/* =====================================================================
   pages/module-detail.js — Pemutar pembelajaran modul (module.html?id=…)
   ---------------------------------------------------------------------
   Struktur (sesuai prinsip segmenting): materi ditampilkan PER BAGIAN,
   bukan satu halaman panjang. Urutan bagian:
     Pengantar (tujuan + introduction) → Materi (subtopik) → Visual →
     Contoh praktis → Latihan → Cek pemahaman (kuis) → Ringkasan & selesai
   Navigasi lewat hash (#id-3, #kuis, #selesai) sehingga tombol Back,
   tautan Dashboard, dan bookmark tetap bekerja.
   Progres: "Tandai selesai & lanjut" → state.completeLesson;
            kuis → state.recordQuiz; "Mark as completed" → state.markModuleComplete
   ===================================================================== */

import { $, $$, h, icon } from '../core/dom.js';
import { initRings, setProgress, toast } from '../core/ui.js';
import { loadJSON } from '../core/data.js';
import * as state from '../core/state.js';
import * as motion from '../core/motion.js';
import { renderBlocks, rich } from '../features/lesson-renderer.js';
import { createQuiz } from '../features/quiz.js';

const KIND_LABEL = { intro: 'Pengantar', topic: 'Materi', visual: 'Visual', example: 'Contoh praktis', exercise: 'Latihan', quiz: 'Cek pemahaman', summary: 'Ringkasan' };
const KIND_ICON = { intro: 'flame', topic: 'book', visual: 'eye', example: 'file', exercise: 'spark', quiz: 'target', summary: 'trophy' };

let mod = null;          // ringkasan modul dari state.getSummary()
let content = null;      // isi data/content/<id>.json
let references = [];
let sections = [];       // [{ id, kind, title, minutes }]
let currentId = null;
let els = {};

export async function init() {
  const id = new URLSearchParams(window.location.search).get('id');
  const host = $('[data-module-detail]');
  mod = state.getSummary().modules.find((m) => m.id === id);

  if (!mod) return renderNotFound(host);

  // Skeleton selama materi dimuat (terlihat pada koneksi lambat)
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

  document.title = `${mod.title} · The Ultimate Job Application Pipeline`;
  document.body.dataset.module = mod.id;
  sections = [
    ...mod.lessons,
    { id: 'kuis', kind: 'quiz', title: 'Cek pemahaman', minutes: 5 },
    { id: 'selesai', kind: 'summary', title: 'Ringkasan & selesai', minutes: 2 },
  ];

  renderShell(host);
  window.addEventListener('hashchange', () => show(resolveHash(), { fromHash: true }));
  show(resolveHash(), { initial: true });
  state.subscribe(() => refreshProgress());
}

/* ---------- Kerangka halaman ---------- */

function renderShell(host) {
  els.ring = h('div', { class: 'ring ring--lg', 'data-ring': true, 'data-value': mod.pct, 'data-label': `Progres modul ${mod.title}` });
  els.headStats = h('p', { class: 'learn-head__stats' });
  els.sideList = h('ol', { class: 'sidebar__list learn-nav', role: 'list' });
  els.sideBar = h('div', { class: 'bar bar--thin', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Progres modul' }, h('span', { class: 'bar__fill' }));
  els.sideCaption = h('p', { class: 'learn-side__caption' });
  els.stage = h('article', { class: 'card learn-stage', 'aria-live': 'off' });

  host.replaceChildren(
    // 1. MODULE HEADER
    h('header', { class: 'learn-head', 'aria-labelledby': 'learn-title' },
      h('div', { class: 'learn-head__copy' },
        h('nav', { class: 'learn-crumbs', 'aria-label': 'Navigasi' },
          h('a', { class: 'back-link', href: 'dashboard.html' }, icon('home'), 'Dashboard'),
          h('span', { 'aria-hidden': 'true' }, '/'),
          h('a', { class: 'back-link', href: 'modules.html' }, 'Semua modul')),
        h('div', { class: 'cluster', 'data-intro': 'fade' },
          h('span', { class: 'code' }, mod.code),
          h('span', { class: 'eyebrow' }, `Modul ${String(mod.number).padStart(2, '0')} · ${mod.title}`)),
        h('h1', { class: 'h1 learn-head__title', id: 'learn-title', 'data-intro': 'up' }, mod.headline),
        h('p', { class: 'text-soft', 'data-intro': 'up' }, `${mod.tagline} · ±${mod.minutes + 7} menit · ${sections.length} bagian`)),
      h('div', { class: 'learn-head__progress', 'data-intro': 'scale' }, els.ring, els.headStats)),

    h('div', { class: 'with-sidebar learn-layout' },
      h('aside', { class: 'sidebar learn-side', 'aria-label': 'Bagian modul' },
        h('div', { class: 'learn-side__progress' }, h('p', { class: 'sidebar__title eyebrow' }, 'Bagian modul'), els.sideBar, els.sideCaption),
        h('nav', { 'aria-label': 'Daftar bagian modul' }, els.sideList)),
      els.stage));

  initRings(host);
  refreshProgress();
}

/* ---------- Routing antarbagian ---------- */

function resolveHash() {
  const hash = decodeURIComponent(window.location.hash.slice(1));
  if (sections.some((s) => s.id === hash)) return hash;
  // Tanpa hash: lanjut dari bagian pertama yang belum selesai
  const next = mod.nextLesson?.id || (mod.quizPassed ? 'selesai' : 'kuis');
  return mod.status === 'done' ? sections[0].id : next;
}

function go(id) {
  if (`#${id}` === window.location.hash) show(id);
  else window.location.hash = id;   // memicu hashchange → show()
}

function show(id, { initial = false } = {}) {
  // Arah transisi: maju (+1) atau mundur (-1) dibanding bagian sebelumnya
  const prevIndex = sections.findIndex((s) => s.id === currentId);
  const direction = sections.findIndex((s) => s.id === id) >= prevIndex ? 1 : -1;
  currentId = id;
  const index = sections.findIndex((s) => s.id === id);
  const section = sections[index];
  state.visit(mod.id, section.kind === 'quiz' || section.kind === 'summary' ? null : section.id);

  const body = h('div', { class: 'learn-stage__body' });
  if (section.kind === 'quiz') renderQuiz(body);
  else if (section.kind === 'summary') renderSummary(body);
  else body.append(renderBlocks(content.sections[section.id]?.blocks || [], {
    moduleId: mod.id,
    content,
    userName: state.getState().user.name,
  }));

  const title = h('h2', { class: 'h2 learn-stage__title', tabindex: '-1' }, section.title);
  els.stage.dataset.kind = section.kind;
  els.stage.replaceChildren(
    h('header', { class: 'learn-stage__head' },
      h('p', { class: 'learn-stage__eyebrow' },
        h('span', { class: 'learn-kind' }, icon(KIND_ICON[section.kind]), KIND_LABEL[section.kind]),
        h('span', { class: 'eyebrow' }, `Bagian ${index + 1} dari ${sections.length}${section.minutes ? ` · ±${section.minutes} menit` : ''}`)),
      title,
      h('span', { 'data-section-status': true })),
    body,
    renderFooter(section, index));

  refreshProgress();

  if (!initial) {
    // Transisi bagian: panggung masuk dari arah navigasi, blok materi berurutan
    motion.slideIn(els.stage, direction, $$('.learn-stage__body > .learn-block', els.stage).slice(0, 5));
    title.focus({ preventScroll: true });
    // Pastikan awal bagian terlihat (topbar sticky diperhitungkan)
    const top = els.stage.getBoundingClientRect().top + window.scrollY - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop || 0);
    if (window.scrollY > top || els.stage.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: Math.max(0, top), behavior: motion.isReduced() ? 'auto' : 'smooth' });
    }
  }
}

/* ---------- Footer: navigasi bagian ---------- */

function renderFooter(section, index) {
  const prev = sections[index - 1];
  const next = sections[index + 1];
  const isLesson = !['quiz', 'summary'].includes(section.kind);
  const done = isLesson && isLessonDone(section.id);

  const prevBtn = prev
    ? h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => go(prev.id) }, icon('arrow-left', 'icon--lead'), h('span', {}, h('span', { class: 'learn-foot__hint' }, 'Sebelumnya'), prev.title))
    : h('a', { class: 'btn btn--ghost', href: 'dashboard.html' }, icon('home', 'icon--lead'), 'Dashboard');

  let primary;
  if (isLesson) {
    primary = h('button', {
      type: 'button',
      class: `btn ${done ? 'btn--secondary' : 'btn--primary'}`,
      onclick: (e) => {
        if (!done) {
          state.completeLesson(mod.id, section.id);
          motion.pop(e.currentTarget);
          toast(`"${section.title}" selesai.`, { type: 'success', title: `+${state.XP.lesson} XP`, duration: 2500 });
        }
        go(next.id);
      },
    }, done ? 'Lanjut' : 'Tandai selesai & lanjut', icon('arrow-right', 'icon--trail'));
  } else if (section.kind === 'quiz') {
    primary = h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => go(next.id) }, 'Ke ringkasan', icon('arrow-right', 'icon--trail'));
  } else {
    primary = h('a', { class: 'btn btn--secondary', href: 'dashboard.html' }, icon('home', 'icon--lead'), 'Kembali ke Dashboard');
  }

  return h('footer', { class: 'learn-foot' }, prevBtn, primary);
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

  // 10. MARK AS COMPLETED
  const completeBox = h('section', { class: 'complete-box', 'aria-labelledby': 'complete-title' });
  body.append(completeBox);
  renderCompleteBox(completeBox, summary, check, nextModule);

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

/* ---------- Progres (header, sidebar) ---------- */

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

function refreshProgress() {
  const m = currentModule();
  if (!m || !els.ring) return;
  mod = { ...mod, ...m };

  setProgress(els.ring, m.pct);
  setProgress(els.sideBar, m.pct);
  els.headStats.replaceChildren(
    h('strong', {}, `${m.lessonsDone}/${m.lessonsTotal}`), ' bagian', h('br'),
    m.quizBest === null ? 'Kuis belum dicoba' : `Kuis terbaik ${m.quizBest}`);
  els.sideCaption.textContent = `${m.pct}% · ${m.status === 'done' ? 'Modul selesai' : m.readyToComplete ? 'Siap ditandai selesai' : `${m.lessonsDone}/${m.lessonsTotal} bagian`}`;

  els.sideList.replaceChildren(...sections.map((s, i) => {
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
  }));

  // Geser strip chip (mobile) agar bagian aktif terlihat
  const active = $('.learn-nav__link.is-active', els.sideList);
  const side = els.sideList.closest('.sidebar');
  if (active && side && side.scrollWidth > side.clientWidth) {
    side.scrollTo({ left: active.offsetLeft - side.clientWidth / 2 + active.offsetWidth / 2, behavior: 'auto' });
  }

  // Status bagian yang sedang dibuka
  const statusEl = $('[data-section-status]', els.stage);
  const section = sections.find((s) => s.id === currentId);
  if (statusEl && section) {
    const done = sectionDone(section);
    statusEl.replaceChildren(done ? h('span', { class: 'chip chip--done' }, icon('check'), 'Selesai') : '');
  }
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
