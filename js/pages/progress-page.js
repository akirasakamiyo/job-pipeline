/* =====================================================================
   pages/progress-page.js — Learning Progress (V4)
   ---------------------------------------------------------------------
   Satu halaman = satu fungsi: ANALITIK BELAJAR saja.
   - Ringkasan (selalu terlihat): progres keseluruhan, modul, bagian, kuis, XP
   - Tab Analitik: skor kuis per modul (garis nilai lulus), materi selesai,
     aktivitas 14 hari, hasil Evaluasi Akhir
   - Tab Per modul: status, bagian, kuis terbaik & percobaan
   - Tab Performa: skor belajar keseluruhan + status 13 aktivitas bernilai
   - Tab Riwayat: aktivitas terakhir (maks. 30 tersimpan)
   - Tab Feedback: feedback modul (lihat / ubah / hapus)
   Badge & XP pindah ke achievements.html; pengaturan & data ke settings.html.
   Semua angka berasal dari state.getSummary(). Tidak ada angka karangan.
   ===================================================================== */

import { $, $$, h, icon } from '../core/dom.js';
import * as state from '../core/state.js';
import * as motion from '../core/motion.js';
import * as feedback from '../core/feedback-store.js';
import { initRings, setProgress, toast, confirmDialog, initTabs } from '../core/ui.js';

const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
const ACTIVITY_ICON = { lesson: 'check', 'quiz-pass': 'target', quiz: 'target', module: 'trophy', start: 'flame', badge: 'star', tracker: 'briefcase', checklist: 'send', practice: 'spark' };
const STATUS = {
  done: { label: 'Selesai', chip: 'chip--done', cta: 'Ulas kembali' },
  ready: { label: 'Siap ditandai selesai', chip: 'chip--warn', cta: 'Tandai selesai' },
  progress: { label: 'Sedang dipelajari', chip: 'chip--progress', cta: 'Lanjutkan' },
  todo: { label: 'Belum mulai', chip: 'chip--locked', cta: 'Mulai' },
};

/** Aktivitas bernilai (sama dengan state.SCORED_ACTIVITIES) → judul & lokasi materi */
const ACTIVITY_INFO = {
  'id-drive-sim': ['Simulasi izin Google Drive', 'id', 'id-15'],
  'cv-structure': ['CV Structure Builder', 'cv', 'cv-13'],
  'cv-redflags': ['CV Red Flags Detector', 'cv', 'cv-14'],
  'cv-ats': ['ATS Keyword Matching', 'cv', 'cv-17'],
  'li-hm': ['Identify the Hiring Manager', 'li', 'li-15'],
  'tx-subject-challenge': ['Subject Line Challenge', 'tx', 'tx-13'],
  'tx-anatomy': ['Email Anatomy Challenge', 'tx', 'tx-14'],
  'tx-order': ['Email Ordering Challenge', 'tx', 'tx-15'],
  'tx-ccbcc': ['CC/BCC Scenario', 'tx', 'tx-18'],
  'tx-mistakes': ['Find the Mistakes', 'tx', 'tx-21'],
  'tr-status': ['Application Status Management', 'tr', 'tr-12'],
  'tr-timing': ['Follow-Up Timing Scenario', 'tr', 'tr-13'],
  'tr-best-message': ['Choose the Best Follow-Up Message', 'tr', 'tr-15'],
};

let firstRender = true;

function timeAgo(iso) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, sec] of units) {
    if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit);
  }
  return 'baru saja';
}

const fullDate = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function init() {
  render(state.getSummary());
  initTabs($('[data-tabs]'), { storageKey: 'progress-tab' });
  initFeedbackList();
  state.subscribe((summary) => render(summary));
  feedback.subscribe(() => renderFeedback(state.getSummary()));
  firstRender = false;
}

/* =====================================================================
   RENDER RINGKASAN
   ===================================================================== */

function render(s) {
  renderOverview(s);
  renderAnalytics(s);
  renderModules(s);
  renderScore(s);
  renderActivity(s);
  renderFeedback(s);
}

