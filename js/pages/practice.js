/* =====================================================================
   pages/practice.js — Halaman Latihan
   1. Email Subject Generator : [Posisi] - [Nama Lengkap] - [Keahlian]
      live preview · Generate · Salin · Reset · riwayat tersimpan
   2. Checklist pra-kirim    : 10 item, persentase, animasi selesai,
      reset, tersimpan (state.tools.presend). Tidak ada yang tercentang
      otomatis.
   3. Daftar kuis modul      : skor terbaik nyata dari state + tautan
   2.0: Email Writing Simulator (features/simulator.js), CV & Portfolio
        Review (features/activities.js), status Evaluasi Akhir
   ===================================================================== */

import { $, h, icon } from '../core/dom.js';
import { toast, confirmDialog, setProgress, initRings } from '../core/ui.js';
import * as state from '../core/state.js';
import * as motion from '../core/motion.js';
import { copyText } from '../features/clipboard.js';
import { renderSimulator } from '../features/simulator.js';
import { renderReview } from '../features/activities.js';

export function init() {
  initGenerator();
  initPresend();
  lazySimulator();
  $('[data-review]').replaceChildren(renderReview({ practiceHref: null }));
  renderQuizzes();
  state.subscribe(() => { renderHistory(); renderQuizzes(); syncPresendFromState(); });

  // Tautan dari Dashboard (practice.html#checklist dll.): gulir ke alat
  // setelah animasi masuk dimulai, karena posisi awal bisa ter-reset.
  const target = window.location.hash && document.getElementById(window.location.hash.slice(1));
  if (target) setTimeout(() => target.scrollIntoView({ behavior: 'auto', block: 'start' }), 400);
}

/* Performa (2.0): simulator (data + puluhan elemen form) baru dibangun saat
   bagiannya mendekati layar, atau langsung bila dibuka lewat #simulator. */
function lazySimulator() {
  const host = $('[data-simulator]');
  let done = false;
  const build = () => { if (!done) { done = true; renderSimulator(host); } };
  if (window.location.hash === '#simulator' || !('IntersectionObserver' in window)) { build(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); build(); }
  }, { rootMargin: '600px 0px' });
  io.observe(host);
}

/* =====================================================================
   1. EMAIL SUBJECT GENERATOR
   ===================================================================== */

const tidy = (value) => String(value || '').replace(/\s+/g, ' ').trim();

/** Format sesuai permintaan: [Posisi] - [Nama Lengkap] - [Keahlian] */
export function buildSubject({ role, name, skill }) {
  return [tidy(role), tidy(name), tidy(skill)].filter(Boolean).join(' - ');
}

function subjectChecks({ role, name, skill }, subject) {
  return [
    { ok: Boolean(tidy(role)), text: 'Posisi terisi' },
    { ok: Boolean(tidy(name)), text: 'Nama lengkap terisi' },
    { ok: Boolean(tidy(skill)), text: 'Keahlian utama terisi' },
    { ok: !subject || subject !== subject.toUpperCase(), text: 'Tidak memakai HURUF KAPITAL SEMUA' },
    { ok: !/\p{Extended_Pictographic}|[!?]{2,}/u.test(subject), text: 'Tanpa emoji atau tanda seru berlebihan' },
    { ok: subject.length <= 70, soft: true, text: 'Ringkas agar tidak terpotong di layar HP' },
  ];
}

let generated = '';   // hasil terakhir yang di-Generate

