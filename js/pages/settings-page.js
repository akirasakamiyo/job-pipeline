/* =====================================================================
   pages/settings-page.js — Halaman Settings (V4)
   ---------------------------------------------------------------------
   Dipindah dari halaman Progress (satu halaman = satu fungsi):
   - tampilan: tema, ukuran huruf (prefs.js), gerak animasi (motion.js)
   - profil & ulangi panduan pengguna baru
   - cadangan / pemulihan JSON (dengan pratinjau isi + Urungkan)
   - reset per cakupan (progres / semua) + Urungkan
   - salinan data rusak & data Job Tracker versi lama (tidak dihapus
     tanpa persetujuan pengguna)
   ===================================================================== */

import { $, $$, h, icon } from '../core/dom.js';
import * as state from '../core/state.js';
import * as storage from '../core/storage.js';
import * as motion from '../core/motion.js';
import * as backup from '../core/backup.js';
import * as prefs from '../core/prefs.js';
import { toast, confirmDialog } from '../core/ui.js';

const UNDO_MS = 12000;      // waktu tombol "Urungkan" tetap tersedia
const fullDate = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATUS_LABEL = { student: 'Pelajar / mahasiswa', 'fresh-grad': 'Fresh graduate', 'career-switch': 'Pindah karier', other: 'Lainnya' };

export function init() {
  renderStorageStatus();
  initAppearancePrefs();
  initMotionPref();
  initBackup();
  initReset();
  initMaintenance();
  renderProfile();
  renderMaintenance();
  state.subscribe(() => renderProfile());
  storage.subscribe('tracker', renderMaintenance);
}

/* ---------- Status penyimpanan: jujur bila data hanya sementara ---------- */
function renderStorageStatus() {
  const box = $('[data-storage-status]');
  const ok = storage.isPersistent();
  box.className = `callout ${ok ? 'callout--tip' : 'callout--warn'}`;
  box.replaceChildren(
    h('span', { class: 'callout__icon' }, icon(ok ? 'shield' : 'alert')),
    h('div', {},
      h('p', { class: 'callout__title' }, ok ? 'Data tersimpan di browser ini' : 'Data hanya tersimpan sementara'),
      h('p', {}, ok
        ? 'Progres tersimpan di LocalStorage perangkat ini saja: tidak dikirim ke server mana pun. Data tidak ikut pindah ke perangkat lain dan hilang bila data situs dihapus, jadi unduh cadangan secara berkala.'
        : 'Browser memblokir LocalStorage (misalnya mode private atau penyimpanan penuh). Progres akan hilang saat tab ditutup. Unduh cadangan sebelum menutup halaman.')));
}

function renderProfile() {
  const { user } = state.getState();
  $('[data-profile-summary]').textContent = user.name
    ? `Nama: ${user.name}${user.status ? ` · ${STATUS_LABEL[user.status] || user.status}` : ''}. Nama dipakai untuk sapaan dan sertifikat.`
    : 'Belum ada nama profil. Nama dipakai untuk sapaan dan sertifikat penyelesaian.';
}

