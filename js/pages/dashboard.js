/* =====================================================================
   pages/dashboard.js — Dashboard utama
   ---------------------------------------------------------------------
   Semua angka berasal dari state.getSummary() (LocalStorage + katalog
   modul). Halaman ikut diperbarui otomatis bila progres berubah,
   termasuk dari tab lain.
   Animasi: data-intro (hero), data-reveal / data-stagger (scroll),
   data-progress (bar), data-tilt (hover kartu) → ditangani motion.js.
   ===================================================================== */

import { $, $$, h, icon } from '../core/dom.js';
import { toast, openModal, closeModal, setProgress, initRings } from '../core/ui.js';
import { loadJSON } from '../core/data.js';
import * as state from '../core/state.js';
import * as motion from '../core/motion.js';
import * as storage from '../core/storage.js';
import { moduleCard } from '../features/module-card.js';

let firstRender = true;
// Hash saat halaman dibuka (dibaca sebelum dialog profil menghapus #profil dari URL)
const START_HASH = window.location.hash;

export async function init() {
  render(state.getSummary());
  initRailControls();
  initProfileDialog();
  initGuide();
  initGoal();
  await renderResources();

  // Sinkron otomatis bila progres/tracker berubah (mis. dari tab lain)
  state.subscribe((summary) => render(summary));
}

function render(summary) {
  renderHero(summary);
  renderProgress(summary);
  renderGoal(summary);
  renderRoadmap(summary);
  renderModules(summary);
  renderTools(summary);
  renderActivity(summary);
  renderAchievements(summary);
  firstRender = false;
}

/* ---------- Utilitas ---------- */

function greetingWord(date = new Date()) {
  const hour = date.getHours();
  if (hour < 4) return 'Selamat malam';
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
function timeAgo(iso) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, sec] of units) {
    if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit);
  }
  return 'baru saja';
}

/** Angka dengan data-count: dianimasikan motion.js (count-up) saat pertama terlihat */
function numberEl(value, cls = 'num') {
  return h('span', { class: cls || null, 'data-count': value }, String(value));
}

/* ---------- HERO ---------- */

function renderHero(s) {
  const name = s.user.name;
  const greet = $('[data-greeting]');
  greet.replaceChildren(`${greetingWord()}${name ? ', ' : '!'}`, name ? h('strong', {}, name) : '', name ? '!' : '');
  $('[data-profile-label]').textContent = name ? 'Ubah profil' : 'Kenalan dulu';

  // Final UX: hero = SATU aksi berikutnya hasil state.getRecommendation()
  // (lanjut materi / ulang kuis / tandai selesai / evaluasi / sertifikat).
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

  // V3: ringkasan isi platform — semua angka dihitung dari data (katalog & daftar alat).
  // Progres pribadi ada di panel Progres Belajar agar tidak diulang di hero.
  $('[data-hero-stats]').replaceChildren(...[
    { icon: 'route', value: s.modules.length, label: 'Modul belajar' },
    { icon: 'book', value: s.lessonsTotal, label: 'Bagian materi' },
    { icon: 'spark', value: s.activitiesTotal, label: 'Latihan interaktif' },
    { icon: 'briefcase', value: TOOLS.length, label: 'Alat praktis melamar' },
  ].map((f) => h('li', { class: 'hero-fact' },
    h('span', { class: 'hero-fact__icon' }, icon(f.icon)),
    h('span', {}, h('strong', { class: 'num' }, String(f.value)), ' ', f.label))));

  renderStatusCard(s, rec);
}

/**
 * Kartu di samping ilustrasi. Final UX: tujuannya SELALU berbeda dari tombol
 * utama hero — kartu ini menunjukkan status (modul aktif / peta modul / rekap),
 * sedangkan tombol hero membawa ke aksi berikutnya.
 */
