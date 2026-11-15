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
