/* =====================================================================
   features/exercises.js — Latihan interaktif di dalam lesson
   ---------------------------------------------------------------------
   checklist : aksi nyata, status tersimpan di LocalStorage (state.js)
   recall    : satu soal cek cepat (active recall), umpan balik instan
   classify  : pilah item ke dua kategori + penjelasan
   builder   : susun nama file / headline / subjek dengan pemeriksaan live
   Semua memakai komponen design system (check, option, feedback, field).
   ===================================================================== */

import { $, $$, h, icon, uid } from '../core/dom.js';
import { setProgress, initRings, toast } from '../core/ui.js';
import * as state from '../core/state.js';
import * as motion from '../core/motion.js';
import { copyText } from './clipboard.js';

/* ---------- CHECKLIST (tersimpan) ---------- */

export function renderChecklist(block, ctx) {
  const saved = state.getState().modules[ctx.moduleId]?.checklist || {};
  const ring = h('div', { class: 'ring', 'data-ring': true, 'data-value': '0', 'data-label': 'Progres checklist', 'data-animate': 'false' });
  const count = h('span', {}, '0');
  const boxes = [];

  const list = h('ul', { class: 'checklist', role: 'list' }, block.items.map((item) => {
    const input = h('input', { type: 'checkbox', checked: Boolean(saved[item.id]) });
    boxes.push(input);
    input.addEventListener('change', () => {
      state.setChecklistItem(ctx.moduleId, item.id, input.checked);
      if (input.checked) motion.pop(input.nextElementSibling);
      update(true);
    });
    return h('li', {},
      h('label', { class: 'check' },
        input,
        h('span', { class: 'check__box' }, checkSvg()),
        h('span', { class: 'check__text' },
          h('span', { class: 'check__title' }, item.text),
          item.hint ? h('span', { class: 'check__hint' }, item.hint) : null)));
  }));

  let wasComplete = false;
  function update(fromUser) {
    const done = boxes.filter((b) => b.checked).length;
    count.textContent = String(done);
    setProgress(ring, (done / boxes.length) * 100, { animate: fromUser });
    const complete = done === boxes.length;
    if (complete && !wasComplete && fromUser) {
      motion.confetti(ring);
      toast('Checklist lengkap. Kerja bagus!', { type: 'success', title: 'Semua langkah selesai' });
    }
    wasComplete = complete;
  }

  const wrap = h('div', { class: 'card card--flat exercise', 'data-module': ctx.moduleId },
    h('div', { class: 'checklist-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Checklist interaktif'),
        h('p', { class: 'text-soft text-sm' }, count, ` dari ${boxes.length} selesai · tersimpan otomatis`)),
      ring),
    list);
  initRings(wrap);
  update(false);
  return wrap;
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

/* ---------- RECALL (cek cepat 1 soal) ---------- */

export function renderRecall(block) {
  const name = uid('recall');
  const feedback = h('div', { 'aria-live': 'polite' });
  const options = h('div', { class: 'options' });

  block.options.forEach((text, i) => {
    const input = h('input', { type: 'radio', name, value: String(i) });
    // 2.0: ikon benar/salah baru ditambahkan SETELAH menjawab (kunci tidak ada di DOM)
    const option = h('label', { class: 'option' },
      input,
      h('span', { class: 'option__key' }, 'ABCD'[i]),
      h('span', {}, text));
    input.addEventListener('change', () => check(i, option));
    options.append(option);
  });

  function check(choice, chosenEl) {
    const correct = choice === block.answer;
    options.classList.add('is-locked');
    $$('.option', options).forEach((opt, i) => {
      $('input', opt).disabled = true;
      opt.append(icon(i === block.answer ? 'check' : 'x', 'option__mark'));
      if (i === block.answer) opt.classList.add('is-correct');
    });
    if (!correct) chosenEl.classList.add('is-wrong');
    const box = h('div', { class: `feedback feedback--${correct ? 'correct' : 'wrong'}` },
      icon(correct ? 'check' : 'x'),
      h('div', {}, h('strong', {}, correct ? 'Tepat!' : 'Belum tepat.'), h('p', {}, block.explain),
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: reset }, icon('undo', 'icon--lead'), 'Coba lagi')));
    feedback.replaceChildren(box);
    correct ? motion.pop(chosenEl) : motion.shake(chosenEl);
  }

  function reset() {
    options.classList.remove('is-locked');
    $$('.option', options).forEach((opt) => {
      opt.classList.remove('is-correct', 'is-wrong');
      $('.option__mark', opt)?.remove();
      const input = $('input', opt);
      input.disabled = false;
      input.checked = false;
    });
    feedback.replaceChildren();
    $('input', options).focus();
  }

  return h('fieldset', { class: 'card card--flat recall exercise' },
    h('legend', { class: 'recall__legend' }, h('span', { class: 'eyebrow' }, icon('spark'), 'Cek cepat')),
    h('p', { class: 'recall__q' }, block.q),
    options,
    feedback);
}

