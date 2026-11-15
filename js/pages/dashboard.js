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
import { isSoon } from '../core/navigation.js';
import * as state from '../core/state.js';
import * as motion from '../core/motion.js';
import { moduleCard } from '../features/module-card.js';

let firstRender = true;

export async function init() {
  render(state.getSummary());
  initProfileDialog();
  await renderResources();

  // Sinkron otomatis bila progres/tracker berubah (mis. dari tab lain)
  state.subscribe((summary) => render(summary));
}

function render(summary) {
  renderHero(summary);
  renderProgress(summary);
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

  const lead = $('[data-hero-lead]');
  const cta = $('[data-continue]');
  const ctaLabel = $('[data-continue-label]');

  if (s.allDone) {
    lead.textContent = 'Kelima stasiun sudah kamu lewati. Saatnya mempraktikkan semuanya dan memantau lamaranmu.';
    ctaLabel.textContent = 'Lihat pencapaian';
    cta.href = 'progress.html';
  } else if (s.isNew) {
    lead.textContent = 'Lima modul singkat yang memandumu dari membuat Gmail profesional sampai follow-up lamaran. Mulai dari stasiun pertama.';
    ctaLabel.textContent = 'Mulai belajar';
    cta.href = s.next.href;
  } else {
    lead.textContent = `Kamu sudah menempuh ${s.overallPct}% perjalanan. Lanjutkan dari stasiun ${s.current.code}: ${s.current.title}.`;
    ctaLabel.textContent = 'Lanjutkan belajar';
    cta.href = s.next.href;
  }

  // Ringkasan di hero
  $('[data-hero-stats]').replaceChildren(
    h('div', {}, h('dt', {}, 'Modul selesai'), h('dd', { class: 'num' }, numberEl(s.completed, ''), h('small', {}, ` /${s.modules.length}`))),
    h('div', {}, h('dt', {}, 'Bagian selesai'), h('dd', { class: 'num' }, numberEl(s.lessonsDone, ''), h('small', {}, ` /${s.lessonsTotal}`))),
    h('div', {}, h('dt', {}, 'Total XP'), h('dd', { class: 'num' }, numberEl(s.xp, ''))),
  );

  // Kartu "berikutnya" di samping ilustrasi
  const card = $('[data-continue-card]');
  if (s.allDone) {
    card.href = 'progress.html';
    card.removeAttribute('data-module');
    card.replaceChildren(
      h('span', { class: 'completion__stamp', style: { width: '48px', height: '48px', rotate: '0deg' } }, icon('trophy')),
      h('span', { class: 'continue-card__body' },
        h('span', { class: 'continue-card__label' }, 'Semua modul selesai'),
        h('span', { class: 'continue-card__title' }, 'Lihat rekap pencapaianmu')),
      icon('arrow-right'));
    return;
  }
  const mod = s.next.module;
  card.href = s.next.href;
  card.dataset.module = mod.id;
  const what = s.next.type === 'lesson' ? s.next.lesson.title
    : s.next.type === 'quiz' ? `Kuis ${mod.title}` : `Tandai ${mod.title} selesai`;
  // Tahap 7 (aksesibilitas, WCAG 2.5.3 "Label in Name"): nama tautan diambil dari
  // teks yang terlihat — tidak lagi memakai aria-label yang berbeda dari teksnya.
  // Ring hanya penanda visual di kartu ini (persentase ada di halaman modul).
  const ring = h('div', { class: 'ring', style: { '--size': '52px', '--stroke': '5px' }, 'data-ring': true, 'data-value': mod.pct, 'aria-hidden': 'true' });
  card.replaceChildren(
    ring,
    h('span', { class: 'continue-card__body' },
      h('span', { class: 'continue-card__label' }, `${s.isNew ? 'Mulai di' : 'Berikutnya'} · ${mod.code}`),
      h('span', { class: 'continue-card__title' }, what),
      h('span', { class: 'continue-card__meta' }, s.next.type === 'lesson' ? `±${s.next.lesson.minutes} menit · Modul ${String(mod.number).padStart(2, '0')}`
        : s.next.type === 'quiz' ? `Nilai lulus ${state.getPassScore()}` : 'Semua bagian & kuis sudah beres')),
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

  const counts = [
    ['Total modul', s.modules.length, 'var(--ink)'],
    ['Selesai', s.completed, 'var(--success)'],
    ['Sedang dipelajari', s.inProgress, 'var(--cobalt)'],
    ['Belum mulai', s.notStarted, 'var(--line-strong)'],
  ];
  $('[data-counts]').replaceChildren(...counts.map(([label, value, dot]) =>
    h('div', { class: 'count-pill' },
      h('span', { class: 'count-pill__value num' }, numberEl(value, '')),
      h('span', { class: 'count-pill__label' }, h('span', { class: 'count-pill__dot', style: { '--dot': dot } }), label))));

  $('[data-module-progress]').replaceChildren(...s.modules.map((m) =>
    h('li', {},
      h('a', { class: 'module-progress__row', href: m.href, 'data-module': m.id },
        h('span', { class: 'code' }, m.code),
        h('span', { class: 'module-progress__title' }, m.title),
        h('span', { class: 'module-progress__pct' }, `${m.pct}%`),
        h('div', {
          class: 'bar', 'data-progress': m.pct, style: { '--value': m.pct },
          role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(m.pct),
          'aria-label': `Progres ${m.title}`,
        }, h('span', { class: 'bar__fill' }))))));
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
      isCurrent ? h('span', { class: 'chip chip--progress' }, 'Kamu di sini') : null));
  }));
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

