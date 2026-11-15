/* =====================================================================
   state.js — Sumber kebenaran progres belajar & gamifikasi
   ---------------------------------------------------------------------
   Semua angka di dashboard DIHITUNG dari data tersimpan (LocalStorage
   key "ujap:progress" & "ujap:tracker") + katalog modul (modules.json).

   Skema ujap:progress (versi 2):
   {
     version: 2,
     user: { name, status, onboardedAt },
     modules: {
       [moduleId]: {
         lessonsDone: ["id-1", ...],        ← bagian yang selesai
         checklist:   { [itemId]: true },   ← checklist di dalam modul
         quiz:        { best, last, attempts, passedAt } | null,
         completedAt: ISO | null            ← "Mark as completed"
       }
     },
     tools: {
       presend: { [itemId]: true },         ← checklist pra-kirim (Latihan)
       presendCompletedAt: ISO | null,
       subjects: [{ text, at }],            ← riwayat Subject Generator (maks 8)
       review: { [itemId]: true },          ← CV & Portfolio Review (2.0)
       reviewCompletedAt: ISO | null
     },
     activities: { [id]: { best, attempts, passedAt } },   ← aktivitas bernilai (2.0)
     worksheets: { [id]: { values, completedAt } },        ← lembar kerja (2.0)
     simulator: { draft, best, last, attempts, passedAt }, ← Email Writing Simulator (2.0)
     evaluation: { best, last, attempts, passedAt } | null ← Evaluasi akhir (2.0)
     xp: number,
     achievements: { [badgeId]: ISO },      ← badge yang sudah DIBERIKAN
     lastVisited: { module, lesson } | null,
     activity: [{ type, module, lesson, text, at }]   ← maks 30 terbaru
   }

   Setiap field dinormalkan saat dibaca (sanitizeState) sehingga data
   lama, terpotong, atau diedit manual tidak membuat aplikasi rusak.
   ===================================================================== */

import * as storage from './storage.js';
import * as tracker from './tracker-store.js';
import { loadJSON } from './data.js';

const KEY = 'progress';
const VERSION = 2;
const MAX_ACTIVITY = 30;
const MAX_SUBJECTS = 8;

/** Poin XP per aksi (diberikan sekali per aktivitas) */
export const XP = { lesson: 10, quiz: 50, module: 100, checklist: 20, activity: 15, worksheet: 15, simulator: 40, evaluation: 150 };

/** Nilai lulus aktivitas bila blok tidak menentukan sendiri */
export const ACTIVITY_PASS = 70;

/**
 * Aktivitas bernilai di materi (id sama dengan "id" pada blok JSON).
 * Dipakai untuk skor keseluruhan & syarat badge. Tambahkan id di sini
 * bila membuat aktivitas bernilai baru.
 */
export const SCORED_ACTIVITIES = [
  'id-drive-sim', 'cv-structure', 'cv-redflags', 'cv-ats', 'li-hm',
  'tx-subject-challenge', 'tx-anatomy', 'tx-order', 'tx-ccbcc', 'tx-mistakes',
  'tr-status', 'tr-timing', 'tr-best-message',
];

/** CV & Portfolio Review (halaman Latihan + Modul 2) */
export const REVIEW_ITEMS = [
  { id: 'rv-pdf', text: 'CV tersimpan sebagai PDF (atau format yang diminta)', hint: 'Teks bisa diseleksi, bukan hasil foto/scan.' },
  { id: 'rv-name', text: 'Nama file: CV_NamaLengkap_Posisi.pdf', hint: 'Tanpa spasi berlebih atau kata "final".' },
  { id: 'rv-contact', text: 'Kontak di header lengkap dan benar', hint: 'Email karier, nomor aktif, kota, LinkedIn.' },
  { id: 'rv-summary', text: 'Professional Summary ditulis untuk posisi ini', hint: '2–3 kalimat berisi bukti dan keahlian.' },
  { id: 'rv-achieve', text: 'Poin pengalaman berisi pencapaian, bukan sekadar tugas', hint: 'Kata kerja + apa yang dilakukan + hasil.' },
  { id: 'rv-keywords', text: 'Kata kunci lowongan yang kamu kuasai sudah muncul', hint: 'Tanpa keyword stuffing.' },
  { id: 'rv-typo', text: 'Bebas salah ketik (sudah dibaca ulang)', hint: 'Baca keras-keras atau minta teman memeriksa.' },
  { id: 'rv-portfolio', text: 'Portofolio berisi 3–6 karya relevan', hint: 'Dengan deskripsi Masalah → Peran → Proses → Hasil.' },
  { id: 'rv-access', text: 'Tautan portofolio bisa dibuka di jendela incognito', hint: 'Akses: siapa saja dengan link · Pelihat.' },
  { id: 'rv-sync', text: 'CV dan profil LinkedIn konsisten', hint: 'Nama, peran, dan periode pengalaman sama.' },
];

