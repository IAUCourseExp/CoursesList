// Conflict detection engine and schedule utilities.
// Pure functions with no DOM dependencies, safe for UI and Web Worker.

import { parseSchedule, parseExam, FA_DAYS } from './datetime.js';
import { rowKeyOf } from './format.js';
import { toAsciiDigits } from './normalize.js';

/**
 * Injective, deterministic slug for ICS UIDs (ISSUE 3): base64url (RFC 4648
 * §5) of the FULL UTF-8 canonical identity. Unlike a fixed-width digest this
 * cannot collide - distinct identities always produce distinct slugs - and it
 * is stable across exports and cart reordering because it derives only from
 * the offering identity. The alphabet (A-Z a-z 0-9 - _) is safe inside an
 * RFC 5545 TEXT UID; long values are handled by the folder.
 */
export const uidSlug = (identity) => {
  const bytes = new TextEncoder().encode(String(identity));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Check if two time ranges (in minutes from midnight) overlap.
 * Touching boundaries (e.g. 08:00-10:00 and 10:00-12:00) do NOT count as conflict.
 */
export const intervalsOverlap = (startA, endA, startB, endB) => {
  return Math.max(startA, startB) < Math.min(endA, endB);
};

/**
 * Analyze a list of course rows for:
 * 1. Schedule conflicts (same weekday and overlapping class hours).
 * 2. Exam conflicts (same exam date and overlapping exam hours).
 * 3. Same-day exam warnings (multiple exams on the same date even if hours differ).
 */
export const detectConflicts = (courses = []) => {
  const scheduleConflicts = [];
  const examConflicts = [];
  const sameDayExams = [];
  const conflictRowKeys = new Set();

  const parsed = courses.map((course) => {
    const key = rowKeyOf(course);
    const sched = parseSchedule(course['زمانبندي تشكيل كلاس']);
    const exam = parseExam(course['زمان امتحان']);
    return {
      course,
      key,
      title: course['نام درس'] || 'بدون نام',
      instructor: course['استاد'] || 'مشخص نشده',
      code: course['كد ارائه كلاس درس'] || course['كد درس'] || '',
      sched,
      exam,
    };
  });

  const n = parsed.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = parsed[i];
      const b = parsed[j];
      // Identical tuples are the same offering showing up twice - comparing
      // it with itself would report a bogus self-conflict (BUG-02).
      if (a.key && a.key === b.key) continue;

      // Schedule conflict check across all slots of course A and course B
      const slotsA = a.sched?.slots?.length ? a.sched.slots : (a.sched ? [a.sched] : []);
      const slotsB = b.sched?.slots?.length ? b.sched.slots : (b.sched ? [b.sched] : []);

      for (const sa of slotsA) {
        for (const sb of slotsB) {
          if (
            sa.dayIndex !== null &&
            sa.dayIndex === sb.dayIndex &&
            intervalsOverlap(sa.startMinutes, sa.endMinutes, sb.startMinutes, sb.endMinutes)
          ) {
            scheduleConflicts.push({
              courseA: a.course,
              courseB: b.course,
              keyA: a.key,
              keyB: b.key,
              titleA: a.title,
              titleB: b.title,
              day: FA_DAYS[sa.dayIndex],
              timeA: `${sa.from} تا ${sa.to}`,
              timeB: `${sb.from} تا ${sb.to}`,
            });
            conflictRowKeys.add(a.key);
            conflictRowKeys.add(b.key);
          }
        }
      }

      // Exam conflict check
      if (
        a.exam &&
        b.exam &&
        a.exam.jy === b.exam.jy &&
        a.exam.jm === b.exam.jm &&
        a.exam.jd === b.exam.jd
      ) {
        // Same exam date
        const hm = (t) => {
          if (!t) return null;
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m;
        };

        const aStart = hm(a.exam.from);
        const aEnd = hm(a.exam.to);
        const bStart = hm(b.exam.from);
        const bEnd = hm(b.exam.to);

        if (
          aStart !== null &&
          aEnd !== null &&
          bStart !== null &&
          bEnd !== null &&
          intervalsOverlap(aStart, aEnd, bStart, bEnd)
        ) {
          examConflicts.push({
            courseA: a.course,
            courseB: b.course,
            keyA: a.key,
            keyB: b.key,
            titleA: a.title,
            titleB: b.title,
            date: `${a.exam.jy}/${String(a.exam.jm).padStart(2, '0')}/${String(a.exam.jd).padStart(2, '0')}`,
            timeA: `${a.exam.from} تا ${a.exam.to}`,
            timeB: `${b.exam.from} تا ${b.exam.to}`,
          });
          conflictRowKeys.add(a.key);
          conflictRowKeys.add(b.key);
        } else {
          sameDayExams.push({
            courseA: a.course,
            courseB: b.course,
            keyA: a.key,
            keyB: b.key,
            titleA: a.title,
            titleB: b.title,
            date: `${a.exam.jy}/${String(a.exam.jm).padStart(2, '0')}/${String(a.exam.jd).padStart(2, '0')}`,
            timeA: a.exam.from ? `${a.exam.from} تا ${a.exam.to}` : 'ساعت نامشخص',
            timeB: b.exam.from ? `${b.exam.from} تا ${b.exam.to}` : 'ساعت نامشخص',
          });
        }
      }
    }
  }

  return {
    scheduleConflicts,
    examConflicts,
    sameDayExams,
    hasConflicts: scheduleConflicts.length > 0 || examConflicts.length > 0,
    conflictRowKeys,
  };
};