function renderStatusCard(s, rec) {
  const card = $('[data-continue-card]');
  const stamp = (name) => h('span', { class: 'completion__stamp', style: { width: '48px', height: '48px', rotate: '0deg' } }, icon(name));
  const body = (label, title, meta) => h('span', { class: 'continue-card__body' },
    h('span', { class: 'continue-card__label' }, label),
    h('span', { class: 'continue-card__title' }, title),
    meta ? h('span', { class: 'continue-card__meta' }, meta) : '');

  if (s.allDone) {
    card.href = 'progress.html';
    card.removeAttribute('data-module');
    const passed = s.evaluation.passed;
    card.replaceChildren(stamp('trophy'),
      body('Semua modul selesai', 'Lihat Progress & Achievements', passed ? `Evaluasi lulus · skor ${s.evaluation.best}` : `${s.badgesEarned ?? s.badges.filter((b) => b.earned).length} badge · ${s.xp} XP`),
      icon('arrow-right'));
    return;
  }
  if (s.isNew) {
    card.href = 'modules.html';
    card.removeAttribute('data-module');
    card.replaceChildren(stamp('route'),
      body('Sebelum mulai', `Kenali ${s.modules.length} modul pipeline`, `${s.lessonsTotal} bagian · ${s.activitiesTotal} latihan interaktif`),
      icon('arrow-right'));
    return;
  }
  const mod = s.current;
  card.href = mod.href;                                   // halaman ringkasan modul (tanpa #bagian)
  card.dataset.module = mod.id;
  // Tahap 7 (WCAG 2.5.3): nama tautan = teks yang terlihat. Ring hanya penanda visual.
  const ring = h('div', { class: 'ring', style: { '--size': '52px', '--stroke': '5px' }, 'data-ring': true, 'data-value': mod.pct, 'aria-hidden': 'true' });
  card.replaceChildren(ring,
    body(`Modul aktif · ${mod.code}`, mod.title,
      `${mod.pct}% · ${mod.lessonsDone}/${mod.lessonsTotal} bagian · kuis ${mod.quizPassed ? 'lulus' : mod.quizAttempts ? `terbaik ${mod.quizBest}` : 'belum'}`),
    icon('arrow-right'));
  initRings(card);
}

/* ---------- PROGRES ---------- */

function renderProgress(s) {
  $('[data-progress-title]').textContent = s.isNew
    ? 'Perjalananmu belum dimulai'
    : s.allDone ? 'Semua modul selesai!' : `${s.overallPct}% perjalanan selesai`;

  setProgress($('[data-overall-ring]'), s.overallPct, { animate: true });

  const bar = $('[data-overall-bar]');
  bar.dataset.progress = s.overallPct;
  bar.setAttribute('aria-valuenow', String(s.overallPct));
  if (!firstRender) setProgress(bar, s.overallPct);
  else bar.style.setProperty('--value', s.overallPct);
  $('[data-overall-pct]').textContent = `${s.overallPct}%`;
  $('[data-steps-caption]').textContent = `${s.stepsDone} dari ${s.stepsTotal} langkah selesai (bagian + kuis + tandai selesai)`;

  // V3: panel ini merangkum statistik; urutan modul ada di Roadmap (tidak diulang)
  const remaining = s.modules.length - s.completed;
  const active = s.allDone ? null : s.current;
  $('[data-counts]').replaceChildren(
    h('div', { class: 'count-pill' },
      h('span', { class: 'count-pill__value num' }, numberEl(s.completed, ''), h('small', {}, `/${s.modules.length}`)),
      h('span', { class: 'count-pill__label' }, h('span', { class: 'count-pill__dot', style: { '--dot': 'var(--success)' } }), 'Modul selesai')),
    h('div', { class: 'count-pill' },
      h('span', { class: 'count-pill__value num' }, numberEl(remaining, '')),
      h('span', { class: 'count-pill__label' }, h('span', { class: 'count-pill__dot', style: { '--dot': 'var(--line-strong)' } }), 'Modul tersisa')),
    h('a', { class: 'count-pill count-pill--active', href: active ? s.next.href : 'progress.html', 'data-module': active?.id || null },
      h('span', { class: 'count-pill__label' }, h('span', { class: 'count-pill__dot', style: { '--dot': 'var(--cobalt)' } }), 'Modul aktif'),
      h('span', { class: 'count-pill__active' }, active ? `${active.code} · ${active.title}` : 'Semua modul selesai'),
      h('span', { class: 'count-pill__meta' }, active ? `${active.pct}% · ${active.lessonsDone}/${active.lessonsTotal} bagian` : 'Lihat pencapaianmu')));
}

