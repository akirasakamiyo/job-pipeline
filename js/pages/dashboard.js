/* =====================================================================
   pages/dashboard.js — Dashboard = pusat kendali ringkas (V4)
   ---------------------------------------------------------------------
   Hanya informasi inti (satu layar di desktop):
   - sapaan + rekomendasi aksi berikutnya (state.getRecommendation)
   - progres keseluruhan (ring + angka ringkas)
   - modul aktif (kartu; tujuannya halaman detail modul, beda dari CTA)
   - target hari ini (opsional, tanpa streak/penalti)
   - ringkasan pencapaian (XP, badge, badge berikutnya)
   - pintasan lima modul + akses cepat Practice & Evaluation
   Detail lengkap ada di halaman masing-masing (satu halaman = satu fungsi).
   Semua angka berasal dari state.getSummary() (LocalStorage + katalog).
   Halaman ikut diperbarui otomatis bila progres berubah (juga dari tab lain).
   ===================================================================== */

import { $, $$, h, icon } from '../core/dom.js';
import { toast, openModal, closeModal, setProgress, initRings } from '../core/ui.js';
import * as state from '../core/state.js';
import * as motion from '../core/motion.js';
import * as storage from '../core/storage.js';

let firstRender = true;
// Hash saat halaman dibuka (dibaca sebelum dialog profil menghapus #profil dari URL)
const START_HASH = window.location.hash;

export async function init() {
  render(state.getSummary());
  initProfileDialog();
  initGuide();
  initGoal();
  // Sinkron otomatis bila progres berubah (mis. dari tab lain)
  state.subscribe((summary) => render(summary));
}

function render(summary) {
  renderHero(summary);
  renderGoal(summary);
  renderActive(summary);
  renderAchievements(summary);
  renderShortcuts(summary);
  renderQuick(summary);
  firstRender = false;
}

