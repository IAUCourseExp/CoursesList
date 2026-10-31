// BUG-02 regression tests: composite row identity, legacy migration, conflict
// self-pairing, and ICS UID uniqueness - validated against the real dataset.
// Pure Node (no browser, no server): run with `node scripts/verify-identity.mjs`.

import fs from 'node:fs';
import Papa from 'papaparse';
import { rowKeyOf, migrateBookmarkKeys, reconcileLegacyKeys, canonicalKeyField } from '../src/lib/format.js';
import { detectConflicts, generateIcsCalendar, uidSlug } from '../src/lib/conflicts.js';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err?.message || err}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

const text = fs.readFileSync(new URL('../public/data.csv', import.meta.url), 'utf8');
const rows = Papa.parse(text, { header: true, skipEmptyLines: true }).data;

// Mirror of the worker's displayCell so keys built from display rows can be
// compared with keys built from raw master rows.
const displayMirror = (value) => {
  const s = value === null || value === undefined ? '' : String(value).trim();
  const norm = s === '' ? '(خالی)' : s
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .trim();
  return norm;
};
const toDisplayRow = (row) => {
  const out = {};
  for (const k of Object.keys(row)) out[k] = displayMirror(row[k]);
  return out;
};

const OFFERING = 'كد ارائه كلاس درس';
const codeOf = (r) => String(r[OFFERING] ?? '').trim();
const codeCounts = new Map();
rows.forEach((r) => codeCounts.set(codeOf(r), (codeCounts.get(codeOf(r)) || 0) + 1));
const dupCodes = [...codeCounts.entries()].filter(([, c]) => c > 1);

console.log('[1] COMPOSITE IDENTITY (rowKeyOf):');

check('every one of the real rows gets a distinct key', () => {
  const keys = new Set(rows.map(rowKeyOf));
  assert(keys.size === rows.length, `distinct=${keys.size} rows=${rows.length}`);
});

check('keys are stable between raw rows and worker-style display rows', () => {
  for (let i = 0; i < rows.length; i++) {
    const raw = rowKeyOf(rows[i]);
    const disp = rowKeyOf(toDisplayRow(rows[i]));
    if (raw !== disp) throw new Error(`row ${i}: raw != display (${JSON.stringify(raw)} vs ${JSON.stringify(disp)})`);
  }
});

check('duplicate offering codes produce different keys per offering', () => {
  assert(dupCodes.length > 0, 'fixture expected duplicate codes in data');
  let checkedGroups = 0;
  for (const [code] of dupCodes) {
    const group = rows.filter((r) => codeOf(r) === code);
    const keys = new Set(group.map(rowKeyOf));
    if (keys.size !== group.length) throw new Error(`code ${code}: ${group.length} rows share ${keys.size} keys`);
    checkedGroups += 1;
  }
  assert(checkedGroups === dupCodes.length, 'all duplicate groups checked');
  console.log(`     (validated ${checkedGroups} duplicate code groups)`);
});

check('uidSlug is deterministic, URL-safe, and injective (ISSUE 3)', () => {
  const k = rowKeyOf(rows[0]);
  assert(uidSlug(k) === uidSlug(k), 'must be deterministic');
  // base64url alphabet only (RFC 4648 section 5), no padding.
  assert(/^[A-Za-z0-9_-]+$/.test(uidSlug(k)), `charset: ${uidSlug(k).slice(0, 30)}`);
  // Injective over the WHOLE dataset: distinct identities never share a slug.
  const slugs = new Set(rows.map((r) => uidSlug(rowKeyOf(r))));
  assert(slugs.size === rows.length, `distinct slugs ${slugs.size} for ${rows.length} rows`);
});

check('ICS UIDs stay unique and stable when the cart order changes (ISSUE 3)', () => {
  const a = generateIcsCalendar([rows[0], rows[1], rows[5]]);
  const b = generateIcsCalendar([rows[5], rows[1], rows[0]]);
  const uidsOf = (t) => [...t.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]).sort();
  assert(JSON.stringify(uidsOf(a)) === JSON.stringify(uidsOf(b)), 'UID set must be reorder-invariant');
  const uniq = new Set(uidsOf(a));
  assert(uniq.size === uidsOf(a).length, 'no duplicate UIDs');
});