/* ---------- CLASSIFY (pilah dua kategori) ---------- */

export function renderClassify(block) {
  const { good = 'Benar', bad = 'Salah' } = block.labels || {};
  const score = h('p', { class: 'classify__score', 'aria-live': 'polite' });
  const results = new Map();

  const rows = block.items.map((item, index) => {
    const why = h('p', { class: 'classify__why', hidden: true });
    const buttons = ['good', 'bad'].map((value) => h('button', {
      type: 'button',
      class: `chip chip-btn classify__btn classify__btn--${value}`,
      'aria-pressed': 'false',
      onclick: (e) => answer(index, value, e.currentTarget),
    }, value === 'good' ? icon('check') : icon('x'), value === 'good' ? good : bad));
    const row = h('li', { class: 'classify__item' },
      h('p', { class: 'classify__text' }, item.text),
      h('div', { class: 'classify__actions', role: 'group', 'aria-label': `Pilih kategori untuk: ${item.text}` }, buttons),
      why);
    row._why = why;
    row._buttons = buttons;
    return row;
  });

  function answer(index, value, btn) {
    const item = block.items[index];
    const row = rows[index];
    const correct = item.answer === value;
    results.set(index, correct);
    row._buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    row.classList.toggle('is-correct', correct);
    row.classList.toggle('is-wrong', !correct);
    row._why.hidden = false;
    row._why.replaceChildren(icon(correct ? 'check' : 'x'), h('span', {},
      h('strong', {}, correct ? 'Tepat. ' : `Kurang tepat — jawabannya "${item.answer === 'good' ? good : bad}". `), item.why));
    correct ? motion.pop(btn) : motion.shake(row);
    updateScore();
  }

  function updateScore() {
    const answered = results.size;
    const right = [...results.values()].filter(Boolean).length;
    score.textContent = answered < block.items.length
      ? `${answered}/${block.items.length} dijawab · ${right} tepat`
      : `Selesai: ${right} dari ${block.items.length} tepat${right === block.items.length ? ' — sempurna!' : '.'}`;
    if (answered === block.items.length && right === block.items.length) motion.confetti(score, 20);
  }

  function reset() {
    results.clear();
    rows.forEach((row) => {
      row.classList.remove('is-correct', 'is-wrong');
      row._why.hidden = true;
      row._buttons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    });
    updateScore();
  }

  updateScore();
  return h('div', { class: 'card card--flat classify exercise' },
    h('div', { class: 'classify__head' },
      h('p', { class: 'eyebrow' }, icon('spark'), 'Latihan memilah'),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: reset }, icon('undo', 'icon--lead'), 'Ulangi')),
    h('ol', { class: 'classify__list', role: 'list' }, rows),
    score);
}

/* ---------- BUILDER (susun teks + pemeriksaan live) ---------- */

/** "rina putri andini" → "RinaPutriAndini" */
const pascal = (text) => text.trim().split(/\s+/).filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('').replace(/[^A-Za-z0-9-]/g, '');