/** Checklist persiapan sebelum mengirim lamaran (halaman Latihan) */
export const PRESEND_ITEMS = [
  { id: 'ps-email', text: 'Email address profesional', hint: 'Format nama asli, khusus karier (Modul 1).' },
  { id: 'ps-pdf', text: 'CV sudah dalam format PDF', hint: 'Kecuali lowongan meminta format lain.' },
  { id: 'ps-filename', text: 'Nama file sudah benar', hint: 'Pola CV_NamaLengkap_Posisi.pdf (Modul 2).' },
  { id: 'ps-size', text: 'Ukuran file sudah sesuai ketentuan', hint: 'Cek batas ukuran di iklan atau portal.' },
  { id: 'ps-portfolio', text: 'Link portfolio bisa diakses', hint: 'Sudah dites di jendela incognito.' },
  { id: 'ps-subject', text: 'Subject email sudah benar', hint: 'Sesuai instruksi lowongan atau formula.' },
  { id: 'ps-company', text: 'Nama perusahaan sudah benar', hint: 'Ejaan sama persis dengan iklan/situs resmi.' },
  { id: 'ps-position', text: 'Posisi yang dilamar sudah benar', hint: 'Sama dengan judul lowongan.' },
  { id: 'ps-attachments', text: 'Seluruh attachment sudah terlampir', hint: 'CV, portofolio, dan dokumen yang diminta.' },
  { id: 'ps-review', text: 'Email sudah diperiksa ulang', hint: 'Baca ulang, atau kirim tes ke diri sendiri.' },
];

let catalog = null;          // isi data/modules.json
let passScore = 70;

/* ---------- Badge (definisi + syarat) ----------
   Syarat hanya terpenuhi oleh aktivitas yang benar-benar diselesaikan.
   Badge modul memerlukan "Mark as completed", yang sendiri mensyaratkan
   semua bagian selesai + kuis lulus.                                   */
export const BADGES = [
  // ----- 10 badge utama (Pipeline 2.0) — semuanya mensyaratkan aktivitas yang benar-benar selesai -----
  { id: 'id-done', main: true, module: 'id', name: 'Digital Identity Ready', desc: 'Selesaikan Modul 1', icon: 'mail', test: (s) => doneOf(s, 'id') },
  { id: 'cv-done', main: true, module: 'cv', name: 'CV Arsenal Complete', desc: 'Selesaikan Modul 2', icon: 'file', test: (s) => doneOf(s, 'cv') },
  { id: 'li-done', main: true, module: 'li', name: 'LinkedIn Navigator', desc: 'Selesaikan Modul 3', icon: 'users', test: (s) => doneOf(s, 'li') },
  { id: 'email-fund', main: true, module: 'tx', name: 'Email Fundamentals Master', desc: 'Selesaikan Materi 1–4 Modul 4 + lulus Subject Challenge & Anatomy Challenge', icon: 'send',
    test: (s) => topicsDone(s, 'tx', ['m1', 'm2', 'm3', 'm4']) && passed(s, 'tx-subject-challenge') && passed(s, 'tx-anatomy') },
  { id: 'email-etiquette', main: true, module: 'tx', name: 'Email Etiquette Specialist', desc: 'Selesaikan Materi 5–6 Modul 4 + lulus CC/BCC Scenario & Find the Mistakes', icon: 'shield',
    test: (s) => topicsDone(s, 'tx', ['m5', 'm6']) && passed(s, 'tx-ccbcc') && passed(s, 'tx-mistakes') },
  { id: 'pipeline-manager', main: true, module: 'tr', name: 'Application Pipeline Manager', desc: 'Selesaikan Modul 5 + catat ≥1 lamaran dengan tanggal follow-up', icon: 'kanban',
    test: (s) => doneOf(s, 'tr') && s.tracker.withFollowUp >= 1 },
  { id: 'email-writer', main: true, name: 'Email Writing Champion', desc: 'Skor rubrik Email Writing Simulator ≥ 80', icon: 'edit', test: (s) => s.simulator.passed },
  { id: 'strategist', main: true, name: 'Job Hunting Strategist', desc: 'Lengkapi CV & Portfolio Review, Company Research Worksheet, dan checklist pra-kirim', icon: 'target',
    test: (s) => s.tools.review.complete && s.worksheetsDone.includes('li-research') && s.tools.presend.everCompleted },
  { id: 'communicator', main: true, name: 'Professional Communicator', desc: 'Lulus kelima kuis modul + Evaluasi Akhir ≥ 80', icon: 'chart',
    test: (s) => s.modules.length > 0 && s.modules.every((m) => m.quizPassed) && (s.evaluation.best ?? 0) >= 80 },
  { id: 'pipeline-complete', main: true, name: 'Application Pipeline Complete', desc: 'Selesaikan kelima modul + lulus Evaluasi Akhir', icon: 'trophy',
    test: (s) => s.allDone && s.evaluation.passed },
  // ----- Milestone (pencapaian kecil; badge versi lama tetap dipertahankan) -----
  { id: 'first-step', name: 'Langkah Pertama', desc: 'Selesaikan 1 bagian materi', icon: 'star', test: (s) => s.lessonsDone >= 1 },
  { id: 'quiz-ace', name: 'Nilai Sempurna', desc: 'Skor 100 di kuis modul', icon: 'target', test: (s) => s.modules.some((m) => m.quizBest === 100) },
  { id: 'presend', name: 'Siap Kirim', desc: 'Lengkapi checklist pra-kirim', icon: 'check', test: (s) => s.tools.presend.done === s.tools.presend.total },
  { id: 'tracker-1', name: 'Lamaran Pertama', desc: 'Catat 1 lamaran di Tracker', icon: 'briefcase', test: (s) => s.tracker.total >= 1 },
  { id: 'tx-done', module: 'tx', name: 'Modul 4 Selesai', desc: 'Selesaikan Modul 4', icon: 'send', test: (s) => doneOf(s, 'tx') },
  { id: 'tr-done', module: 'tr', name: 'Modul 5 Selesai', desc: 'Selesaikan Modul 5', icon: 'kanban', test: (s) => doneOf(s, 'tr') },
  { id: 'master', name: 'Lima Modul Selesai', desc: 'Selesaikan kelima modul', icon: 'flame', test: (s) => s.allDone },
];
const doneOf = (summary, id) => summary.modules.find((m) => m.id === id)?.status === 'done';
const passed = (summary, id) => Boolean(summary.activities[id]?.passedAt);
/** Semua bagian dari materi tertentu (topics di modules.json) sudah selesai */
function topicsDone(summary, moduleId, topicIds) {
  const meta = getModuleMeta(moduleId);
  const ids = (meta?.topics || []).filter((t) => topicIds.includes(t.id)).flatMap((t) => t.lessons);
  return ids.length > 0 && ids.every((id) => summary.lessonSet.has(id));
}

