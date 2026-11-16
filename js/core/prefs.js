/* =====================================================================
   prefs.js — Preferensi tampilan: tema (terang/gelap/sistem) & ukuran huruf
   ---------------------------------------------------------------------
   Disimpan di ujap:prefs (bersama motion & sidebar). Skrip boot di <head>
   sudah memasang data-theme & data-font sebelum halaman tampil sehingga
   tidak ada kilatan tema; modul ini menangani perubahan dari halaman
   Pengaturan, perubahan tema sistem, dan sinkron antartab.
   ===================================================================== */

import * as storage from './storage.js';

const root = document.documentElement;
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

export const THEMES = { system: 'Ikuti sistem', light: 'Terang', dark: 'Gelap' };
export const FONTS = { normal: 'Normal', large: 'Besar', xlarge: 'Sangat besar' };

export function getPrefs() {
  const p = storage.get('prefs', {}) || {};
  return {
    theme: THEMES[p.theme] ? p.theme : 'system',
    font: FONTS[p.font] ? p.font : 'normal',
  };
}

/** Memasang tema & ukuran huruf ke <html> sesuai preferensi tersimpan */
export function applyAppearance() {
  const { theme, font } = getPrefs();
  const dark = theme === 'dark' || (theme === 'system' && darkQuery.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  if (font === 'normal') delete root.dataset.font; else root.dataset.font = font;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14121F' : '#FBF7F0');
}

export function setPref(key, value) {
  storage.update('prefs', (p) => ({ ...p, [key]: value }), {});
  applyAppearance();
}

/** Dipanggil sekali oleh app.js */
export function initAppearance() {
  applyAppearance();
  darkQuery.addEventListener('change', applyAppearance);          // tema sistem berubah
  storage.subscribe('prefs', applyAppearance);                     // tab lain / impor cadangan
}
