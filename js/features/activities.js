/* =====================================================================
   features/activities.js — Mesin aktivitas interaktif (Pipeline 2.0)
   ---------------------------------------------------------------------
   Setiap mesin dipakai ulang oleh beberapa materi lewat blok JSON:
     scenario  : studi kasus pilihan ganda + pembahasan (CC/BCC, timing,
                 izin Drive, hiring manager, status lamaran, …)
     match     : pasangkan istilah ↔ fungsi (drag & drop + klik/keyboard)
     order     : urutkan kartu (tombol naik/turun + drag & drop)
     spot      : temukan kesalahan di email/CV (klik bagian yang salah)
     keywords  : simulasi pencocokan kata kunci lowongan (ATS sederhana)
     worksheet : lembar kerja isian tersimpan + salin sebagai teks
     presend   : checklist pra-kirim (sama dengan halaman Latihan)
     review    : CV & Portfolio Review (sama dengan halaman Latihan)
     tool      : kartu menuju alat nyata (mis. Job Tracker) + status live

   Prinsip:
   - Kunci jawaban TIDAK ditulis ke DOM sebelum peserta menjawab;
     kebenaran dicek dari data JSON di memori.
   - Skor dicatat lewat state.recordActivity(); XP hanya sekali, saat
     pertama kali lulus (nilai lulus terlihat di setiap aktivitas).
   - Semua teks dirender lewat textContent (aman dari XSS).
   ===================================================================== */

import { $, $$, h, icon, uid, debounce } from '../core/dom.js';
import { toast, setProgress, initRings } from '../core/ui.js';
import * as state from '../core/state.js';
import * as tracker from '../core/tracker-store.js';
import * as motion from '../core/motion.js';
import { copyText } from './clipboard.js';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Kerangka kartu aktivitas: judul, info nilai lulus, skor terbaik tersimpan */
function shell(block, { eyebrow, iconName }) {
  const pass = block.pass ?? state.ACTIVITY_PASS;
  const best = state.getState().activities[block.id];
  const status = h('p', { class: 'activity-card__best', 'aria-live': 'polite' });
  const setStatus = (rec = state.getState().activities[block.id]) => {
    status.replaceChildren(rec
      ? h('span', {}, rec.passedAt ? icon('check') : icon('clock'), `Skor terbaik ${rec.best} · ${rec.attempts}× mencoba${rec.passedAt ? ' · lulus' : ''}`)
      : h('span', {}, icon('target'), `Nilai lulus ${pass}`));
  };
  setStatus(best);
  const head = h('div', { class: 'activity-card__head' },
    h('div', {},
      h('p', { class: 'eyebrow' }, icon(iconName), eyebrow),
      block.title ? h('p', { class: 'activity-card__title' }, block.title) : null),
    status);
  return { head, pass, setStatus };
}

/** Simpan skor + umpan balik XP/badge */
function record(block, score, pass, setStatus) {
  const { firstPass } = state.recordActivity(block.id, score, pass, block.title || 'Aktivitas');
  setStatus();
  if (firstPass) toast(`Lulus dengan skor ${score}.`, { type: 'success', title: `+${state.XP.activity} XP` });
}

/** Panel hasil: skor + rincian */
function resultPanel(score, pass, detail) {
  const ok = score >= pass;
  return h('div', { class: `feedback feedback--${ok ? 'correct' : 'wrong'} activity-result` },
    icon(ok ? 'check' : 'info'),
    h('div', {},
      h('strong', {}, `Skor ${score}/100 — ${ok ? 'lulus' : `belum lulus (minimal ${pass})`}`),
      h('p', {}, detail)));
}

/* =====================================================================
   SCENARIO — studi kasus pilihan ganda
   ===================================================================== */

