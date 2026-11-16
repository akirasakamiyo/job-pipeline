/* =====================================================================
   features/subject-generator.js — Email Subject Generator (V4)
   ---------------------------------------------------------------------
   Dipindah dari pages/practice.js agar bisa dibuka sebagai workspace
   tersendiri (practice-tool.html?id=subject-generator).
   Format: [Posisi] - [Nama Lengkap] - [Keahlian]
   Pratinjau langsung · Generate (validasi) · Salin · Reset · riwayat
   tersimpan (state.tools.subjects, maks 8). Selesai pertama kali dicatat
   lewat state.markPractice (tanpa XP).
   ===================================================================== */

import { $, h, icon } from '../core/dom.js';
import { toast } from '../core/ui.js';
import * as state from '../core/state.js';
import * as motion from '../core/motion.js';
import { copyText } from './clipboard.js';

const tidy = (value) => String(value || '').replace(/\s+/g, ' ').trim();

/** Format sesuai permintaan: [Posisi] - [Nama Lengkap] - [Keahlian] */
export function buildSubject({ role, name, skill }) {
  return [tidy(role), tidy(name), tidy(skill)].filter(Boolean).join(' - ');
}

function subjectChecks({ role, name, skill }, subject) {
  return [
    { ok: Boolean(tidy(role)), text: 'Posisi terisi' },
    { ok: Boolean(tidy(name)), text: 'Nama lengkap terisi' },
    { ok: Boolean(tidy(skill)), text: 'Keahlian utama terisi' },
    { ok: !subject || subject !== subject.toUpperCase(), text: 'Tidak memakai HURUF KAPITAL SEMUA' },
    { ok: !/\p{Extended_Pictographic}|[!?]{2,}/u.test(subject), text: 'Tanpa emoji atau tanda seru berlebihan' },
    { ok: subject.length <= 70, soft: true, text: 'Ringkas agar tidak terpotong di layar HP' },
  ];
}

const FIELDS = [
  { key: 'name', id: 'g-name', label: 'Nama lengkap', hint: 'Sesuai identitas, sama dengan di CV.', placeholder: 'cth. Rina Putri Andini', max: 60, autocomplete: 'name' },
  { key: 'role', id: 'g-role', label: 'Posisi yang dilamar', hint: 'Tulis persis seperti judul lowongan.', placeholder: 'cth. Frontend Developer', max: 60 },
  { key: 'skill', id: 'g-skill', label: 'Keahlian utama', hint: 'Satu keahlian paling relevan dengan lowongan.', placeholder: 'cth. React', max: 40 },
];

