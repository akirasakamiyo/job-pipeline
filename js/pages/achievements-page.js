/* =====================================================================
   pages/achievements-page.js — Achievements & XP (V4)
   ---------------------------------------------------------------------
   - Total XP + jumlah badge
   - Badge berikutnya: badge utama terdekat (syarat terpenuhi terbanyak)
   - Sertifikat: status syarat + tautan ke certificate.html
   - 10 badge utama dengan status Didapat / Sedang berjalan / Terkunci
     dan rincian syarat (state.badgeSteps → dihitung dari data nyata)
   - Milestone (milestone lama yang "retired" hanya tampil bila diraih)
   - Tabel XP per aktivitas (state.XP)
   Halaman ini hanya MEMBACA state; pemberian badge tetap di app.js.
   ===================================================================== */

import { $, h, icon } from '../core/dom.js';
import * as state from '../core/state.js';

const XP_RULES = [
  ['lesson', 'Menyelesaikan satu bagian materi'],
  ['quiz', 'Lulus kuis modul (pertama kali)'],
  ['module', 'Menandai modul selesai'],
  ['activity', 'Lulus satu aktivitas bernilai'],
  ['worksheet', 'Menyelesaikan lembar kerja'],
  ['checklist', 'Melengkapi checklist (pra-kirim, CV review, checklist modul)'],
  ['simulator', 'Skor Email Writing Simulator ≥ 80 (pertama kali)'],
  ['evaluation', 'Lulus Evaluasi Akhir (pertama kali)'],
];

const shortDate = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export function init() {
  render(state.getSummary());
  state.subscribe((s) => render(s));
}

/** Status tampilan badge berdasarkan data nyata */
function badgeView(b, s) {
  const steps = state.badgeSteps(b.id, s);
  const ok = steps.filter((x) => x.ok).length;
  const status = b.earned ? 'earned' : ok > 0 ? 'progress' : 'locked';
  return { ...b, steps, ok, status };
}

const STATUS_TEXT = { earned: 'Didapat', progress: 'Sedang berjalan', locked: 'Terkunci' };

function render(s) {
  const main = s.badges.filter((b) => b.main).map((b) => badgeView(b, s));
  const milestones = s.badges.filter((b) => !b.main && (!b.retired || b.earned));
  const earned = main.filter((b) => b.status === 'earned').length;

  $('[data-xp-total]').textContent = String(s.xp);
  $('[data-xp-badges]').textContent = `${earned}/${main.length} badge utama · ${milestones.filter((b) => b.earned).length}/${milestones.length} milestone`;

  renderNext(main);
  renderCert(s);

  $('[data-badge-summary]').textContent = earned === main.length
    ? 'Semua badge utama sudah didapat.'
    : `${earned} didapat · ${main.filter((b) => b.status === 'progress').length} sedang berjalan · ${main.filter((b) => b.status === 'locked').length} terkunci.`;

  $('[data-badge-grid]').replaceChildren(...main.map((b) => h('li', { class: `ach-badge is-${b.status}`, 'data-module': b.module || null },
    h('div', { class: 'ach-badge__top' },
      h('span', { class: 'ach-badge__seal' }, icon(b.status === 'locked' ? 'lock' : b.icon)),
      h('span', { class: `chip ach-chip ach-chip--${b.status}` }, STATUS_TEXT[b.status])),
    h('p', { class: 'ach-badge__name' }, b.name),
    h('p', { class: 'ach-badge__desc' }, b.desc),
    h('div', { class: 'bar bar--thin', role: 'progressbar', 'aria-label': `Syarat ${b.name}`, 'aria-valuemin': '0', 'aria-valuemax': String(b.steps.length), 'aria-valuenow': String(b.status === 'earned' ? b.steps.length : b.ok), style: { '--value': String(b.steps.length ? Math.round(((b.status === 'earned' ? b.steps.length : b.ok) / b.steps.length) * 100) : 0) } }, h('span', { class: 'bar__fill' })),
    h('details', { class: 'ach-badge__steps' },
      h('summary', {}, b.status === 'earned' ? (b.earnedAt ? `Didapat ${shortDate(b.earnedAt)}` : 'Didapat') : `${b.ok}/${b.steps.length} syarat terpenuhi`),
      h('ul', { role: 'list' }, b.steps.map((st) => h('li', { class: st.ok ? 'is-ok' : null }, icon(st.ok ? 'check' : 'clock'), st.label,
        h('span', { class: 'sr-only' }, st.ok ? ' (terpenuhi)' : ' (belum)'))))))));

  $('[data-milestone-grid]').replaceChildren(...milestones.map((b) => h('li', { class: `ach-ms${b.earned ? ' is-earned' : ''}` },
    h('span', { class: 'ach-ms__icon' }, icon(b.earned ? b.icon : 'lock')),
    h('span', { class: 'ach-ms__text' }, h('strong', {}, b.name), h('small', {}, b.earned && b.earnedAt ? `Didapat ${shortDate(b.earnedAt)}` : b.desc)),
    h('span', { class: 'sr-only' }, b.earned ? '(sudah didapat)' : '(terkunci)'))));

  $('[data-xp-rules]').replaceChildren(...XP_RULES.map(([key, text]) => h('li', {},
    h('span', {}, text), h('strong', { class: 'mono' }, `+${state.XP[key]}`))));
}