function renderTools(s) {
  // Deskripsi tile memakai data nyata dari setiap alat
  const quizzesPassed = s.modules.filter((m) => m.quizPassed).length;
  const t = s.tracker;
  const tools = [
    {
      title: 'Email Subject Generator',
      desc: s.tools.subjects.length ? `${s.tools.subjects.length} subjek tersimpan di riwayat.` : 'Susun subjek lamaran dalam hitungan detik.',
      icon: 'wand', module: 'tx', href: 'practice.html#generator', soon: isSoon('practice'),
    },
    {
      title: 'Job Tracker',
      desc: t.total ? `${t.total} lamaran · ${t.byStatus.Interview} interview · ${t.byStatus.Accepted} diterima.` : 'Catat & pantau setiap lamaran.',
      icon: 'kanban', module: 'tr', href: 'tracker.html', soon: isSoon('tracker'),
    },
    {
      title: 'Checklist pra-kirim',
      desc: `${s.tools.presend.pct}% siap · ${s.tools.presend.done}/${s.tools.presend.total} item dicek.`,
      icon: 'check', module: 'id', href: 'practice.html#checklist', soon: isSoon('practice'),
    },
    {
      title: 'Kuis modul',
      desc: `${quizzesPassed} dari ${s.modules.length} kuis lulus.`,
      icon: 'target', module: 'cv', href: 'practice.html#kuis', soon: false,
    },
    {
      title: 'Email Writing Simulator',
      desc: s.simulator.attempts ? `Skor rubrik terbaik ${s.simulator.best}.` : 'Tulis email lamaran & nilai dengan rubrik.',
      icon: 'edit', module: 'tx', href: 'practice.html#simulator', soon: false,
    },
    {
      title: 'Evaluasi Akhir',
      desc: s.evaluation.attempts ? `Skor terbaik ${s.evaluation.best}${s.evaluation.passed ? ' · lulus' : ''}.` : '15 soal skenario lintas modul.',
      icon: 'trophy', module: 'li', href: 'evaluation.html', soon: false,
    },
  ];
  $('[data-tools]').replaceChildren(...tools.map((t) =>
    h('a', { class: 'tool-tile', href: t.href, 'data-module': t.module },
      h('span', { class: 'tool-tile__icon' }, icon(t.icon)),
      h('span', { class: 'tool-tile__title' }, t.title),
      h('span', { class: 'tool-tile__desc' }, t.desc),
      t.soon ? h('span', { class: 'soon-tag' }, 'Segera') : null,
      icon('arrow-right', 'tool-tile__arrow'))));
}

/* ---------- AKTIVITAS ---------- */

const ACTIVITY_ICON = { lesson: 'check', 'quiz-pass': 'target', quiz: 'target', module: 'trophy', start: 'flame', badge: 'star', tracker: 'briefcase', checklist: 'send' };

function renderActivity(s) {
  const host = $('[data-activity]');
  if (!s.activity.length) {
    host.replaceChildren(h('div', { class: 'empty-state' },
      h('span', { class: 'empty-state__icon' }, icon('clock')),
      h('p', { class: 'empty-state__title' }, 'Belum ada aktivitas'),
      h('p', {}, 'Setiap bagian, kuis, dan modul yang kamu selesaikan akan muncul di sini.'),
      h('a', { class: 'btn btn--secondary btn--sm', href: s.next?.href || 'modules.html' }, 'Mulai bagian pertama')));
    return;
  }
  host.replaceChildren(h('ol', { class: 'activity', role: 'list' }, s.activity.slice(0, 5).map((a) =>
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
  const xp = $('[data-xp]');
  if (firstRender) { xp.dataset.count = s.xp; xp.textContent = s.xp; } else motion.countUp(xp, s.xp);

  const next = main.find((b) => !b.earned);
  $('[data-next-badge]').textContent = next ? `Badge berikutnya: ${next.name} — ${next.desc.toLowerCase()}.` : 'Semua badge sudah kamu kumpulkan!';

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
            h('span', { class: 'link-row__meta' }, `${r.type} · ${r.source}`)),
          icon('external', 'link-row__ext'),
          h('span', { class: 'sr-only' }, '(membuka tab baru)')))));
  } catch {
    host.replaceChildren(h('li', { class: 'text-soft text-sm' }, 'Daftar resources gagal dimuat.'));
  }
}

/* ---------- PROFIL (onboarding singkat) ---------- */

function initProfileDialog() {
  const dialog = $('#profile-dialog');
  const form = $('[data-profile-form]', dialog);
  const nameInput = $('#p-name', form);
  const statusInput = $('#p-status', form);

  $('[data-open-profile]').addEventListener('click', () => {
    const { user } = state.getState();
    nameInput.value = user.name;
    if (user.status) statusInput.value = user.status;
    setError('');
    openModal(dialog);
  });

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
