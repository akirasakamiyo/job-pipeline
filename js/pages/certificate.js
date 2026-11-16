/* =====================================================================
   pages/certificate.js — Sertifikat penyelesaian (Final UX)
   ---------------------------------------------------------------------
   Syarat (state.certificateEligibility): kelima modul ditandai selesai +
   Evaluasi Akhir lulus. Nama diambil dari profil.
   Sertifikat diterbitkan sekali (state.issueCertificate → ID & tanggal
   tetap di ujap:progress.certificate) lalu PDF dibuat di browser
   (features/pdf-certificate.js). Tidak ada data yang dikirim ke server.
   Hasil di sertifikat hanya dari data nyata; tidak ada klaim resmi.
   ===================================================================== */

import { $, h, icon } from '../core/dom.js';
import { toast } from '../core/ui.js';
import * as state from '../core/state.js';
import { buildCertificatePdf, isPdfSafe } from '../features/pdf-certificate.js';

const TRAINING = 'The Ultimate Job Application Pipeline';
const DISCLAIMER = 'Dokumen ini dibuat otomatis di perangkat peserta dari data belajar yang tersimpan secara lokal (LocalStorage browser). Bukan sertifikasi resmi dan tidak diverifikasi oleh institusi mana pun. ID sertifikat hanya penanda lokal dan tidak dapat diperiksa secara daring.';

const longDate = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

export function init() {
  render(state.getSummary());
  state.subscribe((s) => render(s));
}

/** Tanggal syarat terakhir terpenuhi: modul terakhir selesai atau evaluasi lulus */
function completionDate() {
  const st = state.getState();
  const dates = [st.evaluation?.passedAt, ...Object.values(st.modules || {}).map((m) => m?.completedAt)].filter(Boolean);
  return dates.sort().at(-1) || new Date().toISOString();
}

/** Ringkasan hasil — semua angka dari getSummary() */
function results(s) {
  const quiz = s.modules.map((m) => m.quizBest).filter((v) => v != null);
  const avg = quiz.length ? Math.round(quiz.reduce((a, b) => a + b, 0) / quiz.length) : null;
  const main = s.badges.filter((b) => b.main);
  return [
    { label: 'Modul selesai', value: `${s.completed}/${s.modules.length}`, pdf: `${s.completed}/${s.modules.length} modul selesai` },
    { label: 'Bagian materi', value: `${s.lessonsDone}/${s.lessonsTotal}`, pdf: `${s.lessonsDone}/${s.lessonsTotal} bagian materi` },
    { label: 'Rata-rata kuis modul', value: avg == null ? '—' : String(avg), pdf: `rata-rata kuis modul ${avg ?? '-'}` },
    { label: 'Evaluasi Akhir', value: `${s.evaluation.best}/100`, pdf: `Evaluasi Akhir ${s.evaluation.best}/100 (nilai lulus ${state.EVALUATION_PASS})` },
    { label: 'Total XP', value: String(s.xp), pdf: `${s.xp} XP` },
    { label: 'Badge utama', value: `${main.filter((b) => b.earned).length}/${main.length}`, pdf: `${main.filter((b) => b.earned).length}/${main.length} badge utama` },
  ];
}