function initGenerator() {
  const form = $('[data-generator]');
  const fields = { name: $('#g-name', form), role: $('#g-role', form), skill: $('#g-skill', form) };
  const preview = $('[data-gen-preview]');
  const from = $('[data-gen-from]');
  const initial = $('[data-gen-initial]');
  const output = $('[data-gen-output]');
  const count = $('[data-gen-count]');
  const checks = $('[data-gen-checks]');
  const copyBtn = $('[data-gen-copy]');

  // Prefill nama dari profil (boleh diubah)
  const userName = state.getState().user.name;
  if (userName) fields.name.value = userName;

  const values = () => ({ name: fields.name.value, role: fields.role.value, skill: fields.skill.value });

  // Live preview: diperbarui setiap kali mengetik
  function updatePreview() {
    const v = values();
    const subject = buildSubject(v);
    preview.textContent = subject || 'Subjek akan muncul di sini…';
    preview.classList.toggle('is-placeholder', !subject);
    from.textContent = tidy(v.name) || 'Nama kamu';
    initial.textContent = (tidy(v.name)[0] || '?').toUpperCase();
    count.textContent = String(subject.length);
    checks.replaceChildren(...subjectChecks(v, subject).map((c) =>
      h('li', { class: c.ok ? 'is-ok' : c.soft ? 'is-soft' : 'is-bad' },
        icon(c.ok ? 'check' : c.soft ? 'info' : 'x'), c.text,
        h('span', { class: 'sr-only' }, c.ok ? '(terpenuhi)' : '(belum terpenuhi)'))));
  }

  function setError(input, message) {
    const field = input.closest('.field');
    $('.field__error', field)?.remove();
    const hintId = `${input.id}-hint`;
    if (message) {
      field.append(h('p', { class: 'field__error', id: `${input.id}-error` }, icon('alert'), message));
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${hintId} ${input.id}-error`);
    } else {
      input.removeAttribute('aria-invalid');
      input.setAttribute('aria-describedby', hintId);
    }
  }

  Object.values(fields).forEach((input) => input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true' && tidy(input.value)) setError(input, '');
    updatePreview();
  }));

  // Generate: validasi → kunci hasil → simpan ke riwayat
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const labels = { name: 'Nama lengkap', role: 'Posisi', skill: 'Keahlian utama' };
    let firstInvalid = null;
    Object.entries(fields).forEach(([key, input]) => {
      const empty = !tidy(input.value);
      setError(input, empty ? `${labels[key]} wajib diisi.` : '');
      if (empty && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) {
      firstInvalid.focus();
      motion.shake(form);
      return;
    }
    generated = buildSubject(values());
    output.textContent = generated;
    output.classList.remove('is-empty');
    copyBtn.disabled = false;
    state.addSubject(generated);
    motion.pop(output);
    toast('Subjek dibuat dan disimpan ke riwayat.', { type: 'success', title: 'Berhasil' });
  });

  copyBtn.addEventListener('click', async () => {
    if (!generated) return;
    const ok = await copyText(generated);
    toast(ok ? `Disalin: "${generated}"` : 'Gagal menyalin. Salin manual, ya.', { type: ok ? 'success' : 'error' });
  });

  // Reset: kosongkan form, pratinjau, dan hasil (riwayat tidak dihapus)
  form.addEventListener('reset', () => {
    requestAnimationFrame(() => {
      generated = '';
      output.textContent = 'Belum ada. Isi kolom lalu tekan Generate.';
      output.classList.add('is-empty');
      copyBtn.disabled = true;
      Object.values(fields).forEach((input) => setError(input, ''));
      updatePreview();
      fields.name.focus();
    });
  });

  updatePreview();
  renderHistory();
}

function renderHistory() {
  const host = $('[data-gen-history]');
  if (!host) return;
  const { subjects } = state.getState().tools;
  if (!subjects.length) {
    host.replaceChildren(h('li', { class: 'gen-history__empty' }, 'Belum ada riwayat. Subjek yang kamu Generate akan tersimpan di sini.'));
    return;
  }
  const fmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  host.replaceChildren(...subjects.map((s) => h('li', { class: 'gen-history__item' },
    h('p', { class: 'gen-history__text' }, s.text, h('time', { class: 'gen-history__time', datetime: s.at }, fmt.format(new Date(s.at)))),
    h('button', {
      type: 'button', class: 'btn btn--ghost btn--icon', 'aria-label': `Salin subjek: ${s.text}`, 'data-tooltip': 'Salin',
      onclick: async () => {
        const ok = await copyText(s.text);
        toast(ok ? 'Subjek dari riwayat disalin.' : 'Gagal menyalin.', { type: ok ? 'success' : 'error' });
      },
    }, icon('copy')),
    h('button', {
      type: 'button', class: 'btn btn--ghost btn--icon', 'aria-label': `Hapus dari riwayat: ${s.text}`, 'data-tooltip': 'Hapus dari riwayat',
      onclick: () => {
        state.removeSubject(s.text);
        toast('Dihapus dari riwayat.', { type: 'info', action: { label: 'Urungkan', onClick: () => state.addSubject(s.text) } });
      },
    }, icon('trash')))));
}

/* =====================================================================
   2. CHECKLIST PRA-KIRIM
   ===================================================================== */

let presendInputs = [];

function initPresend() {
  const list = $('[data-presend-list]');
  const saved = state.getState().tools.presend;
  $('[data-presend-total]').textContent = String(state.PRESEND_ITEMS.length);

  presendInputs = state.PRESEND_ITEMS.map((item) => {
    // Status awal HANYA dari data tersimpan — tidak ada yang tercentang otomatis
    const input = h('input', { type: 'checkbox', checked: saved[item.id] === true, 'data-item': item.id });
    list.append(h('li', {},
      h('label', { class: 'check' },
        input,
        h('span', { class: 'check__box' }, checkSvg()),
        h('span', { class: 'check__text' },
          h('span', { class: 'check__title' }, item.text),
          h('span', { class: 'check__hint' }, item.hint)))));
    input.addEventListener('change', () => {
      const firstComplete = state.setPresendItem(item.id, input.checked);
      if (input.checked) motion.pop(input.nextElementSibling);
      updatePresend({ animate: true, celebrate: true, firstComplete });
    });
    return input;
  });

  $('[data-presend-reset]').addEventListener('click', async () => {
    if (!presendInputs.some((i) => i.checked)) {
      toast('Checklist sudah kosong.', { type: 'info' });
      return;
    }
    const ok = await confirmDialog({
      title: 'Reset checklist pra-kirim?',
      message: 'Semua centang akan dihapus agar bisa dipakai untuk lamaran berikutnya. XP yang sudah didapat tidak berkurang.',
      confirmLabel: 'Ya, reset',
    });
    if (!ok) return;
    state.resetPresend();
    presendInputs.forEach((i) => { i.checked = false; });
    updatePresend({ animate: true });
    toast('Checklist direset.', { type: 'info' });
  });

  initRings($('#checklist'));
  updatePresend({ animate: false });
}

function syncPresendFromState() {
  // Sinkron bila diubah di tab lain
  const saved = state.getState().tools.presend;
  let changed = false;
  presendInputs.forEach((input) => {
    const value = saved[input.dataset.item] === true;
    if (input.checked !== value) { input.checked = value; changed = true; }
  });
  if (changed) updatePresend({ animate: true });
}

let wasComplete = null;
function updatePresend({ animate, celebrate = false, firstComplete = false }) {
  const total = presendInputs.length;
  const done = presendInputs.filter((i) => i.checked).length;
  const pct = Math.round((done / total) * 100);
  const complete = done === total;

  $('[data-presend-done]').textContent = String(done);
  const pctEl = $('[data-presend-pct]');
  if (animate) motion.countUp(pctEl, pct, { duration: 0.5 }); else pctEl.textContent = String(pct);
  setProgress($('[data-presend-ring]'), pct, { animate });
  const bar = $('[data-presend-bar]');
  bar.setAttribute('aria-valuenow', String(pct));
  setProgress(bar, pct, { animate });

  const banner = $('[data-presend-complete]');
  banner.hidden = !complete;
  if (complete && celebrate && wasComplete === false) {
    motion.enter(banner, { opacity: 0, y: 16, scale: 0.97 });
    motion.confetti($('.presend-done__stamp', banner), 36);
    toast(firstComplete ? 'Checklist pra-kirim lengkap.' : 'Semua item siap.', {
      type: 'success',
      title: firstComplete ? `+${state.XP.checklist} XP` : 'Siap kirim',
    });
  }
  wasComplete = complete;
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

/* =====================================================================
   3. KUIS MODUL
   ===================================================================== */

function renderQuizzes() {
  const grid = $('[data-quiz-grid]');
  if (!grid) return;
  const ev = state.getSummary().evaluation;
  const evalStatus = $('[data-eval-status]');
  if (evalStatus) {
    evalStatus.textContent = ev.attempts
      ? `Skor terbaik ${ev.best} · ${ev.attempts}× mencoba${ev.passed ? ' · lulus' : ` · nilai lulus ${state.EVALUATION_PASS}`}`
      : `15 soal acak dari kelima modul · nilai lulus ${state.EVALUATION_PASS}.`;
  }
  $('[data-pass-score]').textContent = String(state.getPassScore());
  const { modules } = state.getSummary();
  grid.replaceChildren(...modules.map((m) => {
    const tried = m.quizBest !== null;
    const chip = !tried
      ? h('span', { class: 'chip' }, 'Belum dicoba')
      : m.quizPassed ? h('span', { class: 'chip chip--done' }, icon('check'), 'Lulus') : h('span', { class: 'chip chip--warn' }, 'Belum lulus');
    return h('article', { class: 'card quiz-tile', 'data-module': m.id, 'aria-labelledby': `qt-${m.id}` },
      h('div', { class: 'quiz-tile__top' }, h('span', { class: 'code' }, m.code), chip),
      h('h3', { class: 'quiz-tile__title', id: `qt-${m.id}` }, m.title),
      h('p', { class: 'quiz-tile__score' },
        h('span', { class: 'num' }, tried ? String(m.quizBest) : '—'),
        h('span', { class: 'text-soft text-sm' }, tried ? `skor terbaik · ${m.quizAttempts}× mencoba` : '8 soal')),
      h('a', { class: `btn ${tried && m.quizPassed ? 'btn--secondary' : 'btn--primary'} btn--block`, href: `${m.href}#kuis` },
        tried ? 'Ulangi kuis' : 'Kerjakan kuis', icon('arrow-right', 'icon--trail')));
  }));
}
