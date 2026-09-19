// Date/time + sort-key verification against the REAL data.csv.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import Papa from 'papaparse';
import {
  parseSchedule, scheduleSortKey, parseExam, FA_DAYS, dayIndexOf,
  jalaliToGregorian, jalaliToDate, formatJalaliWithWeekday,
} from '../src/lib/datetime.js';

const CSV_PATH = path.resolve(__dirname, '../public/data.csv');
const rows = Papa.parse(fs.readFileSync(CSV_PATH, 'utf8'), { header: true, skipEmptyLines: true }).data;

let fail = 0;
const ok = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' - ' + extra : ''}`);
  if (!cond) fail++;
};

console.log('── 1. every schedule cell in data.csv must resolve to a weekday');
let parsed = 0, unknown = 0, failed = 0;
const hist = new Map();
for (const row of rows) {
  const v = String(row['زمانبندي تشكيل كلاس'] || '').trim();
  if (!v) continue;
  const p = parseSchedule(v);
  if (!p) { failed++; continue; }
  parsed++;
  if (p.dayIndex === null) unknown++;
  else hist.set(FA_DAYS[p.dayIndex], (hist.get(FA_DAYS[p.dayIndex]) || 0) + 1);
}
ok('every non-empty schedule cell parses', parsed > 0 && failed === 0, `${parsed} parsed, ${failed} failed`);
ok('no unrecognised weekday left', unknown === 0, `${unknown} unknown`);
console.log('     day histogram:', FA_DAYS.map((d) => `${d}=${hist.get(d) || 0}`).join('  '));

console.log('\n── 2. schedule sort keys are ordered شنبه → جمعه, then by start time');
const keys = rows.map((r) => scheduleSortKey(r['زمانبندي تشكيل كلاس'])).filter((k) => k !== null);
ok('all keys inside 0..60555', keys.every((k) => k >= 0 && k <= 60555), `min ${Math.min(...keys)} max ${Math.max(...keys)}`);
const monEarly = scheduleSortKey('دوشنبه  از 07:30 تا 10:15');
const monLate = scheduleSortKey('دوشنبه  از 13:15 تا 15:00');
const tueEarly = scheduleSortKey('سه شنبه  از 07:30 تا 09:15');
ok('Monday 07:30 < Monday 13:15', monEarly < monLate, `${monEarly} < ${monLate}`);
ok('Monday < Tuesday', monEarly < tueEarly, `${monEarly} < ${tueEarly}`);
ok('corrupted row still yields دوشنبه (index 2)',
  dayIndexOf('دوشنبه  از  تا  دوشنبه  از') === 2);
ok('Arabic-spelled يكشنبه recognised (regression)',
  dayIndexOf('يكشنبه') === 1 && dayIndexOf('یک‌شنبه') === 1 && dayIndexOf('یک شنبه') === 1);

console.log('\n── 3. exam dates: Jalali → Gregorian against Intl as the oracle');
const faCal = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'numeric', day: 'numeric' });
const norm = (s) => String(s).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/\s+/g, '');
const distinct = [...new Set(rows.map((r) => String(r['زمان امتحان'] || '').trim()).filter(Boolean))];
let rt = 0, bad = [];
for (const cell of distinct) {
  const p = parseExam(cell);
  if (!p) { bad.push(`unparsed: ${cell}`); continue; }
  const oracle = norm(faCal.format(p.date)).split('/').map(Number);
  if (oracle[0] === p.jy && oracle[1] === p.jm && oracle[2] === p.jd) rt++;
  else bad.push(`${cell} → got ${oracle.join('/')} expected ${p.jy}/${p.jm}/${p.jd}`);
}
ok('every distinct exam cell round-trips through Intl', bad.length === 0, `${rt}/${distinct.length} verified`);
bad.slice(0, 5).forEach((b) => console.log('       ', b));

console.log('\n── 4. anchors & the 2 real sample dates');
const anchors = [[1405, 1, 1, '2026-03-21'], [1404, 1, 1, '2025-03-21'], [1403, 1, 1, '2024-03-20'],
  [1402, 1, 1, '2023-03-21'], [1400, 1, 1, '2021-03-21'], [1399, 12, 30, '2021-03-20'],
  [1405, 7, 1, '2026-09-23'], [1408, 1, 1, '2029-03-20']];
for (const [jy, jm, jd, expected] of anchors) {
  const g = jalaliToGregorian(jy, jm, jd);
  const got = g && `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
  ok(`${jy}/${jm}/${jd} → ${expected}`, got === expected, got);
}
const s1 = formatJalaliWithWeekday(1405, 10, 5);
console.log(`     1405/10/05 → "${s1.label} · ${s1.weekday} · میلادی ${s1.gregorian}"`);
const s2 = formatJalaliWithWeekday(1405, 10, 24);
console.log(`     1405/10/24 → "${s2.label} · ${s2.weekday} · میلادی ${s2.gregorian}"`);
ok('weekday is correct for 1405/10/05 (Sat = شنبه)',
  jalaliToDate(1405, 10, 5).getUTCDay() === 6 && s1.weekday.includes('شنبه'));

console.log(`\n──────────────────────────────\nRESULT: ${fail === 0 ? 'ALL DATE/SORT CHECKS PASSED' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail ? 1 : 0);
