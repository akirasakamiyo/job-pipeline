/* =====================================================================
   storage.js — Pembungkus LocalStorage yang aman
   ---------------------------------------------------------------------
   - Semua key diberi awalan "ujap:" agar tidak bentrok dengan situs lain
     di domain github.io yang sama.
   - Jika LocalStorage diblokir/penuh (mode private, kuota habis),
     aplikasi tetap berjalan memakai memori sementara.
   - subscribe() memberi tahu perubahan, termasuk dari tab lain.
   Skema data per fitur (progress, tracker) akan ditambahkan di tahap
   berikutnya di atas modul ini.
   ===================================================================== */

const NAMESPACE = 'ujap:';
const memory = new Map();          // cadangan bila LocalStorage tidak tersedia
const bus = new EventTarget();     // notifikasi perubahan dalam tab yang sama

let available = (() => {
  try {
    const probe = `${NAMESPACE}__probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
})();

/** true bila data benar-benar tersimpan permanen di browser */
export const isPersistent = () => available;

/* ---------- Penanganan data rusak ----------
   Bila isi sebuah key bukan JSON valid (diedit manual, terpotong, dsb.),
   isinya TIDAK dibuang begitu saja: disalin ke "ujap:<key>:rusak-<waktu>"
   sebagai cadangan, key utama dikosongkan, lalu dilaporkan ke app.js
   agar pengguna diberi tahu sekali.                                    */
const corruptionReports = [];

function quarantine(key, raw) {
  const backupKey = `${NAMESPACE}${key}:rusak-${Date.now()}`;
  try {
    if (available) {
      localStorage.setItem(backupKey, raw);
      localStorage.removeItem(NAMESPACE + key);
    } else {
      memory.delete(key);
    }
  } catch { /* abaikan: setidaknya aplikasi tetap berjalan */ }
  corruptionReports.push({ key, backupKey, at: new Date().toISOString() });
  console.warn(`[storage] data "${key}" rusak; cadangan disimpan di ${backupKey}`);
}

/** Laporan data rusak yang belum ditampilkan (dikosongkan setelah dibaca) */
export function takeCorruptionReports() {
  return corruptionReports.splice(0, corruptionReports.length);
}

/** Dipakai modul lain bila struktur JSON valid tetapi isinya tidak masuk akal */
export function reportInvalid(key, detail) {
  corruptionReports.push({ key, detail, at: new Date().toISOString() });
}

/** Membaca nilai JSON; mengembalikan fallback bila kosong/rusak */
export function get(key, fallback = null) {
  let raw = null;
  try {
    raw = available ? localStorage.getItem(NAMESPACE + key) : memory.get(key);
  } catch {
    return fallback;
  }
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    quarantine(key, raw);
    return fallback;
  }
}

/** Menyimpan nilai (otomatis JSON). Mengembalikan true bila tersimpan permanen. */
export function set(key, value) {
  const raw = JSON.stringify(value);
  let persisted = false;
  if (available) {
    try {
      localStorage.setItem(NAMESPACE + key, raw);
      persisted = true;
    } catch (error) {
      // Kuota penuh / diblokir: turun ke memori agar aplikasi tidak macet
      console.warn('[storage] gagal menyimpan, memakai memori sementara:', error);
      available = false;
    }
  }
  if (!persisted) memory.set(key, raw);
  bus.dispatchEvent(new CustomEvent('change', { detail: { key, value } }));
  return persisted;
}

/** Ubah sebagian data: update('prefs', p => ({ ...p, motion: 'reduced' }), {}) */
export function update(key, updater, fallback = {}) {
  const current = get(key, fallback);
  const next = updater(structuredClone(current));
  set(key, next);
  return next;
}

export function remove(key) {
  try { if (available) localStorage.removeItem(NAMESPACE + key); } catch { /* abaikan */ }
  memory.delete(key);
  bus.dispatchEvent(new CustomEvent('change', { detail: { key, value: null } }));
}

/**
 * Daftar key milik aplikasi ini (tanpa awalan "ujap:"). Tahap 7: dipakai
 * halaman Progres untuk menemukan salinan data rusak ("…:rusak-<waktu>").
 */
export function keys() {
  if (!available) return [...memory.keys()];
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(NAMESPACE)) out.push(key.slice(NAMESPACE.length));
    }
  } catch { /* abaikan */ }
  return out;
}

/**
 * Berlangganan perubahan sebuah key (tab ini maupun tab lain).
 * Mengembalikan fungsi untuk berhenti berlangganan.
 */
export function subscribe(key, callback) {
  const local = (event) => { if (event.detail.key === key) callback(event.detail.value); };
  const crossTab = (event) => {
    if (event.key !== NAMESPACE + key) return;
    let value = null;
    try { value = event.newValue ? JSON.parse(event.newValue) : null; } catch { value = null; }
    callback(value);
  };
  bus.addEventListener('change', local);
  window.addEventListener('storage', crossTab);
  return () => {
    bus.removeEventListener('change', local);
    window.removeEventListener('storage', crossTab);
  };
}