function render(s) {
  const host = $('[data-cert]');
  const elig = state.certificateEligibility(s);

  if (!elig.ok) {
    host.replaceChildren(h('div', { class: 'card cert-locked' },
      h('div', { class: 'cert-locked__icon' }, icon('lock', 'icon--lg')),
      h('h2', { class: 'h3' }, 'Sertifikat belum terbuka'),
      h('p', { class: 'text-soft' }, 'Selesaikan dua syarat berikut. Status diperbarui otomatis dari progresmu.'),
      h('ul', { class: 'cert-reqs', role: 'list' },
        h('li', { class: elig.modulesDone ? 'is-done' : null }, icon(elig.modulesDone ? 'check' : 'clock'),
          `Kelima modul ditandai selesai (${s.completed}/${s.modules.length})`),
        h('li', { class: elig.evaluationPassed ? 'is-done' : null }, icon(elig.evaluationPassed ? 'check' : 'clock'),
          s.evaluation.attempts ? `Evaluasi Akhir lulus (terbaik ${s.evaluation.best}, minimal ${state.EVALUATION_PASS})` : `Evaluasi Akhir lulus (minimal ${state.EVALUATION_PASS})`)),
      h('div', { class: 'cluster' },
        elig.modulesDone
          ? h('a', { class: 'btn btn--primary', href: 'evaluation.html' }, 'Ikuti Evaluasi Akhir', icon('arrow-right', 'icon--trail'))
          : h('a', { class: 'btn btn--primary', href: s.next?.href || 'modules.html' }, 'Lanjutkan modul', icon('arrow-right', 'icon--trail')),
        h('a', { class: 'btn btn--ghost', href: 'achievements.html' }, 'Lihat Achievements & XP'))));
    return;
  }

  if (!elig.hasName) {
    host.replaceChildren(h('div', { class: 'card cert-locked' },
      h('div', { class: 'cert-locked__icon is-ready' }, icon('user', 'icon--lg')),
      h('h2', { class: 'h3' }, 'Syarat terpenuhi — isi nama dulu'),
      h('p', { class: 'text-soft' }, 'Sertifikat memakai nama di profilmu. Isi nama lengkap seperti yang ingin dicantumkan, lalu kembali ke halaman ini.'),
      h('a', { class: 'btn btn--primary', href: 'dashboard.html#profil' }, icon('user', 'icon--lead'), 'Isi nama di profil')));
    return;
  }

  const cert = state.issueCertificate();
  const res = results(s);
  const date = longDate(completionDate());
  const safe = isPdfSafe(cert.name);

  const download = h('button', { type: 'button', class: 'btn btn--primary btn--lg' }, icon('download', 'icon--lead'), 'Unduh sertifikat (PDF)');
  download.addEventListener('click', () => {
    const bytes = buildCertificatePdf({ name: cert.name, training: TRAINING, date, id: cert.id, results: res.map((r) => r.pdf), disclaimer: DISCLAIMER });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = h('a', { href: url, download: `sertifikat-${cert.id}.pdf`, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Sertifikat PDF diunduh.', { type: 'success' });
  });

  host.replaceChildren(
    h('article', { class: 'cert-preview', 'aria-labelledby': 'cert-name' },
      h('p', { class: 'cert-preview__kicker' }, TRAINING.toUpperCase()),
      h('p', { class: 'cert-preview__title' }, 'Sertifikat Penyelesaian'),
      h('p', { class: 'cert-preview__given' }, 'Diberikan kepada'),
      h('p', { class: 'cert-preview__name', id: 'cert-name' }, cert.name),
      h('p', { class: 'cert-preview__for' }, 'atas penyelesaian seluruh modul pelatihan ', h('strong', {}, TRAINING)),
      h('dl', { class: 'cert-preview__results' }, res.map((r) => h('div', {}, h('dt', {}, r.label), h('dd', { class: 'num' }, r.value)))),
      h('div', { class: 'cert-preview__foot' },
        h('div', {}, h('span', {}, 'Tanggal penyelesaian'), h('strong', {}, date)),
        h('div', {}, h('span', {}, 'ID sertifikat lokal'), h('strong', { class: 'mono' }, cert.id))),
      h('p', { class: 'cert-preview__note' }, DISCLAIMER)),
    h('div', { class: 'cert-actions' },
      download,
      h('a', { class: 'btn btn--ghost', href: 'dashboard.html#profil' }, icon('edit', 'icon--lead'), 'Ubah nama'),
      h('a', { class: 'btn btn--ghost', href: 'progress.html' }, 'Rekap pencapaian')),
    safe ? '' : h('p', { class: 'callout cert-warn', role: 'note' }, icon('alert'), 'Namamu memuat huruf di luar alfabet Latin. PDF memakai font standar, sehingga huruf tersebut akan tampil sebagai "?". Pratinjau di atas tetap benar.'));
}
