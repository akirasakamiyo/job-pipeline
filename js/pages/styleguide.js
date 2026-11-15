/* =====================================================================
   pages/styleguide.js — Logika halaman preview design system
   ---------------------------------------------------------------------
   Setiap demo di halaman ini benar-benar berfungsi (tidak ada tombol
   dekorasi). Data demo TIDAK disimpan, kecuali preferensi gerak.
   Logika fitur final (progres, checklist tersimpan, kuis, dsb.) akan
   dipindah ke js/features/* pada tahap masing-masing.
   ===================================================================== */

import { $, $$, h, icon, clamp } from '../core/dom.js';
import { toast, openModal, confirmDialog, setProgress, setRoute } from '../core/ui.js';
import { setNavProgress } from '../core/navigation.js';
import * as motion from '../core/motion.js';

const SAMPLE_SUBJECT = 'Lamaran Frontend Developer – Rina Putri Andini';
const SAMPLE_FILENAME = 'CV_RinaPutriAndini_FrontendDeveloper.pdf';

export function init() {
  initContrast();
  initScrollSpy();
  initButtons();
  initForm();
  initModuleFilter();
  initProgressDemo();
  initRouteDemo();
  initBadges();
  initChecklist();
  initQuiz();
  initToasts();
  initCompletion();
  initMotionControls();
}

/* ---------- Utilitas ---------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback untuk browser/konteks tanpa Clipboard API
    const area = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/* ---------- 01 · Kontras warna (dihitung langsung dari CSS) ---------- */

function luminance([r, g, b]) {
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const parseRgb = (str) => (str.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
const parseHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function initContrast() {
  $$('.swatch').forEach((swatch) => {
    const chip = $('.swatch__chip', swatch);
    const out = $('[data-contrast]', swatch);
    const fg = swatch.dataset.on;
    const bg = parseRgb(getComputedStyle(chip).backgroundColor);
    const [a, b] = [luminance(parseHex(fg)), luminance(bg)];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const level = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'Gagal';
    out.style.color = fg;
    out.replaceChildren('Aa', h('small', {}, `${ratio.toFixed(1)}:1 · ${level}`));
  });
}

/* ---------- Sidebar: tandai bagian yang sedang dibaca ---------- */

function initScrollSpy() {
  const sidebar = $('[data-scrollspy]');
  if (!sidebar) return;
  const links = $$('.sidebar__link', sidebar);
  const byId = new Map(links.map((link) => [link.hash.slice(1), link]));

  const activate = (id) => {
    links.forEach((link) => link.classList.toggle('is-active', link.hash === `#${id}`));
    const active = byId.get(id);
    if (active) {
      active.setAttribute('aria-current', 'true');
      links.filter((l) => l !== active).forEach((l) => l.removeAttribute('aria-current'));
      // Mobile: geser strip chip agar chip aktif terlihat (tanpa menggulir halaman)
      if (sidebar.scrollWidth > sidebar.clientWidth) {
        const left = active.offsetLeft - sidebar.clientWidth / 2 + active.offsetWidth / 2;
        sidebar.scrollTo({ left, behavior: motion.isReduced() ? 'auto' : 'smooth' });
      }
    }
  };

  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) activate(visible[0].target.id);
  }, { rootMargin: '-30% 0px -60% 0px' });

  byId.forEach((_, id) => { const section = document.getElementById(id); if (section) observer.observe(section); });
}

/* ---------- 04 · Tombol ---------- */

function initButtons() {
  const modal = $('#demo-modal');

  document.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-demo]');
    if (!btn) return;
    const action = btn.dataset.demo;

    if (action === 'save') {
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
      setTimeout(() => {
        btn.classList.remove('is-loading');
        btn.removeAttribute('aria-busy');
        toast('Progres demo tersimpan.', { type: 'success', title: 'Tersimpan' });
      }, 1200);
    }
    if (action === 'start') toast('Halaman Dashboard dibangun di Tahap 4.', { type: 'info', title: 'Segera hadir' });
    if (action === 'ghost') toast('Tombol ghost dipakai untuk aksi berprioritas rendah.', { type: 'info' });
    if (action === 'size') toast(`Tombol ukuran ${btn.dataset.size} diklik.`, { type: 'info' });
    if (action === 'open-modal') openModal(modal);
    if (action === 'module') toast('Halaman modul lengkap dibangun di Tahap 5.', { type: 'info', title: 'Segera hadir' });

    if (action === 'copy') {
      const ok = await copyText(SAMPLE_SUBJECT);
      toast(ok ? `Disalin: "${SAMPLE_SUBJECT}"` : 'Gagal menyalin. Salin manual, ya.', { type: ok ? 'success' : 'error' });
    }
    if (action === 'copy-filename') {
      const ok = await copyText(SAMPLE_FILENAME);
      toast(ok ? 'Contoh nama file disalin.' : 'Gagal menyalin.', { type: ok ? 'success' : 'error' });
    }
    if (action === 'delete') {
      const confirmed = await confirmDialog({
        title: 'Hapus lamaran ini?',
        message: 'Data lamaran "PT Contoh Kreatif – Frontend Developer" akan dihapus dari tracker. (Ini hanya demo, tidak ada data sungguhan yang terhapus.)',
        confirmLabel: 'Ya, hapus',
        danger: true,
      });
      toast(confirmed ? 'Lamaran demo dihapus.' : 'Penghapusan dibatalkan.', { type: confirmed ? 'success' : 'info' });
    }
  });
}