function greetingWord(date = new Date()) {
  const hour = date.getHours();
  if (hour < 4) return 'Selamat malam';
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

/* ---------- HERO: sapaan, rekomendasi, progres keseluruhan ---------- */

function renderHero(s) {
  const name = s.user.name;
  $('[data-greeting]').replaceChildren(`${greetingWord()}${name ? ', ' : '!'}`, name ? h('span', { class: 'dash-hero__name' }, name) : '', name ? '!' : '');
  $('[data-profile-label]').textContent = name ? 'Ubah profil' : 'Kenalan dulu';

  // Satu aksi berikutnya dari data nyata (lanjut materi / ulang kuis / tandai selesai / evaluasi / sertifikat)
  const rec = state.getRecommendation(s);
  const recEl = $('[data-hero-rec]');
  recEl.dataset.kind = rec.kind;
  recEl.replaceChildren(
    h('span', { class: 'hero-rec__icon' }, icon(rec.icon)),
    h('span', { class: 'hero-rec__body' },
      h('span', { class: 'hero-rec__label' }, `Rekomendasi untukmu · ${rec.label}`),
      h('span', { class: 'hero-rec__title' }, rec.title)));
  $('[data-hero-lead]').textContent = rec.text;
  const cta = $('[data-continue]');
  cta.href = rec.href;
  cta.dataset.kind = rec.kind;
  $('[data-continue-label]').textContent = rec.cta;

  $('[data-progress-title]').textContent = s.isNew ? 'Perjalanan belum dimulai' : s.allDone ? 'Semua modul selesai' : `${s.overallPct}% perjalanan selesai`;
  setProgress($('[data-overall-ring]'), s.overallPct, { animate: true });
  $('[data-steps-caption]').textContent = `${s.stepsDone} dari ${s.stepsTotal} langkah (bagian + kuis + tandai selesai)`;
  const quizPassed = s.modules.filter((m) => m.quizPassed).length;
  $('[data-counts]').replaceChildren(...[
    ['Modul selesai', `${s.completed}/${s.modules.length}`],
    ['Bagian materi', `${s.lessonsDone}/${s.lessonsTotal}`],
    ['Kuis lulus', `${quizPassed}/${s.modules.length}`],
  ].map(([label, value]) => h('div', {}, h('dt', {}, label), h('dd', { class: 'num' }, value))));
}

/* ---------- MODUL AKTIF (tujuan: halaman detail modul) ---------- */

function renderActive(s) {
  const card = $('[data-continue-card]');
  if (s.allDone) {
    card.href = s.evaluation.passed ? 'achievements.html' : 'evaluation.html';
    card.removeAttribute('data-module');
    card.replaceChildren(
      h('span', { class: 'completion__stamp dash-active__stamp' }, icon('trophy')),
      h('span', { class: 'dash-active__body' },
        h('span', { class: 'dash-active__title' }, 'Kelima modul selesai'),
        h('span', { class: 'dash-active__meta' }, s.evaluation.passed ? `Evaluasi Akhir lulus · skor ${s.evaluation.best}` : 'Berikutnya: Evaluasi Akhir')),
      icon('arrow-right'));
    return;
  }
  const mod = s.current;
  card.href = mod.href;                                   // ringkasan modul (tanpa #bagian)
  card.dataset.module = mod.id;
  // WCAG 2.5.3: nama tautan = teks yang terlihat. Ring hanya penanda visual.
  const ring = h('div', { class: 'ring', style: { '--size': '56px', '--stroke': '5px' }, 'data-ring': true, 'data-value': mod.pct, 'aria-hidden': 'true' });
  card.replaceChildren(ring,
    h('span', { class: 'dash-active__body' },
      h('span', { class: 'dash-active__code' }, `Modul ${String(mod.number).padStart(2, '0')} · ${mod.code}`),
      h('span', { class: 'dash-active__title' }, mod.title),
      h('span', { class: 'dash-active__meta' }, `${mod.lessonsDone}/${mod.lessonsTotal} bagian · kuis ${mod.quizPassed ? 'lulus' : mod.quizAttempts ? `terbaik ${mod.quizBest}` : 'belum'}`)),
    icon('arrow-right'));
  initRings(card);
}

/* ---------- PENCAPAIAN ringkas ---------- */

function renderAchievements(s) {
  const main = s.badges.filter((b) => b.main);
  const earned = main.filter((b) => b.earned).length;
  const next = main.find((b) => !b.earned);
  const xp = h('span', { class: 'num', 'data-count': s.xp }, String(s.xp));
  $('[data-dash-ach]').replaceChildren(
    h('div', { class: 'dash-ach__nums' },
      h('p', {}, xp, h('small', {}, 'XP')),
      h('p', {}, h('span', { class: 'num' }, `${earned}/${main.length}`), h('small', {}, 'badge utama'))),
    h('div', { class: 'bar bar--thin', role: 'progressbar', 'aria-label': 'Badge utama didapat', 'aria-valuemin': '0', 'aria-valuemax': String(main.length), 'aria-valuenow': String(earned), style: { '--value': String(Math.round((earned / main.length) * 100)) } }, h('span', { class: 'bar__fill' })),
    h('p', { class: 'dash-ach__next' }, next ? `Berikutnya: ${next.name}` : 'Semua badge utama sudah didapat!'));
  if (!firstRender) motion.countUp(xp, s.xp);
}

/* ---------- PINTASAN LIMA MODUL ---------- */

const STATUS_TEXT = { done: 'Selesai', progress: 'Berjalan', todo: 'Belum mulai' };

function renderShortcuts(s) {
  $('[data-module-shortcuts]').replaceChildren(...s.modules.map((m) => h('li', {},
    h('a', { class: `dash-shortcut${m.id === s.current?.id && !s.allDone ? ' is-current' : ''}`, href: m.href, 'data-module': m.id },
      h('span', { class: 'dash-shortcut__top' },
        h('span', { class: 'code' }, m.code),
        h('span', { class: `dash-shortcut__status is-${m.status}` }, m.readyToComplete ? 'Siap ditutup' : STATUS_TEXT[m.status] || '')),
      h('span', { class: 'dash-shortcut__title' }, m.title),
      h('span', { class: 'bar bar--thin', 'aria-hidden': 'true', style: { '--value': String(m.pct) } }, h('span', { class: 'bar__fill' })),
      h('span', { class: 'dash-shortcut__pct mono' }, `${m.pct}%`)))));
}

/* ---------- AKSES CEPAT ---------- */

function renderQuick(s) {
  const practiced = s.activitiesPassed + Object.keys(s.practice || {}).length;
  $('[data-quick-practice]').textContent = practiced ? `${s.activitiesPassed}/${s.activitiesTotal} aktivitas bernilai lulus` : 'Latihan interaktif per modul';
  const quizPassed = s.modules.filter((m) => m.quizPassed).length;
  $('[data-quick-eval]').textContent = `${quizPassed}/${s.modules.length} kuis modul lulus · Evaluasi Akhir ${s.evaluation.passed ? 'lulus' : s.evaluation.attempts ? `terbaik ${s.evaluation.best}` : 'belum'}`;
}

function initProfileDialog() {
  const dialog = $('#profile-dialog');
  const form = $('[data-profile-form]', dialog);
  const nameInput = $('#p-name', form);
  const statusInput = $('#p-status', form);

  const openProfile = () => {
    const { user } = state.getState();
    nameInput.value = user.name;
    if (user.status) statusInput.value = user.status;
    setError('');
    openModal(dialog);
  };
  $('[data-open-profile]').addEventListener('click', openProfile);

  // V3: pintasan profil di sidebar (dashboard.html#profil) langsung membuka dialog
  const fromHash = () => {
    if (window.location.hash !== '#profil') return;
    history.replaceState(null, '', window.location.pathname);
    setTimeout(openProfile, 300);
  };
  fromHash();
  window.addEventListener('hashchange', fromHash);

  function setError(message) {
    const field = nameInput.closest('.field');
    $('.field__error', field)?.remove();
    if (message) {
      field.append(h('p', { class: 'field__error', id: 'p-name-error' }, icon('alert'), message));
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.setAttribute('aria-describedby', 'p-name-hint p-name-error');
    } else {
      nameInput.removeAttribute('aria-invalid');
      nameInput.setAttribute('aria-describedby', 'p-name-hint');
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (name.length < 2) {
      setError('Isi nama minimal 2 huruf.');
      nameInput.focus();
      motion.shake(nameInput);
      return;
    }
    state.setUser({ name, status: statusInput.value });   // memicu render ulang lewat subscribe
    closeModal(dialog);
    toast(`Senang berkenalan, ${name}!`, { type: 'success', title: 'Profil tersimpan' });
  });
}

/* =====================================================================
   TARGET BELAJAR HARIAN (Final UX)
   Opsional. Dihitung dari aktivitas nyata hari ini (state.daily, diisi
   saat bagian/latihan/kuis benar-benar selesai). Tanpa streak & penalti:
   hari berikutnya hitungan mulai dari 0 tanpa catatan "gagal".
   ===================================================================== */

let goalEditing = false;

function initGoal() {
  $('[data-goal]').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-goal-action]');
    if (!btn) return;
    const action = btn.dataset.goalAction;
    if (action === 'edit') { goalEditing = true; renderGoal(state.getSummary()); $('#goal-type')?.focus(); return; }
    if (action === 'clear') {
      goalEditing = false;
      state.setGoal(null);
      toast('Target harian dihapus.', { type: 'info' });
      $('[data-goal-action="edit"]')?.focus();
      return;
    }
    if (action === 'cancel') { goalEditing = false; renderGoal(state.getSummary()); return; }
  });
  $('[data-goal]').addEventListener('submit', (event) => {
    event.preventDefault();
    const type = $('#goal-type').value;
    goalEditing = false;
    state.setGoal(type, 1);
    toast(`Target hari ini: ${state.GOAL_TYPES[type].verb.toLowerCase()} 1 ${state.GOAL_TYPES[type].label}.`, { type: 'success', title: 'Target dipasang' });
    $('[data-goal-action="edit"]')?.focus();
  });
}