export function renderScenario(block) {
  const { head, pass, setStatus } = shell(block, { eyebrow: 'Studi kasus', iconName: 'spark' });
  const answers = new Map();
  const result = h('div', { 'aria-live': 'polite' });
  const retry = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', hidden: true, onclick: () => reset() }, icon('undo', 'icon--lead'), 'Ulangi studi kasus');

  const cases = block.cases.map((c, ci) => {
    const why = h('div', { class: 'scenario__why', hidden: true });
    const buttons = c.options.map((text, oi) => h('button', {
      type: 'button',
      class: 'scenario__option',
      'aria-pressed': 'false',
      onclick: () => choose(ci, oi),
    }, h('span', { class: 'option__key', 'aria-hidden': 'true' }, 'ABCD'[oi]), h('span', {}, text)));
    const item = h('li', { class: 'scenario__case' },
      h('p', { class: 'scenario__situation' }, h('span', { class: 'scenario__num' }, `Kasus ${ci + 1}`), c.situation),
      h('div', { class: 'scenario__options', role: 'group', 'aria-label': `Pilihan untuk kasus ${ci + 1}` }, buttons),
      why);
    item._buttons = buttons;
    item._why = why;
    return item;
  });

  function choose(ci, oi) {
    if (answers.has(ci)) return;
    const c = block.cases[ci];
    const item = cases[ci];
    const correct = oi === c.answer;
    answers.set(ci, correct);
    item._buttons.forEach((b, i) => {
      b.disabled = true;
      b.setAttribute('aria-pressed', String(i === oi));
      if (i === c.answer) b.classList.add('is-correct');
      if (i === oi && !correct) b.classList.add('is-wrong');
    });
    item.classList.add(correct ? 'is-correct' : 'is-wrong');
    item._why.hidden = false;
    item._why.replaceChildren(icon(correct ? 'check' : 'x'), h('p', {},
      h('strong', {}, correct ? 'Tepat. ' : `Kurang tepat — jawaban terbaik: "${c.options[c.answer]}". `), c.explain));
    correct ? motion.pop(item._buttons[oi]) : motion.shake(item._buttons[oi]);
    if (answers.size === block.cases.length) finish();
  }

  function finish() {
    const right = [...answers.values()].filter(Boolean).length;
    const score = Math.round((right / block.cases.length) * 100);
    result.replaceChildren(resultPanel(score, pass, `${right} dari ${block.cases.length} kasus tepat. Baca pembahasan tiap kasus di atas.`));
    retry.hidden = false;
    record(block, score, pass, setStatus);
    if (score === 100) motion.confetti(result, 24);
  }

  function reset() {
    answers.clear();
    cases.forEach((item) => {
      item.classList.remove('is-correct', 'is-wrong');
      item._why.hidden = true;
      item._buttons.forEach((b) => { b.disabled = false; b.classList.remove('is-correct', 'is-wrong'); b.setAttribute('aria-pressed', 'false'); });
    });
    result.replaceChildren();
    retry.hidden = true;
    cases[0]._buttons[0].focus();
  }

  return h('div', { class: 'card card--flat exercise activity-card scenario' },
    head,
    h('ol', { class: 'scenario__list', role: 'list' }, cases),
    result,
    retry);
}

/* =====================================================================
   MATCH — pasangkan istilah dengan fungsinya
   Drag & drop (mouse) ATAU klik kartu → klik slot (sentuh & keyboard).
   ===================================================================== */

