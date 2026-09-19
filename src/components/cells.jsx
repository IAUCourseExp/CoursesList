// Cell renderers shared by the desktop table and the mobile card.
// Every item is center-aligned for optimal readability and rapid scanning.

import { isBlank, faNum } from '../lib/format.js';
import { CODE_COLUMNS } from '../lib/columns.js';
import { parseSchedule, parseExam, toFaDigits, formatJalaliWithWeekday, FA_DAYS } from '../lib/datetime.js';

/** Wraps every occurrence of the search term in <mark>. */
export const Highlighted = ({ text, highlighter }) => {
  const parts = highlighter ? highlighter(text) : null;
  if (!parts) return text;
  return parts.map((p, i) =>
    p.hit
      ? <mark key={i} className="rounded bg-amber-200/80 px-0.5 text-slate-900">{p.text}</mark>
      : <span key={i}>{p.text}</span>
  );
};

export function ScheduleCell({ value, className = '' }) {
  if (isBlank(value)) return <span className="text-slate-300">-</span>;
  const p = parseSchedule(value);
  if (!p) return <span className={`text-center ${className}`}>{value}</span>;
  const slots = p.slots && p.slots.length > 0 ? p.slots : [p];

  return (
    <div
      dir="rtl"
      className={`inline-flex flex-col items-center justify-center gap-1 text-center ${className}`}
    >
      {slots.map((s, idx) => {
        const day = s.dayIndex !== null ? FA_DAYS[s.dayIndex] : s.day;
        return (
          <div
            key={idx}
            className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-[12px] leading-tight"
            title={`${day} ساعت ${s.from} تا ${s.to}`}
          >
            <span className="font-extrabold text-slate-800">{day}</span>
            <span className="tabular-nums text-slate-600">
              ساعت {toFaDigits(s.from)} تا {toFaDigits(s.to)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ExamCell({ value, withGregorian = false, className = '' }) {
  if (isBlank(value)) return <span className="text-slate-300">-</span>;
  const p = parseExam(value);
  if (!p) return <span className={`text-center ${className}`}>{value}</span>;
  const { label, weekday, gregorianShort } = formatJalaliWithWeekday(p.jy, p.jm, p.jd);
  return (
    <div
      dir="rtl"
      className={`inline-flex flex-col items-center justify-center text-center ${className}`}
      title={`${weekday} ${label}${p.from ? ` ساعت ${p.from} تا ${p.to}` : ''}${withGregorian ? ` - میلادی ${gregorianShort}` : ''}`}
    >
      <div className="inline-flex items-center justify-center gap-1 whitespace-nowrap text-[12px] leading-snug">
        <span className="font-extrabold text-amber-800">{weekday}</span>
        <span className="text-slate-700 font-bold">{label}</span>
      </div>
      {p.from && (
        <div className="whitespace-nowrap tabular-nums text-[11px] leading-snug text-slate-500 text-center">
          ساعت {toFaDigits(p.from)} تا {toFaDigits(p.to)}
          {withGregorian && <span className="ms-1 text-[10.5px] text-slate-400">({gregorianShort})</span>}
        </div>
      )}
    </div>
  );
}

/** Generic cell: search highlighting + a dim dash for empties, perfectly center-aligned. */
export function TextCell({ value, highlighter, className = '' }) {
  if (isBlank(value)) return <span className="text-slate-300">-</span>;
  return (
    <span className={`block truncate text-center ${className}`}>
      <Highlighted text={String(value)} highlighter={highlighter} />
    </span>
  );
}

/** Codes are identifiers: 10-20 digits, center-aligned with tabular numbers. */
export function CodeCell({ value, className = '' }) {
  if (isBlank(value)) return <span className="text-slate-300">-</span>;
  return (
    <span dir="ltr" className={`block truncate text-center tabular-nums font-mono ${className}`} title={String(value)}>
      {String(value)}
    </span>
  );
}

/** Capacity cell: center aligned. */
export function CapacityCell({ row }) {
  const raw = row['حداكثر ظرفيت'];
  if (isBlank(raw)) return <span className="text-slate-300">-</span>;
  const n = Number(String(raw).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)));
  const enrolled = row['تعداد ثبت نامي تاكنون'];
  if (!Number.isFinite(n) || n === 0) {
    return <span className="text-slate-300" title="ظرفیت در فایل اعلام نشده">-</span>;
  }
  if (isBlank(enrolled)) {
    return <span className="block text-center tabular-nums font-bold text-slate-700" title="تعداد ثبت‌نامی در فایل اعلام نشده">{faNum(n)}</span>;
  }
  const used = Number(String(enrolled).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)));
  return (
    <span className="block text-center tabular-nums font-bold text-slate-700" title={`${faNum(used)} از ${faNum(n)}`}>
      {faNum(used)}<span className="text-slate-400">/</span>{faNum(n)}
    </span>
  );
}

/** Dispatch by column. */
export function CellContent({ column, row, highlighter, withGregorian }) {
  const value = row[column];
  if (column === 'زمانبندي تشكيل كلاس') return <ScheduleCell value={value} />;
  if (column === 'زمان امتحان') return <ExamCell value={value} withGregorian={withGregorian} />;
  if (column === 'حداكثر ظرفيت') return <CapacityCell row={row} />;
  if (CODE_COLUMNS.includes(column)) return <CodeCell value={value} />;
  if (column === 'دانشجويان مجاز به اخذ كلاس' && value === '-') {
    return <span className="text-slate-400 block text-center">همهٔ دانشجویان</span>;
  }
  return <TextCell value={value} highlighter={highlighter} />;
}