check('long Persian identities fold into valid, unfoldable UID lines (ISSUE 3)', () => {
  const longRow = { ...rows[0], 'نام درس': rows[0]['نام درس'] + ' با نام بلند ' + 'تکراری '.repeat(12) };
  const ics = generateIcsCalendar([longRow]);
  const enc = new TextEncoder();
  const lines = ics.split('\r\n');
  assert(lines.every((l) => enc.encode(l).length <= 75), 'all physical lines within 75 octets');
  // Unfold and confirm the UID comes back whole and still unique-shaped.
  const unfolded = [];
  for (const l of lines) {
    if (l.startsWith(' ')) unfolded[unfolded.length - 1] += l.slice(1);
    else unfolded.push(l);
  }
  const uids = unfolded.filter((l) => l.startsWith('UID:'));
  assert(uids.length > 0, 'UID lines survive folding');
  assert(uids.every((u) => /^UID:course-(class|exam)-[A-Za-z0-9_-]+(-\d+)?@iaushiraz\.ir$/.test(u)),
    `unfolded UID shape: ${uids[0]?.slice(0, 60)}`);
});

console.log('[2] LEGACY MIGRATION (migrateBookmarkKeys):');

check('new-format keys pass through untouched', () => {
  const keys = rows.slice(0, 5).map(rowKeyOf);
  const { keys: out, changed, unresolved } = migrateBookmarkKeys(keys, rows);
  assert(!changed && unresolved.length === 0, 'new keys must be recognized as current');
  assert(out.join('|') === keys.join('|'), 'values must be identical');
});

check('legacy single-code keys migrate when the code matches exactly one row', () => {
  const uniqueCode = [...codeCounts.entries()].find(([, c]) => c === 1)[0];
  const expected = rowKeyOf(rows.find((r) => codeOf(r) === uniqueCode));
  const { keys, changed, unresolved } = migrateBookmarkKeys([uniqueCode], rows);
  assert(changed && unresolved.length === 0, 'unique code must migrate cleanly');
  assert(keys[0] === expected, `mapped to ${JSON.stringify(keys[0])}, expected ${JSON.stringify(expected)}`);
});

check('ambiguous codes are excluded from active keys and reported (ISSUE 2)', () => {
  const [dupCode] = dupCodes[0];
  const { keys, changed, unresolved } = migrateBookmarkKeys([dupCode], rows);
  assert(keys.length === 0, 'ambiguous code must NOT stay in the active list');
  assert(changed === true, 'the active list changed shape');
  assert(unresolved.length === 1 && unresolved[0].kind === 'ambiguous' && unresolved[0].code === dupCode,
    'the ambiguity is reported for the resolution dialog');
});

check('mixed legacy lists migrate resolvable keys and park the rest', () => {
  const uniqueCode = [...codeCounts.entries()].find(([, c]) => c === 1)[0];
  const [dupCode] = dupCodes[0];
  const expected = rowKeyOf(rows.find((r) => codeOf(r) === uniqueCode));
  const { keys, unresolved, changed } = migrateBookmarkKeys([dupCode, uniqueCode], rows);
  assert(keys.length === 1 && keys[0] === expected, 'only the unique code migrates');
  assert(changed === true && unresolved.length === 1 && unresolved[0].key === dupCode,
    'one migrated, one parked for the user');
});

check('legacy 7-field composite keys map to the current composite', () => {
  const legacy = ['كد ارائه كلاس درس', 'كد درس', 'نام درس', 'استاد', 'زمانبندي تشكيل كلاس', 'زمان امتحان', 'مكان برگزاري']
    .map((f) => canonicalKeyField(rows[0][f])).join('\u0001');
  const expected = rowKeyOf(rows[0]);
  const { keys } = migrateBookmarkKeys([legacy], rows);
  assert(keys[0] === expected, 'legacy tuple must map to the composite key');
});

