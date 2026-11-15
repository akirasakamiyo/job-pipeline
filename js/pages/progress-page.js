/* =====================================================================
   pages/progress-page.js — Halaman "Detail progres" (Tahap 7)
   ---------------------------------------------------------------------
   1. Ringkasan: progres keseluruhan, modul, bagian, kuis, XP, badge
   2. Progres per modul (bagian, kuis terbaik, percobaan, status)
   3. Koleksi badge (semua, termasuk yang masih terkunci)
   4. Riwayat aktivitas (maks. 30 entri tersimpan)
   5. Data & pengaturan:
      - preferensi gerak (ikuti sistem / kurangi gerak)
      - unduh cadangan · pulihkan dari cadangan (dengan pratinjau isi)
      - reset per cakupan (progres / tracker / semua) + Urungkan
      - salinan data rusak yang dikarantina storage.js

   Semua angka berasal dari state.getSummary() → sama persis dengan
   Dashboard. Tidak ada angka yang dikarang di halaman ini.
   ===================================================================== */

import { $, $$, h, icon } from '../core/dom.js';
import * as state from '../core/state.js';
import * as storage from '../core/storage.js';
import * as motion from '../core/motion.js';
import * as backup from '../core/backup.js';
import { initRings, setProgress, toast, confirmDialog } from '../core/ui.js';

const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
const ACTIVITY_ICON = { lesson: 'check', 'quiz-pass': 'target', quiz: 'target', module: 'trophy', start: 'flame', badge: 'star', tracker: 'briefcase', checklist: 'send' };
const STATUS = {
  done: { label: 'Selesai', chip: 'chip--done', cta: 'Ulas kembali' },
  ready: { label: 'Siap ditandai selesai', chip: 'chip--warn', cta: 'Tandai selesai' },
  progress: { label: 'Sedang dipelajari', chip: 'chip--progress', cta: 'Lanjutkan' },
  todo: { label: 'Belum mulai', chip: 'chip--locked', cta: 'Mulai' },
};

/** Aktivitas bernilai (sama dengan state.SCORED_ACTIVITIES) → judul & lokasi materi */
const ACTIVITY_INFO = {
  'id-drive-sim': ['Simulasi izin Google Drive', 'id', 'id-15'],
  'cv-structure': ['CV Structure Builder', 'cv', 'cv-13'],
  'cv-redflags': ['CV Red Flags Detector', 'cv', 'cv-14'],
  'cv-ats': ['ATS Keyword Matching', 'cv', 'cv-17'],
  'li-hm': ['Identify the Hiring Manager', 'li', 'li-15'],
  'tx-subject-challenge': ['Subject Line Challenge', 'tx', 'tx-13'],
  'tx-anatomy': ['Email Anatomy Challenge', 'tx', 'tx-14'],
  'tx-order': ['Email Ordering Challenge', 'tx', 'tx-15'],
  'tx-ccbcc': ['CC/BCC Scenario', 'tx', 'tx-18'],
  'tx-mistakes': ['Find the Mistakes', 'tx', 'tx-21'],
  'tr-status': ['Application Status Management', 'tr', 'tr-12'],
  'tr-timing': ['Follow-Up Timing Scenario', 'tr', 'tr-13'],
  'tr-best-message': ['Choose the Best Follow-Up Message', 'tr', 'tr-15'],
};

const UNDO_MS = 12000;      // waktu tombol "Urungkan" tetap tersedia
let firstRender = true;

function timeAgo(iso) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, sec] of units) {
    if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit);
  }
  return 'baru saja';
}

const fullDate = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function init() {
  render(state.getSummary());
  initDataPanel();
  state.subscribe((summary) => render(summary));
  firstRender = false;
}

/* =====================================================================
   RENDER RINGKASAN
   ===================================================================== */

function render(s) {
  renderOverview(s);
  renderModules(s);
  renderScore(s);
  renderBadges(s);
  renderActivity(s);
  renderCorrupt();
}