/* ---------- Muat katalog ---------- */

/** Wajib dipanggil sekali saat boot (app.js) sebelum memakai fungsi lain */
export async function load() {
  if (catalog) return catalog;
  const data = await loadJSON('modules');
  catalog = data.modules;
  passScore = data.quizPassScore ?? 70;
  return catalog;
}

export const getCatalog = () => catalog || [];
export const getModuleMeta = (id) => getCatalog().find((m) => m.id === id) || null;
export const getPassScore = () => passScore;

/* ---------- Normalisasi data ---------- */

function emptyState() {
  return {
    version: VERSION,
    user: { name: '', status: '', onboardedAt: null },
    modules: {},
    tools: { presend: {}, presendCompletedAt: null, subjects: [], review: {}, reviewCompletedAt: null },
    activities: {},
    worksheets: {},
    simulator: { draft: {}, best: null, last: null, attempts: 0, passedAt: null },
    evaluation: null,
    xp: 0,
    achievements: {},
    lastVisited: null,
    activity: [],
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isoOrNull = (v) => (isStr(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const num = (v, min = 0, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const trueMap = (v) => (isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, val]) => val === true)) : {});

function sanitizeModule(raw) {
  if (!isObj(raw)) return null;
  const quiz = isObj(raw.quiz) ? {
    best: num(raw.quiz.best, 0, 100),
    last: num(raw.quiz.last, 0, 100),
    attempts: Math.round(num(raw.quiz.attempts, 0)),
    passedAt: isoOrNull(raw.quiz.passedAt),
  } : null;
  return {
    lessonsDone: Array.isArray(raw.lessonsDone) ? [...new Set(raw.lessonsDone.filter(isStr))] : [],
    checklist: trueMap(raw.checklist),
    quiz,
    completedAt: isoOrNull(raw.completedAt),
  };
}

/** { id: { best, attempts, passedAt } } — skor aktivitas */
function sanitizeScores(raw) {
  if (!isObj(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => isObj(v)).map(([id, v]) => [id, {
    best: num(v.best, 0, 100),
    attempts: Math.round(num(v.attempts, 0)),
    passedAt: isoOrNull(v.passedAt),
  }]));
}

/** Memastikan setiap field bertipe benar; field tak dikenal dibuang */
function sanitizeState(raw) {
  const base = emptyState();
  if (!isObj(raw)) return base;

  const modules = {};
  if (isObj(raw.modules)) {
    Object.entries(raw.modules).forEach(([id, value]) => {
      const m = sanitizeModule(value);
      if (m) modules[id] = m;
    });
  }
  const tools = isObj(raw.tools) ? raw.tools : {};
  const achievements = isObj(raw.achievements)
    ? Object.fromEntries(Object.entries(raw.achievements).filter(([, v]) => isoOrNull(v)))
    : null;   // null = data versi lama, belum pernah diinisialisasi

  return {
    version: VERSION,
    user: {
      name: isStr(raw.user?.name) ? raw.user.name.slice(0, 40) : '',
      status: isStr(raw.user?.status) ? raw.user.status : '',
      onboardedAt: isoOrNull(raw.user?.onboardedAt),
    },
    modules,
    tools: {
      presend: trueMap(tools.presend),
      presendCompletedAt: isoOrNull(tools.presendCompletedAt),
      subjects: Array.isArray(tools.subjects)
        ? tools.subjects.filter((s) => isObj(s) && isStr(s.text) && s.text.trim()).map((s) => ({ text: s.text.slice(0, 200), at: isoOrNull(s.at) || new Date().toISOString() })).slice(0, MAX_SUBJECTS)
        : [],
      review: trueMap(tools.review),
      reviewCompletedAt: isoOrNull(tools.reviewCompletedAt),
    },
    activities: sanitizeScores(raw.activities),
    worksheets: isObj(raw.worksheets)
      ? Object.fromEntries(Object.entries(raw.worksheets).filter(([, v]) => isObj(v)).map(([id, v]) => [id, {
        values: isObj(v.values) ? Object.fromEntries(Object.entries(v.values).filter(([, x]) => isStr(x)).map(([k, x]) => [k, x.slice(0, 1000)])) : {},
        completedAt: isoOrNull(v.completedAt),
      }]))
      : {},
    simulator: {
      draft: isObj(raw.simulator?.draft) ? Object.fromEntries(Object.entries(raw.simulator.draft).filter(([, x]) => isStr(x)).map(([k, x]) => [k, x.slice(0, 1500)])) : {},
      best: raw.simulator?.best == null ? null : num(raw.simulator.best, 0, 100),
      last: raw.simulator?.last == null ? null : num(raw.simulator.last, 0, 100),
      attempts: Math.round(num(raw.simulator?.attempts, 0)),
      passedAt: isoOrNull(raw.simulator?.passedAt),
    },
    evaluation: isObj(raw.evaluation) ? {
      best: num(raw.evaluation.best, 0, 100),
      last: num(raw.evaluation.last, 0, 100),
      attempts: Math.round(num(raw.evaluation.attempts, 0)),
      passedAt: isoOrNull(raw.evaluation.passedAt),
    } : null,
    xp: Math.round(num(raw.xp, 0)),
    achievements,
    lastVisited: isObj(raw.lastVisited) && isStr(raw.lastVisited.module)
      ? { module: raw.lastVisited.module, lesson: isStr(raw.lastVisited.lesson) ? raw.lastVisited.lesson : null }
      : null,
    activity: Array.isArray(raw.activity)
      ? raw.activity.filter((a) => isObj(a) && isStr(a.text) && isoOrNull(a.at)).slice(0, MAX_ACTIVITY)
      : [],
  };
}

/** Membaca data progres yang sudah dinormalkan */
export function getState() {
  const state = sanitizeState(storage.get(KEY, null));
  if (state.achievements === null) state.achievements = {};
  return state;
}

function save(mutator) {
  const state = getState();
  mutator(state);
  storage.set(KEY, state);
  return state;
}

function moduleState(state, id) {
  if (!state.modules[id]) state.modules[id] = { lessonsDone: [], checklist: {}, quiz: null, completedAt: null };
  return state.modules[id];
}

function log(state, entry) {
  state.activity.unshift({ ...entry, at: new Date().toISOString() });
  state.activity = state.activity.slice(0, MAX_ACTIVITY);
}

/** Mencatat aktivitas dari fitur lain (mis. Tracker) */
export function logActivity(entry) {
  return save((state) => log(state, entry));
}

/** Syarat modul boleh ditandai selesai: semua bagian + kuis lulus */
export function canComplete(moduleId) {
  const meta = getModuleMeta(moduleId);
  const ms = getState().modules[moduleId] || {};
  if (!meta) return { ok: false, lessonsLeft: [], quizPassed: false };
  const lessonsLeft = meta.lessons.filter((l) => !(ms.lessonsDone || []).includes(l.id));
  const quizPassed = (ms.quiz?.best ?? 0) >= passScore;
  return { ok: lessonsLeft.length === 0 && quizPassed, lessonsLeft, quizPassed };
}

/* ---------- Aksi belajar ---------- */

export function setUser({ name = '', status = '' } = {}) {
  return save((state) => {
    const isNew = !state.user.onboardedAt;
    state.user.name = String(name).trim().slice(0, 40);
    state.user.status = status;
    if (isNew) {
      state.user.onboardedAt = new Date().toISOString();
      log(state, { type: 'start', text: 'Memulai perjalanan di Pipeline' });
    }
  });
}

export function visit(moduleId, lessonId = null) {
  return save((state) => { state.lastVisited = { module: moduleId, lesson: lessonId }; });
}

export function completeLesson(moduleId, lessonId) {
  const meta = getModuleMeta(moduleId);
  const lesson = meta?.lessons.find((l) => l.id === lessonId);
  if (!lesson) return getState();
  return save((state) => {
    const ms = moduleState(state, moduleId);
    if (ms.lessonsDone.includes(lessonId)) return;
    ms.lessonsDone.push(lessonId);
    state.xp += XP.lesson;
    state.lastVisited = { module: moduleId, lesson: lessonId };
    log(state, { type: 'lesson', module: moduleId, lesson: lessonId, text: `Menyelesaikan "${lesson.title}"` });
  });
}

export function recordQuiz(moduleId, score) {
  const meta = getModuleMeta(moduleId);
  if (!meta) return getState();
  const value = Math.max(0, Math.min(100, Math.round(score)));
  return save((state) => {
    const ms = moduleState(state, moduleId);
    const prev = ms.quiz || { best: 0, last: 0, attempts: 0, passedAt: null };
    const firstPass = !prev.passedAt && value >= passScore;
    ms.quiz = {
      best: Math.max(prev.best, value),
      last: value,
      attempts: prev.attempts + 1,
      passedAt: prev.passedAt || (value >= passScore ? new Date().toISOString() : null),
    };
    if (firstPass) state.xp += XP.quiz;   // XP kuis hanya sekali, saat pertama lulus
    log(state, { type: value >= passScore ? 'quiz-pass' : 'quiz', module: moduleId, text: `Kuis ${meta.title}: skor ${value}` });
  });
}

/**
 * "Mark as completed": hanya berhasil bila semua bagian selesai dan kuis
 * lulus. Mengembalikan true bila modul baru saja ditandai selesai.
 */
export function markModuleComplete(moduleId) {
  const meta = getModuleMeta(moduleId);
  if (!meta || !canComplete(moduleId).ok) return false;
  let marked = false;
  save((state) => {
    const ms = moduleState(state, moduleId);
    if (ms.completedAt) return;
    ms.completedAt = new Date().toISOString();
    state.xp += XP.module;
    marked = true;
    log(state, { type: 'module', module: moduleId, text: `Menyelesaikan modul ${meta.title}` });
  });
  return marked;
}

export function setChecklistItem(moduleId, itemId, checked) {
  return save((state) => {
    const ms = moduleState(state, moduleId);
    if (checked) ms.checklist[itemId] = true;
    else delete ms.checklist[itemId];
  });
}

/* ---------- Alat: checklist pra-kirim ---------- */

/**
 * Mengubah satu item. Mengembalikan true bila checklist BARU SAJA lengkap
 * untuk pertama kali (XP diberikan sekali saja).
 */
export function setPresendItem(itemId, checked) {
  if (!PRESEND_ITEMS.some((i) => i.id === itemId)) return false;
  let firstComplete = false;
  save((state) => {
    if (checked) state.tools.presend[itemId] = true;
    else delete state.tools.presend[itemId];
    const allDone = PRESEND_ITEMS.every((i) => state.tools.presend[i.id]);
    if (allDone && !state.tools.presendCompletedAt) {
      state.tools.presendCompletedAt = new Date().toISOString();
      state.xp += XP.checklist;
      firstComplete = true;
      log(state, { type: 'checklist', text: 'Melengkapi checklist pra-kirim lamaran' });
    }
  });
  return firstComplete;
}

export function resetPresend() {
  // presendCompletedAt sengaja dipertahankan: XP tidak diberikan dua kali
  return save((state) => { state.tools.presend = {}; });
}

/* ---------- Alat: riwayat Subject Generator ---------- */

export function addSubject(text) {
  const value = String(text).trim().slice(0, 200);
  if (!value) return getState();
  return save((state) => {
    state.tools.subjects = [{ text: value, at: new Date().toISOString() }, ...state.tools.subjects.filter((s) => s.text !== value)].slice(0, MAX_SUBJECTS);
  });
}

export function removeSubject(text) {
  return save((state) => { state.tools.subjects = state.tools.subjects.filter((s) => s.text !== text); });
}

/* ---------- Aktivitas bernilai (2.0) ---------- */

/**
 * Mencatat skor aktivitas (skenario, pasangkan, urutkan, temukan kesalahan,
 * kata kunci). XP diberikan SEKALI, saat aktivitas pertama kali lulus.
 * → { firstPass, best }
 */
export function recordActivity(id, score, passScore = ACTIVITY_PASS, label = 'Aktivitas') {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  let firstPass = false;
  const next = save((state) => {
    const prev = state.activities[id] || { best: 0, attempts: 0, passedAt: null };
    firstPass = !prev.passedAt && value >= passScore;
    state.activities[id] = {
      best: Math.max(prev.best, value),
      attempts: prev.attempts + 1,
      passedAt: prev.passedAt || (value >= passScore ? new Date().toISOString() : null),
    };
    if (firstPass) {
      state.xp += XP.activity;
      log(state, { type: 'activity', text: `Lulus aktivitas "${label}" (skor ${value})` });
    }
  });
  return { firstPass, best: next.activities[id].best };
}

/* ---------- Lembar kerja (2.0) ---------- */

export function saveWorksheet(id, values) {
  return save((state) => {
    const prev = state.worksheets[id] || { values: {}, completedAt: null };
    state.worksheets[id] = { ...prev, values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v).slice(0, 1000)])) };
  });
}

