/* =====================================================================
   backup.js — Cadangan, pemulihan, dan reset data (Tahap 7)
   ---------------------------------------------------------------------
   Semua data aplikasi hanya ada di LocalStorage perangkat pengguna.
   Modul ini memberi pengguna kendali penuh atasnya:
   - downloadBackup()  → file JSON berisi progres, preferensi, feedback
                         (+ data Job Tracker lama bila masih tersimpan; V4)
   - readBackupFile()  → membaca & MEMVALIDASI file sebelum dipakai
   - applyBackup()     → mengganti data (mengembalikan snapshot untuk Urungkan)
   - resetData()       → menghapus data per cakupan (juga mengembalikan snapshot)
   - restore()         → mengembalikan snapshot (tombol "Urungkan")

   Prinsip keamanan data:
   * Tidak ada perubahan tanpa konfirmasi di UI (lihat progress-page.js).
   * Setiap aksi yang menghapus/mengganti data mengembalikan snapshot,
     sehingga pengguna bisa membatalkan dari toast.
   * File impor tidak pernah dieksekusi: hanya JSON.parse, dicek bentuknya,
     lalu dinormalkan oleh state.js seperti data biasa.

   V4: Job Tracker dihapus dari LMS. Key lama "ujap:tracker" TIDAK dihapus
   diam-diam: ikut cadangan apa adanya bila ada, dan bisa diunduh/dihapus
   pengguna dari halaman Settings (legacyTracker*).
   ===================================================================== */

import * as storage from './storage.js';
import * as state from './state.js';

export const APP_ID = 'ujap';
export const BACKUP_VERSION = 1;
const DATA_KEYS = ['progress', 'tracker', 'prefs', 'feedback'];   // final: + feedback
const MAX_IMPORT_BYTES = 1024 * 1024;     // 1 MB — jauh di atas ukuran data normal

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ---------- Data Job Tracker lama (V4) ---------- */

/** Jumlah lamaran di key lama "ujap:tracker" (0 bila tidak ada / tidak valid) */
export function legacyTrackerCount() {
  const raw = storage.get('tracker', null);
  const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  return items.filter(isObj).length;
}

/** Mengunduh data Tracker lama sebagai JSON (tanpa diubah) */
export function downloadLegacyTracker() {
  const blob = new Blob([JSON.stringify({ app: APP_ID, kind: 'legacy-tracker', exportedAt: new Date().toISOString(), data: storage.get('tracker', null) }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `ujap-tracker-lama-${todayISO()}.json`; link.hidden = true;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Menghapus data Tracker lama (hanya atas konfirmasi pengguna); → snapshot untuk Urungkan */
export function removeLegacyTracker() {
  const before = snapshot(['tracker']);
  storage.remove('tracker');
  return before;
}

/* ---------- Snapshot (untuk Urungkan) ---------- */

/** Salinan mentah key-key data saat ini */
export function snapshot(keys = DATA_KEYS) {
  return Object.fromEntries(keys.map((key) => [key, storage.get(key, null)]));
}

/** Mengembalikan snapshot; key yang dulu kosong dihapus lagi */
export function restore(snap) {
  Object.entries(snap).forEach(([key, value]) => {
    if (value == null) storage.remove(key);
    else storage.set(key, value);
  });
}

/* ---------- Ekspor ---------- */

export function buildBackup() {
  return {
    app: APP_ID,
    kind: 'backup',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      progress: state.getState(),
      prefs: storage.get('prefs', {}),
      feedback: storage.get('feedback', null),
      // Data Job Tracker versi lama (bila masih ada) disertakan tanpa diubah
      ...(legacyTrackerCount() ? { tracker: storage.get('tracker', null) } : {}),
    },
  };
}

/** Mengunduh file cadangan; mengembalikan nama file */
export function downloadBackup() {
  const filename = `ujap-cadangan-${todayISO()}.json`;
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return filename;
}

/* ---------- Impor ---------- */

/** Ringkasan isi cadangan untuk ditampilkan sebelum pengguna mengonfirmasi */
function describe(data) {
  const modules = isObj(data.progress?.modules) ? Object.values(data.progress.modules) : [];
  const lessons = modules.reduce((sum, m) => sum + (Array.isArray(m?.lessonsDone) ? m.lessonsDone.length : 0), 0);
  const completed = modules.filter((m) => typeof m?.completedAt === 'string').length;
  const rawItems = Array.isArray(data.tracker) ? data.tracker : Array.isArray(data.tracker?.items) ? data.tracker.items : [];
  return {
    lessons,
    completed,
    xp: Number.isFinite(Number(data.progress?.xp)) ? Math.max(0, Math.round(Number(data.progress.xp))) : 0,
    trackerItems: rawItems.length,   // data Tracker lama di file cadangan (bila ada)
  };
}

/**
 * Membaca file cadangan. Tidak mengubah data apa pun.
 * → { ok: true, backup, info, exportedAt } atau { ok: false, error }
 */
export async function readBackupFile(file) {
  if (!file) return { ok: false, error: 'Tidak ada file yang dipilih.' };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, error: 'File terlalu besar untuk sebuah cadangan (maks. 1 MB).' };
  if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
    return { ok: false, error: 'Pilih file .json hasil "Unduh cadangan".' };
  }
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: 'Isi file bukan JSON yang valid. File mungkin rusak atau bukan cadangan dari aplikasi ini.' };
  }
  if (!isObj(parsed) || parsed.app !== APP_ID || !isObj(parsed.data)) {
    return { ok: false, error: 'File ini bukan cadangan The Ultimate Job Application Pipeline.' };
  }
  if (Number(parsed.version) > BACKUP_VERSION) {
    return { ok: false, error: 'Cadangan dibuat oleh versi aplikasi yang lebih baru dan belum didukung.' };
  }
  const { progress, tracker: trackerData } = parsed.data;
  const progressOk = progress == null || isObj(progress);
  const trackerOk = trackerData == null || Array.isArray(trackerData) || isObj(trackerData);
  if (!progressOk || !trackerOk) return { ok: false, error: 'Struktur data di dalam cadangan tidak dikenali.' };
  return { ok: true, backup: parsed, info: describe(parsed.data), exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null };
}