function renderOverview(s) {
  // Ring sudah dibangun oleh app.js (initRings dipanggil sebelum init halaman),
  // jadi nilainya SELALU diatur lewat setProgress. initRings di sini hanya
  // pengaman bila urutan boot berubah (fungsi ini melewati ring yang sudah jadi).
  const ring = $('[data-overall-ring]');
  initRings(ring.parentElement);
  setProgress(ring, s.overallPct, { animate: !firstRender || !motion.isReduced() });
  $('[data-overall-text]').textContent = s.isNew
    ? 'Belum ada langkah yang diselesaikan. Mulai dari Modul 1 untuk mengisi halaman ini.'
    : `${s.stepsDone} dari ${s.stepsTotal} langkah selesai (bagian materi, kuis lulus, dan tanda "selesai" per modul).`;

  const quizPassed = s.modules.filter((m) => m.quizPassed).length;
  const mainBadges = s.badges.filter((b) => b.main);
  const earned = mainBadges.filter((b) => b.earned).length;
  const stats = [
    { icon: 'trophy', value: `${s.completed}/${s.modules.length}`, label: 'Modul selesai' },
    { icon: 'check', value: `${s.lessonsDone}/${s.lessonsTotal}`, label: 'Bagian materi' },
    { icon: 'target', value: `${quizPassed}/${s.modules.length}`, label: 'Kuis lulus' },
    { icon: 'star', value: String(s.xp), label: 'Total XP' },
    { icon: 'flame', value: `${earned}/${mainBadges.length}`, label: 'Badge utama' },
  ];
  $('[data-stats]').replaceChildren(...stats.map((st) =>
    h('div', { class: 'stat' },
      h('span', { class: 'stat__icon' }, icon(st.icon)),
      h('span', { class: 'stat__value num' }, st.value),
      h('span', { class: 'stat__label' }, st.label))));

  const next = $('[data-next]');
  if (s.allDone) {
    next.href = s.evaluation.passed ? 'achievements.html' : 'evaluation.html';
    next.replaceChildren(s.evaluation.passed ? 'Lihat pencapaian' : 'Ke Evaluation', icon('arrow-right', 'icon--trail'));
  } else {
    next.href = s.next?.href || 'modules.html';
    next.replaceChildren(s.isNew ? 'Mulai belajar' : 'Lanjutkan belajar', icon('arrow-right', 'icon--trail'));
  }
}

function renderModules(s) {
  $('[data-module-list]').replaceChildren(...s.modules.map((m) => {
    const key = m.readyToComplete ? 'ready' : m.status;
    const info = STATUS[key];
    const quiz = m.quizAttempts
      ? `Kuis: skor terbaik ${m.quizBest} · ${m.quizAttempts}× percobaan${m.quizPassed ? ' · lulus' : ` · belum lulus (min. ${state.getPassScore()})`}`
      : 'Kuis: belum dicoba';
    const href = m.status === 'done' ? m.href : key === 'ready' ? `${m.href}#selesai` : m.nextLesson ? `${m.href}#${m.nextLesson.id}` : `${m.href}#kuis`;
    return h('li', { class: 'prog-module', 'data-module': m.id },
      h('div', { class: 'prog-module__head' },
        h('span', { class: 'code' }, m.code),
        h('span', { class: `chip ${info.chip}` }, info.label)),
      h('h3', { class: 'prog-module__title' }, m.title),
      h('div', { class: 'prog-module__bar' },
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': `Progres ${m.title}`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(m.pct), style: { '--value': String(m.pct) } },
          h('span', { class: 'bar__fill' })),
        h('span', { class: 'mono prog-module__pct' }, `${m.pct}%`)),
      h('ul', { class: 'prog-module__facts', role: 'list' },
        h('li', {}, `Bagian: ${m.lessonsDone}/${m.lessonsTotal}`),
        h('li', {}, quiz)),
      h('a', { class: 'btn btn--secondary btn--sm prog-module__cta', href }, info.cta, h('span', { class: 'sr-only' }, ` modul ${m.title}`), icon('arrow-right', 'icon--trail')));
  }));
}

/* ---------- Skor belajar keseluruhan (2.0) ---------- */
function renderScore(s) {
  const sc = s.score;
  $('[data-score-total]').textContent = String(sc.total);
  $('[data-score-parts]').replaceChildren(...sc.parts.map((p) => h('li', { class: 'score-part' },
    h('div', { class: 'score-part__head' },
      h('span', {}, p.label),
      h('span', { class: 'mono' }, `${p.value} × ${p.weight}% = ${Math.round((p.value * p.weight) / 100)}`)),
    h('div', { class: 'bar bar--thin', role: 'progressbar', 'aria-label': p.label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(p.value), style: { '--value': String(p.value) } }, h('span', { class: 'bar__fill' })))));
  $('[data-activity-list]').replaceChildren(...state.SCORED_ACTIVITIES.map((id) => {
    const [label, mid, lesson] = ACTIVITY_INFO[id] || [id, null, null];
    const rec = s.activities[id];
    return h('li', { class: 'act-row', 'data-module': mid },
      h('span', { class: 'code' }, (state.getModuleMeta(mid)?.code) || '—'),
      h('a', { class: 'act-row__title', href: mid ? `module.html?id=${mid}#${lesson}` : '#' }, label),
      rec
        ? h('span', { class: `chip ${rec.passedAt ? 'chip--done' : 'chip--warn'}` }, rec.passedAt ? icon('check') : null, `Terbaik ${rec.best}`)
        : h('span', { class: 'chip' }, 'Belum dicoba'));
  }));
  $('[data-activity-summary]').textContent = `${s.activitiesPassed} dari ${s.activitiesTotal} aktivitas lulus · Simulator: ${s.simulator.attempts ? `terbaik ${s.simulator.best}` : 'belum dicoba'} · Evaluasi Akhir: ${s.evaluation.attempts ? `terbaik ${s.evaluation.best}` : 'belum dicoba'}`;
}

