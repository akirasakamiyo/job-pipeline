/* =====================================================================
   pages/tracker-page.js — Job Application Tracker
   ---------------------------------------------------------------------
   Tambah · ubah · hapus (dengan Urungkan) · cari · saring · urutkan ·
   ringkasan per status. Data: js/core/tracker-store.js (LocalStorage).
   Kartu ringkasan juga berfungsi sebagai filter cepat.
   ===================================================================== */

import { $, $$, h, icon, debounce } from '../core/dom.js';
import { toast, openModal, closeModal } from '../core/ui.js';
import * as store from '../core/tracker-store.js';
import * as state from '../core/state.js';
import * as motion from '../core/motion.js';
import * as storage from '../core/storage.js';

const view = { query: '', status: 'all', sort: 'date-desc' };
let editingId = null;

const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const formatDate = (iso) => (iso ? dateFmt.format(new Date(`${iso}T00:00:00`)) : '—');

const STATUS_DOT = { cobalt: 'var(--cobalt)', warn: 'var(--warning)', teal: 'var(--m-li)', done: 'var(--success)', danger: 'var(--danger)' };

export function init() {
  // Isi pilihan status (filter & form) dari satu sumber
  $('[data-filter]').replaceChildren(
    h('option', { value: 'all' }, 'Semua status'),
    ...store.STATUSES.map((s) => h('option', { value: s }, `${s} — ${store.STATUS_INFO[s].hint}`)));
  $('#f-status').replaceChildren(...store.STATUSES.map((s) => h('option', { value: s }, `${s} — ${store.STATUS_INFO[s].hint}`)));

  $('[data-search]').addEventListener('input', debounce((e) => { view.query = e.target.value.trim().toLowerCase(); render(); }, 150));
  $('[data-filter]').addEventListener('change', (e) => { view.status = e.target.value; render(); });
  $('[data-sort]').addEventListener('change', (e) => { view.sort = e.target.value; render(); });
  $('[data-add]').addEventListener('click', () => openForm());

  initForm();
  render();
  storage.subscribe('tracker', () => render());   // sinkron antar-tab

  // Datang dari tautan "Catat di Tracker" (practice.html#tambah)
  if (window.location.hash === '#tambah') {
    history.replaceState(null, '', window.location.pathname);
    setTimeout(() => openForm(), 300);
  }
}

/* ---------- Render ---------- */

function getVisible(items) {
  const q = view.query;
  const filtered = items.filter((item) => {
    if (view.status !== 'all' && item.status !== view.status) return false;
    if (!q) return true;
    return [item.company, item.position, item.contact, item.notes, item.status].some((v) => v.toLowerCase().includes(q));
  });
  const byDate = (a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt.localeCompare(b.createdAt);
  const sorters = {
    'date-desc': (a, b) => byDate(b, a),
    'date-asc': byDate,
    'company-asc': (a, b) => a.company.localeCompare(b.company, 'id', { sensitivity: 'base' }),
    'company-desc': (a, b) => b.company.localeCompare(a.company, 'id', { sensitivity: 'base' }),
    status: (a, b) => store.STATUSES.indexOf(a.status) - store.STATUSES.indexOf(b.status) || byDate(b, a),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    // 2.0: follow-up terdekat dulu; lamaran tanpa tanggal follow-up di akhir
    followup: (a, b) => (a.followUp || '9999').localeCompare(b.followUp || '9999') || byDate(b, a),
  };
  return filtered.sort(sorters[view.sort] || sorters['date-desc']);
}

function render() {
  const items = store.getItems();
  renderSummary(items);
  const visible = getVisible(items);
  const host = $('[data-list]');
  const count = $('[data-result-count]');

  if (!items.length) {
    count.textContent = '';
    host.replaceChildren(h('div', { class: 'empty-state' },
      h('span', { class: 'empty-state__icon' }, icon('briefcase')),
      h('p', { class: 'empty-state__title' }, 'Belum ada lamaran tercatat'),
      h('p', {}, 'Catat lamaran pertamamu pada hari yang sama saat mengirimnya. Badge "Lamaran Pertama" menunggumu.'),
      h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: () => openForm() }, icon('plus', 'icon--lead'), 'Tambah lamaran')));
    return;
  }

  count.textContent = visible.length === items.length
    ? `Menampilkan ${items.length} lamaran`
    : `Menampilkan ${visible.length} dari ${items.length} lamaran`;

  if (!visible.length) {
    host.replaceChildren(h('div', { class: 'empty-state' },
      h('span', { class: 'empty-state__icon' }, icon('search')),
      h('p', { class: 'empty-state__title' }, 'Tidak ada yang cocok'),
      h('p', {}, 'Coba kata kunci lain atau ubah filter status.'),
      h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onclick: clearFilters }, 'Hapus pencarian & filter')));
    return;
  }

  host.replaceChildren(h('table', { class: 'app-table' },
    h('caption', { class: 'sr-only' }, 'Daftar lamaran kerja'),
    h('thead', {}, h('tr', {},
      ['Perusahaan', 'Posisi', 'Tanggal', 'Status', 'Kontak HR', 'Follow-up', 'Catatan', 'Aksi'].map((label) => h('th', { scope: 'col' }, label)))),
    h('tbody', {}, visible.map((item) => row(item)))));
}

