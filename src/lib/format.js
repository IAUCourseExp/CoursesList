// Display-layer helpers: number formatting, "empty" handling, search highlighting,
// capacity math, and plain-text export of a course (for the copy button).

import { labelOf } from './columns.js';
import { normalizeFarsi, toAsciiDigits } from './normalize.js';

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
  // Both Persian (۰-۹) and Arabic-Indic (٠-٩) digit variants (BUG-27).
  const s = toAsciiDigits(String(v).trim());
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
  const pct = known ? Math.round((enrolled / capacity) * 100) : null;
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
 * Uses the SAME normalization as the worker search (lib/normalize.js), so a
 * match found by the worker is always findable here.
 *
 * The normalization is length-preserving except for the outer trim, so match
 * positions found in the normalized string are mapped back into the original
 * through an explicit per-character index map (BUG-08: slicing the original
 * with normalized indexes used to shift every <mark> on text containing
 * digit/letter variants before the match).
 * Returns ALL non-overlapping matches, not just the first.
 */
export const buildHighlighter = (query) => {
  const q = normalizeFarsi(query);
  if (q.length < 1) return null;
  return (text) => {
    const s = String(text ?? '');
    const base = s.length - s.trimStart().length; // leading whitespace skipped by trim
    const core = s.trim();
    if (!core) return null;

    // Normalize per character while remembering each output position's
    // original index (expanding lowercases map every output char to the same
    // source index, which keeps match-end computation correct).
    let norm = '';
    const map = [];
    for (let i = 0; i < core.length; i++) {
      const ch = core[i];
      let transformed = ch;
      const code = ch.charCodeAt(0);
      if (code >= 0x06f0 && code <= 0x06f9) transformed = String(code - 0x06f0);
      else if (code >= 0x0660 && code <= 0x0669) transformed = String(code - 0x0660);
      else if (ch === '\u064A') transformed = '\u06CC';
      else if (ch === '\u0643') transformed = '\u06A9';
      else transformed = ch.toLowerCase();
      for (const t of transformed) {
        norm += t;
        map.push(i);
      }
    }

    // Keep the no-match contract of the previous highlighter: consumers treat
    // null as "nothing to highlight".
    if (!norm.includes(q)) return null;

    const segments = [];
    let lastEnd = 0; // original-string coordinate
    let idx = norm.indexOf(q);
    while (idx !== -1) {
      const start = map[idx];
      const end = map[idx + q.length - 1] + 1;
      if (start > lastEnd) segments.push({ hit: false, text: core.slice(lastEnd, start) });
      segments.push({ hit: true, text: core.slice(start, end) });
      lastEnd = end;
      idx = norm.indexOf(q, idx + q.length);
    }
    if (lastEnd < core.length) segments.push({ hit: false, text: core.slice(lastEnd) });

    // Re-attach the outer whitespace the trim removed.
    const out = [];
    if (base > 0) out.push({ hit: false, text: s.slice(0, base) });
    out.push(...segments);
    const tailStart = base + core.length;
    if (tailStart < s.length) out.push({ hit: false, text: s.slice(tailStart) });
    return out.filter((p) => p.text !== '');
  };
};

/** The row's stable identity - uses only the offering code (كد ارائه كلاس درس).
 *  Migration: if old composite key format is detected in bookmarks/URL, we map it
 *  to the new single-field key by looking up the offering code in masterData. */
const OFFERING_CODE_KEY = 'كد ارائه كلاس درس';

/** Composite identity fields (BUG-02). The offering code alone is NOT unique:
 *  the current dataset has 88 codes that appear on 2+ different offerings.
 *  Code + course name + instructor + schedule + exam distinguishes every row
 *  in the real data (verified 2566/2566 unique) while avoiding the most
 *  volatile fields (room, class-group note). */
const IDENTITY_FIELDS = [
  OFFERING_CODE_KEY,
  'نام درس',
  'استاد',
  'زمانبندي تشكيل كلاس',
  'زمان امتحان',
];

/** Fields used by the pre-composite 7-field key format (for migration). */
const LEGACY_COMPOSITE_FIELDS = [
  OFFERING_CODE_KEY,
  'كد درس',
  'نام درس',
  'استاد',
  'زمانبندي تشكيل كلاس',
  'زمان امتحان',
  'مكان برگزاري',
];

/** Normalize a value for use in composite keys (matching old rowKeyOf behavior).
 *  Exported for the identity/migration regression tests. */
export const canonicalKeyField = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (s === '' || s === '(خالی)') return '';
  return s
    .replace(/\u064A/g, '\u06CC') // Arabic ي → Persian ی
    .replace(/\u0643/g, '\u06A9') // Arabic ك → Persian ک
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // ۰-۹ → 0-9
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)); // ٠-٩ → 0-9
};

