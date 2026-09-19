// Conflict detection engine and schedule utilities.
// Pure functions with no DOM dependencies, safe for UI and Web Worker.

import { parseSchedule, parseExam, jalaliToGregorian, FA_DAYS } from './datetime.js';
import { rowKeyOf } from './format.js';

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
    const t = Number(String(c['تعداد واحد نظري'] || '0').replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)));
    const p = Number(String(c['تعداد واحد عملي'] || '0').replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)));
    if (Number.isFinite(t) && t > 0) theoryUnits += t;
    if (Number.isFinite(p) && p > 0) practicalUnits += p;
  }

  const totalUnits = theoryUnits + practicalUnits;
  let status = 'normal'; // 'low', 'normal', 'honor', 'overload'
  let statusMessage = 'در محدوده مجاز انتخاب واحد';

  if (totalUnits === 0) {
    status = 'empty';
    statusMessage = 'هنوز درسی انتخاب نشده است';
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
 */
export const generateIcsCalendar = (courses = []) => {
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

  // Semester start reference date: Fall 1405 starts around 2026-09-23 (1405/07/01)
  const semesterStart = new Date(Date.UTC(2026, 8, 23, 0, 0, 0));
  const semesterEnd = new Date(Date.UTC(2027, 0, 15, 23, 59, 59));

  const pad = (n) => String(n).padStart(2, '0');
  const formatUtcDate = (d) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const nowStamp = formatUtcDate(new Date());

  courses.forEach((c, idx) => {
    const title = c['نام درس'] || 'درس دانشگاهی';
    const instructor = c['استاد'] || '';
    const room = c['مكان برگزاري'] || '';
    const code = c['كد ارائه كلاس درس'] || c['كد درس'] || '';

    // Weekly class schedule (generate events for all sections/slots)
    const sched = parseSchedule(c['زمانبندي تشكيل كلاس']);
    const slots = sched?.slots?.length ? sched.slots : (sched ? [sched] : []);
    slots.forEach((s, slotIdx) => {
      if (s && s.dayIndex !== null && s.from && s.to) {
        const byDay = ICAL_DAYS[s.dayIndex];
        const [fromH, fromM] = s.from.split(':').map(Number);
        const [toH, toM] = s.to.split(':').map(Number);

        // Find first occurrence date matching dayIndex on or after semesterStart
        const jsDayTarget = (s.dayIndex + 6) % 7;
        const firstClass = new Date(semesterStart);
        const currentJsDay = firstClass.getUTCDay();
        const diffDays = (jsDayTarget - currentJsDay + 7) % 7;
        firstClass.setUTCDate(firstClass.getUTCDate() + diffDays);
        firstClass.setUTCHours(fromH - 3, fromM - 30); // Approximate Iran Time (UTC+3:30)

        const firstEnd = new Date(firstClass);
        firstEnd.setUTCHours(toH - 3, toM - 30);

        const untilStr = `${semesterEnd.getUTCFullYear()}${pad(semesterEnd.getUTCMonth() + 1)}${pad(semesterEnd.getUTCDate())}T235959Z`;

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:course-class-${code || idx}-${idx}-${slotIdx}@iaushiraz.ir`);
        lines.push(`DTSTAMP:${nowStamp}`);
        lines.push(`DTSTART:${formatUtcDate(firstClass)}`);
        lines.push(`DTEND:${formatUtcDate(firstEnd)}`);
        lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${untilStr}`);
        lines.push(`SUMMARY:${title}${instructor ? ` - استاد ${instructor}` : ''}`);
        lines.push(`LOCATION:${room || 'دانشگاه آزاد واحد شیراز'}`);
        lines.push(`DESCRIPTION:کد ارائه: ${code}\\nاستاد: ${instructor}\\nمکان: ${room}`);
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push('DESCRIPTION:یادآوری شروع کلاس');
        lines.push('TRIGGER:-PT15M');
        lines.push('END:VALARM');
        lines.push('END:VEVENT');
      }
    });

    // Final exam
    const exam = parseExam(c['زمان امتحان']);
    if (exam && exam.date) {
      const g = jalaliToGregorian(exam.jy, exam.jm, exam.jd);
      if (g) {
        const examStart = new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
        const examEnd = new Date(Date.UTC(g.gy, g.gm - 1, g.gd));

        if (exam.from && exam.to) {
          const [fH, fM] = exam.from.split(':').map(Number);
          const [tH, tM] = exam.to.split(':').map(Number);
          examStart.setUTCHours(fH - 3, fM - 30);
          examEnd.setUTCHours(tH - 3, tM - 30);
        } else {
          examStart.setUTCHours(4, 30); // 08:00 IRST default
          examEnd.setUTCHours(6, 30); // 10:00 IRST default
        }

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:course-exam-${code || idx}-${idx}@iaushiraz.ir`);
        lines.push(`DTSTAMP:${nowStamp}`);
        lines.push(`DTSTART:${formatUtcDate(examStart)}`);
        lines.push(`DTEND:${formatUtcDate(examEnd)}`);
        lines.push(`SUMMARY:امتحان نهایی: ${title}`);
        lines.push(`LOCATION:${room || 'دانشگاه آزاد واحد شیراز'}`);
        lines.push(`DESCRIPTION:امتحان پایان ترم درس ${title}\\nاستاد: ${instructor}\\nکد ارائه: ${code}`);
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push('DESCRIPTION:یادآوری امتحان فردا');
        lines.push('TRIGGER:-P1D');
        lines.push('END:VALARM');
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push('DESCRIPTION:یادآوری امتحان تا ۲ ساعت دیگر');
        lines.push('TRIGGER:-PT2H');
        lines.push('END:VALARM');
        lines.push('END:VEVENT');
      }
    }
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
};
