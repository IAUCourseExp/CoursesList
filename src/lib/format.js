// Display-layer helpers: number formatting, "empty" handling, search highlighting,
// capacity math, and plain-text export of a course (for the copy button).

import { labelOf } from './columns.js';

/** The worker represents empty cells as this literal, so they stay filterable. */
export const EMPTY_TOKEN = '(خالی)';

/** True when a cell has no real content (worker token, "", or the UI's own dash). */
export const isBlank = (v) => v === '' || v === null || v === undefined || v === EMPTY_TOKEN || v === '---';

/** What to draw for an empty cell: an em dash, much calmer than "(خالی)" ×23 per row. */
export const DASH = '-';

export const displayCell = (v) => (isBlank(v) ? DASH : v);

export const faNum = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return Number(n).toLocaleString('fa-IR');
};

const toNum = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  if (s === '' || s === EMPTY_TOKEN) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Total units = theoretical + practical. Null when neither is present. */
export const totalUnits = (row) => {
  const t = toNum(row['تعداد واحد نظري']);
  const p = toNum(row['تعداد واحد عملي']);
  if (t === null && p === null) return null;
  return (t || 0) + (p || 0);
};

/** { capacity, enrolled, pct } with nulls when the data doesn't support a ratio. */
export const capacityInfo = (row) => {
  const capacity = toNum(row['حداكثر ظرفيت']);
  const enrolled = toNum(row['تعداد ثبت نامي تاكنون']);
  const known = capacity !== null && capacity > 0 && enrolled !== null;
  const pct = known ? Math.min(100, Math.round((enrolled / capacity) * 100)) : null;
  return { capacity, enrolled, pct };
};

/** Colour band for a fill ratio, so "almost full" reads at a glance. */
export const fillTone = (pct) => {
  if (pct === null) return 'none';
  if (pct >= 100) return 'full';
  if (pct >= 85) return 'high';
  if (pct >= 50) return 'mid';
  return 'low';
};

/**
 * Builds a case/ё-insensitive substring highlighter for the search term.
 * Search ran in the worker after ی/ک normalisation and returned normalised display
 * values, so a plain indexOf on the same normalisation is exact.
 */
const normalizeQuery = (q) =>
  String(q || '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .replace(/[\u200c\u200e\u200f]/g, '')
    .toLowerCase()
    .trim();

export const buildHighlighter = (query) => {
  const q = normalizeQuery(query);
  if (q.length < 1) return null;
  return (text) => {
    const s = String(text ?? '');
    const idx = s.toLowerCase().indexOf(q);
    if (idx === -1) return null;
    return [
      { hit: false, text: s.slice(0, idx) },
      { hit: true, text: s.slice(idx, idx + q.length) },
      { hit: false, text: s.slice(idx + q.length) },
    ].filter((p) => p.text !== '');
  };
};

/** The row's stable identity - mirrors App/worker behaviour exactly. */
const canonicalKeyField = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (s === '' || s === '(خالی)') return '';
  return s
    .replace(/\u064A/g, '\u06CC') // Arabic ي → Persian ی
    .replace(/\u0643/g, '\u06A9') // Arabic ك → Persian ک
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // ۰-۹ → 0-9
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)); // ٠-٩ → 0-9
};

/**
 * The row's stable identity.
 */
const ROW_KEY_SEP = '\u0001';
export const rowKeyOf = (row) =>
  [
    row['كد ارائه كلاس درس'],
    row['كد درس'],
    row['نام درس'],
    row['استاد'],
    row['زمانبندي تشكيل كلاس'],
    row['زمان امتحان'],
    row['مكان برگزاري'],
  ]
    .map(canonicalKeyField)
    .join(ROW_KEY_SEP);

/** Plain-text summary of a course for the clipboard / sharing. */
export const courseToText = (row) => {
  const skip = new Set([EMPTY_TOKEN, '', undefined, null]);
  const order = [
    'نام درس', 'استاد', 'زمانبندي تشكيل كلاس', 'زمان امتحان', 'نوع درس',
    'تعداد واحد نظري', 'تعداد واحد عملي', 'حداكثر ظرفيت', 'تعداد ثبت نامي تاكنون',
    'مكان برگزاري', 'مقطع ارائه درس', 'كد درس', 'كد ارائه كلاس درس',
  ];
  const lines = [];
  const title = row['نام درس'] && !skip.has(row['نام درس']) ? row['نام درس'] : 'درس';
  lines.push(`📚 ${title}`);
  for (const col of order) {
    if (col === 'نام درس') continue;
    const v = row[col];
    if (skip.has(v)) continue;
    lines.push(`• ${labelOf(col)}: ${v}`);
  }
  return lines.join('\n');
};

/** Human label for a sort config, used in chips and the mobile sheet. */
export const sortLabel = (sortConfig) => {
  if (!sortConfig?.column) return 'پیش‌فرض (ترتیب فایل)';
  return `${labelOf(sortConfig.column)} - ${sortConfig.direction === 'asc' ? 'صعودی' : 'نزولی'}`;
};
