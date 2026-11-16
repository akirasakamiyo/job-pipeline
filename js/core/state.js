/* =====================================================================
   state.js — Sumber kebenaran progres belajar & gamifikasi
   ---------------------------------------------------------------------
   Semua angka di dashboard DIHITUNG dari data tersimpan (LocalStorage
   key "ujap:progress") + katalog modul (modules.json).
   V4: Job Tracker dihapus dari LMS. Key lama "ujap:tracker" tidak dibaca
   lagi oleh progres/badge (tetap dibiarkan; dikelola di halaman Settings).

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
     goal: { type: 'lesson'|'activity'|'quiz', count } | null ← target belajar (final)
     daily: { date: 'YYYY-MM-DD', lesson, activity, quiz }   ← hitungan HARI INI saja,
                                    dipakai untuk target; tanpa streak & tanpa penalti
     certificate: { id, name, issuedAt } | null             ← sertifikat lokal (final)
     practice: { [toolId]: ISO }            ← V4: latihan tanpa nilai yang pernah
                                    diselesaikan (builder, pilah, tanda tangan) — tanpa XP
     xp: number,
     achievements: { [badgeId]: ISO },      ← badge yang sudah DIBERIKAN
     lastVisited: { module, lesson } | null,
     activity: [{ type, module, lesson, text, at }]   ← maks 30 terbaru
   }

   Setiap field dinormalkan saat dibaca (sanitizeState) sehingga data
   lama, terpotong, atau diedit manual tidak membuat aplikasi rusak.
   ===================================================================== */

import * as storage from './storage.js';
import { loadJSON } from './data.js';

const KEY = 'progress';
const VERSION = 2;
const MAX_ACTIVITY = 30;
const MAX_SUBJECTS = 8;

/** Poin XP per aksi (diberikan sekali per aktivitas) */
export const XP = { lesson: 10, quiz: 50, module: 100, checklist: 20, activity: 15, worksheet: 15, simulator: 40, evaluation: 150 };

/** Target belajar yang bisa dipilih (final enhancement) */
export const GOAL_TYPES = {
  lesson: { label: 'bagian materi', verb: 'Selesaikan' },
  activity: { label: 'latihan interaktif', verb: 'Kerjakan' },
  quiz: { label: 'kuis', verb: 'Kerjakan' },
};

/** Tanggal lokal YYYY-MM-DD (target dihitung per hari kalender perangkat) */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Menambah hitungan harian; hari baru → mulai dari 0 (bukan hukuman, hanya hari baru) */
function bumpDaily(state, kind) {
  if (state.daily.date !== today()) state.daily = { date: today(), lesson: 0, activity: 0, quiz: 0 };
  state.daily[kind] += 1;
}

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

/** CV & Portfolio Review (Practice Center + Modul 2) */
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

/** Checklist persiapan sebelum mengirim lamaran (Practice Center + Modul 4) */
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
  // V4: Job Tracker dihapus → syarat diganti dua aktivitas pengelolaan lamaran di Modul 5 (id badge tetap)
  { id: 'pipeline-manager', main: true, module: 'tr', name: 'Application Pipeline Manager', desc: 'Selesaikan Modul 5 + lulus Application Status Management & Follow-Up Timing Scenario', icon: 'kanban',
    test: (s) => doneOf(s, 'tr') && passed(s, 'tr-status') && passed(s, 'tr-timing') },
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
  // V4: milestone lama (Job Tracker sudah dihapus). Tidak bisa diraih lagi; hanya tampil bila pernah diraih.
  { id: 'tracker-1', retired: true, name: 'Lamaran Pertama', desc: 'Pencapaian dari Job Tracker versi lama', icon: 'briefcase', test: () => false },
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
    goal: null,
    daily: { date: null, lesson: 0, activity: 0, quiz: 0 },
    certificate: null,
    practice: {},
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
    goal: isObj(raw.goal) && GOAL_TYPES[raw.goal.type]
      ? { type: raw.goal.type, count: Math.round(num(raw.goal.count, 1, 10)) || 1 }
      : null,
    daily: isObj(raw.daily) && isStr(raw.daily.date)
      ? { date: raw.daily.date, lesson: Math.round(num(raw.daily.lesson, 0)), activity: Math.round(num(raw.daily.activity, 0)), quiz: Math.round(num(raw.daily.quiz, 0)) }
      : { date: null, lesson: 0, activity: 0, quiz: 0 },
    certificate: isObj(raw.certificate) && isStr(raw.certificate.id) && isoOrNull(raw.certificate.issuedAt)
      ? { id: raw.certificate.id.slice(0, 40), name: isStr(raw.certificate.name) ? raw.certificate.name.slice(0, 60) : '', issuedAt: raw.certificate.issuedAt }
      : null,
    practice: isObj(raw.practice)
      ? Object.fromEntries(Object.entries(raw.practice).filter(([k, v]) => /^[a-z0-9-]{2,40}$/.test(k) && isoOrNull(v)))
      : {},
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