export function renderMatch(block) {
  const { head, pass, setStatus } = shell(block, { eyebrow: 'Pasangkan', iconName: 'grid' });
  const placed = new Map();          // index slot → index definisi
  let selected = null;               // index definisi yang dipilih
  const pool = h('div', { class: 'match__pool', role: 'group', 'aria-label': 'Kartu fungsi yang belum dipasangkan' });
  const result = h('div', { 'aria-live': 'polite' });
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const checkBtn = h('button', { type: 'button', class: 'btn btn--primary btn--sm', disabled: true, onclick: () => check() }, icon('check', 'icon--lead'), 'Periksa');
  const resetBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => reset() }, icon('undo', 'icon--lead'), 'Ulangi');
  let order = shuffle(block.pairs.map((_, i) => i));
  let checked = false;

  const slots = block.pairs.map((pair, si) => {
    const drop = h('button', { type: 'button', class: 'match__drop', onclick: () => placeSelected(si) });
    const slot = h('li', { class: 'match__slot' },
      h('span', { class: 'match__term' }, pair.term),
      drop);
    slot._drop = drop;
    drop.addEventListener('dragover', (e) => { if (!checked) { e.preventDefault(); drop.classList.add('is-over'); } });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
      const di = Number(e.dataTransfer.getData('text/plain'));
      if (!Number.isNaN(di)) place(di, si);
    });
    return slot;
  });

  function card(di) {
    const btn = h('button', {
      type: 'button',
      class: 'match__card',
      draggable: 'true',
      'aria-pressed': String(selected === di),
      onclick: () => { selected = selected === di ? null : di; renderPool(); renderSlots(); if (selected !== null) live.textContent = 'Kartu dipilih. Pilih bagian email tujuan.'; },
    }, block.pairs[di].def);
    btn.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(di)); e.dataTransfer.effectAllowed = 'move'; });
    return btn;
  }

  function placeSelected(si) {
    if (checked) return;
    if (selected === null) {
      // Klik slot terisi tanpa kartu terpilih → kembalikan ke kumpulan
      if (placed.has(si)) { placed.delete(si); renderPool(); renderSlots(); live.textContent = 'Kartu dikembalikan.'; }
      return;
    }
    place(selected, si);
  }

  function place(di, si) {
    if (checked) return;
    for (const [k, v] of placed) if (v === di) placed.delete(k);   // pindahkan bila sudah dipasang di slot lain
    placed.set(si, di);
    selected = null;
    renderPool(); renderSlots();
    live.textContent = `Dipasangkan ke ${block.pairs[si].term}.`;
    checkBtn.disabled = placed.size !== block.pairs.length;
  }

  function renderPool() {
    const used = new Set(placed.values());
    const left = order.filter((di) => !used.has(di));
    pool.replaceChildren(...(left.length ? left.map(card) : [h('p', { class: 'text-soft text-sm' }, 'Semua kartu sudah dipasangkan. Tekan Periksa.')]));
    checkBtn.disabled = placed.size !== block.pairs.length;
  }

  function renderSlots() {
    slots.forEach((slot, si) => {
      const di = placed.get(si);
      slot._drop.classList.toggle('is-filled', di !== undefined);
      slot._drop.classList.toggle('is-target', selected !== null && !checked);
      slot._drop.replaceChildren(di !== undefined ? block.pairs[di].def : (selected !== null ? 'Tempatkan di sini' : 'Seret atau pilih kartu'));
      slot._drop.setAttribute('aria-label', di !== undefined
        ? `${block.pairs[si].term}: ${block.pairs[di].def}${checked ? '' : '. Klik untuk melepas.'}`
        : `${block.pairs[si].term}: kosong${selected !== null ? '. Klik untuk menempatkan kartu terpilih.' : ''}`);
    });
  }

  function check() {
    checked = true;
    let right = 0;
    slots.forEach((slot, si) => {
      const ok = placed.get(si) === si;
      if (ok) right += 1;
      slot.classList.add(ok ? 'is-correct' : 'is-wrong');
      slot._drop.disabled = true;
      if (!ok) slot.append(h('p', { class: 'match__fix' }, icon('check'), h('span', {}, 'Seharusnya: ', h('strong', {}, block.pairs[si].def))));
    });
    const score = Math.round((right / block.pairs.length) * 100);
    result.replaceChildren(resultPanel(score, pass, `${right} dari ${block.pairs.length} pasangan tepat.`));
    checkBtn.disabled = true;
    record(block, score, pass, setStatus);
  }

  function reset() {
    checked = false;
    placed.clear();
    selected = null;
    order = shuffle(block.pairs.map((_, i) => i));
    slots.forEach((slot) => { slot.classList.remove('is-correct', 'is-wrong'); slot._drop.disabled = false; $('.match__fix', slot)?.remove(); });
    result.replaceChildren();
    renderPool(); renderSlots();
  }

  renderPool(); renderSlots();
  return h('div', { class: 'card card--flat exercise activity-card match' },
    head,
    h('p', { class: 'text-soft text-sm' }, 'Kartu fungsi:'),
    pool,
    h('ol', { class: 'match__slots', role: 'list' }, slots),
    live,
    h('div', { class: 'cluster' }, checkBtn, resetBtn),
    result);
}