/** Menandai lembar kerja selesai. → true bila baru pertama kali (XP sekali) */
export function completeWorksheet(id, label = 'Lembar kerja') {
  let first = false;
  save((state) => {
    const prev = state.worksheets[id] || { values: {}, completedAt: null };
    if (prev.completedAt) return;
    state.worksheets[id] = { ...prev, completedAt: new Date().toISOString() };
    state.xp += XP.worksheet;
    first = true;
    log(state, { type: 'activity', text: `Menyelesaikan "${label}"` });
  });
  return first;
}

/* ---------- CV & Portfolio Review (2.0) ---------- */

/** → true bila review BARU SAJA lengkap untuk pertama kali (XP sekali) */
export function setReviewItem(itemId, checked) {
  if (!REVIEW_ITEMS.some((i) => i.id === itemId)) return false;
  let firstComplete = false;
  save((state) => {
    if (checked) state.tools.review[itemId] = true;
    else delete state.tools.review[itemId];
    const allDone = REVIEW_ITEMS.every((i) => state.tools.review[i.id]);
    if (allDone && !state.tools.reviewCompletedAt) {
      state.tools.reviewCompletedAt = new Date().toISOString();
      state.xp += XP.checklist;
      firstComplete = true;
      log(state, { type: 'checklist', text: 'Melengkapi CV & Portfolio Review' });
    }
  });
  return firstComplete;
}

