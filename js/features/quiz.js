/* =====================================================================
   features/quiz.js — Knowledge check (satu soal per layar)
   ---------------------------------------------------------------------
   createQuiz(host, { questions, passScore, best, onFinish })
   - Urutan soal & pilihan diacak setiap percobaan
   - Umpan balik + penjelasan langsung setelah tiap jawaban (active recall)
   - Skor akhir dikirim ke onFinish(score) → disimpan oleh state.recordQuiz
   Memakai komponen .quiz-card / .option / .feedback dari design system.
   ===================================================================== */

import { $, $$, h, icon, uid } from '../core/dom.js';
import * as motion from '../core/motion.js';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function createQuiz(host, { questions, passScore = 70, best = null, onFinish, count = null, finishLink = { href: '#selesai', label: 'Ke ringkasan' } }) {
  let order = [];
  let index = 0;
  let correctCount = 0;

  function start() {
    // Acak soal, lalu acak pilihan di tiap soal sambil menjaga kunci jawaban
    // count: ambil sebagian soal dari bank (dipakai Evaluasi Akhir)
    order = shuffle(questions).slice(0, count || questions.length).map((q) => {
      const opts = shuffle(q.options.map((text, i) => ({ text, correct: i === q.answer })));
      return { ...q, opts };
    });
    index = 0;
    correctCount = 0;
    renderIntro();
  }

  function renderIntro() {
    host.replaceChildren(h('div', { class: 'quiz-intro' },
      h('span', { class: 'tool-tile__icon' }, icon('target')),
      h('div', {},
        h('p', { class: 'h4' }, `${count || questions.length} soal pilihan ganda${count && count < questions.length ? ` (diacak dari ${questions.length} soal)` : ''}`),
        h('p', { class: 'text-soft text-sm' }, `Nilai lulus ${passScore}. Kamu bisa mengulang kapan saja; skor terbaik yang disimpan.`),
        best !== null ? h('p', { class: 'text-sm' }, `Skor terbaikmu sejauh ini: `, h('strong', {}, String(best))) : null),
      h('button', { type: 'button', class: 'btn btn--primary', onclick: () => renderQuestion() },
        best === null ? 'Mulai kuis' : 'Ulangi kuis', icon('arrow-right', 'icon--trail'))));
  }

  function renderQuestion() {
    const q = order[index];
    const name = uid('q');
    const submit = h('button', { type: 'submit', class: 'btn btn--primary', disabled: true }, 'Periksa jawaban');
    const feedback = h('div', { 'aria-live': 'polite' });
    // 2.0: kunci jawaban TIDAK ditulis ke DOM (tidak ada data-correct / ikon
    // sebelum menjawab). Kebenaran dicek dari q.opts di memori.
    const optionsWrap = h('div', { class: 'options' }, q.opts.map((opt, i) =>
      h('label', { class: 'option' },
        h('input', { type: 'radio', name, value: String(i) }),
        h('span', { class: 'option__key' }, 'ABCD'[i]),
        h('span', {}, opt.text))));
    const pct = Math.round((index / order.length) * 100);
    const legendId = uid('legend');

    const form = h('form', { class: 'quiz-card', novalidate: true },
      h('div', { class: 'quiz-card__top' },
        h('span', { class: 'eyebrow' }, `Soal ${index + 1} dari ${order.length}`),
        h('div', { class: 'bar bar--thin', style: { '--value': pct }, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progres kuis' }, h('span', { class: 'bar__fill' }))),
      h('fieldset', { class: 'stack', style: { '--stack-gap': 'var(--s-5)' }, 'aria-labelledby': legendId },
        h('legend', { class: 'quiz-card__q', id: legendId }, q.q),
        optionsWrap),
      feedback,
      h('div', { class: 'quiz-card__foot' }, h('span', { class: 'text-soft text-sm' }, 'Pilih satu jawaban.'), submit));

    let answered = false;
    form.addEventListener('change', () => { if (!answered) submit.disabled = !$('input:checked', form); });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (answered) { next(); return; }
      const chosen = $('input:checked', form)?.closest('.option');
      if (!chosen) return;
      answered = true;
      const chosenIndex = Number($('input', chosen).value);
      const correct = q.opts[chosenIndex].correct;
      if (correct) correctCount += 1;
      // Disimpan untuk pembahasan di layar hasil akhir
      q.chosenText = q.opts[chosenIndex].text;
      q.correctText = q.opts.find((o) => o.correct).text;
      q.wasCorrect = correct;
      optionsWrap.classList.add('is-locked');
      $$('.option', form).forEach((opt, i) => {
        $('input', opt).disabled = true;
        opt.append(icon(q.opts[i].correct ? 'check' : 'x', 'option__mark'));
        if (q.opts[i].correct) opt.classList.add('is-correct');
      });
      if (!correct) chosen.classList.add('is-wrong');
      const box = h('div', { class: `feedback feedback--${correct ? 'correct' : 'wrong'}` },
        icon(correct ? 'check' : 'x'),
        h('div', {}, h('strong', {}, correct ? 'Tepat!' : 'Belum tepat.'), h('p', {}, q.explain)));
      feedback.replaceChildren(box);
      // Umpan balik: pilihan membal (benar) / bergetar (salah), panel penjelasan meluncur masuk
      correct ? motion.pop(chosen) : motion.shake(chosen);
      motion.enter(box, { opacity: 0, y: 12 });
      if (!correct) motion.pop($('.option.is-correct', form));
      submit.textContent = index + 1 < order.length ? 'Soal berikutnya' : 'Lihat hasil';
      submit.focus();
    });

    host.replaceChildren(form);
    motion.enter(form, { opacity: 0, x: 24 });
    $('input', form).focus({ preventScroll: true });
  }

  function next() {
    index += 1;
    if (index < order.length) renderQuestion();
    else finish();
  }

  function finish() {
    const score = Math.round((correctCount / order.length) * 100);
    const passed = score >= passScore;
    best = Math.max(best ?? 0, score);
    const result = h('div', { class: `quiz-result${passed ? ' is-pass' : ''}`, tabindex: '-1' },
      h('div', { class: 'quiz-result__score' },
        h('span', { class: 'num num--xl' }, String(score)),
        h('span', { class: 'text-soft' }, `${correctCount} dari ${order.length} benar`)),
      h('div', {},
        h('p', { class: 'h3' }, passed ? 'Lulus! Pemahamanmu sudah kuat.' : 'Belum lulus—coba sekali lagi.'),
        h('p', { class: 'text-soft' }, passed
          ? (finishLink?.href === '#selesai' ? 'Lanjut ke ringkasan untuk menandai modul selesai.' : 'Hasilmu sudah tersimpan.')
          : `Nilai lulus ${passScore}. Baca ulang bagian yang terasa sulit, lalu ulangi kuis (soal akan diacak).`)),
      h('div', { class: 'cluster' },
        h('button', { type: 'button', class: `btn ${passed ? 'btn--secondary' : 'btn--primary'}`, onclick: start }, icon('undo', 'icon--lead'), 'Ulangi kuis'),
        passed && finishLink ? h('a', { class: 'btn btn--primary', href: finishLink.href }, finishLink.label, icon('arrow-right', 'icon--trail')) : null));

    // Pembahasan seluruh soal: jawabanmu, jawaban benar, dan penjelasannya
    const review = h('details', { class: 'quiz-review', open: !passed },
      h('summary', {}, icon('book'), 'Pembahasan semua soal'),
      h('ol', { class: 'quiz-review__list', role: 'list' }, order.map((q, i) =>
        h('li', { class: `quiz-review__item ${q.wasCorrect ? 'is-correct' : 'is-wrong'}` },
          h('p', { class: 'quiz-review__q' }, h('span', { class: 'quiz-review__num' }, String(i + 1)), q.q),
          h('p', { class: 'quiz-review__ans' }, icon(q.wasCorrect ? 'check' : 'x'),
            h('span', {}, 'Jawabanmu: ', h('strong', {}, q.chosenText ?? '—'))),
          q.wasCorrect ? null : h('p', { class: 'quiz-review__ans is-key' }, icon('check'),
            h('span', {}, 'Jawaban tepat: ', h('strong', {}, q.correctText))),
          h('p', { class: 'quiz-review__explain' }, q.explain)))));
    result.append(review);

    host.replaceChildren(result);
    result.focus();
    motion.enter(result, { opacity: 0, scale: 0.96 });
    // Skor dihitung naik dari 0 agar hasil terasa "dihitung"
    const scoreEl = $('.quiz-result__score .num', result);
    scoreEl.textContent = '0';
    motion.countUp(scoreEl, score, { duration: 0.9 });
    if (passed) motion.confetti($('.quiz-result__score', result));
    onFinish?.(score, passed);
  }

  start();
}
