/* =====================================================================
   loader.js — Bar loading tipis di atas layar (umpan balik nyata)
   ---------------------------------------------------------------------
   Muncul saat aplikasi memuat data halaman dan saat berpindah halaman.
   Bukan animasi palsu: start() dipanggil sebelum proses, done() sesudah.
   Tanpa dependensi agar bisa dipakai modul mana pun.
   ===================================================================== */

let bar = null;
let trickle = null;
let value = 0;

function ensure() {
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'loadbar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Memuat halaman');
    bar.setAttribute('aria-hidden', 'true');
    document.body.append(bar);
  }
  return bar;
}

function set(n) {
  value = Math.max(value, Math.min(n, 0.98));
  ensure().style.setProperty('--load', value);
}

/** Mulai memuat: bar maju perlahan sampai done() dipanggil */
export function start() {
  const el = ensure();
  clearInterval(trickle);
  value = 0;
  el.classList.remove('is-done');
  el.classList.add('is-active');
  set(0.12);
  // Maju makin lambat (tidak pernah mencapai 100% sebelum benar-benar selesai)
  trickle = setInterval(() => set(value + (1 - value) * 0.08), 180);
}

/** Selesai: penuhi bar lalu sembunyikan */
export function done() {
  if (!bar) return;
  clearInterval(trickle);
  bar.style.setProperty('--load', 1);
  bar.classList.add('is-done');
  setTimeout(() => {
    bar.classList.remove('is-active', 'is-done');
    value = 0;
    bar.style.setProperty('--load', 0);
  }, 450);
}