check('legacy composite without a resolvable room still migrates', () => {
  // Simulates a key written by the old rowKeyOf using the other ك spelling,
  // which left the location field empty.
  const fields = ['كد ارائه كلاس درس', 'كد درس', 'نام درس', 'استاد', 'زمانبندي تشكيل كلاس', 'زمان امتحان']
    .map((f) => canonicalKeyField(rows[0][f]));
  const legacyNoRoom = [...fields, ''].join('\u0001');
  const expected = rowKeyOf(rows[0]);
  const { keys } = migrateBookmarkKeys([legacyNoRoom], rows);
  assert(keys[0] === expected, `got ${JSON.stringify(keys[0])}`);
});

check('unknown codes are parked as missing, never silently discarded (ISSUE 2)', () => {
  const { keys, changed, unresolved } = migrateBookmarkKeys(['99999999'], rows);
  assert(keys.length === 0 && changed === true, 'unknown key must leave the active list');
  assert(unresolved.length === 1 && unresolved[0].kind === 'missing' && unresolved[0].key === '99999999',
    'must be reported as missing for the dialog');
});

check('reconcileLegacyKeys merges active + stored pending sets (ISSUE 2)', () => {
  const [dupCode] = dupCodes[0];
  const uniqueCode = [...codeCounts.entries()].find(([, c]) => c === 1)[0];
  // Active list already migrated; store still holds the ambiguous key.
  const r1 = reconcileLegacyKeys([rowKeyOf(rows[0])], [dupCode], rows);
  assert(r1.activeKeys.length === 1, 'active key survives');
  assert(r1.pendingLegacy.length === 1 && r1.pendingLegacy[0].key === dupCode, 'stored pending key re-classified');
  // Idempotence: reconciling the OUTPUT again produces the same result, so the
  // App effect can never loop on its own writes.
  const r2 = reconcileLegacyKeys(r1.activeKeys, r1.pendingLegacy.map((u) => u.key), rows);
  assert(JSON.stringify(r2) === JSON.stringify(r1), 'second pass is identical');
});

check('reconcileLegacyKeys migrates a stored key once the dataset gains it (ISSUE 2)', () => {
  // A code that was missing can appear in a future dataset: simulate by
  // reconciling against a fixture that CONTAINS the stored code.
  const stored = '777777';
  const fixtureRow = { ...rows[0], 'كد ارائه كلاس درس': stored };
  const fixtureData = [fixtureRow, ...rows.slice(0, 3)];
  const r = reconcileLegacyKeys([], [stored], fixtureData);
  assert(r.pendingLegacy.length === 0, 'no longer pending');
  assert(r.changed === true && r.activeKeys[0] === rowKeyOf(fixtureRow), 'auto-migrated into active');
});

console.log('[3] CONFLICT SELF-PAIRING (detectConflicts):');

check('distinct offerings sharing a code still conflict when they truly overlap', () => {
  // Codes 69/70/71 each pair "ورزش 1" with "تربيت بدني" in the same slot.
  const group = rows.filter((r) => codeOf(r) === '71');
  assert(group.length === 2, 'fixture: two rows share code 71');
  const result = detectConflicts(group);
  assert(result.scheduleConflicts.length === 1, `expected 1 genuine conflict, got ${result.scheduleConflicts.length}`);
  assert(result.hasConflicts === true, 'hasConflicts must be true');
});

check('identical tuples never conflict with themselves', () => {
  const twin = { ...rows[0] };
  const result = detectConflicts([rows[0], twin]);
  assert(result.scheduleConflicts.length === 0, 'self-pairs must be skipped');
  assert(result.hasConflicts === false, 'no conflict for identical tuples');
});

console.log('[4] ICS UID UNIQUENESS (generateIcsCalendar):');

check('UIDs are unique across the full dataset including duplicate codes', () => {
  const ics = generateIcsCalendar(rows);
  const uids = [...ics.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]);
  assert(uids.length > 0, 'calendar must contain events');
  const unique = new Set(uids);
  assert(unique.size === uids.length, `${uids.length - unique.size} duplicate UID(s)`);
  console.log(`     (${uids.length} event UIDs across ${rows.length} rows)`);
});

console.log('──────────────────────────────');
console.log(`RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