/* ---------- ROADMAP ---------- */

function renderRoadmap(s) {
  const route = $('[data-roadmap-route]');
  const currentIndex = s.allDone ? s.modules.length - 1 : Math.max(0, s.modules.findIndex((m) => m.id === s.current?.id));
  const position = s.allDone ? 100 : currentIndex * (100 / (s.modules.length - 1));

  route.replaceChildren(
    h('div', { class: 'route__rail' }, h('span', { class: 'route__fill' })),
    h('ol', { class: 'route__stops', role: 'list' }, s.modules.map((m) =>
      h('li', {
        class: `route__stop${m.status === 'done' ? ' is-done' : ''}${m.id === s.current?.id ? ' is-current' : ''}`,
        'data-module': m.id,
      }, h('span', { class: 'route__dot' }, icon('check')), h('span', { class: 'route__label' }, m.code)))),
    h('span', { class: 'route__train', 'aria-hidden': 'true' }, icon('train')));
  route.setAttribute('aria-label', s.allDone
    ? 'Semua stasiun selesai'
    : `Posisi sekarang: stasiun ${currentIndex + 1} dari ${s.modules.length} (${s.current.title}). ${s.completed} modul selesai.`);

  if (firstRender) {
    route.style.setProperty('--value', 0);
    route.dataset.progress = position;      // dianimasikan motion.js saat terlihat
  } else {
    motion.tweenValue(route, position);
  }

  $('[data-roadmap-steps]').replaceChildren(...s.modules.map((m) => {
    let meta = `${m.lessonsTotal} bagian · ±${m.minutes} menit`;
    if (m.status === 'done') meta = `Selesai${m.quizBest !== null ? ` · kuis ${m.quizBest}` : ''}`;
    else if (m.status === 'progress') meta = m.nextLesson ? `Berikutnya: ${m.nextLesson.title}` : m.readyToComplete ? 'Siap ditandai selesai' : 'Tinggal kuis modul';
    const isCurrent = m.id === s.current?.id;
    return h('li', {},
      h('a', {
        class: `roadmap__step${isCurrent ? ' is-current' : ''}`,
        href: m.href,
        'data-module': m.id,
        'data-status': m.status,
        'aria-current': isCurrent ? 'step' : null,
      },
      h('span', { class: 'roadmap__num' }, m.status === 'done' ? icon('check', 'icon--sm') : String(m.number)),
      h('span', { class: 'roadmap__body' },
        h('span', { class: 'roadmap__title' }, m.title),
        h('span', { class: 'roadmap__meta' }, meta)),
      isCurrent ? h('span', { class: 'chip chip--progress' }, 'Kamu di sini')
        : m.status === 'done' ? h('span', { class: 'chip chip--done' }, 'Selesai')
          : h('span', { class: 'chip' }, m.status === 'progress' ? 'Berjalan' : 'Berikutnya')));
  }));

  // Tujuan belajar berikutnya (tujuan nyata dari state, bukan teks statis)
  const next = $('[data-roadmap-next]');
  if (s.allDone) {
    next.href = 'evaluation.html';
    next.replaceChildren(h('span', { class: 'roadmap__next-label' }, 'Semua stasiun selesai'),
      h('span', { class: 'roadmap__next-title' }, 'Uji pemahaman di Evaluasi Akhir'), icon('arrow-right'));
  } else {
    const what = s.next.type === 'lesson' ? s.next.lesson.title : s.next.type === 'quiz' ? `Kuis ${s.next.module.title}` : `Tandai ${s.next.module.title} selesai`;
    next.href = s.next.href;
    next.dataset.module = s.next.module.id;
    next.replaceChildren(h('span', { class: 'roadmap__next-label' }, `Tujuan berikutnya · ${s.next.module.code}`),
      h('span', { class: 'roadmap__next-title' }, what), icon('arrow-right'));
  }
}

