// BUG-01 regression tests: shared-plan import semantics and URL round-trips.
// Pure Node (no browser, no server): run with `node scripts/verify-share.mjs`.

import { sanitizeSharedKeys, computeImport, computeUndo, MAX_SHARE_KEYS } from '../src/lib/shareImport.js';
import { reconcileLegacyKeys } from '../src/lib/format.js';
import Papa from 'papaparse';
import fs from 'node:fs';

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

console.log('[1] PAYLOAD SANITIZING (sanitizeSharedKeys):');

check('null / non-array payloads are rejected', () => {
  assert(sanitizeSharedKeys(null) === null, 'null must be null');
  assert(sanitizeSharedKeys(undefined) === null, 'undefined must be null');
  assert(sanitizeSharedKeys('123||456') === null, 'string payload must be null');
  assert(sanitizeSharedKeys({}) === null, 'object payload must be null');
});

check('empty and whitespace-only payloads are rejected', () => {
  assert(sanitizeSharedKeys([]) === null, '[] must be null');
  assert(sanitizeSharedKeys(['', '   ']) === null, 'blank keys must be null');
});

check('non-string entries are dropped, valid keys survive', () => {
  const out = sanitizeSharedKeys(['a1', 42, null, { x: 1 }, 'b2']);
  assert(out.length === 2 && out[0] === 'a1' && out[1] === 'b2', `got ${JSON.stringify(out)}`);
});

check('duplicate keys are de-duplicated order-stably', () => {
  const out = sanitizeSharedKeys(['k2', 'k1', 'k2', 'k3', 'k1']);
  assert(out.join(',') === 'k2,k1,k3', `got ${JSON.stringify(out)}`);
});

check('oversized payloads are rejected', () => {
  const big = Array.from({ length: MAX_SHARE_KEYS + 1 }, (_, i) => `k${i}`);
  assert(sanitizeSharedKeys(big) === null, 'payload above MAX_SHARE_KEYS must be null');
  const ok = Array.from({ length: MAX_SHARE_KEYS }, (_, i) => `k${i}`);
  assert(sanitizeSharedKeys(ok)?.length === MAX_SHARE_KEYS, 'payload at MAX_SHARE_KEYS is accepted');
});

console.log('[2] IMPORT SEMANTICS (computeImport):');

check('replace swaps the whole selection and reports the delta', () => {
  const r = computeImport('replace', ['a', 'b'], ['c', 'd']);
  assert(r.keys.join(',') === 'c,d', `keys ${JSON.stringify(r.keys)}`);
  assert(r.added.join(',') === 'c,d' && r.removed.join(',') === 'a,b', 'delta wrong');
});

check('merge keeps local order and appends unseen shared keys', () => {
  const r = computeImport('merge', ['a', 'b'], ['c', 'a', 'd']);
  assert(r.keys.join(',') === 'a,b,c,d', `keys ${JSON.stringify(r.keys)}`);
  assert(r.added.join(',') === 'c,d' && r.removed.length === 0, 'delta wrong');
});

check('identical plans produce an empty delta (no undo needed)', () => {
  const r = computeImport('replace', ['a', 'b'], ['b', 'a']);
  assert(r.keys.join(',') === 'b,a', 'replace keeps shared order');
  assert(r.added.length === 0 && r.removed.length === 0, 'delta must be empty');
  const m = computeImport('merge', ['a', 'b'], ['b', 'a']);
  assert(m.added.length === 0 && m.removed.length === 0, 'merge delta must be empty');
});

check('both sides are de-duplicated', () => {
  const r = computeImport('merge', ['a', 'a', 'b'], ['b', 'c', 'c']);
  assert(r.keys.join(',') === 'a,b,c', `keys ${JSON.stringify(r.keys)}`);
  assert(r.added.join(',') === 'c', 'added wrong');
});

check('empty local list with replace equals the shared plan', () => {
  const r = computeImport('replace', [], ['x', 'y']);
  assert(r.keys.join(',') === 'x,y' && r.added.join(',') === 'x,y', 'delta wrong');
});

console.log('[3] UNDO SEMANTICS (computeUndo):');

check('undo reverts exactly what the import changed', () => {
  const r = computeImport('merge', ['a', 'b'], ['c', 'd']);
  const back = computeUndo({ added: r.added, removed: r.removed }, r.keys);
  assert(back.join(',') === 'a,b,c,d'.replace(',c,d', '') , `undo ${JSON.stringify(back)}`);
  assert(back.join(',') === 'a,b', `undo got ${JSON.stringify(back)}`);
});

check('undo preserves unrelated changes made AFTER the import', () => {
  // import merged c,d into [a,b]; user then removes 'a' and adds 'e'
  const afterUserEdits = ['b', 'c', 'd', 'e'];
  const back = computeUndo({ added: ['c', 'd'], removed: [] }, afterUserEdits);
  // c,d are removed again (import added them), user's 'e' stays, 'a' not resurrected
  assert(back.join(',') === 'b,e', `undo got ${JSON.stringify(back)}`);
});

check('undo restores keys the import removed (replace case)', () => {
  const r = computeImport('replace', ['a', 'b'], ['c']);
  const afterUserEdits = ['c', 'e']; // user added e after importing
  const back = computeUndo({ added: r.added, removed: r.removed }, afterUserEdits);
  // 'c' was added by the import, so undo takes it out again; 'e' survives;
  // 'a','b' come back: undo reverts only the import delta.
  assert(back.join(',') === 'e,a,b', `undo got ${JSON.stringify(back)}`);
});

check('undo of an empty delta keeps the list untouched', () => {
  const back = computeUndo({ added: [], removed: [] }, ['a']);
  assert(back.join(',') === 'a', 'empty delta must not change anything');
});