/* =====================================================================
   ORDER — urutkan kartu
   ===================================================================== */

export function renderOrder(block) {
  const { head, pass, setStatus } = shell(block, { eyebrow: 'Urutkan', iconName: 'route' });
  const n = block.items.length;
  const fresh = () => {
    let o;
    do { o = shuffle(block.items.map((_, i) => i)); } while (o.every((v, i) => v === i) && n > 1);
    return o;
  };
  let order = fresh();
  let checked = false;
  let dragFrom = null;
  const list = h('ol', { class: 'order__list', role: 'list' });
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const result = h('div', { 'aria-live': 'polite' });
  const checkBtn = h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: () => check() }, icon('check', 'icon--lead'), 'Periksa urutan');
  const resetBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => reset() }, icon('undo', 'icon--lead'), 'Acak ulang');

  function move(from, to, focusDir) {
    if (to < 0 || to >= n || checked) return;
    const [x] = order.splice(from, 1);
    order.splice(to, 0, x);
    render();
    live.textContent = `"${block.items[x]}" sekarang di posisi ${to + 1}.`;
    const btn = $$(`.order__item`, list)[to]?.querySelector(focusDir === 'up' ? '[data-up]' : '[data-down]');
    (btn && !btn.disabled ? btn : $$(`.order__item`, list)[to]?.querySelector('button:not([disabled])'))?.focus();
  }

  function render() {
    list.replaceChildren(...order.map((itemIndex, pos) => {
      const li = h('li', { class: 'order__item', draggable: checked ? null : 'true' },
        h('span', { class: 'order__pos', 'aria-hidden': 'true' }, String(pos + 1)),
        h('span', { class: 'order__text' }, block.items[itemIndex]),
        h('span', { class: 'order__ctrl' },
          h('button', { type: 'button', class: 'btn btn--ghost btn--icon', 'data-up': true, disabled: pos === 0 || checked, 'aria-label': `Naikkan "${block.items[itemIndex]}"`, onclick: () => move(pos, pos - 1, 'up') }, icon('arrow-left', 'order__up')),
          h('button', { type: 'button', class: 'btn btn--ghost btn--icon', 'data-down': true, disabled: pos === n - 1 || checked, 'aria-label': `Turunkan "${block.items[itemIndex]}"`, onclick: () => move(pos, pos + 1, 'down') }, icon('arrow-right', 'order__down'))));
      if (checked) li.classList.add(itemIndex === pos ? 'is-correct' : 'is-wrong');
      li.addEventListener('dragstart', (e) => { dragFrom = pos; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(pos)); li.classList.add('is-dragging'); });
      li.addEventListener('dragend', () => li.classList.remove('is-dragging'));
      li.addEventListener('dragover', (e) => { if (!checked) e.preventDefault(); });
      li.addEventListener('drop', (e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== pos) move(dragFrom, pos); dragFrom = null; });
      return li;
    }));
  }

  function check() {
    checked = true;
    const right = order.filter((itemIndex, pos) => itemIndex === pos).length;
    const score = Math.round((right / n) * 100);
    render();
    result.replaceChildren(resultPanel(score, pass, `${right} dari ${n} posisi tepat. ${block.explain || ''}`),
      score < 100 ? h('div', { class: 'order__answer' }, h('p', { class: 'text-sm' }, h('strong', {}, 'Urutan yang tepat:')),
        h('ol', { class: 'learn-list' }, block.items.map((t) => h('li', {}, t)))) : null);
    checkBtn.disabled = true;
    record(block, score, pass, setStatus);
  }

  function reset() {
    checked = false;
    order = fresh();
    checkBtn.disabled = false;
    result.replaceChildren();
    render();
  }

  render();
  return h('div', { class: 'card card--flat exercise activity-card order' },
    head,
    h('p', { class: 'text-soft text-sm' }, 'Gunakan tombol panah atau seret kartu untuk mengubah urutan.'),
    list, live,
    h('div', { class: 'cluster' }, checkBtn, resetBtn),
    result);
}

