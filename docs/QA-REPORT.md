# Laporan QA: Final UX Enhancement

**Tanggal:** 16 November 2026 · **Lingkungan:** Chromium (Playwright) di Linux, server lokal

| Pengujian | Hasil |
|---|---|
| Suite fitur baru (onboarding, rekomendasi, target, feedback, analitik, sertifikat, pengaturan, migrasi, keamanan) | **89 / 89 lulus** |
| Suite regresi V3 (pengguna lama yang sudah melihat panduan; label menu diperbarui) | **187 / 187 lulus** |
| Audit layout + axe WCAG 2.1 AA, 18 halaman/bagian (termasuk `certificate.html`), tema terang, 1440/1024/390 | **0 masalah layout, 0 pelanggaran** (54 kombinasi) |
| Audit yang sama, tema gelap | **0 masalah layout, 0 pelanggaran** (54 kombinasi) setelah perbaikan kontras di bawah |
| axe + overflow untuk keadaan baru (panduan terbuka, target terpasang, semua selesai, form feedback, Progress penuh, sertifikat terbuka) × terang/gelap × 1440/390 | **0 / 28** setelah perbaikan |
| Lighthouse (mode HP, lokal, diukur saat audit lain berjalan) | Accessibility, Best Practices, SEO **100**; CLS **0**; Performance: Dashboard 68, Progress 69, Sertifikat 83 |
| PDF sertifikat | Struktur valid (header, xref, `%%EOF`); `pdftotext` membaca nama, ID, ringkasan hasil, dan disclaimer; dirender benar oleh `pdftoppm` |

### Yang diuji khusus
- **Onboarding:** muncul otomatis hanya untuk pengguna baru. Fitur yang diuji:
  - Next/Previous, indikator "Langkah x dari 3" dan titik, tombol Selesai.
  - Selesai/Lewati/Esc menyimpan status, dan panduan tidak muncul lagi.
  - Bisa diulang lewat tombol "Panduan", `dashboard.html#panduan`, atau Pengaturan.
  - Tidak menimpa dialog profil (`#profil`), dan tidak muncul untuk pengguna lama yang sudah punya progres.
- **Rekomendasi:** tujuh keadaan diuji dengan data nyata: mulai, lanjut, kuis, kuis gagal, siap ditutup, evaluasi, sertifikat. Tombol hero dan kartu samping selalu menuju tujuan berbeda.
- **Target harian:** pasang, ganti, dan hapus target.
  - Hitungan hanya bertambah dari aktivitas yang benar-benar selesai; membuka bagian tidak dihitung.
  - Hari baru mulai dari 0 tanpa catatan gagal, tidak ada streak, dan target tidak memberi XP.
- **Feedback:** form muncul hanya setelah modul selesai, dan form kosong ditolak.
  - Simpan, ubah, hapus (dengan konfirmasi) di halaman Progress.
  - Teks ditampilkan sebagai teks biasa, bukan HTML.
- **Analitik:** skor kuis terbaik, materi selesai, riwayat 14 hari, dan kartu evaluasi sama persis dengan state. Pengguna baru melihat keadaan kosong, bukan angka contoh.
- **Sertifikat:** tetap terkunci bila evaluasi < 75. Bila syarat penuh tetapi nama kosong, halaman meminta nama dulu.
  - ID `UJAP-YYYYMMDD-XXXXXXX` tetap sama setelah dimuat ulang.
  - PDF terunduh dan memuat nama, ID, skor, serta disclaimer. Batasan validasi selalu tampil.
- **Pengaturan:** tema gelap/terang/sistem dan ukuran huruf bertahan di semua halaman (dipasang sebelum render).
  - Cadangan memuat `prefs` dan `feedback`; nilai tidak valid dinormalkan saat dipulihkan.
  - Reset semua menghapus feedback dan preferensi.
- **Migrasi:** data lama tanpa `goal`/`daily`/`certificate` terbaca dengan default aman. Field baru yang rusak dinormalkan tanpa salinan rusak.

### Bug yang ditemukan & diperbaiki
| Bug | Perbaikan |
|---|---|
| `dashboard.html#profil` untuk pengguna baru membuka panduan di atas dialog profil (hash sudah dihapus sebelum panduan memeriksa) | Hash dibaca saat halaman dimuat |
| Mengirim form feedback kosong tetap menulis `ujap:feedback` kosong | Validasi sebelum menyimpan |
| Mode gelap: kode stasiun (ID/CV/…) putih di atas warna modul terang (kontras 1,6–2,2) | Teks gelap di mode gelap |
| Mode gelap: tombol Reset (merah terang + teks putih) | Teks gelap |
| Mode gelap: pil XP & elemen kuning lain mewarisi teks terang (kontras 1,33) | Warna teks `--on-signal` (tinta gelap) di semua elemen berlatar kuning |
| Mode gelap: swatch palet di styleguide ikut berubah sehingga label AA salah | Swatch selalu memakai nilai merek (terang) |
| Baris hasil di PDF terpotong di tengah kata ("badge / utama") | Dua baris tetap |