export function renderSubjectGenerator() {
  let generated = '';
  const inputs = {};
  const fieldEls = FIELDS.map((f) => {
    inputs[f.key] = h('input', { class: 'input', id: f.id, name: f.key, type: 'text', maxlength: String(f.max), placeholder: f.placeholder, required: true, autocomplete: f.autocomplete || 'off', 'aria-describedby': `${f.id}-hint` });
    return h('div', { class: 'field' },
      h('label', { class: 'field__label', for: f.id }, f.label, ' ', h('span', { class: 'field__req', 'aria-hidden': 'true' }, '*')),
      inputs[f.key],
      h('p', { class: 'field__hint', id: `${f.id}-hint` }, f.hint));
  });
  const copyBtn = h('button', { type: 'button', class: 'btn btn--secondary', disabled: true }, icon('copy', 'icon--lead'), 'Salin');
  const form = h('form', { class: 'gen-form', novalidate: true }, fieldEls,
    h('div', { class: 'gen-actions' },
      h('button', { type: 'submit', class: 'btn btn--primary' }, icon('wand', 'icon--lead'), 'Generate'),
      copyBtn,
      h('button', { type: 'reset', class: 'btn btn--ghost' }, icon('undo', 'icon--lead'), 'Reset')));

  const preview = h('span', { class: 'inbox-row__subject' }, 'Subjek akan muncul di sini…');
  const from = h('span', { class: 'inbox-row__from' }, 'Nama kamu');
  const initial = h('span', { class: 'inbox-row__avatar' }, '?');
  const output = h('output', { class: 'builder__output is-empty', 'aria-live': 'polite' }, 'Belum ada. Isi kolom lalu tekan Generate.');
  const count = h('span', {}, '0');
  const checks = h('ul', { class: 'builder__checks', role: 'list' });
  const history = h('ul', { class: 'gen-history__list', role: 'list' });

  const userName = state.getState().user.name;
  if (userName) inputs.name.value = userName;
  const values = () => ({ name: inputs.name.value, role: inputs.role.value, skill: inputs.skill.value });

  function updatePreview() {
    const v = values();
    const subject = buildSubject(v);
    preview.textContent = subject || 'Subjek akan muncul di sini…';
    preview.classList.toggle('is-placeholder', !subject);
    from.textContent = tidy(v.name) || 'Nama kamu';
    initial.textContent = (tidy(v.name)[0] || '?').toUpperCase();
    count.textContent = String(subject.length);
    checks.replaceChildren(...subjectChecks(v, subject).map((c) =>
      h('li', { class: c.ok ? 'is-ok' : c.soft ? 'is-soft' : 'is-bad' },
        icon(c.ok ? 'check' : c.soft ? 'info' : 'x'), c.text,
        h('span', { class: 'sr-only' }, c.ok ? '(terpenuhi)' : '(belum terpenuhi)'))));
  }

  function setError(input, message) {
    const field = input.closest('.field');
    $('.field__error', field)?.remove();
    const hintId = `${input.id}-hint`;
    if (message) {
      field.append(h('p', { class: 'field__error', id: `${input.id}-error` }, icon('alert'), message));
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${hintId} ${input.id}-error`);
    } else {
      input.removeAttribute('aria-invalid');
      input.setAttribute('aria-describedby', hintId);
    }
  }

  function renderHistory() {
    if (!history.isConnected && history.childElementCount) return;
    const { subjects } = state.getState().tools;
    if (!subjects.length) {
      history.replaceChildren(h('li', { class: 'gen-history__empty' }, 'Belum ada riwayat. Subjek yang kamu Generate akan tersimpan di sini.'));
      return;
    }
    const fmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    history.replaceChildren(...subjects.map((s) => h('li', { class: 'gen-history__item' },
      h('p', { class: 'gen-history__text' }, s.text, h('time', { class: 'gen-history__time', datetime: s.at }, fmt.format(new Date(s.at)))),
      h('button', {
        type: 'button', class: 'btn btn--ghost btn--icon', 'aria-label': `Salin subjek: ${s.text}`, 'data-tooltip': 'Salin',
        onclick: async () => {
          const ok = await copyText(s.text);
          toast(ok ? 'Subjek dari riwayat disalin.' : 'Gagal menyalin.', { type: ok ? 'success' : 'error' });
        },
      }, icon('copy')),
      h('button', {
        type: 'button', class: 'btn btn--ghost btn--icon', 'aria-label': `Hapus dari riwayat: ${s.text}`, 'data-tooltip': 'Hapus dari riwayat',
        onclick: () => {
          state.removeSubject(s.text);
          toast('Dihapus dari riwayat.', { type: 'info', action: { label: 'Urungkan', onClick: () => state.addSubject(s.text) } });
        },
      }, icon('trash')))));
  }

  Object.values(inputs).forEach((input) => input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true' && tidy(input.value)) setError(input, '');
    updatePreview();
  }));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let firstInvalid = null;
    FIELDS.forEach((f) => {
      const input = inputs[f.key];
      const empty = !tidy(input.value);
      setError(input, empty ? `${f.label === 'Posisi yang dilamar' ? 'Posisi' : f.label} wajib diisi.` : '');
      if (empty && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) { firstInvalid.focus(); motion.shake(form); return; }
    generated = buildSubject(values());
    output.textContent = generated;
    output.classList.remove('is-empty');
    copyBtn.disabled = false;
    state.addSubject(generated);
    state.markPractice('subject-generator', 'Email Subject Generator');
    motion.pop(output);
    toast('Subjek dibuat dan disimpan ke riwayat.', { type: 'success', title: 'Berhasil' });
  });

  copyBtn.addEventListener('click', async () => {
    if (!generated) return;
    const ok = await copyText(generated);
    toast(ok ? `Disalin: "${generated}"` : 'Gagal menyalin. Salin manual, ya.', { type: ok ? 'success' : 'error' });
  });

  form.addEventListener('reset', () => {
    requestAnimationFrame(() => {
      generated = '';
      output.textContent = 'Belum ada. Isi kolom lalu tekan Generate.';
      output.classList.add('is-empty');
      copyBtn.disabled = true;
      Object.values(inputs).forEach((input) => setError(input, ''));
      updatePreview();
      inputs.name.focus();
    });
  });

  updatePreview();
  renderHistory();
  const off = state.subscribe(() => (history.isConnected ? renderHistory() : off()));

  return h('div', { class: 'subject-gen' },
    h('p', { class: 'text-soft' }, 'Format: ', h('code', { class: 'fmt' }, '[Posisi] - [Nama Lengkap] - [Keahlian]')),
    h('div', { class: 'gen-layout' },
      form,
      h('div', { class: 'gen-preview' },
        h('p', { class: 'eyebrow' }, 'Pratinjau langsung'),
        h('div', { class: 'inbox-row', 'aria-hidden': 'true' }, initial, h('div', { class: 'inbox-row__body' }, from, preview), h('span', { class: 'inbox-row__time' }, '09.12')),
        h('div', { class: 'gen-output' }, h('p', { class: 'text-sm text-soft' }, 'Hasil generate:'), output, h('p', { class: 'gen-count' }, count, ' karakter')),
        checks,
        h('aside', { class: 'callout callout--info' },
          h('span', { class: 'callout__icon' }, icon('info')),
          h('div', {}, h('p', { class: 'callout__title' }, 'Ikuti instruksi lowongan'), h('p', {}, 'Jika iklan meminta format subjek tertentu (mis. dengan kode lowongan), pakai format dari iklan. Variasi lain dibahas di Modul 4.'))))),
    h('div', { class: 'gen-history' },
      h('div', { class: 'section-head' }, h('div', { class: 'section-head__text' }, h('h2', { class: 'h4' }, 'Riwayat subjek')), h('span', { class: 'text-soft text-sm' }, 'Maks. 8 terakhir · tersimpan otomatis')),
      history));
}