/* =====================================================================
   SPOT — temukan kesalahan
   ===================================================================== */

export function renderSpot(block) {
  const { head, pass, setStatus } = shell(block, { eyebrow: 'Temukan kesalahan', iconName: 'search' });
  const total = block.segments.filter((s) => s.mistake).length;
  const marked = new Set();
  let checked = false;
  const counter = h('p', { class: 'text-soft text-sm', 'aria-live': 'polite' });
  const result = h('div', { 'aria-live': 'polite' });
  const notes = h('ol', { class: 'spot__notes', role: 'list' });
  const checkBtn = h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: () => check() }, icon('check', 'icon--lead'), 'Periksa');
  const resetBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => reset() }, icon('undo', 'icon--lead'), 'Ulangi');

  const segs = block.segments.map((seg, i) => {
    const btn = h('button', {
      type: 'button',
      class: `spot__seg${seg.br ? ' is-line' : ''}`,
      'aria-pressed': 'false',
      onclick: () => {
        if (checked) return;
        marked.has(i) ? marked.delete(i) : marked.add(i);
        btn.setAttribute('aria-pressed', String(marked.has(i)));
        updateCounter();
      },
    }, seg.text);
    return btn;
  });

  const updateCounter = () => { counter.textContent = `${marked.size} bagian ditandai · ada ${total} kesalahan yang perlu ditemukan`; };

  function check() {
    checked = true;
    let found = 0;
    let falsePos = 0;
    const items = [];
    block.segments.forEach((seg, i) => {
      const btn = segs[i];
      btn.disabled = true;
      const isMarked = marked.has(i);
      if (seg.mistake && isMarked) { found += 1; btn.classList.add('is-found'); items.push({ kind: 'found', seg }); }
      else if (seg.mistake) { btn.classList.add('is-missed'); items.push({ kind: 'missed', seg }); }
      else if (isMarked) { falsePos += 1; btn.classList.add('is-false'); items.push({ kind: 'false', seg }); }
    });
    const score = Math.max(0, Math.round(((found - falsePos) / total) * 100));
    notes.replaceChildren(...items.map(({ kind, seg }) => h('li', { class: `spot__note is-${kind}` },
      icon(kind === 'found' ? 'check' : kind === 'missed' ? 'alert' : 'x'),
      h('div', {},
        h('p', { class: 'spot__quote' }, `“${seg.text}”`),
        h('p', {}, h('strong', {}, kind === 'found' ? 'Ditemukan. ' : kind === 'missed' ? 'Terlewat. ' : 'Sebenarnya sudah tepat. '),
          kind === 'false' ? 'Bagian ini tidak bermasalah.' : seg.mistake)))));
    result.replaceChildren(resultPanel(score, pass,
      `Rubrik: (kesalahan ditemukan − tandai keliru) ÷ total kesalahan. Ditemukan ${found}/${total}, tandai keliru ${falsePos}.`));
    checkBtn.disabled = true;
    record(block, score, pass, setStatus);
  }

  function reset() {
    checked = false;
    marked.clear();
    segs.forEach((b) => { b.disabled = false; b.classList.remove('is-found', 'is-missed', 'is-false'); b.setAttribute('aria-pressed', 'false'); });
    notes.replaceChildren();
    result.replaceChildren();
    checkBtn.disabled = false;
    updateCounter();
  }

  updateCounter();
  return h('div', { class: 'card card--flat exercise activity-card spot' },
    head,
    h('div', { class: `spot__frame spot__frame--${block.frame || 'email'}`, role: 'group', 'aria-label': 'Dokumen latihan. Tekan bagian yang menurutmu salah.' }, segs),
    counter,
    h('div', { class: 'cluster' }, checkBtn, resetBtn),
    result,
    notes);
}

/* =====================================================================
   KEYWORDS — simulasi pencocokan kata kunci lowongan
   ===================================================================== */