const BUILDERS = {
  filename: (v) => {
    const parts = [pascal(v.doc || 'CV'), pascal(v.name), pascal(v.role)].filter(Boolean);
    const output = parts.length ? `${parts.join('_')}.pdf` : '';
    return {
      output,
      checks: [
        { ok: Boolean(pascal(v.name)), text: 'Memuat nama lengkap' },
        { ok: Boolean(pascal(v.role)), text: 'Memuat posisi yang dilamar' },
        { ok: !/\s/.test(output), text: 'Tanpa spasi' },
        { ok: output.endsWith('.pdf'), text: 'Berformat .pdf' },
        { ok: output.length > 0 && output.length <= 60, text: 'Ringkas (≤ 60 karakter)', soft: true },
      ],
    };
  },
  headline: (v) => {
    const output = [v.role, v.skills, v.value].map((s) => (s || '').trim()).filter(Boolean).join(' | ');
    return {
      output,
      checks: [
        { ok: Boolean(v.role?.trim()), text: 'Menyebut peran target' },
        { ok: (v.skills || '').split(',').filter((s) => s.trim()).length >= 1, text: 'Menyebut keahlian utama' },
        { ok: !/(mahasiswa|fresh ?grad|pencari kerja)$/i.test(output.trim()) || Boolean(v.skills), text: 'Lebih dari sekadar status' },
        { ok: output !== output.toUpperCase() || !output, text: 'Tidak memakai huruf kapital semua' },
        { ok: output.length <= 120, text: 'Ringkas dan mudah dipindai', soft: true },
      ],
    };
  },
  // 2.0: format seragam dengan generator & materi — Posisi - Nama Lengkap - Keahlian
  subject: (v) => {
    const role = (v.role || '').trim();
    const name = (v.name || '').trim();
    const skill = (v.skill || '').trim();
    const output = [role, name, skill].filter(Boolean).join(' - ');
    return {
      output,
      checks: [
        { ok: Boolean(role), text: 'Menyebut posisi' },
        { ok: name.split(/\s+/).filter(Boolean).length >= 2, text: 'Menyebut nama lengkap (minimal dua kata)' },
        { ok: Boolean(skill), text: 'Menyebut keahlian utama' },
        { ok: !output || output !== output.toUpperCase(), text: 'Tidak memakai huruf kapital semua' },
        { ok: !/urgent|segera|mohon dibaca|penting|[!?]{2,}/i.test(output), text: 'Tanpa kata mendesak atau tanda seru berlebihan' },
        { ok: !/\p{Extended_Pictographic}/u.test(output), text: 'Tanpa emoji' },
        { ok: output.length <= 70, text: 'Ringkas agar tidak terpotong di layar HP', soft: true },
      ],
    };
  },
  // 2.0: Professional Email Checker (Modul 1)
  emailcheck: (v) => {
    const email = (v.email || '').trim().toLowerCase();
    const [local = '', domain = ''] = email.split('@');
    const nameParts = (v.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter((w) => w.length >= 3);
    const valid = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email);
    const institution = /\.(ac|sch|edu)\.|\.edu$|student|mahasiswa/.test(domain + local);
    const silly = /(cute|imut|ganteng|cantik|keren|sayang|gamer|lover|kece|manja|baby|princess|kiyut|xx|lol)/.test(local);
    return {
      output: email ? (valid ? email : `${email} (format belum valid)`) : '',
      checks: [
        { ok: valid, text: 'Format alamat email valid' },
        { ok: valid && nameParts.some((p) => local.includes(p)), text: 'Memuat nama aslimu' },
        { ok: !silly, text: 'Tanpa julukan atau kata yang tidak profesional' },
        { ok: !/\d{3,}/.test(local), text: 'Tanpa deretan angka (mis. tahun lahir)' },
        { ok: (local.match(/[._-]/g) || []).length <= 2, text: 'Pemisah (titik/garis bawah) tidak berlebihan' },
        { ok: valid && !institution, text: 'Bukan email sekolah/kampus/kantor yang bisa dinonaktifkan' },
        { ok: local.length > 0 && local.length <= 30, text: 'Mudah diketik (≤ 30 karakter sebelum @)', soft: true },
      ],
    };
  },
  // 2.0: Warm Outreach Message Generator (Modul 3)
  outreach: (v) => {
    const r = (v.recipient || '').trim();
    const n = (v.name || '').trim();
    const ctx = (v.context || '').trim();
    const reason = (v.reason || '').trim();
    const pos = (v.position || '').trim();
    if (!r && !n && !ctx && !reason) return { output: '', checks: [{ ok: false, text: 'Isi kolom di atas untuk menyusun pesan' }] };
    const output = [
      `Halo ${r || '[nama penerima]'}, saya ${n || '[namamu]'}.`,
      ctx ? `Saya mengikuti ${ctx} dan merasa banyak belajar dari sana.` : '',
      pos ? `Saya baru saja melamar posisi ${pos} dan ${reason ? `ingin ${reason.replace(/^ingin\s+/i, '')}` : 'ingin mengenal tim lebih dekat'}.` : (reason ? `Saya ${/^ingin/i.test(reason) ? reason : `ingin ${reason}`}.` : ''),
      'Jika berkenan, apakah saya boleh menanyakan satu hal singkat tentang hal tersebut? Terima kasih atas waktunya.',
    ].filter(Boolean).join(' ');
    return {
      output,
      checks: [
        { ok: Boolean(r), text: 'Menyapa dengan nama penerima' },
        { ok: Boolean(ctx), text: 'Menyebut hal spesifik tentang mereka/perusahaan' },
        { ok: Boolean(reason), text: 'Tujuan menghubungi jelas' },
        { ok: !/referral|rekomendasi(kan)? saya|masukkan saya|tolong terima/i.test(output), text: 'Tidak meminta referral di pesan pertama' },
        { ok: output.length <= 300, text: 'Cukup singkat untuk catatan koneksi (±300 karakter)', soft: true },
      ],
    };
  },
};