/* ---------- KARTU MODUL ---------- */

function renderModules(s) {
  const rail = $('[data-module-rail]');
  // Disarankan: modul tujuan "lanjutkan" bila belum dimulai
  const recommendedId = s.current?.status === 'todo' ? s.current.id : null;
  rail.replaceChildren(...s.modules.map((m) => moduleCard(m, { recommended: m.id === recommendedId })));
  // Bar pada render ulang langsung di nilai akhir (render pertama dianimasikan motion.js)
  if (!firstRender) $$('[data-progress]', rail).forEach((bar) => bar.style.setProperty('--value', bar.dataset.progress));
}

/* ---------- ALAT BANTU ---------- */

/** V3: tujuh alat praktis — semuanya berfungsi & menuju lokasi nyata */
const TOOLS = [
  { id: 'subject', title: 'Email Subject Generator', icon: 'wand', module: 'tx', href: 'practice.html#generator' },
  { id: 'tracker', title: 'Job Application Tracker', icon: 'kanban', module: 'tr', href: 'tracker.html' },
  { id: 'checklist', title: 'Interactive Checklist', icon: 'check', module: 'id', href: 'practice.html#checklist' },
  { id: 'simulator', title: 'Email Writing Simulator', icon: 'edit', module: 'tx', href: 'practice.html#simulator' },
  { id: 'review', title: 'CV & Portfolio Review', icon: 'file', module: 'cv', href: 'practice.html#review' },
  { id: 'linkedin', title: 'LinkedIn Profile Checklist', icon: 'users', module: 'li', href: 'module.html?id=li#li-12' },
  { id: 'outreach', title: 'Warm Outreach Generator', icon: 'send', module: 'li', href: 'module.html?id=li#li-16' },
];

function renderTools(s) {
  // Deskripsi tile memakai data nyata dari setiap alat
  const t = s.tracker;
  const st = state.getState();
  const liChecklist = Object.keys(st.modules.li?.checklist || {}).filter((k) => k.startsWith('li-c')).length;
  const desc = {
    subject: s.tools.subjects.length ? `${s.tools.subjects.length} subjek tersimpan di riwayat.` : 'Susun subjek lamaran dalam hitungan detik.',
    tracker: t.total ? `${t.total} lamaran · ${t.followUpDue ? `${t.followUpDue} perlu follow-up` : `${t.byStatus.Interview} interview`}.` : 'Belum ada lamaran tercatat.',
    checklist: `${s.tools.presend.done}/${s.tools.presend.total} item pra-kirim dicek.`,
    simulator: s.simulator.attempts ? `Skor rubrik terbaik ${s.simulator.best}.` : 'Tulis email lamaran & nilai dengan rubrik.',
    review: `${s.tools.review.done}/${s.tools.review.total} item CV & portofolio dicek.`,
    linkedin: liChecklist ? `${liChecklist}/8 bagian profil dirapikan.` : 'Rapikan 8 bagian utama profil.',
    outreach: 'Susun pesan perkenalan yang hangat.',
  };
  $('[data-tools]').replaceChildren(...TOOLS.map((tool) =>
    h('a', { class: 'tool-tile', href: tool.href, 'data-module': tool.module },
      h('span', { class: 'tool-tile__icon' }, icon(tool.icon)),
      h('span', { class: 'tool-tile__title' }, tool.title),
      h('span', { class: 'tool-tile__desc' }, desc[tool.id]),
      icon('arrow-right', 'tool-tile__arrow'))));
}

/* ---------- AKTIVITAS ---------- */

const ACTIVITY_ICON = { lesson: 'check', 'quiz-pass': 'target', quiz: 'target', module: 'trophy', start: 'flame', badge: 'star', tracker: 'briefcase', checklist: 'send' };