console.log('[4] SHARE URL ROUND-TRIPS (producer/consumer contract):');

// Producer (App.handleShare / CartDrawer.handleShareLink): raw '||'-joined
// keys through URL.searchParams.set. Consumer (getInitialStateFromURL):
// searchParams.get().split('||') with NO second decode.
function produce(keys) {
  const url = new URL('https://iaucourseexp.github.io/CoursesList/');
  url.search = '';
  url.searchParams.set('b', keys.join('||'));
  return url.toString();
}
function consume(href) {
  return new URL(href).searchParams.get('b').split('||');
}

check('composite unicode keys survive the share-URL round trip', () => {
  const keys = [
    ['163515999', 'معادلات ديفرانسيل', 'مريم سپاسي', 'سه شنبه  از 13:15 تا 15:45', '1405/10/16 از 08:00 تا 10:00'].join('\u0001'),
    ['71', 'ورزش 1', 'مهدي نورا', 'سه شنبه  از 11:00 تا 12:45', ''].join('\u0001'),
    ['650', 'برنامه‌سازی پیشرفته', 'x', 'y', 'z'].join('\u0001'),
  ];
  const decoded = consume(produce(keys));
  assert(decoded.length === 3, `split produced ${decoded.length} keys`);
  decoded.forEach((k, i) => assert(k === keys[i], `key ${i} round-trip mismatch`));
  assert(sanitizeSharedKeys(decoded).length === 3, 'sanitizer must accept round-tripped keys');
});

check('keys containing percent signs survive the round trip', () => {
  const keys = ['50%off', 'a%2Bb', '100%'];
  const decoded = consume(produce(keys));
  assert(decoded.join(',') === keys.join(','), `got ${JSON.stringify(decoded)}`);
});

check('keys containing + and spaces survive the round trip', () => {
  const keys = ['a+b', 'two words', 'c+d e'];
  const decoded = consume(produce(keys));
  assert(decoded.join(',') === keys.join(','), `got ${JSON.stringify(decoded)}`);
});

check('legacy single-code links (per-key encoded, numeric) still resolve', () => {
  // Old producers wrote ?b=<encodeURIComponent(k1)>||<encodeURIComponent(k2)>.
  // Numeric offering codes contain no '%' or '|', so the legacy URL form is
  // byte-identical to the new one and the same consumer reads it correctly.
  const keys = ['163515999', '71', '650'];
  const legacyHref = `https://iaucourseexp.github.io/CoursesList/?b=${keys.map(encodeURIComponent).join('||')}`;
  const decoded = consume(legacyHref);
  assert(decoded.join(',') === keys.join(','), `got ${JSON.stringify(decoded)}`);
});

check('?f= filter JSON round-trips, including percent signs (BUG-09)', () => {
  // Producer (App URL sync): params.set('f', JSON.stringify(filters)).
  // Consumer: params.get('f') -> JSON.parse with NO second decode.
  const filters = { 'نوع درس': ['نظري'], 'نام درس': ['50% تخفیف'], 'استاد': ['a+b'] };
  const url = new URL('https://iaucourseexp.github.io/CoursesList/');
  url.searchParams.set('f', JSON.stringify(filters));
  const restored = JSON.parse(url.searchParams.get('f'));
  assert(JSON.stringify(restored) === JSON.stringify(filters), `got ${JSON.stringify(restored)}`);
});

check('malformed ?f= values fail gracefully (caller catches to {})', () => {
  const url = new URL('https://x.test/?f=not-json%25zz');
  let filters = {};
  try { filters = JSON.parse(url.searchParams.get('f')); } catch { filters = {}; }
  assert(filters && typeof filters === 'object', 'must degrade to an empty object');
});

console.log('[5] LEGACY KEYS ARRIVING THROUGH SHARED LINKS (ISSUE 2):');

const legacyRows = Papa.parse(
  fs.readFileSync(new URL('../public/data.csv', import.meta.url), 'utf8'),
  { header: true, skipEmptyLines: true },
).data;

check('a legacy single-code key from a shared link resolves like a local bookmark', () => {
  // Pick a genuinely unique code from the live data (163515999, for instance,
  // is one of the 88 DUPLICATE codes and must not be used here).
  const counts = new Map();
  legacyRows.forEach((r) => {
    const c = String(r['كد ارائه كلاس درس'] ?? '').trim();
    counts.set(c, (counts.get(c) || 0) + 1);
  });
  const uniqueCode = [...counts.entries()].find(([, n]) => n === 1)[0];
  const href = `https://iaucourseexp.github.io/CoursesList/?b=${encodeURIComponent(uniqueCode)}`;
  const decoded = new URL(href).searchParams.get('b').split('||');
  assert(sanitizeSharedKeys(decoded)?.[0] === uniqueCode, 'payload accepts the legacy code');
  const r = reconcileLegacyKeys(decoded, [], legacyRows);
  assert(r.pendingLegacy.length === 0, 'unique code resolves without the dialog');
  assert(r.activeKeys.length === 1 && r.activeKeys[0].length > uniqueCode.length, 'migrated to composite identity');
});

check('an ambiguous legacy code from a shared link lands in the pending store, never auto-assigned', () => {
  const dupCode = '71';
  const href = `https://iaucourseexp.github.io/CoursesList/?b=${dupCode}`;
  const decoded = new URL(href).searchParams.get('b').split('||');
  const r = reconcileLegacyKeys(decoded, [], legacyRows);
  assert(r.activeKeys.length === 0, 'nothing active without a user decision');
  assert(r.pendingLegacy.length === 1 && r.pendingLegacy[0].kind === 'ambiguous', 'parked for resolution');
});

console.log('──────────────────────────────');
console.log(`RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