### Catatan & batasan
- Sertifikat dibuat lokal dan **bukan sertifikasi resmi**. GitHub Pages tidak punya server untuk verifikasi, dan data LocalStorage bisa diubah pemilik perangkat.
- PDF memakai font standar Helvetica: huruf di luar Latin tampil sebagai "?". Halaman memberi peringatan bila nama mengandung huruf tersebut.
- Riwayat 14 hari dihitung dari maksimal 30 entri aktivitas tersimpan.
- Belum diuji: Safari/Firefox, perangkat fisik, pembaca layar langsung, pembuka PDF selain Poppler/Chromium.

---

# Laporan QA: Dashboard V3 + Sidebar Global

**Tanggal:** 15 November 2026 · **Lingkungan:** Chromium (Playwright) di Linux, server lokal

| Pengujian | Hasil |
|---|---|
| Suite fungsional (regresi 2.0 + 30 uji sidebar/drawer + 22 uji dashboard V3) | **187 / 187 lulus**, tanpa error konsol/CSP/HTTP |
| Lighthouse (mode HP, lokal) | Accessibility, Best Practices, SEO **100** di 5 halaman; Performance 72–83; CLS **0** |
| Audit layout 17 halaman/bagian × 6 lebar (1440, 1280, 1024, 768, 390, 360) | **0 masalah**: tanpa scroll horizontal, teks terpotong, target sentuh < 24px, kartu bertabrakan, menu hilang, atau konten tertutup sidebar |
| axe-core WCAG 2.1 AA, 51 kombinasi (17 halaman × 1440/1024/390) | **0 pelanggaran** |

### Yang diuji khusus V3
- **Sidebar desktop:**
  - 7 menu dalam 2 grup dengan tujuan yang benar.
  - Satu menu aktif per halaman, berwarna Signal Yellow; halaman modul mengaktifkan *Learning Modules*.
  - Lebar 264px, konten di kanan sidebar.
  - Ciutkan → 80px, preferensi tersimpan dan bertahan saat pindah halaman.
  - Tooltip hanya muncul di mode ikon.
  - Brand, progres ringkas, dan pintasan profil (membuka dialog profil) berfungsi.
- **Keyboard:** Tab pertama = skip link, lalu fokus masuk ke sidebar dengan outline terlihat.
- **Tablet (1024):** rel ikon 80px; tombol perluas membuka menu penuh sebagai overlay tanpa menggeser konten; Esc menutup.
- **HP (390):**
  - Sidebar tersembunyi dan `inert`.
  - Hamburger membuka drawer dengan backdrop, fokus pindah ke menu, `aria-expanded`, dan scroll latar terkunci.
  - Esc mengembalikan fokus ke hamburger; klik backdrop menutup.
  - Memilih setiap menu (7 menu) menutup drawer dan membuka halamannya.
- **Dashboard:**
  - Fallback HTML 10 badge.
  - Statistik hero dihitung dari data.
  - Dua CTA menuju tujuan berbeda; *Lihat peta belajar* menggulir ke roadmap.
  - Panel progres: selesai, tersisa, dan modul aktif.
  - Roadmap dengan status dan tujuan berikutnya.
  - 7 alat cepat; tujuan dan anchor-nya diverifikasi.
  - Empty state aktivitas dan pintasan "Terakhir dibuka".
  - Resources dengan deskripsi dan label verifikasi.
  - Carousel HP dengan panah dan titik posisi.

### Bug yang ditemukan & diperbaiki saat pengujian V3
| Bug | Perbaikan |
|---|---|
| Sidebar disisipkan sebelum skip link, sehingga Tab pertama tidak lagi "Lewati ke konten utama" | Sidebar diletakkan setelah skip link |
| Tombol × drawer muncul di desktop/tablet (aturan `.btn` menimpa `display: none`) | Spesifisitas dinaikkan; tombol hanya tampil di HP |
| Checklist CV & Portfolio Review meluap 14px di HP 360px (nama file panjang tanpa spasi) | Teks checklist boleh dipatahkan |
| Tracker di 768px: tombol "Tambah lamaran" terpotong, dropdown terlalu sempit | Tata letak satu baris mulai 900px |
| Tabel anatomi email: nomor "10" terpecah di 1280px; label "Kepada" bertanda nomor terlipat | Lebar minimum kolom & ruang label |
| Nama aksesibel logo footer | Nama aksesibel logo footer berbeda dari teks terlihat (WCAG 2.5.3) | `aria-label` diganti teks pembaca layar tambahan | kartu ringkasan Tracker berbeda dari teks terlihat (WCAG 2.5.3) | `aria-label` diganti teks pembaca layar tambahan |
| Kartu badge di kolom sempit sangat tinggi | Grid bawah: alat & badge selebar penuh, aktivitas & resources berdampingan |

### Catatan
- Angka "51 Learning Sections" di brief sudah tidak sesuai data: setelah Pipeline 2.0 jumlahnya **89 bagian**, dan hero menampilkan angka dari data.
- Menu *Achievements* diarahkan ke `progress.html` (koleksi badge + skor) agar tidak ada halaman ganda.
- Belum diuji: Safari/Firefox, perangkat fisik, pembaca layar langsung.