/* ---------- 05 · Formulir & validasi ---------- */

function setFieldError(input, message) {
  const field = input.closest('.field');
  let error = $('.field__error', field);
  if (message) {
    if (!error) {
      error = h('p', { class: 'field__error', id: `${input.id}-error` });
      field.append(error);
    }
    error.replaceChildren(icon('alert'), message);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', `${input.id}-hint ${input.id}-error`);
  } else {
    error?.remove();
    input.removeAttribute('aria-invalid');
    input.setAttribute('aria-describedby', `${input.id}-hint`);
  }
}

function validate(input) {
  const value = input.value.trim();
  if (input.name === 'name') {
    if (!value) return 'Nama lengkap wajib diisi.';
    if (value.length < 3) return 'Nama terlalu pendek (minimal 3 huruf).';
  }
  if (input.name === 'email') {
    if (!value) return 'Email wajib diisi.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return 'Format email belum benar, contoh: nama@gmail.com';
    if (/\d{4,}/.test(value.split('@')[0])) return 'Hindari deretan angka acak agar terlihat profesional.';
  }
  return '';
}

function initForm() {
  const form = $('#demo-form');
  if (!form) return;
  const inputs = [$('#f-name', form), $('#f-email', form)];

  // Validasi ulang saat pengguna memperbaiki isian
  inputs.forEach((input) => input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') setFieldError(input, validate(input));
  }));
  inputs.forEach((input) => input.addEventListener('blur', () => { if (input.value) setFieldError(input, validate(input)); }));

  // Penghitung karakter (batas lunak 160)
  const note = $('#f-note', form);
  const counter = $('[data-counter-for="f-note"]', form);
  const soft = Number(note.dataset.softLimit);
  const updateCounter = () => {
    counter.textContent = `${note.value.length}/${soft}`;
    counter.classList.toggle('is-over', note.value.length > soft);
  };
  note.addEventListener('input', updateCounter);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let firstInvalid = null;
    inputs.forEach((input) => {
      const message = validate(input);
      setFieldError(input, message);
      if (message && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) {
      firstInvalid.focus();
      motion.shake(form);
      toast('Periksa kembali isian yang ditandai merah.', { type: 'error', title: 'Belum lengkap' });
      return;
    }
    toast(`Data ${$('#f-name', form).value.trim()} tersimpan (demo).`, { type: 'success', title: 'Berhasil' });
    form.reset();
  });

  form.addEventListener('reset', () => {
    inputs.forEach((input) => setFieldError(input, ''));
    requestAnimationFrame(updateCounter);
  });
}

/* ---------- 06 · Filter kartu modul ---------- */

function initModuleFilter() {
  const buttons = $$('[data-filter]');
  const cards = $$('.module-grid .module-card');
  const status = $('[data-filter-status]');
  const labels = { all: 'semua', progress: 'berjalan', done: 'selesai', todo: 'belum mulai' };

  buttons.forEach((btn) => btn.addEventListener('click', () => {
    const filter = btn.dataset.filter;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    const shown = cards.filter((card) => {
      const visible = filter === 'all' || card.dataset.status === filter;
      card.hidden = !visible;
      return visible;
    });
    status.textContent = `Menampilkan ${shown.length} modul (${labels[filter]}).`;
    if (!motion.isReduced()) {
      window.gsap.fromTo(shown, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, clearProps: 'transform,opacity' });
    }
  }));
}

/* ---------- 07 · Progres ---------- */

function initProgressDemo() {
  const card = $('[data-progress-demo]');
  if (!card) return;
  const ring = $('[data-ring]', card);
  const bar = $('[data-progress-bar]', card);
  const num = $('[data-progress-num]', card);
  const caption = $('[data-progress-caption]', card);
  let value = 40;

  const render = () => {
    setProgress(ring, value);
    setProgress(bar, value);
    motion.countUp(num, value, { duration: 0.6 });
    caption.textContent = `${Math.round(value / 5)} dari 20 lesson selesai`;
    setNavProgress(value);
    if (value === 100) {
      motion.confetti(ring);
      toast('Progres demo mencapai 100%!', { type: 'success', title: 'Luar biasa' });
    }
  };

  card.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-progress-step]');
    if (!btn) return;
    const step = btn.dataset.progressStep;
    value = step === 'reset' ? 0 : clamp(value + Number(step), 0, 100);
    render();
  });

  setNavProgress(value);   // tampilkan indikator topbar dengan nilai demo
}