/** Mencatat aktivitas dari fitur lain */
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
    bumpDaily(state, 'lesson');
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
    bumpDaily(state, 'quiz');
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
    bumpDaily(state, 'activity');
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
    bumpDaily(state, 'activity');
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
    bumpDaily(state, 'activity');
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
    bumpDaily(state, 'quiz');
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

/* ---------- Latihan tanpa nilai (V4) ----------
   Builder, latihan memilah, dan Gmail Signature Practice tidak memberi XP.
   Statusnya hanya dicatat sekali (waktu pertama selesai) agar Practice
   Center bisa menampilkan "Selesai" berdasarkan aktivitas nyata.        */
export function markPractice(id, title = 'Latihan') {
  if (!/^[a-z0-9-]{2,40}$/.test(id) || getState().practice[id]) return false;
  save((state) => {
    state.practice[id] = new Date().toISOString();
    log(state, { type: 'practice', text: `Menyelesaikan latihan: ${title}` });
  });
  return true;
}

/* ---------- Target belajar (final enhancement) ---------- */

/** type: kunci GOAL_TYPES atau null (tanpa target); count 1–10 */
export function setGoal(type, count = 1) {
  return save((state) => {
    state.goal = GOAL_TYPES[type] ? { type, count: Math.max(1, Math.min(10, Math.round(count))) } : null;
  });
}

/* ---------- Sertifikat penyelesaian (final enhancement) ---------- */

/** Syarat: kelima modul selesai + Evaluasi Akhir lulus */
export function certificateEligibility(summary = getSummary()) {
  return {
    modulesDone: summary.allDone,
    evaluationPassed: summary.evaluation.passed,
    hasName: Boolean(summary.user.name),
    ok: summary.allDone && summary.evaluation.passed,
  };
}

/** Hash sederhana (FNV-1a) → bagian ID sertifikat lokal; BUKAN tanda tangan kriptografis */
function localHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).toUpperCase().padStart(7, '0');
}

/**
 * Menerbitkan sertifikat lokal sekali (ID & tanggal tetap), atau mengembalikan
 * yang sudah ada. Nama diambil dari profil saat diterbitkan.
 * → certificate | null bila syarat belum terpenuhi
 */
export function issueCertificate() {
  const summary = getSummary();
  const elig = certificateEligibility(summary);
  if (!elig.ok || !elig.hasName) return null;
  const current = getState().certificate;
  if (current && current.name === summary.user.name) return current;
  const issuedAt = current?.issuedAt || new Date().toISOString();
  const id = `UJAP-${issuedAt.slice(0, 10).replace(/-/g, '')}-${localHash(`${summary.user.name}|${issuedAt}`)}`;
  const cert = { id, name: summary.user.name, issuedAt };
  save((state) => { state.certificate = cert; });
  return cert;
}