function renderOverview(s) {
  // Ring sudah dibangun oleh app.js (initRings dipanggil sebelum init halaman),
  // jadi nilainya SELALU diatur lewat setProgress. initRings di sini hanya
  // pengaman bila urutan boot berubah (fungsi ini melewati ring yang sudah jadi).
  const ring = $('[data-overall-ring]');
  initRings(ring.parentElement);
  setProgress(ring, s.overallPct, { animate: !firstRender || !motion.isReduced() });
  $('[data-overall-text]').textContent = s.isNew
    ? 'Belum ada langkah yang diselesaikan. Mulai dari Modul 1 untuk mengisi halaman ini.'
    : `${s.stepsDone} dari ${s.stepsTotal} langkah selesai (bagian materi, kuis lulus, dan tanda "selesai" per modul).`;

  const quizPassed = s.modules.filter((m) => m.quizPassed).length;
  const mainBadges = s.badges.filter((b) => b.main);
  const earned = mainBadges.filter((b) => b.earned).length;
  const stats = [
    { icon: 'trophy', value: `${s.completed}/${s.modules.length}`, label: 'Modul selesai' },
    { icon: 'check', value: `${s.lessonsDone}/${s.lessonsTotal}`, label: 'Bagian materi' },
    { icon: 'target', value: `${quizPassed}/${s.modules.length}`, label: 'Kuis lulus' },
    { icon: 'star', value: String(s.xp), label: 'Total XP' },
    { icon: 'flame', value: `${earned}/${mainBadges.length}`, label: 'Badge utama' },
  ];
  $('[data-stats]').replaceChildren(...stats.map((st) =>
    h('div', { class: 'stat' },
      h('span', { class: 'stat__icon' }, icon(st.icon)),
      h('span', { class: 'stat__value num' }, st.value),
      h('span', { class: 'stat__label' }, st.label))));

  const next = $('[data-next]');
  if (s.allDone) {
    next.href = 'tracker.html';
    next.replaceChildren('Buka Tracker lamaran', icon('arrow-right', 'icon--trail'));
  } else {
    next.href = s.next?.href || 'modules.html';
    next.replaceChildren(s.isNew ? 'Mulai belajar' : 'Lanjutkan belajar', icon('arrow-right', 'icon--trail'));
  }
}

function renderModules(s) {
  $('[data-module-list]').replaceChildren(...s.modules.map((m) => {
    const key = m.readyToComplete ? 'ready' : m.status;
    const info = STATUS[key];
    const quiz = m.quizAttempts
      ? `Kuis: skor terbaik ${m.quizBest} · ${m.quizAttempts}× percobaan${m.quizPassed ? ' · lulus' : ` · belum lulus (min. ${state.getPassScore()})`}`
      : 'Kuis: belum dicoba';
    const href = m.status === 'done' ? m.href : key === 'ready' ? `${m.href}#selesai` : m.nextLesson ? `${m.href}#${m.nextLesson.id}` : `${m.href}#kuis`;
    return h('li', { class: 'prog-module', 'data-module': m.id },
      h('div', { class: 'prog-module__head' },
        h('span', { class: 'code' }, m.code),
        h('span', { class: `chip ${info.chip}` }, info.label)),
      h('h3', { class: 'prog-module__title' }, m.title),
      h('div', { class: 'prog-module__bar' },
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': `Progres ${m.title}`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(m.pct), style: { '--value': String(m.pct) } },
          h('span', { class: 'bar__fill' })),
        h('span', { class: 'mono prog-module__pct' }, `${m.pct}%`)),
      h('ul', { class: 'prog-module__facts', role: 'list' },
        h('li', {}, `Bagian: ${m.lessonsDone}/${m.lessonsTotal}`),
        h('li', {}, quiz)),
      h('a', { class: 'btn btn--secondary btn--sm prog-module__cta', href }, info.cta, h('span', { class: 'sr-only' }, ` modul ${m.title}`), icon('arrow-right', 'icon--trail')));
  }));
}

/* ---------- Skor belajar keseluruhan (2.0) ---------- */
function renderScore(s) {
  const sc = s.score;
  $('[data-score-total]').textContent = String(sc.total);
  $('[data-score-parts]').replaceChildren(...sc.parts.map((p) => h('li', { class: 'score-part' },
    h('div', { class: 'score-part__head' },
      h('span', {}, p.label),
      h('span', { class: 'mono' }, `${p.value} × ${p.weight}% = ${Math.round((p.value * p.weight) / 100)}`)),
    h('div', { class: 'bar bar--thin', role: 'progressbar', 'aria-label': p.label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(p.value), style: { '--value': String(p.value) } }, h('span', { class: 'bar__fill' })))));
  $('[data-activity-list]').replaceChildren(...state.SCORED_ACTIVITIES.map((id) => {
    const [label, mid, lesson] = ACTIVITY_INFO[id] || [id, null, null];
    const rec = s.activities[id];
    return h('li', { class: 'act-row', 'data-module': mid },
      h('span', { class: 'code' }, (state.getModuleMeta(mid)?.code) || '—'),
      h('a', { class: 'act-row__title', href: mid ? `module.html?id=${mid}#${lesson}` : '#' }, label),
      rec
        ? h('span', { class: `chip ${rec.passedAt ? 'chip--done' : 'chip--warn'}` }, rec.passedAt ? icon('check') : null, `Terbaik ${rec.best}`)
        : h('span', { class: 'chip' }, 'Belum dicoba'));
  }));
  $('[data-activity-summary]').textContent = `${s.activitiesPassed} dari ${s.activitiesTotal} aktivitas lulus · Simulator: ${s.simulator.attempts ? `terbaik ${s.simulator.best}` : 'belum dicoba'} · Evaluasi Akhir: ${s.evaluation.attempts ? `terbaik ${s.evaluation.best}` : 'belum dicoba'}`;
}