export function renderBuilder(block, ctx) {
  const build = BUILDERS[block.kind];
  const values = {};
  const preview = h('output', { class: 'builder__output', 'aria-live': 'polite' });
  const checksList = h('ul', { class: 'builder__checks', role: 'list' });
  const copyBtn = h('button', { type: 'button', class: 'btn btn--secondary btn--sm', disabled: true }, icon('copy', 'icon--lead'), 'Salin');

  const fields = block.fields.map((f) => {
    const id = uid(`bf-${f.id}`);
    const initial = f.default === '@name' ? (ctx.userName || '') : (f.default || '');
    values[f.id] = initial;
    const input = h('input', { class: 'input', id, type: 'text', value: initial, placeholder: f.placeholder || '', autocomplete: 'off' });
    input.addEventListener('input', () => { values[f.id] = input.value; update(); });
    return h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, f.label), input);
  });

  function update() {
    const { output, checks } = build(values);
    preview.textContent = output || 'Isi kolom di atas untuk melihat hasil…';
    preview.classList.toggle('is-empty', !output);
    copyBtn.disabled = !output;
    checksList.replaceChildren(...checks.map((c) =>
      h('li', { class: c.ok ? 'is-ok' : c.soft ? 'is-soft' : 'is-bad' },
        icon(c.ok ? 'check' : c.soft ? 'info' : 'x'), c.text,
        h('span', { class: 'sr-only' }, c.ok ? '(terpenuhi)' : '(belum terpenuhi)'))));
  }

  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(preview.textContent);
    toast(ok ? 'Hasil disalin ke clipboard.' : 'Gagal menyalin. Salin manual, ya.', { type: ok ? 'success' : 'error' });
  });

  const label = { filename: 'Pembuat nama file', headline: 'Penyusun headline', subject: 'Penyusun subjek email', emailcheck: 'Professional Email Checker', outreach: 'Warm Outreach Message Generator' }[block.kind];
  update();
  return h('div', { class: 'card card--flat builder exercise' },
    h('p', { class: 'eyebrow' }, icon('wand'), label),
    h('div', { class: 'builder__fields' }, fields),
    h('div', { class: 'builder__result' },
      h('p', { class: 'text-sm text-soft' }, 'Hasil:'),
      h('div', { class: 'builder__row' }, preview, copyBtn)),
    checksList);
}
