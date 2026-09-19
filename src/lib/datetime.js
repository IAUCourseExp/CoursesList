// Pure date/time parsing shared by the UI *and* the Web Worker.
// No DOM APIs on purpose, so it can be imported from ./worker.js too.

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Convert ASCII digits in a string to Persian digits. */
export const toFaDigits = (s) =>
  String(s ?? '').replace(/[0-9]/g, (d) => FA_DIGITS[+d]);

/** Convert Persian/Arabic-Indic digits back to ASCII (users type them in search). */
export const toEnDigits = (s) =>
  String(s ?? '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));

// ── Jalali → Gregorian (algorithm from jalaali-js, MIT) ────────────────────────
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;

const jalCal = (jy) => {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;

  if (jy < jp || jy >= BREAKS[bl - 1]) return null;

  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;

  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  return { gy, march };
};

const g2d = (gy, gm, gd) => {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
};

const d2g = (jdn) => {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
};

/**
 * Jalali (Persian) date → Gregorian { gy, gm, gd }.
 * Returns null for out-of-range input instead of throwing.
 */
export const jalaliToGregorian = (jy, jm, jd) => {
  const r = jalCal(jy);
  if (!r) return null;
  if (!(jm >= 1 && jm <= 12) || !(jd >= 1 && jd <= 31)) return null;
  const jdn = g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  return d2g(jdn);
};

/** Jalali date → JS Date (UTC midnight, so weekday is stable). */
export const jalaliToDate = (jy, jm, jd) => {
  const g = jalaliToGregorian(jy, jm, jd);
  if (!g) return null;
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd));
};

/** Sortable integer for a Jalali date, e.g. 14051005. Null when unparseable. */
export const jalaliSortKey = (jy, jm, jd) => jy * 10000 + jm * 100 + jd;

// ── Cell parsing ──────────────────────────────────────────────────────────────
const TIME_RE = /([0-9]{1,2}:[0-9]{2})\s*تا\s*([0-9]{1,2}:[0-9]{2})/;
const JALALI_RE = /([1-9][0-9]{3})\s*\/\s*([0-9]{1,2})\s*\/\s*([0-9]{1,2})/;

export const FA_DAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

/**
 * Weekday index for a Persian day name, ignoring the spelling variations actually
 * present in data.csv: Arabic ي/ك vs Persian ی/ک, ZWNJ, and optional spaces
 * ("يكشنبه", "یک‌شنبه", "یک شنبه" are all Sunday-ish = index 1). شنبه = 0.
 */
export const dayIndexOf = (name) => {
  const s = toEnDigits(String(name || ''))
    .replace(/[\u200c\u200f\u200e]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s\u00a0]+/g, '')
    .trim();
  if (!s) return null;
  const map = {
    'شنبه': 0,
    'یکشنبه': 1,
    'دوشنبه': 2,
    'سهشنبه': 3,
    'چهارشنبه': 4,
    'پنجشنبه': 5,
    'جمعه': 6,
  };
  if (s in map) return map[s];

  // Fallback for data-entry garbage: data.csv has 2 rows like
  // "دوشنبه از تا دوشنبه از" with no real day field.
  // Longest-first scan, so "سه‌شنبه" never matches via the trailing "شنبه".
  const ordered = ['چهارشنبه', 'پنج‌شنبه', 'سه‌شنبه', 'یک‌شنبه', 'دوشنبه', 'شنبه', 'جمعه'];
  for (const key of ordered) {
    if (s.includes(key)) return map[key];
  }
  return null;
};

export const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد',
  'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر',
  'دی', 'بهمن', 'اسفند',
];

/**
 * Parses schedule cell string into all its constituent class sessions/slots.
 * Supports courses with 1, 2, or more sections in a single week.
 * Example: "يكشنبه از 07:30 تا 09:15 سه شنبه از 07:30 تا 09:15"
 * Returns { day, dayIndex, from, to, startMinutes, endMinutes, slots: [...] }
 */