function initRouteDemo() {
  const route = $('[data-route]');
  if (!route) return;
  const caption = $('[data-route-caption]');
  const names = ['Digital Identity Foundation', 'The Core Arsenal', 'Recon & Networking', 'Masterclass Execution', 'Post-Send Strategy & Tracking'];
  let current = 1;   // stasiun CV
  const sync = () => {
    setRoute(route, { done: current, current });
    caption.replaceChildren('Stasiun sekarang: ', h('strong', {}, names[current]), ` · ${current} dari 5 modul selesai`);
  };
  sync();

  $$('[data-route-step]').forEach((btn) => btn.addEventListener('click', () => {
    current = clamp(current + Number(btn.dataset.routeStep), 0, 4);
    sync();
    if (current === 4) toast('Kereta tiba di stasiun terakhir: Tracking.', { type: 'success' });
  }));
}

/* ---------- 08 · Badge ---------- */

function initBadges() {
  const list = $('[data-badges]');
  const unlockBtn = $('[data-badge-unlock]');
  const resetBtn = $('[data-badge-reset]');
  if (!list) return;
  const badges = $$('.badge', list);
  const initial = badges.map((b) => b.classList.contains('is-locked'));

  const refresh = () => {
    const remaining = badges.filter((b) => b.classList.contains('is-locked')).length;
    unlockBtn.disabled = remaining === 0;
    unlockBtn.textContent = remaining === 0 ? 'Semua badge terbuka' : 'Buka badge berikutnya';
  };

  unlockBtn.addEventListener('click', () => {
    const next = badges.find((b) => b.classList.contains('is-locked'));
    if (!next) return;
    next.classList.remove('is-locked');
    const seal = $('.badge__seal', next);
    motion.pop(seal);
    motion.confetti(seal, 18);
    toast(`Badge "${$('.badge__name', next).textContent}" didapat!`, { type: 'success', title: '+50 XP' });
    refresh();
  });

  resetBtn.addEventListener('click', () => {
    badges.forEach((b, i) => b.classList.toggle('is-locked', initial[i]));
    refresh();
    toast('Badge demo dikunci ulang.', { type: 'info' });
  });

  refresh();
}

/* ---------- 09 · Checklist ---------- */

function initChecklist() {
  const card = $('[data-checklist-demo]');
  if (!card) return;
  const boxes = $$('input[type="checkbox"]', card);
  const ring = $('[data-ring]', card);
  const countEl = $('[data-check-count]', card);
  $('[data-check-total]', card).textContent = boxes.length;
  let celebrated = false;

  const update = (changed) => {
    const done = boxes.filter((b) => b.checked).length;
    countEl.textContent = done;
    setProgress(ring, (done / boxes.length) * 100);
    if (changed?.checked) motion.pop($('.check__box', changed.closest('.check')));
    if (done === boxes.length && !celebrated) {
      celebrated = true;
      motion.confetti(ring);
      toast('Semua langkah selesai. Identitas digitalmu siap!', { type: 'success', title: '+20 XP' });
    }
    if (done < boxes.length) celebrated = false;
  };

  boxes.forEach((box) => box.addEventListener('change', () => update(box)));
  $('[data-check-reset]', card).addEventListener('click', () => {
    boxes.forEach((b) => { b.checked = false; });
    update();
  });
  update();
}

/* ---------- 10 · Kuis ---------- */

function initQuiz() {
  const form = $('[data-quiz-demo]');
  if (!form) return;
  const optionsWrap = $('[data-options]', form);
  const submit = $('[data-quiz-submit]', form);
  const feedback = $('[data-feedback]', form);
  let checked = false;

  const reset = () => {
    checked = false;
    optionsWrap.classList.remove('is-locked');
    $$('.option', form).forEach((opt) => {
      opt.classList.remove('is-correct', 'is-wrong');
      const input = $('input', opt);
      input.checked = false;
      input.disabled = false;
    });
    // Acak urutan pilihan setiap mencoba lagi
    const opts = $$('.option', optionsWrap);
    opts.sort(() => Math.random() - 0.5).forEach((opt, i) => {
      $('.option__key', opt).textContent = 'ABCD'[i];
      optionsWrap.append(opt);
    });
    feedback.replaceChildren();
    submit.textContent = 'Periksa jawaban';
    submit.disabled = true;
  };

  form.addEventListener('change', () => { if (!checked) submit.disabled = !$('input:checked', form); });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (checked) { reset(); $('input', optionsWrap).focus(); return; }

    const chosen = $('input:checked', form)?.closest('.option');
    if (!chosen) return;
    checked = true;
    const correct = chosen.dataset.correct === 'true';
    optionsWrap.classList.add('is-locked');
    $$('.option', form).forEach((opt) => {
      $('input', opt).disabled = true;
      if (opt.dataset.correct === 'true') opt.classList.add('is-correct');
    });
    if (!correct) chosen.classList.add('is-wrong');

    const box = h('div', { class: `feedback feedback--${correct ? 'correct' : 'wrong'}` },
      icon(correct ? 'check' : 'x'),
      h('div', {},
        h('strong', {}, correct ? 'Tepat sekali!' : 'Belum tepat.'),
        h('p', {}, 'Subjek yang baik menyebut posisi dan nama lengkap, tanpa huruf kapital semua atau emoji, sehingga rekruter langsung tahu isi email sebelum membukanya.')));
    feedback.replaceChildren(box);
    correct ? motion.pop(chosen) : motion.shake(chosen);
    motion.enter(box, { opacity: 0, y: 10 });

    submit.textContent = 'Coba lagi';
    submit.disabled = false;
  });
}

