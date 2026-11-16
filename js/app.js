/* =====================================================================
   app.js — Titik masuk aplikasi (dipakai SEMUA halaman)
   ---------------------------------------------------------------------
   Urutan boot:
   1. Render navigasi global (V3: sidebar kiri + header HP)
   2. Muat katalog modul & tampilkan progres nyata di sidebar
   3. Sinkronkan achievement (badge baru → notifikasi, di halaman mana pun)
   4. Bangun komponen umum (ring progres)
   5. Muat modul khusus halaman berdasarkan <body data-page="...">
   6. Jalankan sistem animasi
   7. Beri tahu pengguna bila ada data LocalStorage yang rusak & dipulihkan
   ===================================================================== */

import { initNavigation, setNavProgress, setNavUser } from './core/navigation.js';
import { initRings, toast, initTooltips, achievement } from './core/ui.js';
import { initBackground } from './core/background.js';
import * as loader from './core/loader.js';
import * as state from './core/state.js';
import * as storage from './core/storage.js';
import * as motion from './core/motion.js';
import { initAppearance } from './core/prefs.js';

/* Peta halaman → modul. Tambahkan entri baru tiap tahap. */
const PAGES = {
  styleguide: () => import('./pages/styleguide.js'),
  dashboard: () => import('./pages/dashboard.js'),
  modules: () => import('./pages/modules.js'),
  module: () => import('./pages/module-detail.js'),
  practice: () => import('./pages/practice.js'),
  tracker: () => import('./pages/tracker-page.js'),
  resources: () => import('./pages/resources-page.js'),   // Tahap 7 (sebelumnya placeholder)
  progress: () => import('./pages/progress-page.js'),     // Tahap 7 (sebelumnya placeholder)
  evaluation: () => import('./pages/evaluation.js'),      // 2.0: Evaluasi Akhir
  certificate: () => import('./pages/certificate.js'),    // final: sertifikat penyelesaian
};

/* ---------- Notifikasi achievement ----------
   Dipanggil setiap kali data progres/tracker berubah. Badge hanya muncul
   SEKALI, yaitu saat syaratnya pertama kali terpenuhi.                  */
function announceAchievements() {
  // Kartu achievement beranimasi (antrean di ui.js, satu per satu)
  state.syncAchievements().forEach((badge) => setTimeout(() => achievement(badge), 500));
}

function reportCorruption() {
  const reports = storage.takeCorruptionReports();
  if (!reports.length) return;
  toast('Sebagian data tersimpan tidak valid dan sudah dipulihkan. Salinan cadangannya disimpan di browser.', {
    type: 'warning',
    title: 'Data diperbaiki',
    duration: 9000,
  });
  console.warn('[app] laporan data rusak:', reports);
}

async function boot() {
  initAppearance();          // tema & ukuran huruf (final)
  loader.start();
  initNavigation();
  initTooltips();
  initBackground();

  try {
    await state.load();
    announceAchievements();
    state.subscribe(() => announceAchievements());
    // Progres nyata & nama profil di sidebar (kecuali preview design system yang memakai nilai demo)
    setNavUser(state.getState().user);
    state.subscribe((summary) => setNavUser(summary.user));
    if (document.body.dataset.page !== 'styleguide') {
      setNavProgress(state.getSummary().overallPct);
      state.subscribe((summary) => setNavProgress(summary.overallPct));
    }
  } catch (error) {
    console.error('[app] data modul gagal dimuat:', error);
    toast('Data modul gagal dimuat. Pastikan situs dibuka lewat server (bukan file://).', { type: 'error', duration: 0 });
  }

  initRings(document);

  const page = document.body.dataset.page;
  if (PAGES[page]) {
    const module = await PAGES[page]();
    await module.init?.();
  }

  motion.init();
  loader.done();
  reportCorruption();
}

boot().catch((error) => {
  loader.done();
  console.error('[app] gagal memulai:', error);
  // Pastikan konten tetap terlihat walau terjadi error
  document.documentElement.classList.add('motion-fallback');
  document.documentElement.classList.remove('is-entering');
});
