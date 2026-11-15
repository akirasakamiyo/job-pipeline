/* =====================================================================
   pages/evaluation.js — Evaluasi Akhir lintas modul (2.0)
   ---------------------------------------------------------------------
   - Bank soal: data/evaluation.json; setiap percobaan mengambil 15 soal
     acak (createQuiz({ count })) dengan pilihan jawaban yang diacak.
   - Jawaban benar TIDAK ada di DOM sebelum peserta menjawab (quiz.js).
   - Skor terbaik dicatat lewat state.recordEvaluation(); XP sekali saat
     pertama lulus. Evaluasi bisa dikerjakan kapan saja; status kesiapan
     modul hanya rekomendasi, bukan penghalang.
   ===================================================================== */

import { $, h, icon } from '../core/dom.js';
import { toast } from '../core/ui.js';
import { loadJSON } from '../core/data.js';
import * as state from '../core/state.js';
import { createQuiz } from '../features/quiz.js';

export async function init() {
  const host = $('[data-eval-quiz]');
  let data;
  try {
    data = await loadJSON('evaluation');
  } catch {
    host.replaceChildren(h('p', { class: 'text-soft' }, 'Soal evaluasi gagal dimuat. Muat ulang halaman.'));
    return;
  }
  const count = Math.min(data.count || 15, data.questions.length);
  $('[data-eval-rules]').replaceChildren(...[
    `${count} soal pilihan ganda, diambil acak dari ${data.questions.length} soal skenario`,
    `Nilai lulus ${state.EVALUATION_PASS}; skor terbaik yang disimpan`,
    'Umpan balik & pembahasan tampil setelah setiap jawaban',
    `Lulus pertama kali: +${state.XP.evaluation} XP`,
  ].map((t) => h('li', {}, icon('check'), t)));

  renderReadiness();
  state.subscribe(renderReadiness);

  const ev = state.getSummary().evaluation;
  createQuiz(host, {
    questions: data.questions,
    count,
    passScore: state.EVALUATION_PASS,
    best: ev.attempts ? ev.best : null,
    finishLink: { href: 'progress.html', label: 'Lihat progres & badge' },
    onFinish: (score) => {
      const { firstPass } = state.recordEvaluation(score);
      if (firstPass) toast('Evaluasi Akhir lulus!', { type: 'success', title: `+${state.XP.evaluation} XP` });
    },
  });
}

function renderReadiness() {
  const s = state.getSummary();
  $('[data-eval-modules]').replaceChildren(...s.modules.map((m) => h('li', { 'data-module': m.id },
    h('span', { class: 'code' }, m.code),
    h('a', { href: m.href }, m.title),
    m.quizPassed ? h('span', { class: 'chip chip--done' }, icon('check'), 'Kuis lulus') : h('span', { class: 'chip' }, 'Kuis belum lulus'))));
  const ready = s.modules.filter((m) => m.quizPassed).length;
  $('[data-eval-hint]').textContent = ready === s.modules.length
    ? 'Semua kuis modul sudah lulus—kamu siap.'
    : `${ready}/${s.modules.length} kuis modul lulus. Kamu tetap boleh mencoba sekarang; mengerjakan kuis modul dulu membantu.`;
}