export function renderKeywords(block) {
  const { head, pass, setStatus } = shell(block, { eyebrow: 'Simulasi kata kunci', iconName: 'search' });
  const id = uid('kw');
  const area = h('textarea', { class: 'textarea keywords__input', id, rows: '7', maxlength: '1500', spellcheck: 'true' });
  area.value = block.sample;
  const chips = h('ul', { class: 'keywords__chips', role: 'list' });
  const meter = h('div', { class: 'bar bar--lg', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Kecocokan kata kunci' }, h('span', { class: 'bar__fill' }));
  const pct = h('strong', { class: 'num' }, '0%');
  const warn = h('div', { 'aria-live': 'polite' });
  const result = h('div', { 'aria-live': 'polite' });
  const saveBtn = h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: () => submit() }, icon('check', 'icon--lead'), 'Simpan hasil');
  const resetBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => { area.value = block.sample; analyse(); result.replaceChildren(); } }, icon('undo', 'icon--lead'), 'Kembalikan contoh');

  const norm = (t) => t.toLowerCase();
  const countOf = (text, term) => (text.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

  let last = { coverage: 0, stuffing: [] };
  function analyse() {
    const text = norm(area.value);
    const found = block.keywords.map((k) => [k.term, ...k.alts].some((t) => text.includes(norm(t))));
    const stuffing = block.keywords.filter((k) => [k.term, ...k.alts].reduce((n, t) => n + countOf(text, norm(t)), 0) > 3).map((k) => k.term);
    const coverage = Math.round((found.filter(Boolean).length / block.keywords.length) * 100);
    chips.replaceChildren(...block.keywords.map((k, i) => h('li', { class: `keywords__chip${found[i] ? ' is-found' : ''}` },
      icon(found[i] ? 'check' : 'x'), k.term, h('span', { class: 'sr-only' }, found[i] ? '(ditemukan)' : '(belum ada)'))));
    pct.textContent = `${coverage}%`;
    setProgress(meter, coverage, { animate: false });
    warn.replaceChildren(stuffing.length
      ? h('div', { class: 'feedback feedback--wrong' }, icon('alert'), h('div', {}, h('strong', {}, 'Terindikasi keyword stuffing: '), h('p', {}, `${stuffing.join(', ')} muncul lebih dari 3 kali. Rekruter manusia akan melihatnya sebagai trik—tulis secara alami dengan bukti.`)))
      : '');
    last = { coverage, stuffing };
  }

  function submit() {
    const score = last.stuffing.length ? Math.min(last.coverage, pass - 10) : last.coverage;
    result.replaceChildren(resultPanel(score, pass, last.stuffing.length
      ? 'Skor dibatasi karena ada pengulangan kata kunci berlebihan.'
      : 'Skor = persentase kata kunci lowongan yang muncul di teks. Pastikan semuanya benar-benar sesuai dengan kemampuan kandidat.'));
    record(block, score, pass, setStatus);
  }

  area.addEventListener('input', debounce(analyse, 150));
  analyse();

  const p = block.posting;
  return h('div', { class: 'card card--flat exercise activity-card keywords' },
    head,
    h('div', { class: 'keywords__grid' },
      h('figure', { class: 'posting' },
        h('figcaption', { class: 'posting__head' }, h('span', { class: 'eyebrow' }, 'Lowongan (fiktif)'), h('strong', {}, p.role), h('span', { class: 'text-soft text-sm' }, p.company)),
        h('ul', { class: 'learn-list' }, p.lines.map((l) => h('li', {}, l)))),
      h('div', { class: 'stack', style: { '--stack-gap': 'var(--s-3)' } },
        h('aside', { class: 'callout callout--info' }, h('span', { class: 'callout__icon' }, icon('user')),
          h('div', {}, h('p', { class: 'callout__title' }, 'Fakta kandidat'), h('p', {}, block.profile))),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, 'Ringkasan & poin CV kandidat (edit di sini)'), area))),
    h('div', { class: 'keywords__score' }, h('span', { class: 'text-sm' }, 'Kecocokan kata kunci: ', pct), meter),
    chips,
    warn,
    h('div', { class: 'cluster' }, saveBtn, resetBtn),
    result,
    h('p', { class: 'text-xs text-soft' }, 'Simulasi ini hanya mencocokkan teks. ATS sungguhan berbeda-beda dan keputusan akhir tetap dibuat manusia.'));
}