function renderNext(main) {
  const host = $('[data-next-badge-body]');
  const candidates = main.filter((b) => b.status !== 'earned' && b.steps.length)
    .sort((a, b) => (b.ok / b.steps.length) - (a.ok / a.steps.length));
  const next = candidates[0];
  if (!next) {
    host.replaceChildren(h('p', { class: 'ach-next__title' }, 'Semua badge utama sudah didapat'), h('p', { class: 'text-soft text-sm' }, 'Kerja bagus! Lihat sertifikatmu di samping.'));
    return;
  }
  const todo = next.steps.find((x) => !x.ok);
  host.replaceChildren(
    h('div', { class: 'ach-next__row' },
      h('span', { class: 'ach-badge__seal' }, icon(next.icon)),
      h('div', {}, h('p', { class: 'ach-next__title' }, next.name), h('p', { class: 'text-soft text-sm' }, `${next.ok}/${next.steps.length} syarat terpenuhi`))),
    h('div', { class: 'bar', role: 'progressbar', 'aria-label': `Progres menuju ${next.name}`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round((next.ok / next.steps.length) * 100)), style: { '--value': String(Math.round((next.ok / next.steps.length) * 100)) } }, h('span', { class: 'bar__fill' })),
    todo ? h('p', { class: 'text-sm' }, h('strong', {}, 'Langkah berikutnya: '), todo.label) : '');
}

function renderCert(s) {
  const elig = state.certificateEligibility(s);
  $('[data-cert-card-body]').replaceChildren(
    h('ul', { class: 'ach-cert__reqs', role: 'list' },
      h('li', { class: elig.modulesDone ? 'is-ok' : null }, icon(elig.modulesDone ? 'check' : 'lock'), `Kelima modul selesai (${s.completed}/${s.modules.length})`),
      h('li', { class: elig.evaluationPassed ? 'is-ok' : null }, icon(elig.evaluationPassed ? 'check' : 'lock'), `Evaluasi Akhir lulus (min. ${state.EVALUATION_PASS})`)),
    h('a', { class: `btn btn--sm ${elig.ok ? 'btn--primary' : 'btn--secondary'}`, href: 'certificate.html' }, icon(elig.ok ? 'download' : 'eye', 'icon--lead'), elig.ok ? 'Lihat & unduh sertifikat' : 'Lihat syarat sertifikat'),
    h('p', { class: 'text-soft text-xs' }, 'Sertifikat lokal, bukan sertifikasi resmi.'));
}