export function resetReview() {
  return save((state) => { state.tools.review = {}; });
}

/* ---------- Email Writing Simulator (2.0) ---------- */

export function saveSimDraft(draft) {
  return save((state) => { state.simulator.draft = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, String(v).slice(0, 1500)])); });
}

/** → { firstPass, best } — XP simulator diberikan sekali saat pertama lulus */
export function recordSimulation(score, passScore = 80) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  let firstPass = false;
  const next = save((state) => {
    const sim = state.simulator;
    firstPass = !sim.passedAt && value >= passScore;
    sim.best = Math.max(sim.best ?? 0, value);
    sim.last = value;
    sim.attempts += 1;
    if (value >= passScore && !sim.passedAt) sim.passedAt = new Date().toISOString();
    if (firstPass) state.xp += XP.simulator;
    log(state, { type: firstPass ? 'activity' : 'quiz', text: `Email Writing Simulator: skor rubrik ${value}` });
  });
  return { firstPass, best: next.simulator.best };
}

/* ---------- Evaluasi akhir (2.0) ---------- */

export const EVALUATION_PASS = 75;

export function recordEvaluation(score) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  let firstPass = false;
  save((state) => {
    const prev = state.evaluation || { best: 0, last: 0, attempts: 0, passedAt: null };
    firstPass = !prev.passedAt && value >= EVALUATION_PASS;
    state.evaluation = {
      best: Math.max(prev.best, value),
      last: value,
      attempts: prev.attempts + 1,
      passedAt: prev.passedAt || (value >= EVALUATION_PASS ? new Date().toISOString() : null),
    };
    if (firstPass) state.xp += XP.evaluation;
    log(state, { type: value >= EVALUATION_PASS ? 'quiz-pass' : 'quiz', text: `Evaluasi Akhir: skor ${value}` });
  });
  return { firstPass };
}