function renderActivity(s) {
  const host = $('[data-activity]');
  // V3: bagian yang terakhir dibuka (state.lastVisited) sebagai pintasan nyata
  const lv = state.getState().lastVisited;
  const lvMod = lv && s.modules.find((m) => m.id === lv.module);
  const lvLesson = lvMod && lv.lesson ? lvMod.lessons.find((l) => l.id === lv.lesson) : null;
  const resume = lvMod
    ? h('a', { class: 'resume-row', href: `${lvMod.href}${lvLesson ? `#${lvLesson.id}` : ''}`, 'data-module': lvMod.id },
      h('span', { class: 'code' }, lvMod.code),
      h('span', { class: 'resume-row__body' },
        h('span', { class: 'resume-row__label' }, 'Terakhir dibuka'),
        h('span', { class: 'resume-row__title' }, lvLesson ? lvLesson.title : lvMod.title)),
      icon('arrow-right'))
    : null;
  if (!s.activity.length) {
    host.replaceChildren(h('div', { class: 'empty-state' },
      h('span', { class: 'empty-state__icon' }, icon('clock')),
      h('p', { class: 'empty-state__title' }, 'Belum ada aktivitas'),
      h('p', {}, 'Setiap bagian, kuis, dan modul yang kamu selesaikan akan muncul di sini.'),
      h('a', { class: 'btn btn--secondary btn--sm', href: s.next?.href || 'modules.html' }, 'Mulai bagian pertama')));
    if (resume) host.prepend(resume);
    return;
  }
  host.replaceChildren(resume || '', h('ol', { class: 'activity', role: 'list' }, s.activity.slice(0, 5).map((a) =>
    h('li', { class: 'activity__item', 'data-module': a.module || null },
      h('span', { class: 'activity__icon' }, icon(ACTIVITY_ICON[a.type] || 'check')),
      h('p', { class: 'activity__text' }, a.text, h('time', { class: 'activity__time', datetime: a.at }, timeAgo(a.at)))))));
}

/* ---------- PENCAPAIAN ---------- */

function renderAchievements(s) {
  // 2.0: dashboard menampilkan 10 badge utama; milestone kecil ada di halaman Progres
  const main = s.badges.filter((b) => b.main);
  const earned = main.filter((b) => b.earned);
  $('[data-badge-count]').textContent = earned.length;
  $('[data-badge-total]').textContent = main.length;
  const badgeBar = $('[data-badge-bar]');
  badgeBar.setAttribute('aria-valuemax', String(main.length));
  badgeBar.setAttribute('aria-valuenow', String(earned.length));
  badgeBar.style.setProperty('--value', String(Math.round((earned.length / main.length) * 100)));
  const xp = $('[data-xp]');
  if (firstRender) { xp.dataset.count = s.xp; xp.textContent = s.xp; } else motion.countUp(xp, s.xp);

  const next = main.find((b) => !b.earned);
  $('[data-next-badge]').textContent = !earned.length
    ? `Belum ada badge. Badge pertama yang paling dekat: ${next.name} — ${next.desc.charAt(0).toLowerCase()}${next.desc.slice(1)}.`
    : next ? `Badge berikutnya: ${next.name} — ${next.desc.charAt(0).toLowerCase()}${next.desc.slice(1)}.` : 'Semua badge utama sudah kamu kumpulkan!';

  // Badge yang sudah didapat ditampilkan lebih dulu
  const ordered = [...earned, ...main.filter((b) => !b.earned)];
  $('[data-badges]').replaceChildren(...ordered.map((b) =>
    h('li', { class: `badge${b.earned ? '' : ' is-locked'}`, 'data-module': b.module || null },
      h('div', { class: 'badge__seal' }, icon(b.icon), h('span', { class: 'badge__lock' }, icon('lock'))),
      h('div', {},
        h('p', { class: 'badge__name' }, b.name),
        h('p', { class: 'badge__desc' }, b.earned
          ? (b.earnedAt ? `Didapat ${new Date(b.earnedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}` : 'Didapat')
          : b.desc),
        h('span', { class: 'sr-only' }, b.earned ? '(sudah didapat)' : '(terkunci)')))));
}

/* ---------- RESOURCES ---------- */

async function renderResources() {
  const host = $('[data-resources]');
  try {
    const { resources } = await loadJSON('resources');
    host.replaceChildren(...resources.slice(0, 4).map((r) =>
      h('li', {},
        h('a', { class: 'link-row', href: r.url, target: '_blank', rel: 'noopener noreferrer', 'data-module': r.module },
          h('span', { class: 'link-row__icon' }, icon('book')),
          h('span', { class: 'link-row__body' },
            h('span', { class: 'link-row__title' }, r.title),
            r.about ? h('span', { class: 'link-row__desc' }, r.about) : null,
            h('span', { class: 'link-row__meta' }, `${r.type} · ${r.source}`,
              r.verified ? null : h('span', { class: 'verify-tag link-row__verify' }, 'Perlu verifikasi'))),
          icon('external', 'link-row__ext'),
          h('span', { class: 'sr-only' }, '(membuka tab baru)')))));
  } catch {
    host.replaceChildren(h('li', { class: 'text-soft text-sm' }, 'Daftar resources gagal dimuat.'));
  }
}

/* ---------- KONTROL CAROUSEL MODUL (V3, tampilan HP) ----------
   Tombol panah + titik posisi. Disembunyikan CSS bila rail bukan carousel. */
function initRailControls() {
  const rail = $('[data-module-rail]');
  const dotsHost = $('[data-rail-dots]');
  const prev = $('[data-rail-prev]');
  const next = $('[data-rail-next]');
  const cards = () => $$('.module-card', rail);
  const step = () => (cards()[1] ? cards()[1].offsetLeft - cards()[0].offsetLeft : rail.clientWidth);
  const index = () => Math.round(rail.scrollLeft / Math.max(1, step()));
  const go = (i) => rail.scrollTo({ left: i * step(), behavior: motion.isReduced() ? 'auto' : 'smooth' });

  dotsHost.replaceChildren(...cards().map((c, i) => h('li', {},
    h('button', { type: 'button', class: 'rail-dot', 'aria-label': `Ke modul ${i + 1}`, onclick: () => go(i) }))));
  const update = () => {
    const i = Math.min(cards().length - 1, index());
    $$('.rail-dot', dotsHost).forEach((d, k) => d.setAttribute('aria-current', k === i ? 'true' : 'false'));
    prev.disabled = rail.scrollLeft <= 2;
    next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
  };
  prev.addEventListener('click', () => go(Math.max(0, index() - 1)));
  next.addEventListener('click', () => go(Math.min(cards().length - 1, index() + 1)));
  rail.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
  window.addEventListener('resize', update);
  update();
}

/* ---------- PROFIL (onboarding singkat) ---------- */

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
      text: `Ada ${s.activitiesTotal} latihan interaktif di dalam materi, plus Email Writing Simulator, Checklist Pre-send, dan Application Tracker. XP diberikan setelah latihan benar-benar selesai.`,
      list: ['Latihan di dalam materi (studi kasus, urutkan, cari kesalahan)', 'Simulator & alat di halaman Latihan', 'Tracker untuk mencatat lamaran sungguhan'],
      link: { href: 'practice.html', text: 'Buka halaman Latihan' },
    },
    {
      title: 'Complete: evaluasi akhir & sertifikat',
      text: `Setelah kelima modul selesai, ikuti Evaluasi Akhir (nilai lulus ${state.EVALUATION_PASS}). Lulus evaluasi membuka sertifikat penyelesaian berformat PDF yang dibuat di perangkatmu.`,
      list: ['Selesaikan semua bagian + kuis tiap modul', 'Tandai modul selesai', 'Ikuti Evaluasi Akhir, lalu unduh sertifikat'],
      link: { href: 'progress.html', text: 'Lihat Progress & Achievements' },
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
