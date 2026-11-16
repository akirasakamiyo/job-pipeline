/* =====================================================================
   features/practice-catalog.js — Katalog Practice Center (V4)
   ---------------------------------------------------------------------
   Satu sumber untuk: direktori practice.html, workspace
   practice-tool.html?id=…, dan status selesai.
   Setiap latihan MEMAKAI ULANG blok yang sama dengan materi
   (data/content/<modul>.json → section → block id/type), sehingga soal
   tidak diduplikasi dan hasil tercatat sekali di state yang sama
   (XP tidak dobel karena state.recordActivity memberi XP sekali per id).

   source:
     { section, blockId }   → blok dengan id tersebut di bagian materi
     { section, type }      → blok pertama bertipe itu (review, presend)
     { generator: true }    → Email Subject Generator (practice-tools.js)

   status(summary) → { state: 'done'|'tried'|'todo'|'free', text }
   ===================================================================== */

const scored = (id) => (s) => {
  const r = s.activities[id];
  if (r?.passedAt) return { state: 'done', text: `Lulus · terbaik ${r.best}` };
  if (r) return { state: 'tried', text: `Dicoba · terbaik ${r.best}` };
  return { state: 'todo', text: 'Bernilai · belum dicoba' };
};
const practiced = (id) => (s) => (s.practice?.[id] ? { state: 'done', text: 'Selesai · tanpa XP' } : { state: 'free', text: 'Tanpa nilai · tanpa XP' });
const worksheet = (id) => (s) => (s.worksheetsDone.includes(id) ? { state: 'done', text: 'Selesai' } : { state: 'todo', text: 'Lembar kerja · belum selesai' });

