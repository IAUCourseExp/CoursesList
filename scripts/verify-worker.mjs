// Verification harness for src/worker.js - runs the REAL worker module in Node with a
// stubbed `self`, fed the REAL public/data.csv through a data: URL. No browser needed.
//
//   npm run verify        (or: node scripts/verify-worker.mjs)
//
import fs from 'node:fs';
import Papa from 'papaparse';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const CSV = fs.readFileSync(path.join(REPO, 'public/data.csv'), 'utf8');

const sent = [];
globalThis.self = { postMessage: (m) => sent.push(m), onmessage: null };
await import('../src/worker.js');

const { parseSchedule, parseExam } = await import('../src/lib/datetime.js');

const lastOf = (type) => [...sent].reverse().find((m) => m.type === type);
const waitFor = async (type, timeout = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const m = lastOf(type);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`timeout waiting for ${type}`);
};

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ' - ' + extra : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' - ' + extra : ''}`); }
};

const SCHEDULE_COL = 'زمانبندي تشكيل كلاس';
const EXAM_COL = 'زمان امتحان';
const isBlank = (v) => v === '' || v === '(خالی)' || v === null || v === undefined;

console.log('CoursesList - worker.js verification\n');

// ── 1. INIT ───────────────────────────────────────────────────────────────────
console.log('[1] INIT: parse public/data.csv');
const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(CSV);
await self.onmessage({ data: { type: 'INIT', payload: { url: dataUrl, cachedText: null } } });
const loaded = await waitFor('DATA_LOADED');
const rows = loaded.payload.data;
const cols = loaded.payload.columns;
check('DATA_LOADED received', !!loaded);
const expectedRowCount = Papa.parse(CSV, { header: true, skipEmptyLines: true }).data.length;
check('row count matches the parsed CSV', rows.length === expectedRowCount, `got ${rows.length}, expected ${expectedRowCount}`);
check('column count == 22 (phantom column removed)', cols.length === 22, `got ${cols.length}`);
check('phantom "" column is gone', !cols.includes(''));
check('no row carries the "" key', rows.every((r) => !('' in r)));
check('Persian headers intact', cols.includes('نام درس') && cols.includes('استاد') && cols.includes(SCHEDULE_COL));
check('no ERROR emitted', !lastOf('ERROR'));

// ── 2. search ─────────────────────────────────────────────────────────────────
console.log('\n[2] QUERY: full-text search (Persian normalisation)');
const query = async (payload) => {
  const before = sent.filter((m) => m.type === 'QUERY_RESULTS').length;
  await self.onmessage({ data: { type: 'QUERY', payload } });
  for (let i = 0; i < 3000; i++) {
    const rs = sent.filter((m) => m.type === 'QUERY_RESULTS');
    if (rs.length > before) return rs[rs.length - 1].payload.rows;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('no QUERY_RESULTS');
};
const Q = (search, filters = {}, sort = { column: null, direction: 'asc' }) => query({ search, filters, sort });

const all = await Q('');
check('empty query returns all rows', all.length === expectedRowCount, `got ${all.length}, expected ${expectedRowCount}`);
const ai = await Q('هوش مصنوعی');
check(
  'search finds a term',
  ai.length > 0 && ai.length < expectedRowCount,
  `هوش مصنوعی → ${ai.length} of ${expectedRowCount}`,
);
check('every hit really contains the term',
  ai.every((r) => Object.values(r).some((v) => String(v).includes('هوش مصنوعی'))));
check('Arabic ي normalised to Persian ی in the query',
  (await Q('هوش مصنوعي')).length === ai.length);
check('Arabic ك in the query works', (await Q('كلاس')).length > 0);
check('Persian digits in the query match', (await Q('۱۴۰۵')).length > 0, `۱۴۰۵ → ${(await Q('۱۴۰۵')).length} rows`);
check('nonsense query → 0 rows', (await Q('zzzznomatchzzzz')).length === 0);

// ── 3. filters ────────────────────────────────────────────────────────────────
console.log('\n[3] QUERY: facet filters');
check('filter narrows and matches exactly',
  (await Q('', { 'نوع درس': ['نظري'] }, { column: null, direction: 'asc' })).every((r) => r['نوع درس'] === 'نظری'));
check('multiple values are OR-ed',
  (await Q('', { 'نوع درس': ['نظري', 'عملي'] }, { column: null, direction: 'asc' }))
    .every((r) => r['نوع درس'] === 'نظری' || r['نوع درس'] === 'عملی'));
check('two columns are AND-ed',
  (await Q('', { 'نوع درس': ['نظري'], 'استان': ['71 - فارس(71)'] }, { column: null, direction: 'asc' }))
    .every((r) => r['نوع درس'] === 'نظری' && r['استان'] === '71 - فارس(71)'));

// محاسبه پویا برای جلوگیری از شکست تست هنگام آپدیت لیست اساتید
const expectedEmptyProf = all.filter((r) => isBlank(r['استاد'])).length;
check('"(خالی)" is filterable (empty professor)',
  (await Q('', { 'استاد': ['(خالی)'] }, { column: null, direction: 'asc' })).length === expectedEmptyProf,
  `${expectedEmptyProf} rows have no professor`);

// ── 4. sorting ────────────────────────────────────────────────────────────────
console.log('\n[4] QUERY: sorting');
const numeric = await Q('', {}, { column: 'حداكثر ظرفيت', direction: 'asc' });
const nums = numeric.map((r) => Number(r['حداكثر ظرفيت'])).filter((n) => !Number.isNaN(n));
check('numeric column sorts numerically', nums.every((n, i) => i === 0 || nums[i - 1] <= n),
  `first ${nums[0]} last ${nums.at(-1)}`);
const numericDesc = await Q('', {}, { column: 'حداكثر ظرفيت', direction: 'desc' });
const numsD = numericDesc.map((r) => Number(r['حداكثر ظرفيت'])).filter((n) => !Number.isNaN(n));
check('descending is the mirror of ascending', numsD[0] === nums.at(-1) && numsD.at(-1) === nums[0]);

const textAsc = await Q('', {}, { column: 'نام درس', direction: 'asc' });
// Parse the CSV with Papa (same parser the worker uses) instead of the previous
// hand-rolled regex. The old regex only matched quoted cells, so every unquoted
// row contributed '' to the expected list and the two arrays could never line up.
const rawNames = Papa.parse(CSV, { header: true, skipEmptyLines: true })
  .data.map((r) => r['نام درس'] ?? '');
const norm1 = (v) => String(v).replace(/\u064A/g, '\u06CC').replace(/\u0643/g, '\u06A9').trim() || '(خالی)';
const expectedNames = rawNames
  .slice()
  .sort((a, b) => String(a).localeCompare(String(b), 'fa'))
  .map(norm1);
check('text column matches an independently computed raw-string sort',
  textAsc.map((r) => r['نام درس']).join('\u0001') === expectedNames.join('\u0001'),
  `first actual "${textAsc[0]['نام درس']}" vs expected "${expectedNames[0]}"`);

// exam dates - chronological order
const examAsc = await Q('', {}, { column: EXAM_COL, direction: 'asc' });
const examKeys = examAsc.filter((r) => !isBlank(r[EXAM_COL])).map((r) => parseExam(r[EXAM_COL])?.sortKey ?? null);
check('exam ASC: every row has a parseable date', examKeys.every((k) => k !== null));
check('exam ASC is chronological', examKeys.every((k, i) => i === 0 || examKeys[i - 1] <= k),
  `${examKeys[0]} → ${examKeys.at(-1)}`);
const examDesc = await Q('', {}, { column: EXAM_COL, direction: 'desc' });
const examKeysD = examDesc.filter((r) => !isBlank(r[EXAM_COL])).map((r) => parseExam(r[EXAM_COL])?.sortKey ?? null);
check('exam DESC is reverse-chronological', examKeysD.every((k, i) => i === 0 || examKeysD[i - 1] >= k),
  `${examKeysD[0]} → ${examKeysD.at(-1)}`);
const distinctExamDates = new Set(examKeys).size;
const oldKeys = examAsc.filter((r) => !isBlank(r[EXAM_COL])).map((r) => parseFloat(r[EXAM_COL]));
const oldDistinct = new Set(oldKeys).size;
check(
  'REGRESSION: old parseFloat key saw only years, new key sees real dates',
  oldDistinct > 0 && oldDistinct <= 2 && distinctExamDates > oldDistinct * 5,
  `old key: ${oldDistinct} distinct, new key: ${distinctExamDates} distinct`,
);
const yearCounts = new Map();
examKeys.forEach((k) => {
  const y = String(k).slice(0, 4);
  yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
});
const dominantYear = [...yearCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
const distinctInDominantYear = new Set(
  examKeys.filter((k) => String(k).startsWith(dominantYear)),
).size;
check(
  'exam sort distinguishes multiple dates within a year',
  distinctInDominantYear > 1,
  `${distinctInDominantYear} distinct ${dominantYear} dates`,
);

// محاسبه پویا برای سطرهای خالی امتحان
const blankExamCount = all.filter((r) => isBlank(r[EXAM_COL])).length;
check('blank exam rows sit at the END when ascending',
  examAsc.slice(-blankExamCount).every((r) => isBlank(r[EXAM_COL])), `${blankExamCount} rows have no exam date`);
check('blank exam rows sit at the END when descending too',
  examDesc.slice(-blankExamCount).every((r) => isBlank(r[EXAM_COL])));

// schedule - day order then start time
const schedAsc = await Q('', {}, { column: SCHEDULE_COL, direction: 'asc' });
const sched = schedAsc.filter((r) => !isBlank(r[SCHEDULE_COL])).map((r) => parseSchedule(r[SCHEDULE_COL]));
check('schedule ASC: all schedule cells parse', sched.every(Boolean));
check('schedule ASC groups شنبه → جمعه then orders by start time', sched.every((p, i) => {
  if (i === 0) return true;
  const prev = sched[i - 1];
  if (prev.dayIndex !== p.dayIndex) return prev.dayIndex < p.dayIndex;
  return prev.startMinutes <= p.startMinutes;
}), `${sched.length} scheduled rows`);

// محاسبه پویا برای سطرهای خالی زمانبندی کلاس
const blankSchedCount = all.filter((r) => isBlank(r[SCHEDULE_COL])).length;
check('blank schedule rows sit at the END when ascending',
  schedAsc.slice(-blankSchedCount).every((r) => isBlank(r[SCHEDULE_COL])), `${blankSchedCount} rows have no schedule`);
check('blank schedule rows sit at the END when descending too',
  (await Q('', {}, { column: SCHEDULE_COL, direction: 'desc' })).slice(-blankSchedCount)
    .every((r) => isBlank(r[SCHEDULE_COL])));

// ── 5. display normalisation ──────────────────────────────────────────────────
console.log('\n[5] Cell display normalisation');
check('empty cells become "(خالی)"', all.some((r) => Object.values(r).includes('(خالی)')));
check('no null/undefined cells survived', all.every((r) => Object.values(r).every((v) => typeof v === 'string')));
check('Arabic ي is normalised in output', !all.some((r) => Object.values(r).some((v) => v.includes('ي'))));
check('Arabic ك is normalised in output', !all.some((r) => Object.values(r).some((v) => v.includes('ك'))));
check('query result rows contain exactly the 22 columns',
  all.every((r) => Object.keys(r).length === 22));

// ── 6. facets ─────────────────────────────────────────────────────────────────
console.log('\n[6] FACETS');
const facetFor = async (column) => {
  const n = sent.filter((m) => m.type === 'FACETS_RESULT').length;
  await self.onmessage({ data: { type: 'FACETS', payload: { column } } });
  for (let i = 0; i < 4000; i++) {
    const rs = sent.filter((m) => m.type === 'FACETS_RESULT');
    if (rs.length > n) return rs[rs.length - 1].payload;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('no FACETS_RESULT');
};
const fUnit = await facetFor('واحد');
check(
  'facets returned for a column',
  fUnit.column === 'واحد' && fUnit.values.length > 0,
  `${fUnit.values.length} values`,
);
check(
  'facet counts sum to the row total',
  fUnit.values.reduce((a, b) => a + b.count, 0) === expectedRowCount,
  `sum = ${fUnit.values.reduce((a, b) => a + b.count, 0)}, expected ${expectedRowCount}`,
);
check('facets are sorted by count desc', fUnit.values.every((v, i) => i === 0 || fUnit.values[i - 1].count >= v.count));
check('top facet value is شیراز', fUnit.values[0].value.includes('شیراز'), `"${fUnit.values[0].value}" × ${fUnit.values[0].count}`);
check('"(خالی)" is a real facet bucket', (await facetFor('مكان برگزاري')).values.some((v) => v.value === '(خالی)'));
const beforeCount = sent.filter((m) => m.type === 'FACETS_RESULT').length;
await self.onmessage({ data: { type: 'FACETS', payload: { column: 'ستون_نامعتبر' } } });
check('unknown column is ignored', sent.filter((m) => m.type === 'FACETS_RESULT').length === beforeCount);
await self.onmessage({ data: { type: 'FACETS', payload: { column: '' } } });
check('phantom column cannot be filtered', sent.filter((m) => m.type === 'FACETS_RESULT').length === beforeCount);

// ── 7. errors ─────────────────────────────────────────────────────────────────
console.log('\n[7] Error handling');
sent.length = 0;
await self.onmessage({ data: { type: 'INIT', payload: { url: 'http://127.0.0.1:1/nope.csv', cachedText: null } } });
await new Promise((r) => setTimeout(r, 300));
check('unreachable URL emits ERROR instead of crashing', !!lastOf('ERROR'),
  String(lastOf('ERROR')?.payload?.message).slice(0, 40));

console.log(`\n──────────────────────────────\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);