export const parseSchedule = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const matches = [...raw.matchAll(/از\s*(\d{1,2}:\d{2})\s*تا\s*(\d{1,2}:\d{2})/g)];
  if (matches.length === 0) return null;

  const hm = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const slots = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const from = match[1];
    const to = match[2];
    const prevEnd = i === 0 ? 0 : (matches[i - 1].index + matches[i - 1][0].length);
    let dayText = raw.slice(prevEnd, match.index)
      .replace(/\s*از\s*از\s*/g, ' ')
      .replace(/\s*از\s*$/, '')
      .trim();
    let dIdx = dayIndexOf(dayText);
    if (dIdx === null && slots.length > 0) {
      dIdx = slots[slots.length - 1].dayIndex;
      dayText = slots[slots.length - 1].day;
    }
    const canonicalDay = dIdx !== null ? FA_DAYS[dIdx] : dayText;
    slots.push({
      day: canonicalDay,
      dayIndex: dIdx,
      from,
      to,
      startMinutes: hm(from),
      endMinutes: hm(to),
      raw: `${canonicalDay} از ${from} تا ${to}`,
    });
  }

  const primary = slots[0];
  return {
    day: primary.day,
    dayIndex: primary.dayIndex,
    from: primary.from,
    to: primary.to,
    startMinutes: primary.startMinutes,
    endMinutes: primary.endMinutes,
    slots,
  };
};

/** "1405/10/05 از 08:00 تا 10:00" → { jy, jm, jd, date, gregorian, from, to, … } */
export const parseExam = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const d = raw.match(JALALI_RE);
  if (!d) return null;
  const jy = +d[1];
  const jm = +d[2];
  const jd = +d[3];
  const date = jalaliToDate(jy, jm, jd);
  if (!date) return null;
  const time = raw.match(TIME_RE);
  return {
    jy, jm, jd,
    date,
    from: time ? time[1] : '',
    to: time ? time[2] : '',
    sortKey: jalaliSortKey(jy, jm, jd),
  };
};

/** Numeric sortable key for a schedule cell: day order first, then start time. */
export const scheduleSortKey = (value) => {
  const p = parseSchedule(value);
  if (!p) return null;
  const day = p.dayIndex ?? 99;
  return day * 10000 + p.startMinutes;
};

// ── Formatting (Persian, with Gregorian cross-reference) ──────────────────────
const gregFmt = new Intl.DateTimeFormat('fa-IR-u-ca-gregory', {
  year: 'numeric', month: 'long', day: 'numeric',
});
const weekFmt = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' });
const gregShortFmt = new Intl.DateTimeFormat('fa-IR-u-ca-gregory', {
  year: 'numeric', month: '2-digit', day: '2-digit',
});

/** "۰۵ دی ۱۴۰۵" - the Jalali date, written strictly in Persian order: [روز] [ماه] [سال] */
export const formatJalali = (jy, jm, jd) => {
  if (!jy || !jm || !jd) return '';
  const monthName = JALALI_MONTH_NAMES[jm - 1] || '';
  return `${toFaDigits(jd)} ${monthName} ${toFaDigits(jy)}`;
};

/** "شنبه ۰۵ دی ۱۴۰۵" - strict RTL Persian order: [روز هفته] [روز] [ماه] [سال] */
export const formatJalaliWithWeekday = (jy, jm, jd) => {
  const date = jalaliToDate(jy, jm, jd);
  if (!date) return { label: '', weekday: '', fullRtl: '', gregorian: '', gregorianShort: '' };
  const weekday = weekFmt.format(date);
  const label = formatJalali(jy, jm, jd);
  return {
    label,
    weekday,
    fullRtl: `${weekday} ${label}`,
    gregorian: gregFmt.format(date),
    gregorianShort: gregShortFmt.format(date),
  };
};

/** Whole-day difference from today (Asia/Tehran-agnostic; UTC midnights). */
export const daysUntil = (date, now = new Date()) => {
  if (!date) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - today) / 86400000);
};

/** Human relative label: "امروز"، "فردا"، "۳ روز دیگر"، "۱۲ روز پیش". */
export const relativeDayLabel = (days) => {
  if (days === null || days === undefined) return '';
  if (days === 0) return 'امروز';
  if (days === 1) return 'فردا';
  if (days === -1) return 'دیروز';
  if (days > 1) return `${toFaDigits(days)} روز دیگر`;
  return `${toFaDigits(Math.abs(days))} روز پیش`;
};