/* ---------- Reset (Tahap 7, halaman Progres) ---------- */

/**
 * Mengosongkan progres belajar, XP, badge, alat Latihan, dan riwayat.
 * keepProfile: nama & status profil tetap disimpan (default).
 * Pemanggil (backup.js) WAJIB mengambil snapshot dulu agar bisa diurungkan.
 */
export function resetProgress({ keepProfile = true } = {}) {
  const current = getState();
  const next = emptyState();
  if (keepProfile) next.user = current.user;
  storage.set(KEY, next);
  return next;
}

/** Menyimpan ulang data progres dalam bentuk yang sudah dinormalkan (dipakai saat impor) */
export function normalizeStored() {
  const raw = storage.get(KEY, null);
  if (raw == null) return getState();
  const clean = sanitizeState(raw);
  if (clean.achievements === null) clean.achievements = {};
  storage.set(KEY, clean);
  return clean;
}

/* ---------- Ringkasan (semua angka dashboard berasal dari sini) ---------- */

export function getSummary(state = getState()) {
  const trackerItems = tracker.getItems();
  const trackerStats = tracker.getStats(trackerItems);

  const modules = getCatalog().map((meta) => {
    const ms = state.modules[meta.id] || {};
    const doneIds = new Set((ms.lessonsDone || []).filter((id) => meta.lessons.some((l) => l.id === id)));
    const lessonsDone = doneIds.size;
    const lessonsTotal = meta.lessons.length;
    const quizBest = ms.quiz?.best ?? null;
    const quizPassed = (quizBest ?? 0) >= passScore;
    const completed = Boolean(ms.completedAt);
    // Langkah: 1 per bagian + 1 kuis lulus + 1 "Mark as completed"
    const stepsDone = lessonsDone + (quizPassed ? 1 : 0) + (completed ? 1 : 0);
    const stepsTotal = lessonsTotal + 2;
    const pct = Math.round((stepsDone / stepsTotal) * 100);
    const touched = stepsDone > 0 || Object.keys(ms.checklist || {}).length > 0 || (ms.quiz?.attempts ?? 0) > 0;
    const status = completed ? 'done' : touched ? 'progress' : 'todo';
    const readyToComplete = !completed && lessonsDone === lessonsTotal && quizPassed;
    const nextLesson = meta.lessons.find((l) => !doneIds.has(l.id)) || null;
    const minutesLeft = meta.lessons.filter((l) => !doneIds.has(l.id)).reduce((sum, l) => sum + l.minutes, 0);
    return {
      ...meta,
      minutes: meta.lessons.reduce((sum, l) => sum + l.minutes, 0),
      minutesLeft,
      lessonsDone,
      lessonsTotal,
      quizBest,
      quizPassed,
      quizAttempts: ms.quiz?.attempts ?? 0,
      stepsDone,
      stepsTotal,
      pct,
      status,
      nextLesson,
      readyToComplete,
      href: `module.html?id=${meta.id}`,
    };
  });

  const completed = modules.filter((m) => m.status === 'done').length;
  const inProgress = modules.filter((m) => m.status === 'progress').length;
  const stepsDone = modules.reduce((sum, m) => sum + m.stepsDone, 0);
  const stepsTotal = modules.reduce((sum, m) => sum + m.stepsTotal, 0);
  const lessonsDone = modules.reduce((sum, m) => sum + m.lessonsDone, 0);
  const lessonsTotal = modules.reduce((sum, m) => sum + m.lessonsTotal, 0);

  // Tujuan "Lanjutkan belajar": modul terakhir dibuka (bila belum selesai)
  // → modul yang sedang berjalan → modul pertama yang belum dimulai
  const last = modules.find((m) => m.id === state.lastVisited?.module && m.status !== 'done');
  const current = last || modules.find((m) => m.status === 'progress') || modules.find((m) => m.status === 'todo') || null;

  let next = null;
  if (current) {
    if (current.nextLesson) next = { type: 'lesson', module: current, lesson: current.nextLesson, href: `${current.href}#${current.nextLesson.id}` };
    else if (!current.quizPassed) next = { type: 'quiz', module: current, lesson: null, href: `${current.href}#kuis` };
    else next = { type: 'complete', module: current, lesson: null, href: `${current.href}#selesai` };
  }

  const presendDone = PRESEND_ITEMS.filter((i) => state.tools.presend[i.id]).length;
  const reviewDone = REVIEW_ITEMS.filter((i) => state.tools.review[i.id]).length;
  const lessonSet = new Set(Object.values(state.modules).flatMap((m) => m.lessonsDone || []));

  // Skor belajar keseluruhan (transparan, ditampilkan rumusnya di halaman Progres):
  // 40% rata-rata kuis modul · 25% evaluasi akhir · 20% rata-rata aktivitas · 15% simulator
  const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
  const quizAvg = avg(modules.map((m) => m.quizBest ?? 0));
  const activityAvg = avg(SCORED_ACTIVITIES.map((id) => state.activities[id]?.best ?? 0));
  const evalBest = state.evaluation?.best ?? 0;
  const simBest = state.simulator.best ?? 0;
  const score = {
    total: Math.round(quizAvg * 0.4 + evalBest * 0.25 + activityAvg * 0.2 + simBest * 0.15),
    parts: [
      { id: 'quiz', label: 'Rata-rata kuis modul', weight: 40, value: Math.round(quizAvg) },
      { id: 'evaluation', label: 'Evaluasi Akhir', weight: 25, value: Math.round(evalBest) },
      { id: 'activities', label: `Rata-rata ${SCORED_ACTIVITIES.length} aktivitas latihan`, weight: 20, value: Math.round(activityAvg) },
      { id: 'simulator', label: 'Email Writing Simulator', weight: 15, value: Math.round(simBest) },
    ],
  };

  const summary = {
    user: state.user,
    xp: state.xp,
    activity: state.activity,
    modules,
    completed,
    inProgress,
    notStarted: modules.length - completed - inProgress,
    stepsDone,
    stepsTotal,
    lessonsDone,
    lessonsTotal,
    overallPct: stepsTotal ? Math.round((stepsDone / stepsTotal) * 100) : 0,
    current,
    next,
    // Pengguna "baru" = belum ada progres belajar (aktivitas Tracker/Latihan tidak dihitung)
    isNew: stepsDone === 0 && !state.activity.some((a) => ['lesson', 'quiz', 'quiz-pass', 'module', 'activity'].includes(a.type)),
    allDone: modules.length > 0 && completed === modules.length,
    tools: {
      presend: { done: presendDone, total: PRESEND_ITEMS.length, pct: Math.round((presendDone / PRESEND_ITEMS.length) * 100), everCompleted: Boolean(state.tools.presendCompletedAt) },
      review: { done: reviewDone, total: REVIEW_ITEMS.length, pct: Math.round((reviewDone / REVIEW_ITEMS.length) * 100), complete: Boolean(state.tools.reviewCompletedAt) },
      subjects: state.tools.subjects,
    },
    lessonSet,
    activities: state.activities,
    activitiesPassed: SCORED_ACTIVITIES.filter((id) => state.activities[id]?.passedAt).length,
    activitiesTotal: SCORED_ACTIVITIES.length,
    worksheetsDone: Object.entries(state.worksheets).filter(([, w]) => w.completedAt).map(([id]) => id),
    simulator: { best: state.simulator.best, attempts: state.simulator.attempts, passed: Boolean(state.simulator.passedAt) },
    evaluation: { best: state.evaluation?.best ?? null, attempts: state.evaluation?.attempts ?? 0, passed: Boolean(state.evaluation?.passedAt) },
    score,
    tracker: trackerStats,
    trackerCount: trackerStats.total,
  };

  // Badge: "earned" bila sudah pernah diberikan (tersimpan) ATAU syarat terpenuhi saat ini
  summary.badges = BADGES.map((b) => {
    const earnedAt = state.achievements[b.id] || null;
    return { ...b, earnedAt, earned: Boolean(earnedAt) || Boolean(b.test(summary)) };
  });
  return summary;
}

