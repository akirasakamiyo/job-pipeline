# The Ultimate Job Application Pipeline — konvensi proyek

LMS statis untuk GitHub Pages: HTML5, CSS3, vanilla JS (ES modules), GSAP 3.12.5 (lokal di `vendor/gsap/`), LocalStorage, JSON. Tanpa framework, tanpa build step, tanpa backend.

## Arsitektur
- `js/app.js` adalah satu-satunya entry point. Ia memuat modul halaman dari `<body data-page>`.
- Inti: `js/core/`
  - `storage.js`: semua key memakai awalan `ujap:`; data rusak dikarantina ke `ujap:<key>:rusak-<ts>`.
  - `state.js`: progres, XP, badge, dan `sanitizeState`. Juga `goal`/`daily` (target harian tanpa streak), `certificate` (ID lokal), `getRecommendation()`.
  - `backup.js` (cadangan berisi `progress`, `prefs`, `feedback`, plus `tracker` lama bila masih ada). Job Tracker dihapus di V4: jangan menambah UI/kode Tracker lagi; key lama `ujap:tracker` hanya dikelola di Settings (unduh/hapus atas persetujuan pengguna).
  - `feedback-store.js`: feedback modul di `ujap:feedback` (opsional, lokal).
  - `prefs.js`: tema (`light`/`dark`/`system`) & ukuran huruf di `ujap:prefs`; dipasang lebih dulu oleh skrip boot (`data-theme`, `data-font`). Status panduan di `ujap:prefs.onboarding`.
  - `navigation.js`: sidebar kiri global, dirender ke placeholder `[data-topbar]` di setiap halaman. Menu V4 (8 menu, 5 grup, ikon Lucide) diatur di `NAV_GROUPS`; halaman turunan dipetakan di `PAGE_TO_NAV`. Lebar dan mode diatur CSS (`.appnav` di `layout.css`): ≥1200 penuh/ciut, 768–1199 ikon + overlay, <768 drawer. Preferensi ciut ada di `ujap:prefs.sidebar` dan dipasang oleh skrip boot `<head>` (`data-nav-pref`).
  - `motion.js`, `ui.js` (termasuk `initTabs` untuk tab aksesibel).
- V4: satu halaman = satu fungsi. Dashboard hanya pusat kendali ringkas (muat satu layar di 1440×900); detail ada di halaman masing-masing: `modules`, `module` (tanpa hash = detail, dengan hash = lesson player 100dvh), `practice` + `practice-tool`, `evaluation` + `quiz`, `progress`, `achievements`, `certificate`, `resources`, `settings`.
- Lesson player (`js/pages/module-detail.js`): bagian panjang dipecah otomatis per kelompok blok (`paginate()`); jangan meringkas teks materi agar muat. Bar Sebelumnya/Berikutnya harus selalu terlihat tanpa scroll halaman. Fullscreen API hanya lewat klik.
- Practice Center: daftar latihan di `js/features/practice-catalog.js` merujuk blok materi (`section` + `blockId`); jangan menyalin soal. Latihan tanpa nilai dicatat lewat `state.markPractice` (tanpa XP).
- Materi berbasis data:
  - Daftar bagian dan pengelompokan materi (`topics`): `data/modules.json`.
  - Aktivitas interaktif: `js/features/activities.js`. Simulator: `js/features/simulator.js` + `data/simulator.json`. Evaluasi akhir: `data/evaluation.json`.
  - Isi per modul: `data/content/<id>.json`, dirender oleh `js/features/lesson-renderer.js` (lihat daftar tipe blok di file itu).
- Path selalu relatif, supaya situs jalan di sub-path GitHub Pages.

## Aturan
- Respons dan teks UI dalam Bahasa Indonesia. Istilah industri boleh bahasa Inggris, beri penjelasan.
- Teks pengguna dirender lewat `textContent` (`h()` di `dom.js`). Tidak boleh `innerHTML` atau `eval`.
- Setiap HTML punya CSP dengan hash skrip boot inline. Kalau skrip itu diubah, perbarui hash di semua halaman (perintahnya di README).
- **Jangan mengganti id bagian** (`id-1`, `cv-3`, …) atau id badge, karena progres pengguna terikat ke id tersebut. Field baru di LocalStorage harus opsional.
- Jangan ada API key atau secret di frontend.
- Referensi tidak boleh dikarang. Yang belum dicek diberi `verified:false` atau blok `verify`, sehingga tampil label "Perlu verifikasi".
- XP dan badge hanya diberikan setelah aktivitas benar-benar selesai. Checklist tidak boleh tercentang otomatis.
- Kunci jawaban (kuis, cek cepat, aktivitas) tidak boleh ditulis ke DOM sebelum peserta menjawab.
- Aktivitas bernilai baru: daftarkan id di `SCORED_ACTIVITIES` (state.js) dan `ACTIVITY_INFO` (progress-page.js).
- Pertahankan design system: token di `css/tokens.css`, pratinjau di `styleguide.html`. Warna baru wajib punya nilai mode gelap (`html[data-theme="dark"]`); teks di atas kuning pakai `--on-signal`, latar gelap bertulisan putih pakai `--inverse`.
- Sertifikat bukan sertifikasi resmi: jangan menambah klaim verifikasi/akreditasi.

## Uji
- Jalankan `python3 -m http.server 8000`.
- Halaman baru: salin `<head>` (CSP + skrip boot dengan hash yang sama) dari halaman yang ada.
- Uji dengan Playwright: layout di 1440/1024/768/390, axe WCAG 2.1 AA, dan alur fungsional (lihat `docs/QA-REPORT.md`).
- Konsol harus bersih dari error dan pelanggaran CSP.
