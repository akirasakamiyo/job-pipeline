/* =====================================================================
   dom.js — Helper DOM kecil & aman
   ---------------------------------------------------------------------
   PENTING (keamanan): teks dari pengguna SELALU dimasukkan lewat
   textContent (fungsi h / setText), tidak pernah lewat innerHTML,
   untuk mencegah XSS.
   ===================================================================== */

export const ICON_SPRITE = 'assets/icons/sprite.svg';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** querySelector singkat */
export const $ = (selector, root = document) => root.querySelector(selector);

/** querySelectorAll → Array */
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/**
 * Membuat elemen secara aman.
 * h('button', { class: 'btn', type: 'button', onclick: fn }, 'Teks', childEl)
 * - properti "on..." menjadi event listener
 * - properti "dataset" diisi ke data-*
 * - string anak menjadi text node (aman dari HTML injection)
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Ikon dari sprite: icon('check', 'icon--sm') */
export function icon(name, extraClass = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icon ${extraClass}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `${ICON_SPRITE}#i-${name}`);
  svg.append(use);
  return svg;
}

/** Event delegation: on(list, 'click', '.item', (e, item) => {}) */
export function on(root, type, selector, handler, options) {
  root.addEventListener(type, (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  }, options);
}

/** ID unik sederhana (untuk aria-controls, id item tracker, dll.) */
export function uid(prefix = 'id') {
  const rand = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9]/gi, '').slice(0, 10);
  return `${prefix}-${rand}`;
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Menjalankan fungsi setelah jeda diam (untuk input pencarian, resize) */
export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