/**
 * Calculate total theory, practical, and overall units for selected courses.
 */
export const calculateUnits = (courses = []) => {
  let theoryUnits = 0;
  let practicalUnits = 0;

  for (const c of courses) {
    // Both Persian (۰-۹) and Arabic-Indic (٠-٩) digit variants (BUG-27).
    const t = Number(toAsciiDigits(String(c['تعداد واحد نظري'] || '0')));
    const p = Number(toAsciiDigits(String(c['تعداد واحد عملي'] || '0')));
    if (Number.isFinite(t) && t > 0) theoryUnits += t;
    if (Number.isFinite(p) && p > 0) practicalUnits += p;
  }

  const totalUnits = theoryUnits + practicalUnits;
  let status = 'normal'; // 'empty', 'low', 'normal', 'honor', 'overload'
  let statusMessage = 'در محدوده مجاز انتخاب واحد';

  // "Empty" means the cart is actually empty (BUG-19); courses selected with
  // zero/missing unit values are a different, honest situation.
  if (courses.length === 0) {
    status = 'empty';
    statusMessage = 'هنوز درسی انتخاب نشده است';
  } else if (totalUnits === 0) {
    status = 'low';
    statusMessage = 'واحد دروس انتخاب‌شده در فایل اعلام نشده یا صفر است (حداقل مجاز ۱۲ واحد)';
  } else if (totalUnits < 12) {
    status = 'low';
    statusMessage = 'کمتر از حداقل مجاز ترم (حداقل ۱۲ واحد)';
  } else if (totalUnits <= 20) {
    status = 'normal';
    statusMessage = 'تعداد واحد مجاز استاندارد (۱۲ تا ۲۰ واحد)';
  } else if (totalUnits <= 24) {
    status = 'honor';
    statusMessage = 'مجاز فقط برای دانشجویان ممتاز با معدل بالای ۱۷ و درس نیوفتاده در ترم گذشته';
  } else {
    status = 'overload';
    statusMessage = 'بیش از سقف قانونی انتخاب واحد (حداکثر ۲۴ واحد)';
  }

  return {
    theoryUnits,
    practicalUnits,
    totalUnits,
    status,
    statusMessage,
  };
};

/**
 * Generate standard RFC 5545 iCalendar content (.ics) for course schedules and final exams.
 *
 * @param {Array} courses - selected course rows
 * @param {{ semester?: {semesterStart: Date, teachingEnd: Date}|null,
 *           nowMs?: number }} options
 *   semester - the owner-verified teaching window (public/semester.json).
 *     Without it, weekly class events are OMITTED and the calendar carries
 *     only the (exact) exam events - the old earliest-exam guess anchored
 *     every weekly class inside exam season and was removed (BUG-04).
 *   nowMs    - trusted-clock instant used for DTSTAMP.
 */
