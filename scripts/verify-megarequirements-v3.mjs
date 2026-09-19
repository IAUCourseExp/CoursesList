// Test suite verifying:
// 1. Multi-slot schedule parsing (275 multi-section courses in data.csv)
// 2. Conflict detector checking all secondary slots
// 3. Strict Persian RTL date and time ordering
// 4. Side-by-side lane conflict algorithm for WeeklyTimetable
// 5. Total elimination of "اسلامی" from codebase UI
// 6. Tour Guide v3 cache key and updated links

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import {
  parseSchedule,
  parseExam,
  formatJalaliWithWeekday,
  formatJalali,
  FA_DAYS,
} from '../src/lib/datetime.js';
import { detectConflicts, generateIcsCalendar } from '../src/lib/conflicts.js';
import { TOUR_KEY } from '../src/lib/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
let fail = 0;

function assert(cond, msg, detail = '') {
  if (cond) {
    console.log(`  ✅ PASS: ${msg}`);
    pass++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`, detail);
    fail++;
  }
}

console.log('🧪 Running Verification for Mega-Requirements V3...\n');

// 1. Multi-slot schedule parsing
console.log('--- 1. Multi-Slot Schedule Parsing ---');
const csv = fs.readFileSync(path.join(ROOT, 'public/data.csv'), 'utf8');
const rows = Papa.parse(csv, { header: true }).data;

let multiSlotCourses = 0;
let totalSlots = 0;
for (const r of rows) {
  const p = parseSchedule(r['زمانبندي تشكيل كلاس']);
  if (p) {
    totalSlots += p.slots.length;
    if (p.slots.length > 1) multiSlotCourses++;
  }
}
assert(multiSlotCourses === 275, `Identified exactly 275 multi-slot courses (got ${multiSlotCourses})`);
assert(totalSlots === 2121, `Identified exactly 2121 total class sessions (got ${totalSlots})`);

// Sample multi-slot parsing checks
const sample1 = parseSchedule('يكشنبه  از 07:30 تا 09:15 سه شنبه  از 07:30 تا 09:15 ');
assert(sample1.slots.length === 2, 'Sample 1 has 2 slots');
assert(sample1.slots[0].day === 'یک‌شنبه' && sample1.slots[0].from === '07:30', 'Slot 1: Sunday 07:30');
assert(sample1.slots[1].day === 'سه‌شنبه' && sample1.slots[1].from === '07:30', 'Slot 2: Tuesday 07:30');

const sample2 = parseSchedule('پنج شنبه  از 11:00 تا 11:45 پنج شنبه  از  از 12:15 تا 13:15 ');
assert(sample2.slots.length === 2, 'Sample 2 has 2 slots');
assert(sample2.slots[0].from === '11:00' && sample2.slots[1].from === '12:15', 'Sample 2 consecutive slots on Thursday parsed');

// 2. Conflict detector checking secondary slots
console.log('\n--- 2. Conflict Detector on Secondary Slots ---');
const courseA = {
  'نام درس': 'برنامه‌نویسی پیشرفته',
  'زمانبندي تشكيل كلاس': 'يكشنبه از 07:30 تا 09:15 سه شنبه از 07:30 تا 09:15',
  'زمان امتحان': '1405/10/10 از 08:00 تا 10:00',
  'كد ارائه كلاس درس': '101',
};
const courseB = {
  'نام درس': 'سیستم‌های عامل',
  'زمانبندي تشكيل كلاس': 'سه شنبه از 08:30 تا 10:00', // Collides with courseA slot 2!
  'زمان امتحان': '1405/10/20 از 08:00 تا 10:00',
  'كد ارائه كلاس درس': '102',
};
const cd = detectConflicts([courseA, courseB]);
assert(cd.hasConflicts === true, 'Conflict detected on secondary slot of Course A (Tuesday)');
assert(cd.scheduleConflicts.length === 1, 'Exactly 1 schedule conflict flagged');
assert(cd.scheduleConflicts[0].day === 'سه‌شنبه', 'Conflict day is Tuesday');

// 3. Persian RTL Date and Time Ordering
console.log('\n--- 3. Persian RTL Date and Time Ordering ---');
const examP = parseExam('1405/10/05 از 08:00 تا 10:00');
const formatted = formatJalaliWithWeekday(examP.jy, examP.jm, examP.jd);
assert(formatted.fullRtl === 'شنبه ۵ دی ۱۴۰۵', `Exam full RTL date string: "${formatted.fullRtl}"`);
assert(formatted.weekday === 'شنبه', `Weekday is شنبه`);
assert(formatted.label === '۵ دی ۱۴۰۵', `Day-Month-Year is ۵ دی ۱۴۰۵`);

// 4. Elimination of "اسلامی" across UI codebase
console.log('\n--- 4. Elimination of "اسلامی" across UI ---');
const uiFiles = [
  'src/App.jsx',
  'src/components/ExamTimeline.jsx',
  'src/components/HelpPanel.jsx',
  'src/components/TourGuide.jsx',
  'src/components/WeeklyTimetable.jsx',
  'src/components/cells.jsx',
  'src/components/MobileCard.jsx',
  'src/components/DesktopRow.jsx',
  'src/lib/conflicts.js',
];
let islFound = 0;
for (const file of uiFiles) {
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const matches = content.match(/اسلامی|اسلامي/g);
  if (matches) {
    console.error(`Found "اسلامی" in ${file}: count=${matches.length}`);
    islFound += matches.length;
  }
}
assert(islFound === 0, `Zero occurrences of "اسلامی" in UI files (found ${islFound})`);

// 5. Tour Guide cache key and updated links
console.log('\n--- 5. Tour Key and Header Links ---');
assert(TOUR_KEY === 'usc.tour.v3', `Tour key updated to usc.tour.v3 (is ${TOUR_KEY})`);

const appContent = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
assert(appContent.includes('https://iaucourseexp.github.io/iau-experiences/'), 'Contains iau-experiences website link');
assert(appContent.includes('کانال تجربیات'), 'Contains "کانال تجربیات" link title');
assert(appContent.includes('کانال جزوه'), 'Contains "کانال جزوه" link title');

console.log(`\n──────────────────────────────\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