/* =====================================================================
   WORKSHEET — lembar kerja tersimpan
   ===================================================================== */

export function renderWorksheet(block) {
  const saved = state.getState().worksheets[block.id] || { values: {}, completedAt: null };
  const values = {};
  const status = h('p', { class: 'activity-card__best', 'aria-live': 'polite' });
  const output = h('div');
  const doneBtn = h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: () => complete() }, icon('check', 'icon--lead'), 'Tandai selesai');
  const copyBtn = h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onclick: () => copyAll() }, icon('copy', 'icon--lead'), 'Salin sebagai teks');
  const persist = debounce(() => state.saveWorksheet(block.id, values), 300);
  const required = block.fields.filter((f) => f.required);
  const filled = () => required.filter((f) => (values[f.id] || '').trim().length >= 3).length;

  const fields = block.fields.map((f) => {
    const id = uid(`ws-${f.id}`);
    values[f.id] = saved.values[f.id] ?? f.default ?? '';
    const input = f.multiline
      ? h('textarea', { class: 'textarea', id, rows: '3', maxlength: '1000', placeholder: f.placeholder || '' })
      : h('input', { class: 'input', id, type: 'text', maxlength: '300', placeholder: f.placeholder || '', autocomplete: 'off' });
    input.value = values[f.id];
    input.addEventListener('input', () => { values[f.id] = input.value; persist(); update(); });
    return h('div', { class: 'field' },
      h('label', { class: 'field__label', for: id }, f.label, f.required ? h('span', { class: 'field__req', 'aria-hidden': 'true' }, ' *') : null),
      input);
  });

  function update() {
    const done = state.getState().worksheets[block.id]?.completedAt;
    status.replaceChildren(done
      ? h('span', {}, icon('check'), 'Selesai · tersimpan di perangkat ini')
      : h('span', {}, icon('clock'), `${filled()}/${required.length} isian wajib terisi · tersimpan otomatis`));
    doneBtn.disabled = Boolean(done) || filled() < required.length;
    if (block.output === 'columns') {
      const cols = (values.columns || '').split(',').map((c) => c.trim()).filter(Boolean);
      output.replaceChildren(cols.length ? h('div', { class: 'worksheet__out' },
        h('p', { class: 'text-sm' }, h('strong', {}, 'Baris judul kolom'), ' (tempel ke baris pertama spreadsheet):'),
        h('output', { class: 'builder__output' }, cols.join('\t')),
        h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onclick: async () => { const ok = await copyText(cols.join('\t')); toast(ok ? 'Judul kolom disalin. Tempel di sel A1.' : 'Gagal menyalin.', { type: ok ? 'success' : 'error' }); } }, icon('copy', 'icon--lead'), 'Salin judul kolom')) : '');
    }
  }

  function complete() {
    state.saveWorksheet(block.id, values);
    const first = state.completeWorksheet(block.id, block.title || 'Lembar kerja');
    if (first) toast('Lembar kerja selesai.', { type: 'success', title: `+${state.XP.worksheet} XP` });
    update();
  }

  async function copyAll() {
    const text = [block.title, ...block.fields.map((f) => `${f.label}:\n${(values[f.id] || '—').trim()}`)].join('\n\n');
    const ok = await copyText(text);
    toast(ok ? 'Isi lembar kerja disalin.' : 'Gagal menyalin. Salin manual, ya.', { type: ok ? 'success' : 'error' });
  }

  update();
  return h('div', { class: 'card card--flat exercise activity-card worksheet' },
    h('div', { class: 'activity-card__head' },
      h('div', {}, h('p', { class: 'eyebrow' }, icon('edit'), 'Lembar kerja'), h('p', { class: 'activity-card__title' }, block.title)),
      status),
    h('div', { class: 'worksheet__fields' }, fields),
    output,
    h('div', { class: 'cluster' }, doneBtn, copyBtn));
}

/* =====================================================================
   CHECKLIST TERSIMPAN BERSAMA (pra-kirim & CV/Portfolio Review)
   ===================================================================== */