export const PRACTICE_GROUPS = [
  { module: 'id', title: 'Digital Identity Practice', items: [
    { id: 'id-emailcheck', title: 'Professional Email Checker', desc: 'Cek apakah alamat email sudah profesional dan mudah dibaca HRD.', icon: 'mail', source: { section: 'id-12', blockId: 'id-emailcheck' }, status: practiced('id-emailcheck') },
    { id: 'id-signature', title: 'Gmail Signature Practice', desc: 'Susun tanda tangan email 3–5 baris lengkap dengan pratinjau.', icon: 'edit', source: { section: 'id-4', blockId: 'id-signature' }, status: practiced('id-signature') },
    { id: 'id-drive-sim', title: 'Google Drive Permission Simulation', desc: 'Pilih izin berbagi yang tepat untuk CV dan portofolio.', icon: 'folder', source: { section: 'id-15', blockId: 'id-drive-sim' }, status: scored('id-drive-sim') },
    { id: 'id-emails', title: 'Pilah Alamat Email', desc: 'Tentukan alamat email yang layak dan yang perlu dihindari.', icon: 'check', source: { section: 'id-10', blockId: 'id-emails' }, status: practiced('id-emails') },
  ] },
  { module: 'cv', title: 'CV & Portfolio Practice', items: [
    { id: 'cv-structure', title: 'CV Structure Review', desc: 'Urutkan bagian CV fresh graduate dari atas ke bawah.', icon: 'file', source: { section: 'cv-13', blockId: 'cv-structure' }, status: scored('cv-structure') },
    { id: 'cv-redflags', title: 'CV Red Flags Challenge', desc: 'Temukan red flag yang membuat CV dilewati.', icon: 'alert', source: { section: 'cv-14', blockId: 'cv-redflags' }, status: scored('cv-redflags') },
    { id: 'cv-ats', title: 'ATS Keyword Matching', desc: 'Cocokkan kata kunci lowongan dengan isi CV tanpa keyword stuffing.', icon: 'search', source: { section: 'cv-17', blockId: 'cv-ats' }, status: scored('cv-ats') },
    { id: 'cv-review', title: 'Portfolio Review Checklist', desc: 'Checklist CV & portofolio sebelum dikirim.', icon: 'check', source: { section: 'cv-19', type: 'review' }, status: (s) => (s.tools.review.complete ? { state: 'done', text: 'Lengkap' } : { state: s.tools.review.done ? 'tried' : 'todo', text: `${s.tools.review.done}/${s.tools.review.total} butir` }) },
    { id: 'cv-filename', title: 'CV File Name Builder', desc: 'Susun nama file CV yang rapi dan mudah dicari.', icon: 'wand', source: { section: 'cv-10', blockId: 'cv-filename' }, status: practiced('cv-filename') },
    { id: 'cv-bullets', title: 'Pilah Poin Pengalaman', desc: 'Bedakan poin pengalaman yang kuat dan yang lemah.', icon: 'check', source: { section: 'cv-10', blockId: 'cv-bullets' }, status: practiced('cv-bullets') },
  ] },
  { module: 'li', title: 'LinkedIn & Networking Practice', items: [
    { id: 'li-headline', title: 'LinkedIn Headline Builder', desc: 'Susun headline LinkedIn dengan formula yang jelas.', icon: 'wand', source: { section: 'li-10', blockId: 'li-headline' }, status: practiced('li-headline') },
    { id: 'li-research', title: 'Company Research Activity', desc: 'Lembar riset perusahaan sebelum melamar atau menghubungi.', icon: 'search', source: { section: 'li-13', blockId: 'li-research' }, status: worksheet('li-research') },
    { id: 'li-outreach', title: 'Warm Outreach Message Generator', desc: 'Tulis catatan koneksi yang hangat dan spesifik.', icon: 'send', source: { section: 'li-16', blockId: 'li-outreach' }, status: practiced('li-outreach') },
    { id: 'li-hm', title: 'Identify the Hiring Manager', desc: 'Tentukan siapa yang paling tepat dihubungi.', icon: 'users', source: { section: 'li-15', blockId: 'li-hm' }, status: scored('li-hm') },
    { id: 'li-notes', title: 'Pilah Pesan Networking', desc: 'Bedakan pesan yang hangat dan yang dingin.', icon: 'check', source: { section: 'li-10', blockId: 'li-notes' }, status: practiced('li-notes') },
  ] },
  { module: 'tx', title: 'Email Practice', items: [
    { id: 'subject-generator', title: 'Email Subject Generator', desc: 'Buat subjek [Posisi] - [Nama Lengkap] - [Keahlian] + riwayat.', icon: 'wand', source: { generator: true }, status: practiced('subject-generator') },
    { id: 'tx-anatomy', title: 'Email Anatomy Challenge', desc: 'Pasangkan bagian email lamaran dengan fungsinya.', icon: 'mail', source: { section: 'tx-14', blockId: 'tx-anatomy' }, status: scored('tx-anatomy') },
    { id: 'tx-mistakes', title: 'Find the Mistakes', desc: 'Temukan kesalahan di contoh email lamaran.', icon: 'search', source: { section: 'tx-21', blockId: 'tx-mistakes' }, status: scored('tx-mistakes') },
    { id: 'tx-ccbcc', title: 'CC/BCC Scenario', desc: 'Pilih To, CC, atau BCC untuk setiap situasi.', icon: 'users', source: { section: 'tx-18', blockId: 'tx-ccbcc' }, status: scored('tx-ccbcc') },
    { id: 'tx-order', title: 'Email Ordering Challenge', desc: 'Susun urutan bagian email lamaran.', icon: 'route', source: { section: 'tx-15', blockId: 'tx-order' }, status: scored('tx-order') },
    { id: 'tx-sim', title: 'Email Writing Simulator', desc: 'Tulis email lamaran lengkap dan nilai dengan rubrik.', icon: 'edit', source: { section: 'tx-22', blockId: 'tx-sim' }, status: (s) => (s.simulator.passed ? { state: 'done', text: `Lulus · terbaik ${s.simulator.best}` } : s.simulator.attempts ? { state: 'tried', text: `Dicoba · terbaik ${s.simulator.best}` } : { state: 'todo', text: 'Belum dicoba' }) },
    { id: 'tx-presend', title: 'Pre-Send Checklist', desc: 'Periksa semuanya sebelum menekan Kirim.', icon: 'send', source: { section: 'tx-23', type: 'presend' }, status: (s) => (s.tools.presend.everCompleted ? { state: 'done', text: 'Pernah lengkap' } : { state: s.tools.presend.done ? 'tried' : 'todo', text: `${s.tools.presend.done}/${s.tools.presend.total} butir` }) },
    { id: 'tx-subject-challenge', title: 'Subject Line Challenge', desc: 'Pilih subjek email terbaik untuk setiap lowongan.', icon: 'target', source: { section: 'tx-13', blockId: 'tx-subject-challenge' }, status: scored('tx-subject-challenge') },
    { id: 'tx-hooks', title: 'Pilah Kalimat Pembuka', desc: 'Bedakan kalimat pembuka yang spesifik dan yang generik.', icon: 'check', source: { section: 'tx-11', blockId: 'tx-hooks' }, status: practiced('tx-hooks') },
  ] },
  { module: 'tr', title: 'Post-Send Practice', items: [
    { id: 'tr-timing', title: 'Follow-Up Timing Scenario', desc: 'Tentukan kapan waktu follow-up yang wajar.', icon: 'clock', source: { section: 'tr-13', blockId: 'tr-timing' }, status: scored('tr-timing') },
    { id: 'tr-best-message', title: 'Choose the Best Follow-Up Message', desc: 'Pilih pesan follow-up terbaik untuk situasi nyata.', icon: 'send', source: { section: 'tr-15', blockId: 'tr-best-message' }, status: scored('tr-best-message') },
    { id: 'tr-status', title: 'Application Status Management', desc: 'Perbarui status lamaran sesuai kabar terbaru.', icon: 'route', source: { section: 'tr-12', blockId: 'tr-status' }, status: scored('tr-status') },
    { id: 'tr-system', title: 'Create Your Own Tracking System', desc: 'Rancang tracker lamaran pribadi di Sheets/Notion.', icon: 'grid', source: { section: 'tr-11', blockId: 'tr-system' }, status: worksheet('tr-system') },
    { id: 'tr-followups', title: 'Pilah Pesan Follow-Up', desc: 'Bedakan pesan follow-up profesional dan yang perlu dihindari.', icon: 'check', source: { section: 'tr-10', blockId: 'tr-followups' }, status: practiced('tr-followups') },
  ] },
];

export const PRACTICE_ITEMS = PRACTICE_GROUPS.flatMap((g) => g.items.map((item) => ({ ...item, module: g.module, group: g.title })));
export const findPractice = (id) => PRACTICE_ITEMS.find((item) => item.id === id) || null;

/** Mencari blok materi sumber sebuah latihan */
export function findBlock(content, source) {
  const blocks = content?.sections?.[source.section]?.blocks || [];
  return source.blockId ? blocks.find((b) => b.id === source.blockId) : blocks.find((b) => b.type === source.type) || null;
}
