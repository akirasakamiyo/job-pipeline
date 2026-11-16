/* =====================================================================
   feedback-store.js — Feedback peserta per modul (LocalStorage "ujap:feedback")
   ---------------------------------------------------------------------
   Opsional, hanya tersimpan di perangkat ini (tidak dikirim ke mana pun).
   Skema (versi 1):
   {
     version: 1,
     items: {
       [moduleId]: {
         clarity:   'ya' | 'cukup' | 'tidak',   ← Apakah materi mudah dipahami?
         examples:  'ya' | 'cukup' | 'tidak',   ← Apakah contoh membantu?
         exercises: 'ya' | 'cukup' | 'tidak',   ← Apakah latihan sesuai materi?
         improve:   string (≤ 600),             ← Bagian yang perlu diperbaiki
         updatedAt: ISO
       }
     }
   }
   Data yang tidak valid dinormalkan saat dibaca (sama seperti state.js).
   ===================================================================== */

import * as storage from './storage.js';

const KEY = 'feedback';
export const ANSWERS = { ya: 'Ya', cukup: 'Cukup', tidak: 'Tidak' };
export const QUESTIONS = [
  { id: 'clarity', text: 'Apakah materi mudah dipahami?' },
  { id: 'examples', text: 'Apakah contoh membantu?' },
  { id: 'exercises', text: 'Apakah latihan sesuai dengan materi?' },
];
export const IMPROVE_MAX = 600;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function sanitizeItem(raw) {
  if (!isObj(raw)) return null;
  const item = {};
  QUESTIONS.forEach((q) => { item[q.id] = ANSWERS[raw[q.id]] ? raw[q.id] : ''; });
  item.improve = typeof raw.improve === 'string' ? raw.improve.slice(0, IMPROVE_MAX) : '';
  item.updatedAt = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt)) ? raw.updatedAt : new Date().toISOString();
  return QUESTIONS.some((q) => item[q.id]) || item.improve.trim() ? item : null;
}

/** Semua feedback yang valid: { [moduleId]: item } */
export function getAll() {
  const raw = storage.get(KEY, null);
  if (!isObj(raw) || !isObj(raw.items)) return {};
  return Object.fromEntries(Object.entries(raw.items).map(([id, v]) => [id, sanitizeItem(v)]).filter(([, v]) => v));
}

export const get = (moduleId) => getAll()[moduleId] || null;

/** Simpan/ubah feedback satu modul. → item tersimpan atau null bila kosong */
export function save(moduleId, data) {
  const item = sanitizeItem({ ...data, updatedAt: new Date().toISOString() });
  const items = getAll();
  if (item) items[moduleId] = item; else delete items[moduleId];
  storage.set(KEY, { version: 1, items });
  return item;
}

export function remove(moduleId) {
  const items = getAll();
  delete items[moduleId];
  storage.set(KEY, { version: 1, items });
}

export const subscribe = (cb) => storage.subscribe(KEY, cb);