/* ---------- 11 · Toast ---------- */

function initToasts() {
  const messages = {
    success: ['Jawaban tersimpan.', 'Berhasil'],
    info: ['Follow-up ideal dikirim 5–7 hari kerja setelah melamar.', 'Tips'],
    warning: ['Subjek lebih dari 60 karakter bisa terpotong di HP.', 'Perhatian'],
    error: ['Gagal menyalin ke clipboard.', 'Terjadi kesalahan'],
  };
  $$('[data-toast]').forEach((btn) => btn.addEventListener('click', () => {
    const type = btn.dataset.toast;
    if (type === 'undo') {
      toast('Lamaran "PT Contoh Kreatif" dipindah ke arsip.', {
        type: 'info',
        duration: 6000,
        action: { label: 'Urungkan', onClick: () => toast('Dikembalikan dari arsip.', { type: 'success' }) },
      });
      return;
    }
    const [message, title] = messages[type];
    toast(message, { type, title });
  }));
}

/* ---------- 12 · Completion ---------- */

function initCompletion() {
  const panel = $('[data-completion]');
  const showBtn = $('[data-completion-show]');
  if (!panel) return;

  showBtn.addEventListener('click', () => {
    panel.hidden = false;
    showBtn.hidden = true;
    panel.focus({ preventScroll: true });
    panel.scrollIntoView({ behavior: motion.isReduced() ? 'auto' : 'smooth', block: 'center' });
    motion.enter(panel, { opacity: 0, y: 32, scale: 0.96 });
    motion.pop($('.completion__stamp', panel));
    $$('[data-completion-count]', panel).forEach((el) => {
      el.textContent = '0';
      motion.countUp(el, Number(el.dataset.completionCount));
    });
    setTimeout(() => motion.confetti($('.completion__stamp', panel), 36), 250);
  });

  $('[data-completion-hide]', panel).addEventListener('click', () => {
    panel.hidden = true;
    showBtn.hidden = false;
    showBtn.focus();
  });
}

/* ---------- 14 · Preferensi & demo gerak ---------- */

function initMotionControls() {
  const radios = $$('input[name="motion-pref"]');
  const status = $('[data-motion-status]');
  const describe = () => {
    const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    status.textContent = motion.isReduced()
      ? `Mode gerak minimal aktif${osReduced ? ' (mengikuti setelan perangkat)' : ''}: animasi dekoratif dimatikan.`
      : 'Animasi penuh aktif. Pilih "Kurangi gerak" bila animasi terasa mengganggu.';
  };

  const pref = motion.getMotionPref();
  radios.forEach((r) => { r.checked = r.value === pref; });
  describe();

  radios.forEach((r) => r.addEventListener('change', () => {
    motion.setMotionPref(r.value);
    describe();
    toast(r.value === 'reduced' ? 'Gerak dikurangi di seluruh LMS.' : 'Gerak mengikuti setelan sistem.', { type: 'success' });
  }));

  const gsap = window.gsap;
  $$('[data-motion-demo]').forEach((tile) => tile.addEventListener('click', () => {
    if (motion.isReduced()) {
      toast('Mode gerak minimal aktif, jadi animasi demo tidak diputar.', { type: 'info' });
      return;
    }
    const box = $('.motion-tile__box, .motion-tile__stack', tile);
    const type = tile.dataset.motionDemo;
    if (type === 'fade') gsap.fromTo(box, { opacity: 0 }, { opacity: 1, duration: 0.7 });
    if (type === 'up') gsap.fromTo(box, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7 });
    if (type === 'cards') gsap.fromTo(box.children, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08 });
    if (type === 'pop') motion.pop(box);
    if (type === 'shake') motion.shake(box);
    if (type === 'confetti') motion.confetti(box);
  }));
}
