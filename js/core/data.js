/* =====================================================================
   data.js — Memuat file JSON di folder /data (dengan cache)
   ---------------------------------------------------------------------
   Path relatif ('data/...') agar tetap benar saat situs berada di
   sub-path GitHub Pages (https://user.github.io/nama-repo/).
   ===================================================================== */

const cache = new Map();

/** loadJSON('modules') → isi data/modules.json (dimuat sekali per halaman) */
export function loadJSON(name) {
  if (!cache.has(name)) {
    const request = fetch(`data/${name}.json`)   // cache bawaan browser agar cocok dengan <link rel=preload>
      .then((response) => {
        if (!response.ok) throw new Error(`Gagal memuat data/${name}.json (${response.status})`);
        return response.json();
      })
      .catch((error) => {
        cache.delete(name);              // izinkan mencoba lagi
        throw error;
      });
    cache.set(name, request);
  }
  return cache.get(name);
}
