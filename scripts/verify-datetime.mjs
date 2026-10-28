// Date/time + sort-key verification against the REAL data.csv.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import Papa from 'papaparse';
import {
  parseSchedule, scheduleSortKey, parseExam, FA_DAYS, dayIndexOf,
  jalaliToGregorian, jalaliToDate, formatJalaliWithWeekday,
  tehranToday, tehranDayKey, daysUntil, examStatus, splitDuration, faCountdownLabel,
  relativeDayLabel, TEHRAN_OFFSET_MIN,
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

console.log('\n── 5. exact exam instants: Tehran HH:MM → UTC (Iran = fixed UTC+03:30 since 2022)');
const iso = (ms) => new Date(ms).toISOString();
const p1 = parseExam('1405/10/17 از 08:00 تا 10:00');
ok('1405/10/17 08:00 Tehran = 2027-01-07T04:30:00Z',
  p1.startAt === Date.parse('2027-01-07T04:30:00Z'), iso(p1.startAt));
ok('1405/10/17 10:00 Tehran = 2027-01-07T06:30:00Z',
  p1.endAt === Date.parse('2027-01-07T06:30:00Z'), iso(p1.endAt));
const p2 = parseExam('1405/10/16 از 08:00 تا 10:00 ');
ok('trailing space still parses to 2027-01-06T04:30:00Z',
  p2.startAt === Date.parse('2027-01-06T04:30:00Z'), iso(p2.startAt));
const p3 = parseExam('1405/10/17 از 16:30 تا 18:00');
ok('16:30 Tehran = 13:00Z (same UTC day)', p3.startAt === Date.parse('2027-01-07T13:00:00Z'), iso(p3.startAt));
const pNoTime = parseExam('1405/10/17');
ok('date-only cell → null instants (day-level fallback)',
  pNoTime && pNoTime.startAt === null && pNoTime.endAt === null);
// DST boundary sanity: all distinct exam dates must be after Iran's last clock
// change (fall-back on 2021-09-21, after which DST was abolished), where the
// constant +03:30 offset is exact. Flag anything older so nobody silently relies
// on the fixed offset for a pre-1400 date.
let preDst = 0;
for (const cell of distinct) {
  const p = parseExam(cell);
  if (p && p.date.getTime() < Date.parse('2021-09-21T20:30:00Z')) preDst++;
}
ok('every exam date is after Iran dropped DST (fixed +03:30 is exact)', preDst === 0, `${preDst} pre-2022`);

console.log('\n── 6. tehranToday / daysUntil are timezone-independent');
const tehranMidnight = tehranToday(Date.parse('2027-01-07T20:30:00Z')); // = 00:00 Tehran on 1405/10/18
ok('Tehran midnight of 1405/10/18 = UTC day 2027-01-08', tehranMidnight === Date.UTC(2027, 0, 8),
  iso(tehranMidnight));
ok('1 minute before Tehran midnight is still the previous Tehran day',
  tehranToday(Date.parse('2027-01-07T20:29:59Z')) === Date.UTC(2027, 0, 7));
ok('tehranDayKey returns whole day numbers', Number.isInteger(tehranDayKey(Date.now())));
// Device clock set to 23:00 UTC on Jan 6 = 02:30 Tehran Jan 7 → exam "today" = 0,
// even though a naive device-local calendar says Jan 6 → would have shown 1.
const ambiguousNow = Date.parse('2027-01-06T23:00:00Z');
ok('daysUntil sees 1405/10/17 as TODAY from a UTC-1 device at 23:00',
  daysUntil(p1.date, ambiguousNow) === 0, `got ${daysUntil(p1.date, ambiguousNow)}`);
ok('daysUntil accepts a numeric epoch (ticker snapshot)',
  daysUntil(p1.date, Date.UTC(2027, 0, 6)) === 1);
ok('daysUntil still accepts a Date object (legacy call sites)',
  daysUntil(p1.date, new Date(Date.UTC(2027, 0, 6))) === 1);

console.log('\n── 7. exam lifecycle: upcoming → ongoing → finished');
const s = p1.startAt, e = p1.endAt;
ok('day before 08:00 → upcoming', examStatus(s, e, s - 86400000) === 'upcoming');
ok('1 ms before start → upcoming', examStatus(s, e, s - 1) === 'upcoming');
ok('between 08:00 and 10:00 → ongoing', examStatus(s, e, (s + e) / 2) === 'ongoing');
ok('at exactly start → ongoing', examStatus(s, e, s) === 'ongoing');
ok('1 ms after end → finished', examStatus(s, e, e + 1) === 'finished');
ok('no parsable time → unknown (day-level fallback)', examStatus(null, null, Date.now()) === 'unknown');
const dur = splitDuration(2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5 * 1000);
ok('splitDuration 2d 3h 4m 5s', dur.days === 2 && dur.hours === 3 && dur.minutes === 4 && dur.seconds === 5);
ok('faCountdownLabel drops zero units, keeps seconds under a day',
  faCountdownLabel(dur) === '۲ روز و ۳ ساعت و ۴ دقیقه'
  && faCountdownLabel(splitDuration(90 * 60000)) === '۱ ساعت و ۳۰ دقیقه و ۰ ثانیه');
ok('relativeDayLabel unchanged: امروز/فردا/X روز پیش',
  relativeDayLabel(0) === 'امروز' && relativeDayLabel(1) === 'فردا' && relativeDayLabel(-7) === '۷ روز پیش');

console.log(`\n──────────────────────────────\nRESULT: ${fail === 0 ? 'ALL DATE/SORT CHECKS PASSED' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail ? 1 : 0);