function renderActivity(s) {
  const host = $('[data-activity]');
  $('[data-activity-count]').textContent = s.activity.length ? `${s.activity.length} aktivitas terakhir (maks. 30 disimpan)` : '';
  if (!s.activity.length) {
    host.replaceChildren(h('div', { class: 'empty-state' },
      h('span', { class: 'empty-state__icon' }, icon('clock')),
      h('p', { class: 'empty-state__title' }, 'Belum ada aktivitas'),
      h('p', {}, 'Bagian, kuis, modul, latihan, dan badge yang kamu selesaikan akan muncul di sini.')));
    return;
  }
  host.replaceChildren(h('ol', { class: 'activity', role: 'list' }, s.activity.map((a) =>
    h('li', { class: 'activity__item', 'data-module': a.module || null },
      h('span', { class: 'activity__icon' }, icon(ACTIVITY_ICON[a.type] || 'check')),
      h('p', { class: 'activity__text' }, a.text,
        h('time', { class: 'activity__time', datetime: a.at, title: fullDate(a.at) }, timeAgo(a.at)))))));
}

/* =====================================================================
   ANALITIK BELAJAR (Final UX) — visual sederhana dari data nyata
   ===================================================================== */

function hbarRow({ code, module, label, value, max = 100, text, marker }) {
  const pct = value == null ? 0 : Math.round((value / max) * 100);
  return h('li', { class: 'hbar', 'data-module': module || null },
    h('span', { class: 'code' }, code),
    h('span', { class: 'hbar__label' }, label),
    h('span', { class: 'hbar__track', style: { '--value': pct, ...(marker != null ? { '--marker': marker } : {}) } },
      h('span', { class: `hbar__fill${value == null ? ' is-empty' : ''}` }),
      marker != null ? h('span', { class: 'hbar__marker' }) : ''),
    h('span', { class: 'hbar__value mono' }, text));
}

function renderAnalytics(s) {
  const pass = state.getPassScore();
  $('[data-quiz-chart]').replaceChildren(...s.modules.map((m) => hbarRow({
    code: m.code, module: m.id, label: m.title, value: m.quizBest, marker: pass,
    text: m.quizBest == null ? 'belum' : `${m.quizBest}${m.quizPassed ? ' ✓' : ''}`,
  })));
  const tried = s.modules.filter((m) => m.quizAttempts);
  $('[data-quiz-note]').textContent = tried.length
    ? `Garis tegak = nilai lulus ${pass}. ${tried.filter((m) => m.quizPassed).length} dari ${s.modules.length} kuis lulus · ${tried.reduce((n, m) => n + m.quizAttempts, 0)} percobaan.`
    : `Belum ada kuis yang dicoba. Garis tegak = nilai lulus ${pass}.`;

  $('[data-lesson-chart]').replaceChildren(...s.modules.map((m) => hbarRow({
    code: m.code, module: m.id, label: m.title, value: m.lessonsDone, max: m.lessonsTotal || 1,
    text: `${m.lessonsDone}/${m.lessonsTotal}`,
  })));

  // Riwayat 14 hari: dihitung dari state.activity (maks. entri tersimpan terbatas)
  const days = [];
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (let i = 13; i >= 0; i -= 1) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push({ key: key(d), date: d, count: 0 }); }
  const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
  s.activity.forEach((a) => { const d = byKey[key(new Date(a.at))]; if (d) d.count += 1; });
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  const fmt = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  $('[data-history-chart]').replaceChildren(
    h('ol', { class: 'col-chart__bars', role: 'list', 'aria-label': 'Jumlah aktivitas per hari, 14 hari terakhir' }, days.map((d, i) =>
      h('li', { class: 'col-chart__col', style: { '--h': Math.round((d.count / max) * 100) } },
        h('span', { class: 'col-chart__bar' }),
        h('span', { class: 'sr-only' }, `${fmt(d.date)}: ${d.count} aktivitas`),
        (i === 0 || i === 13) ? h('span', { class: 'col-chart__tick', 'aria-hidden': 'true' }, i === 13 ? 'Hari ini' : fmt(d.date)) : ''))));
  $('[data-history-note]').textContent = total
    ? `${total} aktivitas tercatat dalam 14 hari (dari ${s.activity.length} entri riwayat terakhir yang disimpan).`
    : 'Belum ada aktivitas dalam 14 hari terakhir.';

  // Evaluasi akhir + sertifikat
  const ev = s.evaluation;
  const elig = state.certificateEligibility(s);
  const evalCard = $('[data-eval-card]');
  evalCard.dataset.state = ev.passed ? 'passed' : ev.attempts ? 'tried' : 'none';
  evalCard.replaceChildren(
    h('p', { class: 'analytics__title' }, 'Evaluasi Akhir & sertifikat'),
    h('p', { class: 'analytics__big' }, h('span', { class: 'num num--lg' }, ev.attempts ? String(ev.best) : '—'), h('span', { class: 'text-soft' }, ev.attempts ? '/100' : '')),
    h('p', { class: 'text-sm' }, ev.attempts
      ? `${ev.passed ? 'Lulus' : 'Belum lulus'} · ${ev.attempts}× percobaan · nilai lulus ${state.EVALUATION_PASS}`
      : `Belum dicoba · nilai lulus ${state.EVALUATION_PASS}`),
    h('ul', { class: 'analytics__checks', role: 'list' },
      h('li', { class: elig.modulesDone ? 'is-done' : null }, icon(elig.modulesDone ? 'check' : 'lock'), `5 modul selesai (${s.completed}/${s.modules.length})`),
      h('li', { class: elig.evaluationPassed ? 'is-done' : null }, icon(elig.evaluationPassed ? 'check' : 'lock'), 'Evaluasi Akhir lulus')),
    elig.ok
      ? h('a', { class: 'btn btn--primary btn--sm', href: 'certificate.html' }, icon('trophy', 'icon--lead'), 'Lihat sertifikat')
      : h('a', { class: 'btn btn--secondary btn--sm', href: s.allDone ? 'evaluation.html' : (s.next?.href || 'modules.html') }, s.allDone ? 'Ikuti Evaluasi Akhir' : 'Lanjutkan modul', icon('arrow-right', 'icon--trail')));
}