/* ---------- Tampilan ---------- */
function initAppearancePrefs() {
  const sync = () => {
    const p = prefs.getPrefs();
    $$('input[name="theme-pref"]').forEach((r) => { r.checked = r.value === p.theme; });
    $$('input[name="font-pref"]').forEach((r) => { r.checked = r.value === p.font; });
  };
  sync();
  $$('input[name="theme-pref"]').forEach((r) => r.addEventListener('change', () => {
    prefs.setPref('theme', r.value);
    toast(`Tema: ${prefs.THEMES[r.value]}.`, { type: 'success' });
  }));
  $$('input[name="font-pref"]').forEach((r) => r.addEventListener('change', () => {
    prefs.setPref('font', r.value);
    toast(`Ukuran huruf: ${prefs.FONTS[r.value]}.`, { type: 'success' });
  }));
  storage.subscribe('prefs', sync);
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

/* ---------- Cadangan & pemulihan ---------- */
function initBackup() {
  $('[data-export]').addEventListener('click', () => {
    try {
      const name = backup.downloadBackup();
      toast(`File "${name}" sedang diunduh. Simpan di tempat aman: file ini berisi namamu dan data belajarmu.`, { type: 'success', title: 'Cadangan dibuat', duration: 7000 });
    } catch (error) {
      console.error('[settings] ekspor gagal:', error);
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
      message: `File "${file.name}"${when} berisi ${info.lessons} bagian selesai, ${info.completed} modul selesai, dan ${info.xp} XP. Data di browser ini akan DIGANTI dengan isi file tersebut. Kamu masih bisa mengurungkan sesaat setelahnya.`,
      confirmLabel: 'Ya, pulihkan',
    });
    if (!ok) return;
    const before = backup.applyBackup(result.backup);
    motion.init();
    offerUndo(before, 'Data dipulihkan dari cadangan.', 'Pemulihan dibatalkan. Data kembali seperti sebelumnya.');
  });
}

/* ---------- Reset ---------- */
function initReset() {
  $('[data-reset]').addEventListener('click', async () => {
    const scope = $('input[name="reset-scope"]:checked')?.value || 'progress';
    const s = state.getSummary();
    const messages = {
      progress: `Semua progres belajar akan dihapus: ${s.lessonsDone} bagian selesai, nilai kuis, ${s.completed} modul selesai, ${s.xp} XP, badge, latihan, dan riwayat. Nama profil TIDAK ikut dihapus.`,
      all: `SEMUA data aplikasi di browser ini akan dihapus: progres belajar, XP, badge, nama profil, feedback, preferensi tampilan, dan data lama.`,
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

/* ---------- Salinan rusak & data Job Tracker lama ---------- */
function renderMaintenance() {
  const count = backup.listCorruptCopies().length;
  $('[data-corrupt-text]').textContent = count
    ? `${count} salinan data tidak valid disimpan sebagai cadangan otomatis. Hapus bila tidak diperlukan.`
    : 'Tidak ada salinan data rusak.';
  $('[data-corrupt-clear]').hidden = count === 0;

  const legacy = backup.legacyTrackerCount();
  $('[data-legacy]').hidden = legacy === 0;
  $('[data-legacy-text]').textContent = legacy
    ? `Fitur Job Tracker sudah dihapus dari LMS, tetapi ${legacy} lamaran dari versi lama masih tersimpan di browser ini. Data ini tidak dipakai lagi; unduh bila ingin menyimpannya, lalu hapus.`
    : '';
}

function initMaintenance() {
  $('[data-corrupt-clear]').addEventListener('click', async () => {
    const count = backup.listCorruptCopies().length;
    if (!count) return;
    const ok = await confirmDialog({
      title: 'Hapus salinan data rusak?',
      message: `${count} salinan data yang tidak valid akan dihapus permanen. Data aktif tidak terpengaruh.`,
      confirmLabel: 'Ya, hapus',
      danger: true,
    });
    if (!ok) return;
    const removed = backup.removeCorruptCopies();
    renderMaintenance();
    toast(`${removed} salinan data rusak dihapus.`, { type: 'success' });
  });

  $('[data-legacy-download]').addEventListener('click', () => {
    backup.downloadLegacyTracker();
    toast('Data Job Tracker lama sedang diunduh.', { type: 'success' });
  });
  $('[data-legacy-remove]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Hapus data Job Tracker lama?',
      message: `${backup.legacyTrackerCount()} lamaran dari versi lama akan dihapus dari browser ini. Progres belajar tidak terpengaruh.`,
      confirmLabel: 'Ya, hapus',
      danger: true,
    });
    if (!ok) return;
    const before = backup.removeLegacyTracker();
    renderMaintenance();
    offerUndo(before, 'Data Job Tracker lama dihapus.', 'Penghapusan dibatalkan.');
  });
}