/* ---------- Rekomendasi belajar (final enhancement) ----------
   Hanya dari state nyata. Urutan prioritas:
   lulus evaluasi → sertifikat · semua modul selesai → evaluasi ·
   modul siap ditutup → tandai selesai · kuis gagal → ulas materi ·
   bagian tersisa → lanjutkan · bagian habis → kuis · baru → mulai      */
export function getRecommendation(s = getSummary()) {
  if (s.allDone && s.evaluation.passed) {
    return { kind: 'certificate', label: 'Tahap akhir', title: 'Semua tuntas — lihat rekap & sertifikatmu', text: `Evaluasi Akhir lulus dengan skor terbaik ${s.evaluation.best}. Unduh sertifikat penyelesaian dan tinjau pencapaianmu.`, href: 'certificate.html', cta: 'Lihat sertifikat', icon: 'trophy' };
  }
  if (s.allDone) {
    return { kind: 'evaluation', label: 'Tahap akhir', title: 'Kelima modul selesai — ikuti Evaluasi Akhir', text: s.evaluation.attempts ? `Skor terbaikmu ${s.evaluation.best}; nilai lulus ${EVALUATION_PASS}. Ulangi evaluasi kapan saja.` : `15 soal skenario lintas modul. Nilai lulus ${EVALUATION_PASS}.`, href: 'evaluation.html', cta: s.evaluation.attempts ? 'Ulangi evaluasi' : 'Mulai evaluasi', icon: 'target' };
  }
  const m = s.current;
  if (m.readyToComplete) {
    return { kind: 'complete', label: `Modul ${m.code}`, title: `${m.title} siap ditandai selesai`, text: 'Semua bagian sudah selesai dan kuis lulus. Tandai modul selesai untuk mendapat XP dan membuka badge.', href: `${m.href}#selesai`, cta: 'Complete Module', icon: 'check' };
  }
  if (m.quizAttempts > 0 && !m.quizPassed) {
    return { kind: 'review', label: `Modul ${m.code}`, title: `Pelajari ulang ${m.title}, lalu ulangi kuis`, text: `Skor kuis terbaikmu ${m.quizBest}; nilai lulus ${passScore}. Baca ringkasan tiap materi dan pembahasan kuis sebelum mencoba lagi.`, href: `${m.href}#selesai`, cta: 'Ulas materi', icon: 'book' };
  }
  if (m.nextLesson) {
    const started = m.lessonsDone > 0 || !s.isNew;
    return { kind: s.isNew ? 'start' : 'continue', label: `Modul ${m.code}`, title: s.isNew ? 'Mulai dari stasiun pertama' : `Lanjutkan: ${m.nextLesson.title}`, text: started ? `${m.lessonsDone}/${m.lessonsTotal} bagian ${m.title} selesai · ±${m.nextLesson.minutes} menit untuk bagian berikutnya.` : `${m.title} · ${m.lessonsTotal} bagian · ±${m.minutes} menit.`, href: `${m.href}#${m.nextLesson.id}`, cta: s.isNew ? 'Mulai belajar' : 'Continue', icon: 'arrow-right' };
  }
  return { kind: 'quiz', label: `Modul ${m.code}`, title: `Semua bagian ${m.title} selesai — kerjakan kuis`, text: `Kuis modul berisi soal pilihan ganda dengan pembahasan. Nilai lulus ${passScore}.`, href: `${m.href}#kuis`, cta: 'Kerjakan kuis', icon: 'target' };
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
    // Pengguna "baru" = belum ada progres belajar (aktivitas Latihan tidak dihitung)
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
    goal: state.goal ? (() => {
      const done = state.daily.date === today() ? state.daily[state.goal.type] : 0;
      return { ...state.goal, ...GOAL_TYPES[state.goal.type], done: Math.min(done, state.goal.count), reached: done >= state.goal.count };
    })() : null,
    certificate: state.certificate,
    evaluation: { best: state.evaluation?.best ?? null, attempts: state.evaluation?.attempts ?? 0, passed: Boolean(state.evaluation?.passedAt) },
    score,
    practice: state.practice,
  };

  // Badge: "earned" bila sudah pernah diberikan (tersimpan) ATAU syarat terpenuhi saat ini
  summary.badges = BADGES.map((b) => {
    const earnedAt = state.achievements[b.id] || null;
    return { ...b, earnedAt, earned: Boolean(earnedAt) || Boolean(b.test(summary)) };
  });
  return summary;
}