function row(item) {
  const info = store.STATUS_INFO[item.status];
  return h('tr', { 'data-id': item.id },
    h('td', { class: 'app-table__company' }, item.company),
    h('td', { class: 'app-table__position', 'data-label': 'Posisi' }, item.position),
    h('td', { class: 'app-table__date', 'data-label': 'Tanggal' }, h('time', { datetime: item.date }, formatDate(item.date))),
    h('td', { class: 'app-table__status', 'data-label': 'Status' }, h('span', { class: `chip status status--${info.tone}`, title: info.hint }, item.status)),
    h('td', { class: 'app-table__contact', 'data-label': 'Kontak HR' }, item.contact || h('span', { class: 'muted' }, '—')),
    h('td', { class: 'app-table__follow', 'data-label': 'Follow-up' }, followCell(item)),
    h('td', { class: 'app-table__notes', 'data-label': 'Catatan' }, item.notes ? h('p', { title: item.notes }, item.notes) : h('span', { class: 'muted' }, '—')),
    h('td', { class: 'app-table__actions' },
      h('button', { type: 'button', class: 'btn btn--ghost btn--icon', 'aria-label': `Ubah lamaran ${item.company} – ${item.position}`, 'data-tooltip': 'Ubah', onclick: () => openForm(item) }, icon('edit')),
      h('button', { type: 'button', class: 'btn btn--ghost btn--icon', 'aria-label': `Hapus lamaran ${item.company} – ${item.position}`, 'data-tooltip': 'Hapus (bisa diurungkan)', onclick: () => remove(item) }, icon('trash'))));
}

/** Tanggal follow-up + penanda bila sudah jatuh tempo (lamaran masih aktif) */
function followCell(item) {
  if (!item.followUp) return h('span', { class: 'muted' }, '—');
  const active = ['Applied', 'Under Review', 'Interview'].includes(item.status);
  const due = active && item.followUp <= store.todayISO();
  return h('span', { class: 'follow' },
    h('time', { datetime: item.followUp }, formatDate(item.followUp)),
    due ? h('span', { class: 'chip chip--warn follow__due' }, 'Waktunya follow-up') : null);
}

function renderSummary(items) {
  const stats = store.getStats(items);
  const host = $('[data-summary]');
  const statusCard = (status) => {
    const info = store.STATUS_INFO[status];
    return h('button', {
      type: 'button',
      class: 'sum-card',
      'aria-pressed': String(view.status === status),
      // Nama tombol dari teks yang terlihat + keterangan untuk pembaca layar (WCAG 2.5.3)
      'data-status': status,
      onclick: () => {
        view.status = view.status === status ? 'all' : status;
        $('[data-filter]').value = view.status;
        render();
      },
    },
    h('span', { class: 'sum-card__label' }, h('span', { class: 'sum-card__dot', style: { '--dot': STATUS_DOT[info.tone] } }), status),
    h('span', { class: 'sum-card__value num' }, String(stats.byStatus[status])),
    h('span', { class: 'sr-only' }, ' lamaran — klik untuk menyaring'));
  };
  host.replaceChildren(
    h('div', { class: 'sum-card sum-card--total' },
      h('span', { class: 'sum-card__label' }, icon('briefcase', 'icon--sm'), 'Total lamaran'),
      h('span', { class: 'sum-card__value num' }, String(stats.total)),
      h('small', {}, stats.total ? `${stats.active} masih berjalan · ${stats.responseRate}% sudah ada respons` : 'Mulai catat lamaranmu')),
    ...store.STATUSES.map(statusCard));
}

