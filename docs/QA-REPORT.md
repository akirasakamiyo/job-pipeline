# Laporan QA — Tahap 7

**Tanggal:** 15 November 2026 · **Lingkungan:** Chromium (Playwright) di Linux, server lokal `python3 -m http.server`
**Cakupan:** semua halaman, fitur, data, keamanan, tampilan, dan simulasi deploy GitHub Pages.

> Semua hasil di bawah berasal dari pengujian otomatis yang benar-benar dijalankan. Hal yang **belum** diuji
> tercantum terpisah di bagian akhir dokumen.

## Ringkasan

| Pengujian | Hasil |
|---|---|
| Uji fungsional & data otomatis | **152 / 152 lulus** |
| Audit layout: 10 halaman × 4 lebar (1440, 1024, 768, 390) | **0 masalah**: tanpa scroll horizontal, teks terpotong, target sentuh < 24px, kartu bertabrakan, atau navigasi hilang |
| axe-core WCAG 2.1 AA, 24 kombinasi halaman/lebar + 404 | **0 pelanggaran nyata**. 1 temuan kontras pada kartu achievement terbaca saat kartu masih memudar masuk; setelah animasi selesai = 0 |
| Lighthouse (mode HP, server lokal tanpa kompresi) | Accessibility **100**, Best Practices **100**, SEO **100** di 6 halaman. Performance 76–86. CLS **0** |
| Error konsol / pelanggaran CSP / HTTP 4xx–5xx | **0** di seluruh skenario |
| Simulasi GitHub Pages (sub-path `/job-pipeline/` + 404) | Semua halaman & aset termuat. Tombol halaman 404 kembali ke `/job-pipeline/dashboard.html` |
| Regresi uji Tahap 2, 5, 6 | Lulus, tanpa error |

## Rincian uji otomatis (152 pemeriksaan)

| Area | Jumlah | Yang diuji |
|---|---|---|
| Halaman | 12 | 10 halaman terbuka dengan judul; `index.html` mengalihkan ke Dashboard; konten tetap tampil bila dibuka via `file://` |
| Navigasi | 21 | 6 menu topbar (URL & `aria-current`); logo; indikator progres; logo footer; skip link; 5 tab bawah di HP; menu "Lainnya" (buka, Esc, 3 tautan) |
| Tautan | 4 | Semua tautan internal membalas 200; 10 tautan eksternal memakai `_blank` + `noopener noreferrer`; 16 aset/data penting ada; 41 ikon ada di sprite |
| Belajar | 16 | 10 bagian tersimpan; XP bagian; progres naik; "Mark as completed" terkunci sampai semua syarat terpenuhi; tidak bisa dobel; 61 rute bagian/kuis/selesai bisa dibuka; id/hash tidak valid ditangani |
| Kuis | 5 | Gagal tanpa XP + pembahasan; retake lulus +50 XP sekali; retake gagal tidak menurunkan skor terbaik |
| Achievement | 4 | Badge hanya setelah syarat terpenuhi; kartu animasi muncul; tidak muncul ulang setelah reload |
| Integrasi | 4 | Dashboard, kartu modul, dan halaman Progres menunjukkan angka yang sama (20%, 1/5, 10/51, 250 XP) |
| Generator | 8 | Validasi, live preview, format, salin ke clipboard, reset, riwayat tersimpan & bisa dihapus |
| Checklist | 7 | Tidak tercentang otomatis; XP hanya di 10/10; tersimpan; reset dengan konfirmasi; tidak ada XP ganda |
| Latihan | 1 | 5 tautan kuis menuju kuis modul |
| Tracker | 16 | Empty state, validasi, Esc, tambah, cari, filter, urut A–Z & tanggal, edit, ringkasan, hapus + urungkan, batas panjang, tampilan kartu di HP |
| Data | 2 | Bertahan setelah refresh; bertahan setelah **browser ditutup lalu dibuka lagi** (profil persisten) |
| Data rusak | 14 | 9 jenis data LocalStorage rusak/tidak valid → semua halaman tetap jalan; notifikasi "Data diperbaiki"; salinan asli dikarantina; salinan bisa dihapus; LocalStorage diblokir → mode memori + peringatan |
| Progres | 4 | Riwayat, 10 badge, 5 kartu modul, unduh cadangan JSON |
| Reset | 6 | Batal → tidak berubah; reset progres (nama & tracker tetap); UI langsung diperbarui; **Urungkan** memulihkan persis; reset tracker; reset semua |
| Impor | 6 | Pratinjau isi sebelum konfirmasi; pemulihan berhasil; 4 jenis file tidak valid ditolak tanpa mengubah data |
| Empty state | 1 | Dashboard kembali ke tampilan pengguna baru setelah reset semua |
| Preferensi | 2 | "Kurangi gerak" tersimpan & berlaku di semua halaman; bisa dikembalikan |
| Resources | 9 | 11 sumber; label verifikasi; filter modul/jenis/gabungan; empty state + hapus filter; pencarian; filter dari URL; tautan https; chip modul |
| Keamanan | 3 | Payload HTML/JS di Generator, Tracker, dan parameter URL tampil sebagai teks (tanpa eksekusi) |
| GSAP | 6 | GSAP & ScrollTrigger termuat dari vendor lokal; **tanpa GSAP** (file diblokir) 5 halaman utama tetap tampil & berfungsi |
| Konsol | 1 | Tidak ada error JS/CSP/HTTP |

