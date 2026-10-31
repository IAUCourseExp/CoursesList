// Verification test harness for Mega-Features:
// Conflict Engine, Unit Calculator, ICS Calendar Generator, and Comparison Logic.

import { detectConflicts, calculateUnits, generateIcsCalendar } from '../src/lib/conflicts.js';

let passed = 0;
let failed = 0;

function assert(name, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}${extra ? ' (' + extra + ')' : ''}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}${extra ? ' (' + extra + ')' : ''}`);
  }
}

console.log('CoursesList - Mega-Features Verification\n');

// ── 1. Schedule Conflict Detection ───────────────────────────────────────────
console.log('[1] SCHEDULE CONFLICT DETECTION:');

const c1 = {
  'نام درس': 'برنامه‌نویسی پیشرفته',
  'زمانبندي تشكيل كلاس': 'دوشنبه  از 08:00 تا 10:00 ',
  'زمان امتحان': '1405/10/10 از 08:00 تا 10:00 ',
  'كد ارائه كلاس درس': '1001',
  'تعداد واحد نظري': '3',
  'تعداد واحد عملي': '0',
};

// Overlaps with c1 on Monday (09:00 to 11:00)
const c2 = {
  'نام درس': 'سیستم‌های عامل',
  'زمانبندي تشكيل كلاس': 'دوشنبه  از 09:00 تا 11:00 ',
  'زمان امتحان': '1405/10/15 از 08:00 تا 10:00 ',
  'كد ارائه كلاس درس': '1002',
  'تعداد واحد نظري': '3',
  'تعداد واحد عملي': '0',
};

// Back-to-back with c1 on Monday (10:00 to 12:00) -> NO conflict!
const c3 = {
  'نام درس': 'پایگاه داده‌ها',
  'زمانبندي تشكيل كلاس': 'دوشنبه  از 10:00 تا 12:00 ',
  'زمان امتحان': '1405/10/20 از 08:00 تا 10:00 ',
  'كد ارائه كلاس درس': '1003',
  'تعداد واحد نظري': '3',
  'تعداد واحد عملي': '0',
};

// Different day (Tuesday 08:00 to 10:00) -> NO conflict!
const c4 = {
  'نام درس': 'هوش مصنوعی',
  'زمانبندي تشكيل كلاس': 'سه‌شنبه  از 08:00 تا 10:00 ',
  'زمان امتحان': '1405/10/25 از 08:00 تا 10:00 ',
  'كد ارائه كلاس درس': '1004',
  'تعداد واحد نظري': '3',
  'تعداد واحد عملي': '0',
};

const resOverlap = detectConflicts([c1, c2]);
assert('Detects overlapping class schedules on same day', resOverlap.scheduleConflicts.length === 1);
assert('Correctly flags both conflicting course keys', resOverlap.conflictRowKeys.size === 2);

const resTouching = detectConflicts([c1, c3]);
assert('Touching boundaries (10:00-10:00) do NOT trigger schedule conflict', resTouching.scheduleConflicts.length === 0);

const resDiffDay = detectConflicts([c1, c4]);
assert('Different days do NOT trigger schedule conflict', resDiffDay.scheduleConflicts.length === 0);

// ── 2. Exam Conflict Detection ───────────────────────────────────────────────
console.log('\n[2] EXAM CONFLICT DETECTION:');

// Same date, same hours as c1
const cExamConflict = {
  'نام درس': 'شبکه‌های کامپیوتری',
  'زمانبندي تشكيل كلاس': 'چهارشنبه  از 13:00 تا 15:00 ',
  'زمان امتحان': '1405/10/10 از 08:00 تا 10:00 ',
  'كد ارائه كلاس درس': '1005',
  'تعداد واحد نظري': '3',
  'تعداد واحد عملي': '0',
};

// Same date, different hours (14:00 to 16:00) -> Same-day warning, not hard conflict
const cExamSameDay = {
  'نام درس': 'معماری کامپیوتر',
  'زمانبندي تشكيل كلاس': 'چهارشنبه  از 15:00 تا 17:00 ',
  'زمان امتحان': '1405/10/10 از 14:00 تا 16:00 ',
  'كد ارائه كلاس درس': '1006',
  'تعداد واحد نظري': '3',
  'تعداد واحد عملي': '0',
};

const resExamClash = detectConflicts([c1, cExamConflict]);
assert('Detects same-day overlapping exam times', resExamClash.examConflicts.length === 1);
assert('Flags hasConflicts boolean as true', resExamClash.hasConflicts === true);

const resSameDay = detectConflicts([c1, cExamSameDay]);
assert('Detects multiple exams on same date', resSameDay.sameDayExams.length === 1);
assert('Same-day non-overlapping exams do NOT trigger hard conflict flag', resSameDay.examConflicts.length === 0);

// ── 3. Unit Calculator Regulations ───────────────────────────────────────────
console.log('\n[3] UNIT CALCULATOR REGULATIONS:');

const practicalCourse = {
  'تعداد واحد نظري': '1',
  'تعداد واحد عملي': '2',
};

const u1 = calculateUnits([]);
assert('Empty course list gives 0 units and empty status', u1.totalUnits === 0 && u1.status === 'empty');

const uLow = calculateUnits([c1, c2, c3]); // 3 + 3 + 3 = 9 units
assert('Under 12 units is flagged as low', uLow.totalUnits === 9 && uLow.status === 'low');

const uNormal = calculateUnits([c1, c2, c3, c4, practicalCourse]); // 9 + 3 + 3 = 15 units (13 theory + 2 practical)
assert('12 to 20 units is flagged as normal', uNormal.totalUnits === 15 && uNormal.status === 'normal');
assert('Calculates theory vs practical breakdown', uNormal.theoryUnits === 13 && uNormal.practicalUnits === 2);

const fiveCourses = [c1, c2, c3, c4, cExamConflict, cExamSameDay, practicalCourse]; // 3*6 + 3 = 21 units
const uHonor = calculateUnits(fiveCourses);
assert('21 to 24 units is flagged as honor student tier', uHonor.totalUnits === 21 && uHonor.status === 'honor');
assert('Honor status message matches exact regulation string', uHonor.statusMessage === 'مجاز فقط برای دانشجویان ممتاز با معدل بالای ۱۷ و درس نیوفتاده در ترم گذشته');

const overloadList = [...fiveCourses, { 'تعداد واحد نظري': '4', 'تعداد واحد عملي': '1' }]; // 26 units
const uOver = calculateUnits(overloadList);
assert('Over 24 units is flagged as overload', uOver.totalUnits === 26 && uOver.status === 'overload');

// ── 4. iCalendar (.ics) Generator ────────────────────────────────────────────
console.log('\n[4] RFC 5545 iCALENDAR GENERATOR:');

import { jalaliToDate } from '../src/lib/datetime.js';
import { parseJalaliDate, validateSemesterEntry } from '../src/lib/semester.js';

// Semester fixture mirrors the real public/semester.json presets (ISSUE 1):
// APPROXIMATE ranges the owner keeps editable - never presented as official.
const PRESETS = {
  active: 'fall',
  semesters: {
    fall: { label: 'نیم‌سال اول (مهر)', semesterStart: '1405/07/01', teachingEnd: '1405/09/30' },
    winter: { label: 'نیم‌سال دوم (بهمن)', semesterStart: '1405/11/15', teachingEnd: '1406/03/20' },
    summer: { label: 'نیم‌سال تابستان', semesterStart: '1405/04/20', teachingEnd: '1405/05/30' },
  },
};

// 4a. Preset validation (ISSUE 1): all three parse; boundaries/leap handled.
const fall = validateSemesterEntry(PRESETS.semesters.fall);
const winter = validateSemesterEntry(PRESETS.semesters.winter);
const summer = validateSemesterEntry(PRESETS.semesters.summer);
assert('fall preset parses (1 Mehr → 30 Azar)', !!fall && fall.startText === '1405/07/01' && fall.endText === '1405/09/30');
assert('winter preset parses and crosses the Jalali year', !!winter && winter.teachingEnd.getUTCFullYear() === 2027,
  `teachingEnd → ${winter ? winter.teachingEnd.toISOString().slice(0, 10) : 'null'}`);
assert('summer preset parses', !!summer);

const leapEnd = validateSemesterEntry({ semesterStart: '1403/10/01', teachingEnd: '1403/12/30' });
assert('leap-year Esfand 30 is a valid teaching end (1403 is leap)', !!leapEnd);
const nonLeapEnd = validateSemesterEntry({ semesterStart: '1404/10/01', teachingEnd: '1404/12/30' });
assert('Esfand 30 of a non-leap year is rejected, not rolled over', nonLeapEnd === null);
const inverted = validateSemesterEntry({ semesterStart: '1405/09/30', teachingEnd: '1405/07/01' });
assert('inverted window is rejected', inverted === null);
const malformed = validateSemesterEntry({ semesterStart: '1405/13/01', teachingEnd: '1405/11/30' });
assert('malformed month is rejected', malformed === null);

// The window handed to the generator comes from the CONFIRMED entry.
const SEMESTER = fall;
const NOW_MS = Date.UTC(2026, 0, 1, 12, 30, 0); // fixed trusted-clock instant

// 4b. Without a confirmed window the export degrades honestly:
const icsNoSemester = generateIcsCalendar([c1, cExamConflict], { nowMs: NOW_MS });
assert('no-semester ICS starts with BEGIN:VCALENDAR', icsNoSemester.startsWith('BEGIN:VCALENDAR'));
assert('no-semester ICS omits weekly class events instead of guessing the window', !icsNoSemester.includes('RRULE:FREQ=WEEKLY'));
assert('no-semester ICS still contains the exact exam event', icsNoSemester.includes('SUMMARY:امتحان نهایی:'));

// 4b'. With the confirmed window: full weekly recurrence
const icsText = generateIcsCalendar([c1, cExamConflict], { semester: SEMESTER, nowMs: NOW_MS });
assert('ICS starts with BEGIN:VCALENDAR', icsText.startsWith('BEGIN:VCALENDAR'));
assert('ICS ends with END:VCALENDAR', icsText.trim().endsWith('END:VCALENDAR'));
assert('ICS contains weekly class recurrence rule', icsText.includes('RRULE:FREQ=WEEKLY'));
assert('ICS contains Persian summary title', icsText.includes('SUMMARY:برنامه‌نویسی پیشرفته'));
assert('ICS contains exam event', icsText.includes('SUMMARY:امتحان نهایی:'));
assert('ICS contains reminder alarms', icsText.includes('BEGIN:VALARM'));
assert('DTSTAMP comes from the trusted clock, not the device', icsText.includes('DTSTAMP:20260101T123000Z'));

// DTSTART: first دوشنبه (Monday) on/after 1 Mehr 1405, 08:00 Tehran = 04:30 UTC
const semStart = SEMESTER.semesterStart;
const daysToMonday = ((2 + 6) % 7 - (semStart.getUTCDay()) + 7) % 7;
const firstMonday = new Date(semStart);
firstMonday.setUTCDate(firstMonday.getUTCDate() + daysToMonday);
firstMonday.setUTCHours(8 - 3, 0 - 30); // 08:00 Tehran → UTC
const wantDTSTART = `${firstMonday.getUTCFullYear()}${String(firstMonday.getUTCMonth() + 1).padStart(2, '0')}${String(firstMonday.getUTCDate()).padStart(2, '0')}T${String(firstMonday.getUTCHours()).padStart(2, '0')}3000Z`;
assert('weekly DTSTART is the first matching weekday on/after semester start', icsText.includes(`DTSTART:${wantDTSTART}`), wantDTSTART);
// UNTIL = 30 Azar 1405 → 2026-12-21T235959Z (recurrence stops at the teaching end)
assert('weekly UNTIL equals the teaching end (T235959Z)', icsText.includes('UNTIL=20261221T235959Z'),
  `30 Azar 1405 → ${SEMESTER.teachingEnd.toISOString().slice(0, 10)}`);
assert('teaching end is before the main exam window in the data (classes stop before exams)',
  SEMESTER.teachingEnd.getTime() < jalaliToDate(1405, 10, 5).getTime());

// 4c. RFC 5545 TEXT escaping (ASCII comma, semicolon - the characters that
// actually break ICS property parsing; Persian ، and ؛ are plain TEXT chars)
const messyCourse = {
  ...c1,
  'نام درس': 'درس, با کاما; و سمیکالن تست',
  'استاد': 'استاد; دوم, سوم',
  'مكان برگزاري': 'سالن 1, طبقه 2; شرق',
};
const icsMessy = generateIcsCalendar([messyCourse], { semester: SEMESTER, nowMs: NOW_MS });
assert('commas and semicolons are escaped in SUMMARY', icsMessy.includes('درس\\, با کاما\\; و سمیکالن تست'));
assert('commas and semicolons are escaped in LOCATION', icsMessy.includes('سالن 1\\, طبقه 2\\; شرق'));

// 4d. Line folding at 75 octets, UTF-8-safe, unfoldable
const longCourse = {
  ...c1,
  'نام درس': 'این نام درس عمداً بسیار طولانی است تا خط خروجی تقویم از حد هفتاد و پنج اکتت عبور کند و folding آزمایش شود ' + 'برنامه‌سازی',
};
const icsLong = generateIcsCalendar([longCourse], { semester: SEMESTER, nowMs: NOW_MS });
const enc = new TextEncoder();
const physLines = icsLong.split('\r\n');
assert('every physical line stays within 75 octets', physLines.every((l) => enc.encode(l).length <= 75));
const contCount = physLines.filter((l) => l.startsWith(' ')).length;
assert('folding actually produced continuation lines', contCount > 0, `${contCount} continuations`);
// Unfold (RFC 5545 §3.1: remove CRLF + one leading space) and confirm the
// original logical line comes back intact.
const unfolded = [];
for (const l of physLines) {
  if (l.startsWith(' ')) unfolded[unfolded.length - 1] += l.slice(1);
  else unfolded.push(l);
}
assert('unfolded lines restore the original long title', unfolded.some((l) => l.startsWith('SUMMARY:') && l.includes('این نام درس عمداً بسیار طولانی')) && unfolded.every((l) => !l.startsWith(' ')));

console.log('\n──────────────────────────────');
console.log(`RESULT: ${passed} passed, ${failed} failed\n`);

if (failed > 0) process.exit(1);