function badgeItem(b) {
  return h('li', { class: `badge${b.earned ? '' : ' is-locked'}`, 'data-module': b.module || null },
    h('div', { class: 'badge__seal' }, icon(b.icon), h('span', { class: 'badge__lock' }, icon('lock'))),
    h('div', {},
      h('p', { class: 'badge__name' }, b.name),
      h('p', { class: 'badge__desc' }, b.desc),
      b.earned
        ? h('p', { class: 'badge__desc badge__when' }, b.earnedAt ? `Didapat ${new Date(b.earnedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Didapat')
        : null,
      h('span', { class: 'sr-only' }, b.earned ? '(sudah didapat)' : '(terkunci)')));
}

function renderBadges(s) {
  const main = s.badges.filter((b) => b.main);
  const milestones = s.badges.filter((b) => !b.main);
  const earned = main.filter((b) => b.earned);
  $('[data-badge-summary]').textContent = `${earned.length} dari ${main.length} badge utama sudah didapat · ${milestones.filter((b) => b.earned).length}/${milestones.length} milestone.`;
  $('[data-badge-grid]').replaceChildren(...main.map(badgeItem));
  $('[data-milestone-grid]').replaceChildren(...milestones.map(badgeItem));
}

function renderActivity(s) {
  const host = $('[data-activity]');
  $('[data-activity-count]').textContent = s.activity.length ? `${s.activity.length} aktivitas terakhir (maks. 30 disimpan)` : '';
  if (!s.activity.length) {
    host.replaceChildren(h('div', { class: 'empty-state' },
      h('span', { class: 'empty-state__icon' }, icon('clock')),
      h('p', { class: 'empty-state__title' }, 'Belum ada aktivitas'),
      h('p', {}, 'Bagian, kuis, modul, badge, dan lamaran yang kamu catat akan muncul di sini.')));
    return;
  }
  host.replaceChildren(h('ol', { class: 'activity', role: 'list' }, s.activity.map((a) =>
    h('li', { class: 'activity__item', 'data-module': a.module || null },
      h('span', { class: 'activity__icon' }, icon(ACTIVITY_ICON[a.type] || 'check')),
      h('p', { class: 'activity__text' }, a.text,
        h('time', { class: 'activity__time', datetime: a.at, title: fullDate(a.at) }, timeAgo(a.at)))))));
}

/* =====================================================================
   DATA & PENGATURAN
   ===================================================================== */

function initDataPanel() {
  // Status penyimpanan: jujur bila data hanya tersimpan sementara
  const persist = $('[data-storage-status]');
  if (storage.isPersistent()) {
    persist.className = 'callout callout--tip';
    persist.replaceChildren(
      h('span', { class: 'callout__icon' }, icon('shield')),
      h('div', {},
        h('p', { class: 'callout__title' }, 'Data tersimpan di browser ini'),
        h('p', {}, 'Progres dan tracker tersimpan di LocalStorage perangkat ini saja: tidak dikirim ke server mana pun. Data tidak ikut pindah ke browser/perangkat lain dan akan hilang bila data situs dihapus, jadi unduh cadangan secara berkala.')));
  } else {
    persist.className = 'callout callout--warn';
    persist.replaceChildren(
      h('span', { class: 'callout__icon' }, icon('alert')),
      h('div', {},
        h('p', { class: 'callout__title' }, 'Data hanya tersimpan sementara'),
        h('p', {}, 'Browser memblokir LocalStorage (misalnya mode private atau penyimpanan penuh). Progres akan hilang saat tab ditutup. Unduh cadangan sebelum menutup halaman.')));
  }

  initMotionPref();

  $('[data-export]').addEventListener('click', () => {
    try {
      const name = backup.downloadBackup();
      toast(`File "${name}" sedang diunduh. Simpan di tempat aman: file ini berisi nama dan data lamaranmu.`, { type: 'success', title: 'Cadangan dibuat', duration: 7000 });
    } catch (error) {
      console.error('[progress] ekspor gagal:', error);
      toast('Cadangan gagal dibuat di browser ini.', { type: 'error' });
    }
  });

  const fileInput = $('[data-import-file]');
  $('[data-import]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';                         // izinkan memilih file yang sama lagi
    if (!file) return;
    const result = await backup.readBackupFile(file);
    if (!result.ok) {
      toast(result.error, { type: 'error', title: 'Cadangan tidak bisa dipakai', duration: 8000 });
      return;
    }
    const { info } = result;
    const when = result.exportedAt && !Number.isNaN(Date.parse(result.exportedAt)) ? ` (dibuat ${fullDate(result.exportedAt)})` : '';
    const ok = await confirmDialog({
      title: 'Pulihkan dari cadangan?',
      message: `File "${file.name}"${when} berisi ${info.lessons} bagian selesai, ${info.completed} modul selesai, ${info.xp} XP, dan ${info.trackerItems} lamaran. Data di browser ini akan DIGANTI dengan isi file tersebut. Kamu masih bisa mengurungkan sesaat setelahnya.`,
      confirmLabel: 'Ya, pulihkan',
    });
    if (!ok) return;
    const before = backup.applyBackup(result.backup);
    motion.init();
    offerUndo(before, 'Data dipulihkan dari cadangan.', 'Pemulihan dibatalkan. Data kembali seperti sebelumnya.');
  });

  $('[data-reset]').addEventListener('click', async () => {
    const scope = $('input[name="reset-scope"]:checked')?.value || 'progress';
    const s = state.getSummary();
    const messages = {
      progress: `Semua progres belajar akan dihapus: ${s.lessonsDone} bagian selesai, nilai kuis, ${s.completed} modul selesai, ${s.xp} XP, badge, checklist pra-kirim, dan riwayat subject. Nama profil dan Tracker lamaran TIDAK ikut dihapus.`,
      tracker: `Seluruh ${s.trackerCount} lamaran di Tracker akan dihapus. Progres belajar tidak berubah.`,
      all: `SEMUA data aplikasi di browser ini akan dihapus: progres belajar, XP, badge, ${s.trackerCount} lamaran, nama profil, dan preferensi tampilan.`,
    };
    const ok = await confirmDialog({
      title: `Reset ${backup.RESET_SCOPES[scope].toLowerCase()}?`,
      message: `${messages[scope]} Disarankan mengunduh cadangan terlebih dulu.`,
      confirmLabel: 'Ya, reset',
      danger: true,
    });
    if (!ok) return;
    const before = backup.resetData(scope);
    if (scope === 'all') motion.init();
    offerUndo(before, `${backup.RESET_SCOPES[scope]} sudah direset.`, 'Reset dibatalkan. Data kembali seperti sebelumnya.');
  });

  $('[data-corrupt-clear]').addEventListener('click', async () => {
    const count = backup.listCorruptCopies().length;
    if (!count) return;
    const ok = await confirmDialog({
      title: 'Hapus salinan data rusak?',
      message: `${count} salinan data yang tidak valid akan dihapus permanen. Data aktif (progres & tracker) tidak terpengaruh.`,
      confirmLabel: 'Ya, hapus',
      danger: true,
    });
    if (!ok) return;
    const removed = backup.removeCorruptCopies();
    renderCorrupt();
    toast(`${removed} salinan data rusak dihapus.`, { type: 'success' });
  });
}

/** Toast dengan tombol Urungkan untuk aksi yang mengganti/menghapus data */
function offerUndo(before, doneText, undoText) {
  toast(doneText, {
    type: 'success',
    duration: UNDO_MS,
    action: {
      label: 'Urungkan',
      onClick: () => {
        backup.restore(before);
        motion.init();
        toast(undoText, { type: 'info' });
      },
    },
  });
}

function initMotionPref() {
  const radios = $$('input[name="motion-pref"]');
  const status = $('[data-motion-status]');
  const describe = () => {
    const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    status.textContent = motion.isReduced()
      ? `Gerak minimal aktif${osReduced ? ' (mengikuti setelan perangkat)' : ''}: animasi dekoratif dimatikan.`
      : 'Animasi penuh aktif.';
  };
  const sync = () => {
    const pref = motion.getMotionPref();
    radios.forEach((r) => { r.checked = r.value === pref; });
    describe();
  };
  sync();
  radios.forEach((r) => r.addEventListener('change', () => {
    motion.setMotionPref(r.value);
    describe();
    toast(r.value === 'reduced' ? 'Gerak dikurangi di seluruh LMS.' : 'Gerak mengikuti setelan sistem.', { type: 'success' });
  }));
  storage.subscribe('prefs', sync);
}

function renderCorrupt() {
  const count = backup.listCorruptCopies().length;
  $('[data-corrupt-text]').textContent = count
    ? `${count} salinan data tidak valid disimpan sebagai cadangan otomatis. Hapus bila tidak diperlukan.`
    : 'Tidak ada salinan data rusak.';
  $('[data-corrupt-clear]').hidden = count === 0;
}
