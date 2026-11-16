/* =====================================================================
   features/pdf-certificate.js — Penulis PDF minimal untuk sertifikat
   ---------------------------------------------------------------------
   Tanpa library & tanpa server: PDF 1.4 satu halaman A4 lanskap dengan
   font standar Helvetica (tidak perlu disematkan), encoding WinAnsi.
   Semua teks ditulis sebagai string PDF dengan escape oktal sehingga
   file tetap ASCII murni dan offset xref = panjang string.

   Batasan yang disengaja:
   - Hanya karakter Latin (Windows-1252). Huruf lain diganti "?".
   - Lebar teks memakai tabel metrik Helvetica standar (AFM) untuk
     ASCII; karakter lain dihitung lebar rata-rata.
   ===================================================================== */

// Lebar glyph (per 1000 unit) untuk kode 32–126 — metrik standar Adobe
const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

// Karakter Unicode → byte Windows-1252 di rentang 0x80–0x9F
const CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };

/** Teks → array byte WinAnsi (karakter tak didukung → "?") */
export function toWinAnsi(text) {
  const out = [];
  for (const ch of String(text).normalize('NFC')) {
    const c = ch.codePointAt(0);
    if (c === 0x09 || c === 0x0A || c === 0x0D) out.push(0x20);
    else if ((c >= 0x20 && c <= 0x7E) || (c >= 0xA0 && c <= 0xFF)) out.push(c);
    else if (CP1252[c]) out.push(CP1252[c]);
    else out.push(0x3F);
  }
  return out;
}

/** Apakah semua karakter bisa ditulis apa adanya di PDF */
export const isPdfSafe = (text) => !toWinAnsi(text).some((b, i) => b === 0x3F && [...String(text).normalize('NFC')][i] !== '?');

function textWidth(text, size, bold = false) {
  const table = bold ? W_BOLD : W_REG;
  return toWinAnsi(text).reduce((sum, b) => sum + (b >= 32 && b <= 126 ? table[b - 32] : 556), 0) * size / 1000;
}

function pdfString(text) {
  return `(${toWinAnsi(text).map((b) => {
    if (b === 0x28 || b === 0x29 || b === 0x5C) return `\\${String.fromCharCode(b)}`;
    if (b < 0x20 || b > 0x7E) return `\\${b.toString(8).padStart(3, '0')}`;
    return String.fromCharCode(b);
  }).join('')})`;
}

/** Memecah teks menjadi baris dengan lebar maksimum (pt) */
function wrap(text, size, maxWidth, bold = false) {
  const lines = [];
  let line = '';
  String(text).split(/\s+/).filter(Boolean).forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, bold) > maxWidth) { lines.push(line); line = word; } else line = next;
  });
  if (line) lines.push(line);
  return lines;
}

const hex = (color) => color.match(/[0-9a-f]{2}/gi).map((x) => (parseInt(x, 16) / 255).toFixed(3)).join(' ');

/**
 * Membuat PDF sertifikat.
 * @param {{name:string, training:string, date:string, id:string, results:string[], disclaimer:string}} data
 * @returns {Uint8Array}
 */
export function buildCertificatePdf(data) {
  const W = 842; const H = 595; const cx = W / 2;
  const ops = [];
  const rect = (x, y, w, h, { fill, stroke, lw = 1 } = {}) => {
    if (fill) ops.push(`${hex(fill)} rg`);
    if (stroke) ops.push(`${hex(stroke)} RG ${lw} w`);
    ops.push(`${x} ${y} ${w} ${h} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
  };
  const text = (str, x, y, size, { bold = false, color = '#1E1B2E', align = 'left', spacing = 0 } = {}) => {
    const extra = spacing * Math.max(0, toWinAnsi(str).length - 1);
    const w = textWidth(str, size, bold) + extra;
    const tx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${hex(color)} rg ${spacing} Tc ${tx.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(str)} Tj ET`);
  };

  // Latar & bingkai (warna token: paper, signal, ink, cobalt)
  rect(0, 0, W, H, { fill: '#FBF7F0' });
  rect(18, 18, W - 36, H - 36, { stroke: '#FFC83D', lw: 10 });
  rect(34, 34, W - 68, H - 68, { stroke: '#1E1B2E', lw: 1.2 });
  rect(cx - 40, H - 92, 80, 6, { fill: '#3B5BDB' });

  text('THE ULTIMATE JOB APPLICATION PIPELINE', cx, H - 70, 10, { bold: true, color: '#5B5770', align: 'center', spacing: 1.6 });
  text('SERTIFIKAT PENYELESAIAN', cx, H - 140, 30, { bold: true, align: 'center', spacing: 1 });
  text('Diberikan kepada', cx, H - 180, 13, { color: '#5B5770', align: 'center' });

  // Nama: diperkecil bila terlalu panjang
  let size = 34;
  while (size > 18 && textWidth(data.name, size, true) > W - 160) size -= 2;
  text(data.name, cx, H - 228, size, { bold: true, align: 'center' });
  ops.push(`${hex('#FFC83D')} RG 2 w ${cx - 170} ${H - 244} m ${cx + 170} ${H - 244} l S`);

  text('atas penyelesaian seluruh modul pelatihan', cx, H - 276, 13, { color: '#3A3650', align: 'center' });
  text(data.training, cx, H - 300, 17, { bold: true, align: 'center' });

  // Ringkasan hasil (1–2 baris)
  let y = H - 336;
  const half = Math.ceil(data.results.length / 2);
  [data.results.slice(0, half), data.results.slice(half)].filter((g) => g.length).forEach((group) => {
    wrap(group.join('  ·  '), 11, W - 200).forEach((line) => { text(line, cx, y, 11, { color: '#3A3650', align: 'center' }); y -= 17; });
  });

  // Tanggal & ID
  const footY = 128;
  text('TANGGAL PENYELESAIAN', 90, footY + 18, 8, { bold: true, color: '#5B5770', spacing: 1 });
  text(data.date, 90, footY, 13, { bold: true });
  text('ID SERTIFIKAT LOKAL', W - 90, footY + 18, 8, { bold: true, color: '#5B5770', align: 'right', spacing: 1 });
  text(data.id, W - 90, footY, 13, { bold: true, align: 'right' });
  ops.push(`${hex('#CFC4B0')} RG 0.8 w 90 ${footY - 14} m ${W - 90} ${footY - 14} l S`);

  // Batasan validitas (wajib tampil di dokumen)
  y = footY - 34;
  wrap(data.disclaimer, 8.5, W - 180).forEach((line) => { text(line, cx, y, 8.5, { color: '#5B5770', align: 'center' }); y -= 12; });

  const stream = ops.join('\n');
  const infoDate = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; })();
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    `<< /Title ${pdfString(`Sertifikat Penyelesaian - ${data.name}`)} /Producer (The Ultimate Job Application Pipeline - dibuat lokal di browser) /CreationDate (${infoDate}) >>`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);   // ASCII murni → 1 karakter = 1 byte
}
