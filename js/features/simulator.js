/* =====================================================================
   features/simulator.js — Email Writing Simulator (Modul 4, Materi 7)
   ---------------------------------------------------------------------
   Peserta membaca lowongan fiktif (data/simulator.json), menyusun setiap
   bagian email, melihat pratinjau langsung, lalu meminta penilaian rubrik.

   Rubrik (total 100) — semua kriteria & bobot ditampilkan ke peserta:
     Ketepatan informasi 30 · Kelengkapan 20 · Struktur 20 ·
     Profesionalitas bahasa 15 · Relevansi 15
   Penilaian otomatis hanya memeriksa hal yang bisa dicek mesin dan
   TIDAK mengklaim menilai kualitas komunikasi seperti manusia.

   Draf tersimpan otomatis (state.simulator.draft). Skor terbaik dicatat
   lewat state.recordSimulation(); XP sekali saat pertama mencapai nilai lulus.
   ===================================================================== */

import { $, h, icon, uid, debounce } from '../core/dom.js';
import { toast, confirmDialog } from '../core/ui.js';
import { loadJSON } from '../core/data.js';
import * as state from '../core/state.js';
import * as motion from '../core/motion.js';
import { copyText } from './clipboard.js';

const SLANG = ['gan', 'bro', 'sis', 'wkwk', 'wkwkwk', 'btw', 'aku', 'gue', 'gw', 'kak', 'plis', 'pls', 'thx', 'makasih', 'nggak', 'gak', 'ga', 'yah', 'dong', 'banget', 'ngelamar', 'nganggur'];
const norm = (t) => String(t || '').toLowerCase();
const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const hasAny = (text, list) => list.some((t) => norm(text).includes(norm(t)));

/* ---------- Rubrik ---------- */