function clearFilters() {
  view.query = '';
  view.status = 'all';
  $('[data-search]').value = '';
  $('[data-filter]').value = 'all';
  render();
}

/* ---------- Form tambah / ubah ---------- */

const FIELDS = ['company', 'position', 'date', 'status', 'contact', 'followUp', 'notes'];

function initForm() {
  const form = $('[data-form]');
  const notes = $('#f-notes', form);
  const counter = $('[data-notes-count]', form);
  notes.addEventListener('input', () => { counter.textContent = `${notes.value.length}/500`; });

  ['company', 'position', 'date'].forEach((name) => {
    const input = form.elements[name];
    input.addEventListener('input', () => { if (input.getAttribute('aria-invalid') === 'true') setError(input, validate(name, input.value)); });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(FIELDS.map((name) => [name, form.elements[name].value]));
    let firstInvalid = null;
    ['company', 'position', 'date'].forEach((name) => {
      const message = validate(name, data[name]);
      setError(form.elements[name], message);
      if (message && !firstInvalid) firstInvalid = form.elements[name];
    });
    if (firstInvalid) {
      firstInvalid.focus();
      motion.shake(firstInvalid);
      return;
    }

    try {
      if (editingId) {
        const { before, after } = store.updateItem(editingId, data);
        if (before.status !== after.status) {
          state.logActivity({ type: 'tracker', module: 'tr', text: `Status lamaran ${after.company} → ${after.status}` });
        }
        toast(`Lamaran ${after.company} diperbarui.`, { type: 'success' });
      } else {
        const item = store.addItem(data);
        state.logActivity({ type: 'tracker', module: 'tr', text: `Mencatat lamaran ${item.company} – ${item.position}` });
        toast(`Lamaran ${item.company} ditambahkan.`, { type: 'success', title: 'Tersimpan' });
      }
    } catch (error) {
      toast(error.message, { type: 'error' });
      return;
    }
    closeModal($('#app-dialog'));
    render();
    const id = editingId;
    editingId = null;
    if (id) motion.pop($(`tr[data-id="${id}"]`));
  });
}

function validate(name, value) {
  const v = String(value || '').trim();
  if (name === 'company' && !v) return 'Nama perusahaan wajib diisi.';
  if (name === 'position' && !v) return 'Posisi wajib diisi.';
  if (name === 'date') {
    if (!v) return 'Tanggal melamar wajib diisi.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Format tanggal tidak valid.';
  }
  return '';
}

function setError(input, message) {
  const field = input.closest('.field');
  $('.field__error', field)?.remove();
  const hint = `${input.id}-hint`;
  if (message) {
    field.append(h('p', { class: 'field__error', id: `${input.id}-error` }, icon('alert'), message));
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', `${hint} ${input.id}-error`);
  } else {
    input.removeAttribute('aria-invalid');
    input.setAttribute('aria-describedby', hint);
  }
}

function openForm(item = null) {
  const form = $('[data-form]');
  editingId = item?.id || null;
  form.reset();
  $$('.field__error', form).forEach((e) => e.remove());
  $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid'));
  $('[data-form-title]').textContent = item ? 'Ubah lamaran' : 'Tambah lamaran';
  $('[data-form-submit]').textContent = item ? 'Simpan perubahan' : 'Simpan lamaran';
  FIELDS.forEach((name) => {
    form.elements[name].value = item ? item[name] : name === 'date' ? store.todayISO() : name === 'status' ? 'Applied' : '';
  });
  $('[data-notes-count]').textContent = `${form.elements.notes.value.length}/500`;
  openModal($('#app-dialog'));
  form.elements.company.focus();
}

/* ---------- Hapus (dengan Urungkan) ---------- */

function remove(item) {
  const removed = store.removeItem(item.id);
  if (!removed) return;
  render();
  toast(`Lamaran ${item.company} dihapus.`, {
    type: 'info',
    duration: 7000,
    action: {
      label: 'Urungkan',
      onClick: () => {
        store.restoreItem(removed);
        render();
        toast('Lamaran dikembalikan.', { type: 'success' });
      },
    },
  });
}
