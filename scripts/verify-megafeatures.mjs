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

const icsText = generateIcsCalendar([c1, cExamConflict]);
assert('ICS starts with BEGIN:VCALENDAR', icsText.startsWith('BEGIN:VCALENDAR'));
assert('ICS ends with END:VCALENDAR', icsText.trim().endsWith('END:VCALENDAR'));
assert('ICS contains weekly class recurrence rule', icsText.includes('RRULE:FREQ=WEEKLY'));
assert('ICS contains Persian summary title', icsText.includes('SUMMARY:برنامه‌نویسی پیشرفته'));
assert('ICS contains exam event', icsText.includes('SUMMARY:امتحان نهایی:'));
assert('ICS contains reminder alarms', icsText.includes('BEGIN:VALARM'));

console.log('\n──────────────────────────────');
console.log(`RESULT: ${passed} passed, ${failed} failed\n`);

if (failed > 0) process.exit(1);