---

# Laporan QA: Pipeline 2.0

**Tanggal:** 15 November 2026
**Lingkungan:** Chromium (Playwright) di Linux, server lokal `python3 -m http.server`
**Cakupan:** kurikulum 2.0 (25 materi, 89 bagian), aktivitas interaktif, simulator, evaluasi akhir, badge & skor, serta regresi seluruh fitur versi 1.

> Semua angka di bawah berasal dari pengujian otomatis yang benar-benar dijalankan. Hal yang **belum** diuji tercantum di bagian akhir.

## Ringkasan

| Pengujian | Hasil |
|---|---|
| Regresi fungsional & data (suite versi 1, diperbarui ke 2.0) | **155 / 155 lulus** |
| Alur baru 2.0 (aktivitas, simulator, evaluasi, badge, tracker follow-up) | **25 / 25 lulus** |
| Semua 89 bagian materi dibuka lewat URL; judulnya cocok | Lulus, tanpa error/peringatan konsol |
| Audit layout: 17 halaman/bagian × 4 lebar (1440, 1024, 768, 390) | **0 masalah** (setelah perbaikan di bawah) |
| axe-core WCAG 2.1 AA: 34 kombinasi halaman/lebar | **0 pelanggaran** |
| Lighthouse (mode HP, server lokal tanpa kompresi) | Accessibility, Best Practices, SEO **100**. Performance: Dashboard 80, Evaluasi 82, Latihan 79, Modul 4 74. CLS **0** |
| CSP & keamanan | Hash skrip boot cocok di semua halaman. Tidak ada `innerHTML`/`eval`. Tidak ada secret |

## Yang diuji di alur 2.0

| Area | Pemeriksaan |
|---|---|
| Kunci jawaban | Kuis dan cek cepat tidak punya `data-correct` atau ikon jawaban sebelum peserta menjawab |
| Studi kasus | Skor 100 tercatat, XP +15 sekali, pembahasan tampil untuk setiap kasus |
| Drag & drop anatomi | Penempatan lewat klik/keyboard; skor 100 bila semua tepat |
| Urutkan | Tombol naik/turun; urutan benar → 100 |
| Find the Mistakes | Semua kesalahan ditemukan → 100; pembahasan per kesalahan |
| ATS keyword | Cakupan 100% tercatat; *keyword stuffing* terdeteksi dan membatasi skor |
| Lembar kerja | Selesai + tersimpan; isian bertahan setelah refresh |
| CV & Portfolio Review | Lengkap → tersimpan, ikut syarat badge *Job Hunting Strategist* |
| Simulator | Email buruk → skor rendah + umpan balik per kriteria; email baik → ≥ 80 + badge; pratinjau langsung; salin draf; draf bertahan setelah refresh |
| Evaluasi Akhir | 15 soal acak; skor 100 → lulus + XP 150 |
| Badge | *Email Fundamentals Master* & *Email Etiquette Specialist* hanya setelah materi + aktivitas terkait selesai; dashboard menampilkan 10 badge utama |
| Tracker | Tanggal follow-up tersimpan; penanda "Waktunya follow-up" muncul saat jatuh tempo |
| Progres | Skor keseluruhan, 13 aktivitas, 10 badge utama + 7 milestone |

## Bug yang ditemukan & diperbaiki

| Bug | Perbaikan |
|---|---|
| Tabel Tracker meluap di lebar 768px setelah kolom Follow-up ditambah | Tampilan kartu dipakai sampai 899px |
| Halaman Latihan meluap 10px di HP (kartu review di dalam grid) | Kolom grid `minmax(0, 1fr)` |
| Tautan modul di halaman Evaluasi hanya 22px | Tinggi minimum 40px |
| Performance Latihan turun ke 68 karena simulator dirender saat halaman dimuat | Simulator dimuat saat mendekati layar → 79 |
| Label kolom simulator terdorong ke kanan | Rata kiri |

## Belum diuji / perlu dicek manual

1. **SmartEmailing tidak diperiksa.** Situsnya diblokir jaringan sesi pengembangan dan akses repo tidak diberikan. Modul 4 dibangun dari brief pemilik proyek.
2. **Tautan eksternal & referensi** masih berlabel "Perlu verifikasi". Judul artikel HBR, Glints, dan JobStreet yang spesifik belum dicantumkan karena tidak bisa diverifikasi.
3. **Browser lain** (Safari, Firefox), **perangkat fisik**, dan **pembaca layar** belum dicoba langsung.
4. **Drag & drop di layar sentuh** memakai mode ketuk-lalu-ketuk; seret dengan jari tidak didukung, sesuai rancangan.
5. **Rubrik simulator** hanya memeriksa hal yang bisa dicek mesin. Kualitas tulisan tetap perlu dinilai manusia.
6. **Kebenaran isi materi** perlu ditinjau ahli/pemilik konten, terutama bagian bertanda "Saran praktis".
