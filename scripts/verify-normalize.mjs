// BUG-08 regression tests: shared normalization + index-mapped highlighting.
// Pure Node (no browser): run with `node scripts/verify-normalize.mjs`.

import { normalizeFarsi, normalizeDisplay, toAsciiDigits } from '../src/lib/normalize.js';
import { buildHighlighter } from '../src/lib/format.js';

let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (err) { failed++; console.log(`  ❌ ${name}\n     ${err?.message || err}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };

console.log('[1] SHARED NORMALIZATION (lib/normalize.js):');

check('digit variants unify in both directions', () => {
  assert(normalizeFarsi('۱۴۰۵') === '1405' && normalizeFarsi('٠٩') === '09');
  assert(toAsciiDigits('۱۲٣') === '123');
});

check('Arabic ي/ك unify to Persian forms', () => {
  assert(normalizeFarsi('كلاس') === 'کلاس' && normalizeFarsi('ميكرو') === 'میکرو');
});

check('transforms are length-preserving (except outer trim)', () => {
  const s = '  برنامه‌نویسی ۱۴۰۵ ';
  const n = normalizeFarsi(s);
  assert(n === 'برنامه‌نویسی 1405', `got ${JSON.stringify(n)}`);
  assert(s.length - s.trimStart().length === 2, 'two leading whitespace chars removed');
  assert(n.length === s.trim().length, 'length parity with trimmed source');
});

check('display normalization keeps digits ASCII and trims only', () => {
  assert(normalizeDisplay('  حسين ۱۲ ') === 'حسین 12');
});

console.log('[2] HIGHLIGHT INDEX MAPPING (buildHighlighter):');

check('match position is exact when digit variants precede the match', () => {
  const h = buildHighlighter('پیشرفته');
  const segs = h('درس ۱۴۰۵: برنامه‌نویسی پیشرفته است');
  const hit = segs.find((p) => p.hit);
  assert(hit && hit.text === 'پیشرفته', `hit=${JSON.stringify(hit)}`);
  assert(segs.map((p) => p.text).join('') === 'درس ۱۴۰۵: برنامه‌نویسی پیشرفته است', 'segments must rebuild the original');
});

check('ZWNJ before the match no longer shifts the highlight', () => {
  const cell = 'برنامه‌نویسی پیشرفته';
  const h = buildHighlighter('پیشرفته');
  const segs = h(cell);
  const hit = segs.find((p) => p.hit);
  assert(hit && hit.text === 'پیشرفته', `hit=${JSON.stringify(hit)}`);
  const before = segs.slice(0, segs.indexOf(hit)).map((p) => p.text).join('');
  assert(before === 'برنامه‌نویسی ', `prefix=${JSON.stringify(before)}`);
});

check('query with ZWNJ matches ZWNJ-bearing text (worker parity)', () => {
  const h = buildHighlighter('برنامه‌نویسی');
  const segs = h('برنامه‌نویسی پیشرفته');
  const hit = segs.find((p) => p.hit);
  assert(hit && hit.text === 'برنامه‌نویسی', `hit=${JSON.stringify(hit)}`);
});

check('Arabic ي/ك spellings highlight with a Persian query', () => {
  const h = buildHighlighter('میکرو');
  const segs = h('ميكروبيولوژي');
  const hit = segs.find((p) => p.hit);
  assert(hit && hit.text === 'ميكرو', `hit=${JSON.stringify(hit)}`);
});

check('leading/trailing whitespace survives highlighting', () => {
  const h = buildHighlighter('ریاضی');
  const segs = h('  ریاضی عمومی  ');
  assert(segs.map((p) => p.text).join('') === '  ریاضی عمومی  ', JSON.stringify(segs));
  assert(segs.find((p) => p.hit)?.text === 'ریاضی');
});

check('multiple matches all highlight, none overlap', () => {
  const h = buildHighlighter('ریاضی');
  const segs = h('ریاضی ۱ و ریاضی ۲');
  const hits = segs.filter((p) => p.hit);
  assert(hits.length === 2 && hits.every((p) => p.text === 'ریاضی'), JSON.stringify(segs));
});

check('non-matching text returns null', () => {
  assert(buildHighlighter('فارسی')('کاملاً بی‌ربط') === null);
});

check('empty query builds no highlighter', () => {
  assert(buildHighlighter('') === null && buildHighlighter('   ') === null);
});

console.log('──────────────────────────────');
console.log(`RESULT: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