## Bug yang ditemukan & diperbaiki di Tahap 7

| Bug | Penyebab | Perbaikan |
|---|---|---|
| Halaman Resources & Progres hanya placeholder; reset progres belum ada | Belum dibangun di tahap sebelumnya | Halaman lengkap + `js/core/backup.js` (cadangan, pemulihan, reset, urungkan) |
| Ring progres di halaman Progres menunjukkan 0% (seharusnya 20%) | `app.js` membangun ring sebelum halaman mengisi nilainya, jadi `initRings` melewatinya | Nilai selalu diatur lewat `setProgress()` |
| Nama aksesibel tidak memuat teks yang terlihat (WCAG 2.5.3) di 4 tempat | `aria-label` berbeda dari teks tombol/tautan | Label disesuaikan; ring dekoratif disembunyikan dari pembaca layar |
| Preferensi "Kurangi gerak" hanya bisa diatur di halaman Design System | Tidak ada pengaturan untuk pengguna | Ditambahkan di Progres → Data & pengaturan |
| URL yang salah menampilkan halaman 404 bawaan GitHub | Tidak ada `404.html` | `404.html` mandiri dengan tautan yang benar di sub-path |

## Belum diuji / perlu dicek manual

1. **Tautan eksternal belum diverifikasi.** Jaringan lingkungan pengembangan memblokir semua situs luar, jadi 10 URL ini belum pernah dibuka:
   - `support.google.com/accounts/answer/185839`
   - `support.google.com/mail/answer/8395`
   - `support.google.com/drive/answer/2494822`
   - `linkedin.com/help/linkedin`
   - `theladders.com`
   - `hbr.org`
   - `business.linkedin.com/talent-solutions`
   - `support.google.com/a/users`
   - `glints.com/id`
   - `id.jobstreet.com`
2. **Browser lain:** hanya Chromium yang diuji. Safari (Mac/iPhone) dan Firefox belum.
3. **Perangkat fisik:** tampilan HP diuji lewat emulasi 390px, bukan di HP sungguhan.
4. **Pembaca layar** (VoiceOver/NVDA) belum dicoba langsung. Yang sudah dijalankan adalah axe-core dan Lighthouse.
5. **Performa di GitHub Pages sungguhan** belum diukur. Skor di atas dari server lokal tanpa kompresi.
6. **Kebenaran isi materi:** konten ditulis dari praktik umum. Bagian bertanda "Perlu verifikasi" perlu ditinjau ahli/pemilik konten.