/**
 * Mengganti data dengan isi cadangan yang SUDAH divalidasi readBackupFile().
 * Mengembalikan snapshot sebelum impor (untuk Urungkan).
 */
export function applyBackup(backup) {
  const before = snapshot();
  const { progress, tracker: trackerData, prefs, feedback } = backup.data;

  storage.set('progress', isObj(progress) ? progress : {});
  state.normalizeStored();                         // buang field tak dikenal / tipe salah

  // Data Job Tracker lama dari cadangan versi sebelumnya: disimpan apa adanya (tidak dipakai UI)
  if (Array.isArray(trackerData) || (isObj(trackerData) && Array.isArray(trackerData.items) && trackerData.items.length)) storage.set('tracker', trackerData);

  // Preferensi: hanya field yang dikenal (lihat sanitizePrefs)
  storage.set('prefs', sanitizePrefs(prefs));

  // Feedback (opsional; cadangan lama belum memilikinya → biarkan yang ada)
  if (isObj(feedback) && isObj(feedback.items)) storage.set('feedback', { version: 1, items: feedback.items });
  return before;
}

/** Preferensi yang dikenal + nilai default (dipakai impor & halaman Pengaturan) */
export function sanitizePrefs(prefs) {
  const p = isObj(prefs) ? prefs : {};
  return {
    motion: p.motion === 'reduced' ? 'reduced' : 'system',
    sidebar: p.sidebar === 'collapsed' ? 'collapsed' : 'expanded',            // V3
    theme: ['light', 'dark'].includes(p.theme) ? p.theme : 'system',          // final
    font: ['large', 'xlarge'].includes(p.font) ? p.font : 'normal',           // final
    ...(isObj(p.onboarding) && ['done', 'skipped'].includes(p.onboarding.status)
      ? { onboarding: { status: p.onboarding.status, at: String(p.onboarding.at || '') } } : {}),
  };
}

/* ---------- Reset ---------- */

export const RESET_SCOPES = {
  progress: 'Progres belajar',
  all: 'Semua data',
};

/**
 * scope: 'progress' | 'all'
 * - progress: bagian, kuis, modul, XP, badge, alat Latihan, riwayat (nama profil tetap)
 * - all     : progres + profil + preferensi + feedback + data Tracker lama
 * Mengembalikan snapshot sebelum reset (untuk Urungkan).
 */
export function resetData(scope) {
  if (!RESET_SCOPES[scope]) throw new Error(`Cakupan reset tidak dikenal: ${scope}`);
  const before = snapshot();
  if (scope === 'progress' || scope === 'all') state.resetProgress({ keepProfile: scope !== 'all' });
  if (scope === 'all') { storage.remove('prefs'); storage.remove('feedback'); storage.remove('tracker'); }
  return before;
}

/* ---------- Salinan data rusak ---------- */

/** Key cadangan otomatis yang dibuat storage.js saat data rusak */
export const listCorruptCopies = () => storage.keys().filter((key) => /:rusak-\d+$/.test(key));

export function removeCorruptCopies() {
  const keys = listCorruptCopies();
  keys.forEach((key) => storage.remove(key));
  return keys.length;
}