/* ---------- Rincian syarat badge utama (V4, halaman Achievements & XP) ----------
   Hanya untuk ditampilkan: syarat yang terpenuhi dihitung dari data nyata.
   Badge tetap diberikan oleh BADGES[].test (sumber kebenaran).           */
const modSteps = (s, id) => {
  const m = s.modules.find((x) => x.id === id);
  if (!m) return [];
  return [
    { label: `Semua bagian selesai (${m.lessonsDone}/${m.lessonsTotal})`, ok: m.lessonsDone === m.lessonsTotal },
    { label: 'Kuis modul lulus', ok: m.quizPassed },
    { label: 'Modul ditandai selesai', ok: m.status === 'done' },
  ];
};
const actStep = (s, id, label) => ({ label: `Lulus ${label}`, ok: passed(s, id) });
const topicStep = (s, mod, ids, label) => ({ label, ok: topicsDone(s, mod, ids) });
const BADGE_STEPS = {
  'id-done': (s) => modSteps(s, 'id'),
  'cv-done': (s) => modSteps(s, 'cv'),
  'li-done': (s) => modSteps(s, 'li'),
  'email-fund': (s) => [topicStep(s, 'tx', ['m1', 'm2', 'm3', 'm4'], 'Materi 1–4 Modul 4 selesai'), actStep(s, 'tx-subject-challenge', 'Subject Challenge'), actStep(s, 'tx-anatomy', 'Email Anatomy Challenge')],
  'email-etiquette': (s) => [topicStep(s, 'tx', ['m5', 'm6'], 'Materi 5–6 Modul 4 selesai'), actStep(s, 'tx-ccbcc', 'CC/BCC Scenario'), actStep(s, 'tx-mistakes', 'Find the Mistakes')],
  'pipeline-manager': (s) => [{ label: 'Modul 5 selesai', ok: doneOf(s, 'tr') }, actStep(s, 'tr-status', 'Application Status Management'), actStep(s, 'tr-timing', 'Follow-Up Timing Scenario')],
  'email-writer': (s) => [{ label: `Skor Email Writing Simulator ≥ 80 (terbaik ${s.simulator.best ?? '—'})`, ok: s.simulator.passed }],
  strategist: (s) => [{ label: 'CV & Portfolio Review lengkap', ok: s.tools.review.complete }, { label: 'Company Research Worksheet selesai', ok: s.worksheetsDone.includes('li-research') }, { label: 'Checklist pra-kirim lengkap', ok: s.tools.presend.everCompleted }],
  communicator: (s) => [{ label: `Kelima kuis modul lulus (${s.modules.filter((m) => m.quizPassed).length}/${s.modules.length})`, ok: s.modules.length > 0 && s.modules.every((m) => m.quizPassed) }, { label: `Evaluasi Akhir ≥ 80 (terbaik ${s.evaluation.best ?? '—'})`, ok: (s.evaluation.best ?? 0) >= 80 }],
  'pipeline-complete': (s) => [{ label: `Kelima modul selesai (${s.completed}/${s.modules.length})`, ok: s.allDone }, { label: 'Evaluasi Akhir lulus', ok: s.evaluation.passed }],
};

/** → [{label, ok}] untuk badge utama; [] untuk milestone */
export function badgeSteps(badgeId, summary = getSummary()) {
  return BADGE_STEPS[badgeId] ? BADGE_STEPS[badgeId](summary) : [];
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

/** Berlangganan perubahan progres (termasuk dari tab lain) */
export function subscribe(callback) {
  const offProgress = storage.subscribe(KEY, () => callback(getSummary()));
  return offProgress;
}