function sharedChecklist({ items, getSaved, setItem, xpLabel, title, practiceHref }) {
  const ring = h('div', { class: 'ring', 'data-ring': true, 'data-value': '0', 'data-label': `Progres ${title}`, 'data-animate': 'false' });
  const count = h('span', {}, '0');
  const boxes = items.map((item) => {
    const input = h('input', { type: 'checkbox', checked: getSaved()[item.id] === true, 'data-item': item.id });
    input.addEventListener('change', () => {
      const firstComplete = setItem(item.id, input.checked);
      if (input.checked) motion.pop(input.nextElementSibling);
      update(true);
      if (firstComplete) { motion.confetti(ring); toast(`${title} lengkap.`, { type: 'success', title: `+${state.XP.checklist} XP` }); }
    });
    return { item, input };
  });
  function update(animate) {
    const done = boxes.filter((b) => b.input.checked).length;
    count.textContent = String(done);
    setProgress(ring, (done / boxes.length) * 100, { animate });
  }
  const wrap = h('div', { class: 'card card--flat exercise' },
    h('div', { class: 'checklist-head' },
      h('div', {}, h('p', { class: 'eyebrow' }, xpLabel), h('p', { class: 'text-soft text-sm' }, count, ` dari ${boxes.length} selesai · tersimpan otomatis`)),
      ring),
    h('ul', { class: 'checklist', role: 'list' }, boxes.map(({ item, input }) => h('li', {},
      h('label', { class: 'check' }, input,
        h('span', { class: 'check__box' }, checkSvg()),
        h('span', { class: 'check__text' }, h('span', { class: 'check__title' }, item.text), item.hint ? h('span', { class: 'check__hint' }, item.hint) : null))))),
    practiceHref ? h('a', { class: 'btn btn--ghost btn--sm', href: practiceHref }, 'Buka di halaman Latihan', icon('arrow-right', 'icon--trail')) : null);
  initRings(wrap);
  update(false);
  return wrap;
}

export function renderPresend() {
  return sharedChecklist({
    items: state.PRESEND_ITEMS,
    getSaved: () => state.getState().tools.presend,
    setItem: state.setPresendItem,
    xpLabel: 'Checklist pra-kirim',
    title: 'Checklist pra-kirim',
    practiceHref: 'practice.html#checklist',
  });
}

export function renderReview({ practiceHref = 'practice.html#review' } = {}) {
  return sharedChecklist({
    items: state.REVIEW_ITEMS,
    getSaved: () => state.getState().tools.review,
    setItem: state.setReviewItem,
    xpLabel: 'CV & Portfolio Review',
    title: 'CV & Portfolio Review',
    practiceHref,
  });
}

/* =====================================================================
   TOOL — kartu menuju alat nyata + status live
   ===================================================================== */

export function renderTool(block) {
  const status = h('p', { class: 'text-sm' });
  const refresh = () => {
    if (block.tool === 'tracker') {
      const s = tracker.getStats();
      status.replaceChildren(s.withFollowUp
        ? h('span', { class: 'chip chip--done' }, icon('check'), `${s.withFollowUp} lamaran punya tanggal follow-up`)
        : h('span', { class: 'chip' }, s.total ? `${s.total} lamaran tercatat, belum ada tanggal follow-up` : 'Belum ada lamaran tercatat'));
    }
  };
  refresh();
  // Lepas langganan saat kartu sudah tidak ada di halaman (bagian materi berganti)
  const off = state.subscribe(() => (status.isConnected ? refresh() : off()));
  return h('div', { class: 'card card--flat tool-link' },
    h('span', { class: 'tool-tile__icon' }, icon('kanban')),
    h('div', { class: 'tool-link__body' }, h('p', { class: 'activity-card__title' }, block.title), h('p', { class: 'text-soft text-sm' }, block.text), status),
    h('a', { class: 'btn btn--primary btn--sm', href: block.href }, 'Buka', icon('arrow-right', 'icon--trail')));
}

function checkSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M3 8.5 6.5 12 13 4.5');
  svg.append(path);
  return svg;
}
