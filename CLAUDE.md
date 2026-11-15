# The Ultimate Job Application Pipeline — konvensi proyek

LMS statis untuk GitHub Pages: HTML5, CSS3, vanilla JS (ES modules), GSAP 3.12.5 (lokal di `vendor/gsap/`), LocalStorage, JSON. Tanpa framework, tanpa build step, tanpa backend.

## Arsitektur
- `js/app.js` adalah satu-satunya entry point. Ia memuat modul halaman dari `<body data-page>`.
- Inti: `js/core/`
  - `storage.js`: semua key memakai awalan `ujap:`; data rusak dikarantina ke `ujap:<key>:rusak-<ts>`.
  - `state.js`: progres, XP, badge, dan `sanitizeState`.
  - `tracker-store.js`, `backup.js`.
  - `navigation.js`, `motion.js`, `ui.js`.
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
- Pertahankan design system: token di `css/tokens.css`, pratinjau di `styleguide.html`.

## Uji
- Jalankan `python3 -m http.server 8000`.
- Uji dengan Playwright: layout di 1440/1024/768/390, axe WCAG 2.1 AA, dan alur fungsional (lihat `docs/QA-REPORT.md`).
- Konsol harus bersih dari error dan pelanggaran CSP.