/** Setiap kriteria → { earned, max, note } (note dipakai bila belum penuh) */
export function evaluate(v, sc) {
  const all = [v.greeting, v.opening, v.value, v.attachment, v.closing, v.signature, v.subject].join('\n');
  const c = [];
  const add = (cat, label, max, earned, note) => c.push({ cat, label, max, earned: Math.max(0, Math.min(max, Math.round(earned))), note });

  // 1. Ketepatan informasi (30)
  const to = norm(v.to).trim();
  add('Ketepatan informasi', 'Alamat penerima sama persis dengan lowongan', 10, to === sc.recipient ? 10 : 0,
    to ? `Alamat di lowongan: ${sc.recipient}. Salin persis, huruf demi huruf.` : 'Kolom Recipient masih kosong.');
  const cc = norm(v.cc).trim();
  add('Ketepatan informasi', 'CC dikosongkan karena lowongan tidak meminta tembusan', 5, !cc || cc === '-' || cc === '—' ? 5 : 0,
    'Lowongan tidak meminta tembusan. Isi CC hanya bila diminta.');
  add('Ketepatan informasi', 'Nama perusahaan disebut dengan benar', 5, hasAny(`${v.greeting} ${v.opening}`, sc.companyAliases) ? 5 : 0,
    `Sebutkan "${sc.company}" di salam atau paragraf pembuka—dan pastikan bukan nama perusahaan lain.`);
  const posSubject = hasAny(v.subject, sc.positionAliases);
  const posOpening = hasAny(v.opening, sc.positionAliases);
  add('Ketepatan informasi', 'Posisi tepat di subjek dan paragraf pembuka', 10, (posSubject ? 5 : 0) + (posOpening ? 5 : 0),
    `Tulis posisi "${sc.position}" ${!posSubject && !posOpening ? 'di subjek dan paragraf pembuka' : !posSubject ? 'di subjek' : 'di paragraf pembuka'}.`);

  // 2. Kelengkapan (20)
  const required = ['to', 'subject', 'greeting', 'opening', 'value', 'attachment', 'closing', 'signature'];
  const filled = required.filter((k) => String(v[k] || '').trim().length >= 2).length;
  add('Kelengkapan', 'Semua bagian email terisi', 10, (filled / required.length) * 10,
    `${required.length - filled} bagian masih kosong. Email lamaran membutuhkan semua bagian.`);
  const mentionsCv = /\bcv\b|curriculum vitae/i.test(v.attachment);
  const mentionsPf = /portofolio|portfolio/i.test(v.attachment);
  add('Kelengkapan', 'Lampiran yang diminta disebutkan (CV & portofolio)', 10, (mentionsCv ? 5 : 0) + (mentionsPf ? 5 : 0),
    `Lowongan meminta CV dan portofolio. Belum disebut: ${[!mentionsCv && 'CV', !mentionsPf && 'portofolio'].filter(Boolean).join(' & ')}.`);

  // 3. Struktur (20)
  const parts = String(v.subject || '').split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  const subjectClean = v.subject && v.subject !== v.subject.toUpperCase() && !/[!?]{2,}|\p{Extended_Pictographic}/u.test(v.subject);
  add('Struktur', 'Subjek mengikuti format Posisi - Nama Lengkap - Keahlian', 10,
    (parts.length === 3 ? 6 : 0) + (parts.length >= 2 && words(parts[1]) >= 2 ? 2 : 0) + (subjectClean ? 2 : 0),
    'Gunakan tiga bagian yang dipisah " - ": posisi, nama lengkap (minimal dua kata), keahlian. Tanpa huruf kapital semua atau tanda seru.');
  const greetFormal = /^(yth|kepada yth|dengan hormat)/i.test(String(v.greeting).trim()) || /(bapak|ibu|tim rekrutmen|tim hr|hrd)/i.test(v.greeting);
  const greetInformal = /\b(hai|hi|halo kak|dear gan|hey)\b/i.test(v.greeting);
  add('Struktur', 'Salam pembuka formal', 5, greetFormal && !greetInformal ? 5 : 0,
    'Gunakan sapaan formal, mis. "Yth. Tim Rekrutmen PT Sinar Kreasi," atau "Yth. Ibu Laras Pramesti,".');
  const thanks = /terima kasih/i.test(v.closing);
  const next = /(bersedia|siap|kesempatan|wawancara|interview|seleksi|berdiskusi|diskusi)/i.test(v.closing);
  add('Struktur', 'Penutup berisi kesediaan & terima kasih', 5, (thanks ? 3 : 0) + (next ? 2 : 0),
    `Tambahkan ${[!next && 'kesediaan mengikuti seleksi/wawancara', !thanks && 'ucapan terima kasih'].filter(Boolean).join(' dan ')}.`);

  // 4. Profesionalitas bahasa (15)
  const slang = SLANG.filter((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(all));
  const emoji = /\p{Extended_Pictographic}/u.test(all);
  const shout = /[!?]{2,}/.test(all);
  const caps = (all.match(/\b[A-Z]{5,}\b/g) || []).filter((w) => !['EYD', 'PUEBI', 'HTML'].includes(w));
  const issues = [slang.length && `kata informal (${slang.slice(0, 4).join(', ')})`, emoji && 'emoji', shout && 'tanda baca berlebihan', caps.length && 'kata berhuruf kapital semua'].filter(Boolean);
  add('Profesionalitas bahasa', 'Tanpa kata informal, emoji, atau tanda baca berlebihan', 10, 10 - issues.length * 3,
    `Ditemukan: ${issues.join('; ')}. Gunakan bahasa formal dan kata ganti "saya".`);
  const sigLines = String(v.signature || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const sigContact = /(\d[\d\s-]{7,}|@|linkedin|portofolio|portfolio)/i.test(v.signature);
  add('Profesionalitas bahasa', 'Tanda tangan berisi nama lengkap & kontak', 5, (sigLines.length && words(sigLines[0]) >= 2 ? 2 : 0) + (sigContact ? 3 : 0),
    'Tulis nama lengkap di baris pertama, lalu nomor telepon dan LinkedIn/portofolio.');

  // 5. Relevansi (15)
  const matched = sc.keywordGroups.filter((g) => hasAny(v.value, g.terms));
  add('Relevansi', 'Value proposition menyebut kualifikasi lowongan', 10, matched.length >= 3 ? 10 : matched.length === 2 ? 7 : matched.length === 1 ? 4 : 0,
    `Baru ${matched.length} kualifikasi yang dikaitkan${matched.length ? ` (${matched.map((g) => g.label).join(', ')})` : ''}. Hubungkan 2–3 kualifikasi dengan bukti pengalamanmu.`);
  const bodyWords = words(v.opening) + words(v.value) + words(v.attachment) + words(v.closing);
  add('Relevansi', 'Panjang isi wajar (±50–250 kata)', 5, bodyWords >= 50 && bodyWords <= 250 ? 5 : bodyWords > 0 ? 2 : 0,
    bodyWords < 50 ? `Isi baru ${bodyWords} kata—tambahkan bukti yang relevan.` : `Isi ${bodyWords} kata—ringkas agar mudah dibaca.`);

  const total = c.reduce((sum, x) => sum + x.earned, 0);
  return { total, criteria: c };
}

/* ---------- Komponen ---------- */

export async function renderSimulator(host) {
  host.replaceChildren(h('p', { class: 'text-soft' }, 'Memuat simulator…'));
  let data;
  try {
    data = await loadJSON('simulator');
  } catch {
    host.replaceChildren(h('p', { class: 'text-soft' }, 'Simulator gagal dimuat. Muat ulang halaman.'));
    return;
  }
  const sc = data.scenario;
  const pass = data.passScore ?? 80;
  const values = { ...Object.fromEntries(data.fields.map((f) => [f.id, ''])), ...state.getState().simulator.draft };
  const persist = debounce(() => state.saveSimDraft(values), 400);
  const inputs = {};

  const form = h('form', { class: 'sim__form', novalidate: true, onsubmit: (e) => { e.preventDefault(); grade(); } },
    data.fields.map((f) => {
      const id = uid(`sim-${f.id}`);
      const input = f.multiline
        ? h('textarea', { class: 'textarea', id, rows: f.id === 'value' ? '5' : '3', maxlength: '1500', placeholder: f.placeholder })
        : h('input', { class: 'input', id, type: f.id === 'to' || f.id === 'cc' ? 'email' : 'text', maxlength: '200', placeholder: f.placeholder, autocomplete: 'off', spellcheck: f.id === 'to' || f.id === 'cc' ? 'false' : 'true' });
      input.value = values[f.id] || '';
      input.addEventListener('input', () => { values[f.id] = input.value; persist(); preview(); });
      inputs[f.id] = input;
      return h('div', { class: 'field' },
        h('label', { class: 'field__label', for: id }, h('span', { class: 'sim__part' }, f.part), f.label));
    }).map((wrap, i) => { wrap.append(inputs[data.fields[i].id]); return wrap; }),
    h('div', { class: 'cluster sim__actions' },
      h('button', { type: 'submit', class: 'btn btn--primary' }, icon('check', 'icon--lead'), 'Nilai email'),
      h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => copyDraft() }, icon('copy', 'icon--lead'), 'Salin draf'),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => reset() }, icon('undo', 'icon--lead'), 'Reset simulasi')));

  const previewEl = h('figure', { class: 'mail sim__preview', 'aria-live': 'off' });
  const rubricEl = h('div', { class: 'sim__rubric', tabindex: '-1' });
  const bestEl = h('p', { class: 'activity-card__best' });

  function preview() {
    const line = (label, value) => h('div', {}, h('dt', {}, label), h('dd', {}, value || h('span', { class: 'muted' }, '—')));
    const para = (text, cls) => (String(text || '').trim()
      ? String(text).split(/\n{2,}/).map((p) => h('p', { class: cls }, p))
      : [h('p', { class: 'sim__ph' }, '…')]);
    previewEl.replaceChildren(
      h('figcaption', { class: 'mail__caption' }, icon('eye'), 'Pratinjau langsung'),
      h('dl', { class: 'mail__meta' }, line('Kepada', values.to), line('CC', values.cc), h('div', { class: 'mail__subject' }, h('dt', {}, 'Subjek'), h('dd', {}, values.subject || h('span', { class: 'muted' }, '—')))),
      h('div', { class: 'mail__body' },
        ...para(values.greeting), ...para(values.opening), ...para(values.value), ...para(values.attachment), ...para(values.closing),
        h('div', { class: 'mail__signature' }, String(values.signature || '').split('\n').filter((l) => l.trim()).map((l, i) => h('p', { class: i === 0 ? 'mail__signame' : null }, l)))));
  }

  function showBest() {
    const sim = state.getState().simulator;
    bestEl.replaceChildren(sim.best === null
      ? h('span', {}, icon('target'), `Nilai lulus ${pass} · draf tersimpan otomatis`)
      : h('span', {}, sim.passedAt ? icon('check') : icon('clock'), `Skor terbaik ${sim.best} · ${sim.attempts}× dinilai${sim.passedAt ? ' · lulus' : ''}`));
  }

  function grade() {
    const { total, criteria } = evaluate(values, sc);
    const { firstPass } = state.recordSimulation(total, pass);
    const groups = [...new Set(criteria.map((c) => c.cat))];
    rubricEl.replaceChildren(
      h('div', { class: `sim__score${total >= pass ? ' is-pass' : ''}` },
        h('span', { class: 'num num--xl' }, String(total)),
        h('div', {},
          h('p', { class: 'h4' }, total >= pass ? 'Email siap dikirim (menurut rubrik)!' : 'Masih ada yang bisa diperbaiki'),
          h('p', { class: 'text-soft text-sm' }, `Nilai lulus ${pass}. Perbaiki kriteria bertanda di bawah, lalu nilai ulang—draf tetap tersimpan.`))),
      ...groups.map((cat) => {
        const items = criteria.filter((c) => c.cat === cat);
        const earned = items.reduce((s, c) => s + c.earned, 0);
        const max = items.reduce((s, c) => s + c.max, 0);
        return h('section', { class: 'sim__group' },
          h('p', { class: 'sim__group-head' }, h('strong', {}, cat), h('span', { class: 'mono' }, `${earned}/${max}`)),
          h('ul', { class: 'sim__criteria', role: 'list' }, items.map((c) => {
            const full = c.earned === c.max;
            return h('li', { class: full ? 'is-ok' : c.earned > 0 ? 'is-part' : 'is-bad' },
              icon(full ? 'check' : c.earned > 0 ? 'info' : 'x'),
              h('div', {},
                h('p', {}, c.label, h('span', { class: 'sim__pts' }, ` ${c.earned}/${c.max}`)),
                full ? null : h('p', { class: 'sim__tip' }, c.note)));
          })));
      }),
      h('p', { class: 'text-xs text-soft' }, 'Rubrik otomatis memeriksa kelengkapan, ketepatan, struktur, kata informal, dan kata kunci. Ia tidak menilai gaya, nada, atau kejujuran isi seperti pembaca manusia.'));
    showBest();
    motion.enter(rubricEl, { opacity: 0, y: 12 });
    rubricEl.focus({ preventScroll: false });
    const scoreEl = $('.sim__score .num', rubricEl);
    scoreEl.textContent = '0';
    motion.countUp(scoreEl, total, { duration: 0.8 });
    if (firstPass) toast('Kamu mencapai nilai lulus simulator.', { type: 'success', title: `+${state.XP.simulator} XP` });
  }

  function draftText() {
    return [`Kepada: ${values.to}`, values.cc ? `CC: ${values.cc}` : null, `Subjek: ${values.subject}`, '',
      values.greeting, '', values.opening, '', values.value, '', values.attachment, '', values.closing, '', values.signature]
      .filter((x) => x !== null).join('\n').trim();
  }

  async function copyDraft() {
    const ok = await copyText(draftText());
    toast(ok ? 'Draf email disalin. Tempel ke Gmail, lalu periksa lagi sebelum mengirim.' : 'Gagal menyalin. Salin manual, ya.', { type: ok ? 'success' : 'error' });
  }

  async function reset() {
    if (!Object.values(values).some((x) => String(x).trim())) return;
    const ok = await confirmDialog({ title: 'Reset simulasi?', message: 'Semua isian draf akan dikosongkan. Skor terbaik yang sudah tercatat tidak berubah.', confirmLabel: 'Ya, reset' });
    if (!ok) return;
    Object.keys(values).forEach((k) => { values[k] = ''; inputs[k].value = ''; });
    state.saveSimDraft(values);
    rubricEl.replaceChildren();
    preview();
    inputs.to.focus();
  }

  host.replaceChildren(h('div', { class: 'sim' },
    h('div', { class: 'activity-card__head' }, h('div', {}, h('p', { class: 'eyebrow' }, icon('edit'), 'Email Writing Simulator'), h('p', { class: 'activity-card__title' }, 'Susun email lamaranmu')), bestEl),
    h('figure', { class: 'posting sim__posting' },
      h('figcaption', { class: 'posting__head' }, h('span', { class: 'eyebrow' }, 'Lowongan (fiktif)'), h('strong', {}, sc.position), h('span', { class: 'text-soft text-sm' }, `${sc.company} · dari ${sc.source} · tenggat ${sc.deadline}`)),
      h('p', { class: 'text-sm' }, sc.description),
      h('div', { class: 'posting__cols' },
        h('div', {}, h('p', { class: 'text-sm' }, h('strong', {}, 'Kualifikasi')), h('ul', { class: 'learn-list' }, sc.qualifications.map((q) => h('li', {}, q)))),
        h('div', {}, h('p', { class: 'text-sm' }, h('strong', {}, 'Cara melamar')), h('ul', { class: 'learn-list' }, sc.instructions.map((q) => h('li', {}, q)))))),
    h('div', { class: 'sim__layout' }, form, h('div', { class: 'sim__side' }, previewEl)),
    rubricEl));
  preview();
  showBest();
}