export const generateIcsCalendar = (courses = [], { semester = null, nowMs = Date.now() } = {}) => {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IAU Shiraz//CoursesList Scheduler//FA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:برنامه هفتگی دانشگاه آزاد شیراز',
    'X-WR-TIMEZONE:Asia/Tehran',
  ];

  // Day mapping from dayIndex (0 = شنبه ... 6 = جمعه) to iCal BYDAY
  const ICAL_DAYS = ['SA', 'SU', 'MO', 'TU', 'WE', 'TH', 'FR'];

  /** RFC 5545 §3.2.11 TEXT escaping for SAFE-CHAR sequences. */
  const escapeText = (value) =>
    String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');

  const encoder = new TextEncoder();
  /** RFC 5545 §3.1: fold content lines at 75 OCTETS (never characters), and
   *  never split a multi-byte UTF-8 character. Continuations open with one space. */
  const foldLine = (line) => {
    if (encoder.encode(line).length <= 75) return [line];
    const parts = [];
    let cur = '';
    let curOctets = 0;
    let limit = 75;
    for (const ch of line) {
      const octets = encoder.encode(ch).length;
      if (curOctets + octets > limit) {
        parts.push(cur);
        cur = '';
        curOctets = 0;
        limit = 74;
      }
      cur += ch;
      curOctets += octets;
    }
    if (cur) parts.push(cur);
    return parts.map((p, i) => (i === 0 ? p : ` ${p}`));
  };

  const push = (line) => lines.push(...foldLine(line));

  const pad = (n) => String(n).padStart(2, '0');
  const formatUtcDate = (d) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const nowStamp = formatUtcDate(new Date(nowMs));

  const semesterStart = semester?.semesterStart instanceof Date ? semester.semesterStart : null;
  const teachingEnd = semester?.teachingEnd instanceof Date ? semester.teachingEnd : null;
  const hasTeachingWindow = !!(semesterStart && teachingEnd && teachingEnd > semesterStart);

  courses.forEach((c) => {
    const title = c['نام درس'] || 'درس دانشگاهی';
    const instructor = c['استاد'] || '';
    const room = c['مكان برگزاري'] || '';
    const code = c['كد ارائه كلاس درس'] || c['كد درس'] || '';
    const uidBase = uidSlug(rowKeyOf(c));

    // Weekly class schedule (all slots) - only with a verified teaching window
    const sched = parseSchedule(c['زمانبندي تشكيل كلاس']);
    const slots = sched?.slots?.length ? sched.slots : (sched ? [sched] : []);
    if (hasTeachingWindow) {
      slots.forEach((s, slotIdx) => {
        if (s && s.dayIndex !== null && s.from && s.to) {
          const byDay = ICAL_DAYS[s.dayIndex];
          const [fromH, fromM] = s.from.split(':').map(Number);
          const [toH, toM] = s.to.split(':').map(Number);

          // First occurrence of this weekday on or after the semester start
          const firstClass = findFirstWeekdayOnOrAfter(s.dayIndex, semesterStart);
          firstClass.setUTCHours(fromH - 3, fromM - 30); // fixed Iran time (UTC+3:30)

          const firstEnd = new Date(firstClass);
          firstEnd.setUTCHours(toH - 3, toM - 30);

          if (firstClass > teachingEnd) return; // would produce zero occurrences

          const untilStr = `${teachingEnd.getUTCFullYear()}${pad(teachingEnd.getUTCMonth() + 1)}${pad(teachingEnd.getUTCDate())}T235959Z`;

          push('BEGIN:VEVENT');
          push(`UID:course-class-${uidBase}-${slotIdx}@iaushiraz.ir`);
          push(`DTSTAMP:${nowStamp}`);
          push(`DTSTART:${formatUtcDate(firstClass)}`);
          push(`DTEND:${formatUtcDate(firstEnd)}`);
          push(`RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${untilStr}`);
          push(`SUMMARY:${escapeText(title)}${instructor ? ` - استاد ${escapeText(instructor)}` : ''}`);
          push(`LOCATION:${escapeText(room || 'دانشگاه آزاد واحد شیراز')}`);
          push(`DESCRIPTION:کد ارائه: ${escapeText(code)}\\nاستاد: ${escapeText(instructor)}\\nمکان: ${escapeText(room)}`);
          push('BEGIN:VALARM');
          push('ACTION:DISPLAY');
          push('DESCRIPTION:یادآوری شروع کلاس');
          push('TRIGGER:-PT15M');
          push('END:VALARM');
          push('END:VEVENT');
        }
      });
    }

    // Final exam - use pre-computed UTC instants from parseExam (BUG-016 fix)
    const exam = parseExam(c['زمان امتحان']);
    if (exam && exam.date) {
      const examStart = exam.startAt !== null ? new Date(exam.startAt) : null;
      const examEnd = exam.endAt !== null ? new Date(exam.endAt) : null;

      if (examStart && examEnd) {
        push('BEGIN:VEVENT');
        push(`UID:course-exam-${uidBase}@iaushiraz.ir`);
        push(`DTSTAMP:${nowStamp}`);
        push(`DTSTART:${formatUtcDate(examStart)}`);
        push(`DTEND:${formatUtcDate(examEnd)}`);
        push(`SUMMARY:امتحان نهایی: ${escapeText(title)}`);
        push(`LOCATION:${escapeText(room || 'دانشگاه آزاد واحد شیراز')}`);
        push(`DESCRIPTION:امتحان پایان ترم درس ${escapeText(title)}\\nاستاد: ${escapeText(instructor)}\\nکد ارائه: ${escapeText(code)}`);
        push('BEGIN:VALARM');
        push('ACTION:DISPLAY');
        push('DESCRIPTION:یادآوری امتحان فردا');
        push('TRIGGER:-P1D');
        push('END:VALARM');
        push('BEGIN:VALARM');
        push('ACTION:DISPLAY');
        push('DESCRIPTION:یادآوری امتحان تا ۲ ساعت دیگر');
        push('TRIGGER:-PT2H');
        push('END:VALARM');
        push('END:VEVENT');
      }
    }
  });

  push('END:VCALENDAR');
  return lines.join('\r\n');
};

/**
 * Find the first occurrence of a given weekday (0=شنبه...6=جمعه) on or after the reference date.
 */
function findFirstWeekdayOnOrAfter(dayIndex, referenceDate) {
  const jsDayTarget = (dayIndex + 6) % 7;
  const firstClass = new Date(referenceDate);
  const currentJsDay = firstClass.getUTCDay();
  const diffDays = (jsDayTarget - currentJsDay + 7) % 7;
  firstClass.setUTCDate(firstClass.getUTCDate() + diffDays);
  return firstClass;
}