/* =====================================================================
   FEEDBACK MODUL (Final UX)
   ===================================================================== */

function renderFeedback(s) {
  const host = $('[data-feedback-list]');
  if (!host) return;
  const all = feedback.getAll();
  const done = s.modules.filter((m) => m.status === 'done');
  if (!done.length && !Object.keys(all).length) {
    host.replaceChildren(h('div', { class: 'empty-state' },
      h('span', { class: 'empty-state__icon' }, icon('edit')),
      h('p', { class: 'empty-state__title' }, 'Belum ada modul yang selesai'),
      h('p', {}, 'Form feedback muncul di akhir halaman modul setelah modul ditandai selesai.')));
    return;
  }
  const mods = s.modules.filter((m) => m.status === 'done' || all[m.id]);
  host.replaceChildren(h('ul', { class: 'fb-list', role: 'list' }, mods.map((m) => {
    const fb = all[m.id];
    return h('li', { class: 'fb-item', 'data-module': m.id },
      h('div', { class: 'fb-item__head' },
        h('span', { class: 'code' }, m.code),
        h('h3', { class: 'fb-item__title' }, m.title),
        fb ? h('span', { class: 'chip chip--done' }, 'Terisi') : h('span', { class: 'chip' }, 'Belum diisi')),
      fb ? h('dl', { class: 'fb-item__answers' }, feedback.QUESTIONS.map((q) => [
        h('dt', {}, q.text), h('dd', {}, fb[q.id] ? feedback.ANSWERS[fb[q.id]] : '—'),
      ]), fb.improve ? [h('dt', { class: 'fb-item__improve' }, 'Bagian yang perlu diperbaiki'), h('dd', { class: 'fb-item__improve' }, fb.improve)] : '') : '',
      fb ? h('p', { class: 'text-soft text-xs' }, `Diperbarui ${fullDate(fb.updatedAt)}`) : '',
      h('div', { class: 'cluster' },
        h('a', { class: 'btn btn--secondary btn--sm', href: `${m.href}#feedback` }, icon('edit', 'icon--lead'), fb ? 'Ubah' : 'Isi feedback', h('span', { class: 'sr-only' }, ` untuk ${m.title}`)),
        fb ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-fb-delete': m.id }, icon('trash', 'icon--lead'), 'Hapus', h('span', { class: 'sr-only' }, ` feedback ${m.title}`)) : ''));
  })));
}

function initFeedbackList() {
  $('[data-feedback-list]')?.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-fb-delete]');
    if (!btn) return;
    const id = btn.dataset.fbDelete;
    const title = state.getModuleMeta(id)?.title || id;
    const ok = await confirmDialog({ title: 'Hapus feedback?', message: `Feedback untuk ${title} akan dihapus dari perangkat ini.`, confirmLabel: 'Hapus', danger: true });
    if (!ok) return;
    feedback.remove(id);
    toast('Feedback dihapus.', { type: 'success' });
    $('#feedback-title')?.focus();
  });
}
