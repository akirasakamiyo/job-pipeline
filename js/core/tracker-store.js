/* =====================================================================
   tracker-store.js — Data Job Application Tracker (LocalStorage "ujap:tracker")
   ---------------------------------------------------------------------
   Skema (versi 1):
   {
     version: 1,
     items: [{
       id, company, position, date (YYYY-MM-DD), status,
       contact, followUp (YYYY-MM-DD | ''), notes, createdAt (ISO), updatedAt (ISO)
     }]
   }
   Setiap item divalidasi saat dibaca. Entri yang tidak valid disalin ke
   key cadangan lalu dilewati, sehingga satu entri rusak tidak membuat
   seluruh tracker gagal dimuat.
   ===================================================================== */

import * as storage from './storage.js';
import { uid } from './dom.js';

const KEY = 'tracker';
const VERSION = 1;

/** Status sesuai urutan alur lamaran */
export const STATUSES = ['Applied', 'Under Review', 'Interview', 'Accepted', 'Rejected'];

/** Keterangan singkat status (Bahasa Indonesia) */
export const STATUS_INFO = {
  'Applied': { label: 'Applied', hint: 'Lamaran terkirim', tone: 'cobalt' },
  'Under Review': { label: 'Under Review', hint: 'Sedang ditinjau', tone: 'warn' },
  'Interview': { label: 'Interview', hint: 'Diundang wawancara/tes', tone: 'teal' },
  'Accepted': { label: 'Accepted', hint: 'Diterima / mendapat tawaran', tone: 'done' },
  'Rejected': { label: 'Rejected', hint: 'Proses berhenti', tone: 'danger' },
};

export const LIMITS = { company: 80, position: 80, contact: 120, notes: 500 };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (value) => DATE_RE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanNotes = (value) => String(value ?? '').trim().slice(0, LIMITS.notes);

/** Mengubah objek mentah menjadi item valid, atau null bila tidak bisa diperbaiki */
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const company = clean(raw.company, LIMITS.company);
  const position = clean(raw.position, LIMITS.position);
  if (!company || !position) return null;
  const now = new Date().toISOString();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('app'),
    company,
    position,
    date: isValidDate(raw.date) ? raw.date : '',
    status: STATUSES.includes(raw.status) ? raw.status : 'Applied',
    contact: clean(raw.contact, LIMITS.contact),
    followUp: isValidDate(raw.followUp) ? raw.followUp : '',   // 2.0: tanggal follow-up (opsional)
    notes: cleanNotes(raw.notes),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  };
}

/** Membaca seluruh item (sudah divalidasi) */
export function getItems() {
  const data = storage.get(KEY, null);
  if (data == null) return [];
  const rawItems = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : null;
  if (!rawItems) {
    storage.reportInvalid(KEY, 'Format tracker tidak dikenali; tracker dikosongkan.');
    storage.set(`${KEY}:rusak-${Date.now()}`, data);
    storage.set(KEY, { version: VERSION, items: [] });
    return [];
  }
  const items = [];
  const rejected = [];
  const seen = new Set();
  rawItems.forEach((raw) => {
    const item = sanitize(raw);
    if (!item) { rejected.push(raw); return; }
    if (seen.has(item.id)) item.id = uid('app');   // id ganda diperbaiki
    seen.add(item.id);
    items.push(item);
  });
  if (rejected.length) {
    storage.set(`${KEY}:rusak-${Date.now()}`, rejected);
    storage.reportInvalid(KEY, `${rejected.length} entri tracker tidak valid dipindahkan ke cadangan.`);
    storage.set(KEY, { version: VERSION, items });
  }
  return items;
}

function saveItems(items) {
  storage.set(KEY, { version: VERSION, items });
}

export function addItem(data) {
  const item = sanitize({ ...data, id: uid('app'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (!item) throw new Error('Nama perusahaan dan posisi wajib diisi.');
  saveItems([item, ...getItems()]);
  return item;
}

export function updateItem(id, data) {
  const items = getItems();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) throw new Error('Lamaran tidak ditemukan.');
  const before = { ...items[index] };
  const updated = sanitize({ ...before, ...data, id, createdAt: before.createdAt, updatedAt: new Date().toISOString() });
  if (!updated) throw new Error('Nama perusahaan dan posisi wajib diisi.');
  items[index] = updated;
  saveItems(items);
  return { before, after: updated };
}

/** Menghapus item; mengembalikan { item, index } untuk fitur Urungkan */
export function removeItem(id) {
  const items = getItems();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return null;
  const [item] = items.splice(index, 1);
  saveItems(items);
  return { item, index };
}

export function restoreItem({ item, index }) {
  const items = getItems().filter((i) => i.id !== item.id);
  items.splice(Math.min(index, items.length), 0, item);
  saveItems(items);
}

/** Ringkasan untuk dashboard & halaman tracker */
export function getStats(items = getItems()) {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  items.forEach((i) => { byStatus[i.status] += 1; });
  const total = items.length;
  const responded = total - byStatus.Applied;
  return {
    total,
    byStatus,
    active: byStatus.Applied + byStatus['Under Review'] + byStatus.Interview,
    responseRate: total ? Math.round((responded / total) * 100) : 0,
    withFollowUp: items.filter((i) => i.followUp).length,
    // Follow-up jatuh tempo: tanggal sudah tiba & lamaran masih aktif
    followUpDue: items.filter((i) => i.followUp && i.followUp <= todayISO() && ['Applied', 'Under Review', 'Interview'].includes(i.status)).length,
  };
}