function renderGoal(s) {
  const host = $('[data-goal-body]');
  if (!host) return;
  const g = s.goal;
  if (!g || goalEditing) {
    host.replaceChildren(h('form', { class: 'goal__form' },
      h('p', { class: 'goal__hint', id: 'goal-hint' }, g ? 'Pilih target baru untuk hari ini.' : 'Opsional: pilih satu target kecil yang realistis. Tidak ada streak atau penalti.'),
      h('div', { class: 'goal__row' },
        h('label', { class: 'sr-only', for: 'goal-type' }, 'Jenis target'),
        h('select', { class: 'select', id: 'goal-type', 'aria-describedby': 'goal-hint' },
          ...Object.entries(state.GOAL_TYPES).map(([id, t]) => h('option', { value: id, selected: g?.type === id || null }, `${t.verb} 1 ${t.label}`))),
        h('button', { type: 'submit', class: 'btn btn--secondary btn--sm' }, 'Pasang target'),
        g ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-goal-action': 'cancel' }, 'Batal') : '')));
    return;
  }
  const pct = Math.round((g.done / g.count) * 100);
  host.replaceChildren(
    h('p', { class: 'goal__text' }, `${g.verb} ${g.count} ${g.label}`,
      h('span', { class: `goal__status${g.reached ? ' is-done' : ''}` }, g.reached ? ' · Tercapai!' : ` · ${g.done}/${g.count}`)),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progres target hari ini', style: { '--value': pct } }, h('span', { class: 'bar__fill' })),
    h('p', { class: 'goal__hint' }, g.reached ? 'Bagus! Lanjutkan kalau masih ada waktu, atau istirahat dulu.' : 'Terhitung otomatis saat aktivitasnya benar-benar selesai.'),
    h('div', { class: 'goal__row' },
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-goal-action': 'edit' }, icon('edit'), 'Ganti target'),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'data-goal-action': 'clear' }, icon('trash'), 'Hapus target')));
}

/* =====================================================================
   PANDUAN PENGGUNA BARU (Final UX)
   3 langkah: Explore → Practice → Complete. Muncul otomatis sekali untuk
   pengguna yang belum punya ujap:prefs.onboarding. Selesai/lewati/tutup
   disimpan sehingga tidak muncul lagi; bisa diulang lewat tombol
   "Panduan", dashboard.html#panduan, atau halaman Pengaturan.
   Tidak membuka dialog profil (profil tetap lewat tombolnya sendiri).
   ===================================================================== */

function guideSteps(s) {
  return [
    {
      title: 'Explore: kenali lima modul',
      text: `Pipeline dibagi menjadi ${s.modules.length} modul berurutan, dari identitas digital sampai follow-up. Kerjakan berurutan; tiap modul berisi bagian materi singkat dan satu kuis.`,
      list: s.modules.map((m) => `${m.code} · ${m.title}`),
      link: { href: 'modules.html', text: 'Lihat semua modul' },
    },
    {
      title: 'Practice: coba alat interaktif',
      text: `Ada ${s.activitiesTotal} latihan interaktif bernilai di dalam materi, plus Email Writing Simulator, Checklist Pre-send, dan alat lain. Semuanya juga bisa dibuka satu per satu dari Practice Center. XP diberikan setelah latihan benar-benar selesai.`,
      list: ['Latihan di dalam materi (studi kasus, urutkan, cari kesalahan)', 'Semua latihan per modul di Practice Center', 'Kuis modul & Evaluasi Akhir di halaman Evaluation'],
      link: { href: 'practice.html', text: 'Buka Practice Center' },
    },
    {
      title: 'Complete: evaluasi akhir & sertifikat',
      text: `Setelah kelima modul selesai, ikuti Evaluasi Akhir (nilai lulus ${state.EVALUATION_PASS}). Lulus evaluasi membuka sertifikat penyelesaian berformat PDF yang dibuat di perangkatmu.`,
      list: ['Selesaikan semua bagian + kuis tiap modul', 'Tandai modul selesai', 'Ikuti Evaluasi Akhir, lalu unduh sertifikat'],
      link: { href: 'evaluation.html', text: 'Buka Evaluation' },
    },
  ];
}

function initGuide() {
  const dialog = $('#guide-dialog');
  let step = 0;
  let steps = [];

  const show = () => {
    const st = steps[step];
    $('[data-guide-step]', dialog).textContent = `Langkah ${step + 1} dari ${steps.length}`;
    $('[data-guide-title]', dialog).textContent = st.title;
    $('[data-guide-panel]', dialog).replaceChildren(
      h('p', { id: 'guide-text' }, st.text),
      h('ul', { class: 'guide__list' }, st.list.map((item) => h('li', {}, icon('check'), item))),
      h('a', { class: 'btn btn--ghost btn--sm guide__link', href: st.link.href, 'data-guide-link': true }, st.link.text, icon('arrow-right')));
    $$('[data-guide-dots] li', dialog).forEach((li, i) => li.classList.toggle('is-active', i <= step));
    const prev = $('[data-guide-prev]', dialog);
    prev.hidden = step === 0;
    $('[data-guide-next]', dialog).textContent = step === steps.length - 1 ? 'Selesai' : 'Berikutnya';
  };
  const save = (status) => storage.update('prefs', (p) => ({ ...p, onboarding: { status, at: new Date().toISOString() } }), {});
  const open = () => {
    steps = guideSteps(state.getSummary());
    step = 0;
    show();
    openModal(dialog);
  };
  const finish = (status) => {
    save(status);
    closeModal(dialog);
    if (status === 'done') toast('Panduan selesai. Mulai dari tombol rekomendasi di atas.', { type: 'success' });
  };

  $('[data-guide-next]', dialog).addEventListener('click', () => {
    if (step < steps.length - 1) { step += 1; show(); $('[data-guide-next]', dialog).focus(); } else finish('done');
  });
  $('[data-guide-prev]', dialog).addEventListener('click', () => {
    if (step > 0) { step -= 1; show(); (step === 0 ? $('[data-guide-next]', dialog) : $('[data-guide-prev]', dialog)).focus(); }
  });
  $$('[data-guide-skip]', dialog).forEach((b) => b.addEventListener('click', () => finish('skipped')));
  // Esc / klik backdrop = lewati (status disimpan agar tidak muncul terus)
  dialog.addEventListener('cancel', () => { if (!storage.get('prefs', {})?.onboarding) save('skipped'); });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog && !storage.get('prefs', {})?.onboarding) save('skipped');
    if (e.target.closest('[data-guide-link]') && !storage.get('prefs', {})?.onboarding) save('skipped');
  });
  $('[data-open-guide]').addEventListener('click', open);

  const fromHash = () => {
    if (window.location.hash !== '#panduan') return false;
    history.replaceState(null, '', window.location.pathname);
    setTimeout(open, 300);
    return true;
  };
  window.addEventListener('hashchange', fromHash);
  if (fromHash()) return;
  // Otomatis hanya untuk pengguna baru yang belum pernah melihat panduan,
  // dan tidak saat datang untuk membuka profil (#profil).
  const seen = Boolean(storage.get('prefs', {})?.onboarding);
  if (!seen && state.getSummary().isNew && START_HASH !== '#profil') setTimeout(open, 600);
}
