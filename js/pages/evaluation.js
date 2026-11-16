/* =====================================================================
   pages/evaluation.js — Evaluation (V4: direktori evaluasi formal)
   ---------------------------------------------------------------------
   Lima kuis modul + Evaluasi Akhir. Setiap kartu menampilkan modul
   terkait, jumlah soal, nilai lulus, skor terbaik & percobaan (data
   nyata), status, dan tombol Mulai/Ulangi → quiz.html?id=<modul|final>.
   Bank soal yang dipakai sama dengan materi (data/content/<id>.json →
   quiz) dan data/evaluation.json; tidak ada soal yang diduplikasi.
   ===================================================================== */

import { $, h, icon } from '../core/dom.js';
import { loadJSON } from '../core/data.js';
import * as state from '../core/state.js';

const counts = {};   // jumlah soal per evaluasi (dari bank soal)

export async function init() {
  render(state.getSummary());
  state.subscribe(render);
  const ids = state.getSummary().modules.map((m) => m.id);
  const results = await Promise.allSettled([...ids.map((id) => loadJSON(`content/${id}`)), loadJSON('evaluation')]);
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    if (i < ids.length) counts[ids[i]] = r.value.quiz?.length || 0;
    else counts.final = { count: Math.min(r.value.count || 15, r.value.questions.length), bank: r.value.questions.length };
  });
  render(state.getSummary());
}

function statusOf(best, attempts, passed) {
  if (passed) return { key: 'done', label: 'Lulus' };
  if (attempts) return { key: 'tried', label: 'Belum lulus' };
  return { key: 'todo', label: 'Belum dicoba' };
}

function card({ id, code, module, kicker, title, questions, pass, best, attempts, passed, note }) {
  const st = statusOf(best, attempts, passed);
  const titleId = `ev-${id}`;
  return h('li', { class: `card eval-card is-${st.key}${id === 'final' ? ' eval-card--final' : ''}`, 'data-module': module || null },
    h('div', { class: 'eval-card__top' },
      code ? h('span', { class: 'code' }, code) : h('span', { class: 'eval-card__icon' }, icon('trophy')),
      h('span', { class: `chip practice-chip practice-chip--${st.key}` }, st.key === 'done' ? icon('check') : null, st.label)),
    h('p', { class: 'eval-card__kicker' }, kicker),
    h('h2', { class: 'eval-card__title', id: titleId }, title),
    h('dl', { class: 'eval-card__facts' },
      h('div', {}, h('dt', {}, 'Soal'), h('dd', {}, questions || '…')),
      h('div', {}, h('dt', {}, 'Nilai lulus'), h('dd', {}, String(pass))),
      h('div', {}, h('dt', {}, 'Skor terbaik'), h('dd', {}, attempts ? String(best) : '—')),
      h('div', {}, h('dt', {}, 'Percobaan'), h('dd', {}, String(attempts)))),
    note ? h('p', { class: 'eval-card__note' }, note) : null,
    h('a', { class: `btn btn--sm ${st.key === 'done' ? 'btn--secondary' : 'btn--primary'} eval-card__cta`, href: `quiz.html?id=${id}`, 'aria-describedby': titleId },
      attempts ? 'Ulangi' : 'Mulai', icon('arrow-right', 'icon--trail')));
}

function render(s) {
  const passed = s.modules.filter((m) => m.quizPassed).length;
  $('[data-eval-summary]').textContent = `${passed}/${s.modules.length} kuis modul lulus · Evaluasi Akhir ${s.evaluation.passed ? `lulus (terbaik ${s.evaluation.best})` : s.evaluation.attempts ? `terbaik ${s.evaluation.best}` : 'belum dicoba'}.`;
  const fin = counts.final;
  $('[data-eval-cards]').replaceChildren(
    ...s.modules.map((m) => card({
      id: m.id, code: m.code, module: m.id,
      kicker: `Kuis Modul ${String(m.number).padStart(2, '0')}`,
      title: m.title,
      questions: counts[m.id] ? `${counts[m.id]} soal` : null,
      pass: state.getPassScore(),
      best: m.quizBest, attempts: m.quizAttempts, passed: m.quizPassed,
      note: m.quizPassed ? null : m.lessonsDone < m.lessonsTotal ? `Disarankan setelah materi selesai (${m.lessonsDone}/${m.lessonsTotal} bagian).` : null,
    })),
    card({
      id: 'final', code: null, module: null,
      kicker: 'Lintas lima modul',
      title: 'Evaluasi Akhir',
      questions: fin ? `${fin.count} dari ${fin.bank}` : null,
      pass: state.EVALUATION_PASS,
      best: s.evaluation.best, attempts: s.evaluation.attempts, passed: s.evaluation.passed,
      note: s.allDone ? 'Lulus + kelima modul selesai membuka sertifikat.' : `${s.completed}/${s.modules.length} modul selesai. Boleh dicoba kapan saja; sertifikat butuh kelima modul selesai.`,
    }));
}