/* ---------- Achievement ---------- */

/**
 * Mencocokkan syarat badge dengan data terbaru. Badge yang baru terpenuhi
 * disimpan beserta waktunya, lalu dikembalikan agar app.js menampilkan
 * notifikasi. Data versi lama (belum punya field achievements) diinisialisasi
 * diam-diam tanpa notifikasi.
 */
export function syncAchievements() {
  const raw = storage.get(KEY, null);
  const legacy = !raw || !isObj(raw.achievements);
  const state = getState();
  const summary = getSummary(state);
  const fresh = BADGES.filter((b) => !state.achievements[b.id] && b.test(summary));
  if (!fresh.length && !legacy) return [];
  save((s) => {
    const now = new Date().toISOString();
    fresh.forEach((b) => {
      s.achievements[b.id] = now;
      if (!legacy) log(s, { type: 'badge', text: `Mendapat badge "${b.name}"` });
    });
  });
  return legacy ? [] : fresh;
}

/** Berlangganan perubahan progres & tracker (termasuk dari tab lain) */
export function subscribe(callback) {
  const offProgress = storage.subscribe(KEY, () => callback(getSummary()));
  const offTracker = storage.subscribe('tracker', () => callback(getSummary()));
  return () => { offProgress(); offTracker(); };
}
