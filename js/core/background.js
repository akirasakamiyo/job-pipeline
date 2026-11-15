/* =====================================================================
   background.js — Dekorasi latar bertema karier digital
   ---------------------------------------------------------------------
   Menambahkan ilustrasi kecil (amplop, dokumen, laptop, kartu
   portofolio, pesawat kertas, balon chat) ke lapisan .bg-deco yang
   sudah ada di setiap halaman.
   - Diletakkan di tepi layar (di luar area baca), opasitas rendah
   - Mengambang pelan (data-float) + parallax halus (data-parallax),
     dianimasikan oleh motion.js; otomatis diam saat gerak dikurangi
   - aria-hidden & alt kosong: murni dekoratif
   ===================================================================== */

const ITEMS = [
  { name: 'envelope', w: 72, h: 56, float: 12, parallax: 0.12 },
  { name: 'document', w: 56, h: 68, float: 10, parallax: 0.2 },
  { name: 'laptop', w: 84, h: 60, float: 8, parallax: 0.08 },
  { name: 'portfolio', w: 64, h: 60, float: 11, parallax: 0.16 },
  { name: 'plane', w: 64, h: 52, float: 14, parallax: 0.24 },
  { name: 'chat', w: 64, h: 52, float: 9, parallax: 0.1 },
];

export function initBackground() {
  const layer = document.querySelector('.bg-deco');
  if (!layer || layer.dataset.career) return;
  layer.dataset.career = 'true';
  const fragment = document.createDocumentFragment();
  ITEMS.forEach((item) => {
    const img = document.createElement('img');
    img.src = `assets/deco/${item.name}.svg`;
    img.alt = '';
    img.width = item.w;
    img.height = item.h;
    img.decoding = 'async';
    img.loading = 'lazy';
    img.className = `deco deco-career deco-career--${item.name}`;
    img.dataset.float = String(item.float);
    img.dataset.parallax = String(item.parallax);
    fragment.append(img);
  });
  layer.append(fragment);
}