/** Normalize an offering code for stable identity. */
const normalizeOfferingCode = (value) => {
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
 * The row's stable identity: a structured tuple of the identity fields,
 * canonicalized (ي/ك, digit variants, trim, empty/uniform '-') and joined
 * with \u0001 so no field value can bleed into another. Field values are
 * identical whether the row comes from the worker's raw parse or from a
 * normalized display row: both spellings canonicalize to the same tuple.
 */
export const rowKeyOf = (row) =>
  IDENTITY_FIELDS.map((f) => canonicalKeyField(row?.[f])).join('\u0001');

/**
 * Migration helper: bring stored/shared keys of older formats to the current
 * composite identity (BUG-02 / ISSUE 2).
 *
 *  - Legacy single-code keys migrate only when the code matches exactly ONE
 *    current row.
 *  - Codes shared by several offerings are AMBIGUOUS: they are never assigned
 *    to a candidate automatically. They come back in `unresolved` so the UI
 *    can let the user pick (one or more) - nothing is dropped or guessed.
 *  - Legacy 7-field composite keys map through an exact lookup, with a
 *    location-less variant for keys written before the room field spelling
 *    was corrected; misses are reported as unresolved too.
 *  - The returned `keys` contain ONLY resolvable identities: unresolved
 *    entries are excluded from the active list (the caller keeps them in a
 *    dedicated pending store) so a dead key can never silently masquerade as
 *    a bookmark.
 *
 * @param {string[]} oldKeys - Keys from localStorage or a shared URL
 * @param {object[]} masterData - Full course data for lookup
 * @returns {{ keys: string[], unresolved: Array<{key: string, code: string, kind: 'ambiguous'|'missing'}>, changed: boolean }}
 */
export const migrateBookmarkKeys = (oldKeys, masterData) => {
  if (!oldKeys?.length || !masterData?.length) {
    return { keys: [...(oldKeys || [])], unresolved: [], changed: false };
  }

  const codeToKeys = new Map();  // legacy single code -> composite keys sharing it
  const compositeToKey = new Map(); // legacy 7-field tuple -> composite key
  const currentKeys = new Set();
  for (const row of masterData) {
    const newKey = rowKeyOf(row);
    if (newKey) currentKeys.add(newKey);
    const code = normalizeOfferingCode(row[OFFERING_CODE_KEY]);
    if (code && newKey) {
      if (!codeToKeys.has(code)) codeToKeys.set(code, []);
      codeToKeys.get(code).push(newKey);
    }
    const legacyTuple = LEGACY_COMPOSITE_FIELDS.map((f) => canonicalKeyField(row[f]));
    const legacyKey = legacyTuple.join('\u0001');
    if (legacyKey && newKey) compositeToKey.set(legacyKey, newKey);
  }

  const keys = [];
  const unresolved = [];
  for (const k of oldKeys) {
    if (currentKeys.has(k)) { keys.push(k); continue; } // already current format

    if (k.includes('\u0001')) {
      const direct = compositeToKey.get(k);
      if (direct) { keys.push(direct); continue; }
      // Variant: same tuple but with an empty trailing (location) field, for
      // keys written by the old rowKeyOf using the other ك spelling.
      const fields = k.split('\u0001');
      if (fields.length === LEGACY_COMPOSITE_FIELDS.length) {
        const variant = [...fields.slice(0, -1), ''].join('\u0001');
        const mapped = compositeToKey.get(variant);
        if (mapped) { keys.push(mapped); continue; }
      }
      unresolved.push({ key: k, code: fields[0] || '', kind: 'missing' });
      continue;
    }

    const matches = codeToKeys.get(k);
    if (matches && matches.length === 1) { keys.push(matches[0]); continue; }
    if (matches && matches.length > 1) {
      unresolved.push({ key: k, code: k, kind: 'ambiguous' });
      continue;
    }
    // Unknown (stale dataset): recoverable only by the user's decision.
    unresolved.push({ key: k, code: k, kind: 'missing' });
  }

  const changed = keys.length !== oldKeys.length || keys.some((k, i) => k !== oldKeys[i]);
  return { keys, unresolved, changed };
};

/**
 * Reconcile the active bookmark list with the pending legacy-key store
 * (ISSUE 2). Every load re-classifies BOTH sources: a code that was missing
 * can appear in a future dataset and then migrates automatically, and an
 * ambiguous code stays pending until the user resolves it. Pure - tested in
 * scripts/verify-legacy.mjs.
 *
 * @returns {{ activeKeys: string[], pendingLegacy: Array<{key, code, kind}>, changed: boolean }}
 */
export const reconcileLegacyKeys = (bookmarks, storedLegacyKeys, masterData) => {
  const combined = [...new Set([...(bookmarks || []), ...(storedLegacyKeys || [])])];
  const { keys, unresolved, changed } = migrateBookmarkKeys(combined, masterData);
  return { activeKeys: keys, pendingLegacy: unresolved, changed };
};

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


/** Gender of a section, read from the free-text "نام كلاس درس" column.
 *  Also catches typos like "خوهران" / "برادرا". Returns 'female' | 'male' | null. */
export const genderOf = (row) => {
  const note = String(row?.['نام كلاس درس'] ?? '');
  if (/خو?اهر/.test(note)) return 'female';
  if (/برادر/.test(note)) return 'male';
  return null;
};

export const GENDER_LABEL = { female: 'خواهران', male: 'برادران' };