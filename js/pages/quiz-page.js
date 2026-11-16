/* =====================================================================
   pages/quiz-page.js — Runner kuis (V4)
   ---------------------------------------------------------------------
   quiz.html?id=<modul>  → kuis modul (data/content/<id>.json → quiz),
                           skor via state.recordQuiz (XP sekali saat lulus)
   quiz.html?id=final    → Evaluasi Akhir (data/evaluation.json, 15 soal
                           acak), skor via state.recordEvaluation
   Satu soal per layar, umpan balik + pembahasan setelah menjawab.
   Kunci jawaban TIDAK ditulis ke DOM sebelum peserta menjawab (quiz.js).
   ===================================================================== */

import { $, h, icon } from '../core/dom.js';
import { toast } from '../core/ui.js';
import { loadJSON } from '../core/data.js';
import * as state from '../core/state.js';
import { createQuiz } from '../features/quiz.js';

export async function init() {
  const host = $('[data-quiz-page]');
  const id = new URLSearchParams(window.location.search).get('id');
  const s = state.getSummary();
  const mod = s.modules.find((m) => m.id === id);
  if (!mod && id !== 'final') {
    document.title = 'Kuis tidak ditemukan · The Ultimate Job Application Pipeline';
    host.replaceChildren(h('div', { class: 'empty-state', style: { marginTop: '48px' } },
      h('span', { class: 'empty-state__icon' }, icon('clipboard-check')),
      h('h1', { class: 'h3' }, 'Kuis tidak ditemukan'),
      h('p', {}, 'Pilih kuis dari halaman Evaluation.'),
      h('a', { class: 'btn btn--primary', href: 'evaluation.html' }, 'Buka Evaluation')));
    return;
  }
  if (mod) document.body.dataset.module = mod.id;

  const rules = h('ul', { class: 'quiz-rules', role: 'list' });
  const quizHost = h('div', { class: 'quiz-host' }, h('div', { class: 'skeleton skeleton--block', 'aria-busy': 'true', 'aria-label': 'Memuat soal' }));
  const after = h('div', { class: 'quiz-after', 'aria-live': 'polite' });
  host.replaceChildren(
    h('nav', { class: 'md-crumbs', 'aria-label': 'Navigasi' }, h('a', { class: 'back-link', href: 'evaluation.html' }, icon('arrow-left'), 'Evaluation')),
    h('header', { class: 'quiz-head' },
      h('p', { class: 'eyebrow' }, mod ? h('span', { class: 'code' }, mod.code) : null, mod ? ` Kuis Modul ${String(mod.number).padStart(2, '0')}` : 'Lintas lima modul'),
      h('h1', { class: 'h2 quiz-head__title' }, mod ? mod.title : 'Evaluasi Akhir'),
      rules),
    h('section', { class: 'card quiz-stage', 'aria-label': 'Soal' }, quizHost),
    after);
  document.title = `${mod ? `Kuis ${mod.title}` : 'Evaluasi Akhir'} · Evaluation`;

  try {
    if (mod) {
      const content = await loadJSON(`content/${mod.id}`);
      rules.replaceChildren(...[
        `${content.quiz.length} soal pilihan ganda, urutan diacak`,
        `Nilai lulus ${state.getPassScore()}; skor terbaik yang disimpan`,
        'Pembahasan tampil setelah setiap jawaban',
        `Lulus pertama kali: +${state.XP.quiz} XP`,
      ].map((t) => h('li', {}, icon('check'), t)));
      createQuiz(quizHost, {
        questions: content.quiz,
        passScore: state.getPassScore(),
        best: mod.quizAttempts ? mod.quizBest : null,
        finishLink: { href: 'evaluation.html', label: 'Kembali ke Evaluation' },
        onFinish: (score, passed) => {
          const before = state.getState().modules[mod.id]?.quiz?.passedAt;
          state.recordQuiz(mod.id, score);
          if (passed && !before) toast('Kuis lulus!', { type: 'success', title: `+${state.XP.quiz} XP` });
          const m = state.getSummary().modules.find((x) => x.id === mod.id);
          after.replaceChildren(passed
            ? (m.readyToComplete ? nextCard('Semua bagian selesai dan kuis lulus. Tandai modul selesai di ringkasan modul.', `${m.href}#selesai`, 'Tandai modul selesai')
              : m.status === 'done' ? '' : nextCard(`Kuis lulus. Selesaikan ${m.lessonsTotal - m.lessonsDone} bagian materi lagi untuk menandai modul selesai.`, m.nextLesson ? `${m.href}#${m.nextLesson.id}` : m.href, 'Lanjutkan materi'))
            : nextCard('Belum lulus. Ulas materinya dulu, lalu coba lagi kapan saja.', m.href, 'Ulas materi modul'));
        },
      });
    } else {
      const data = await loadJSON('evaluation');
      const count = Math.min(data.count || 15, data.questions.length);
      rules.replaceChildren(...[
        `${count} soal pilihan ganda, diambil acak dari ${data.questions.length} soal skenario`,
        `Nilai lulus ${state.EVALUATION_PASS}; skor terbaik yang disimpan`,
        'Pembahasan tampil setelah setiap jawaban',
        `Lulus pertama kali: +${state.XP.evaluation} XP`,
      ].map((t) => h('li', {}, icon('check'), t)));
      createQuiz(quizHost, {
        questions: data.questions,
        count,
        passScore: state.EVALUATION_PASS,
        best: s.evaluation.attempts ? s.evaluation.best : null,
        finishLink: { href: 'evaluation.html', label: 'Kembali ke Evaluation' },
        onFinish: (score) => {
          const { firstPass } = state.recordEvaluation(score);
          if (firstPass) toast('Evaluasi Akhir lulus!', { type: 'success', title: `+${state.XP.evaluation} XP` });
          const sum = state.getSummary();
          after.replaceChildren(state.certificateEligibility(sum).ok
            ? nextCard('Kelima modul selesai dan Evaluasi Akhir lulus. Sertifikat penyelesaianmu sudah terbuka.', 'certificate.html', 'Lihat sertifikat')
            : sum.evaluation.passed ? nextCard(`Evaluasi lulus. Selesaikan ${sum.modules.length - sum.completed} modul lagi untuk membuka sertifikat.`, 'modules.html', 'Ke Learning Modules') : '');
        },
      });
    }
  } catch (error) {
    console.error(error);
    quizHost.replaceChildren(h('p', { class: 'text-soft' }, 'Soal gagal dimuat. Muat ulang halaman.'));
  }
}

function nextCard(text, href, label) {
  return h('div', { class: 'callout callout--tip quiz-next' },
    h('span', { class: 'callout__icon' }, icon('info')),
    h('div', {}, h('p', {}, text), h('a', { class: 'btn btn--secondary btn--sm', href }, label, icon('arrow-right', 'icon--trail'))));
}
