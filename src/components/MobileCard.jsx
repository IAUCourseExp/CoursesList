import React, { useState } from 'react';
import {
  HeartIcon,
  CopyIcon,
  CalendarIcon,
  ClockIcon,
  PinIcon,
  UserIcon,
  ChevronDown,
  LayersIcon,
  CompareIcon,
  GraduationCapIcon,
  CheckIcon,
} from './icons.jsx';
import { ScheduleCell, ExamCell, Highlighted } from './cells.jsx';
import { isBlank, faNum, capacityInfo, fillTone, displayCell } from '../lib/format.js';
import { labelOf, CARD_FACT_COLUMNS, CARD_EXTRA_COLUMNS, pickColumns } from '../lib/columns.js';
import {
  parseExam,
  parseSchedule,
  toFaDigits,
  formatJalaliWithWeekday,
  daysUntil,
  relativeDayLabel,
} from '../lib/datetime.js';
import { CapacityBar } from './Bits.jsx';

/** One labelled fact in the 2-column grid. */
const Fact = ({ label, children, className = '' }) => (
  <div className={`min-w-0 ${className}`}>
    <p className="mb-0.5 text-[10.5px] font-bold text-slate-400">{label}</p>
    <div className="min-w-0 text-[12.5px] font-semibold leading-snug text-slate-700">{children}</div>
  </div>
);

/**
 * Mobile course card. Reading order:
 * Offering code & badges -> what is it -> who teaches it -> when is it -> when is the exam -> details.
 */
const MobileCard = React.memo(function MobileCard({
  row,
  index,
  isBookmarked,
  onToggleBookmark,
  onCopy,
  onCompare,
  onOpenDetail,
  rowKey,
  highlighter,
  availableColumns,
}) {
  const [open, setOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const capacity = capacityInfo(row);
  const tone = fillTone(capacity.pct);
  const exam = parseExam(row['زمان امتحان']);
  const schedule = parseSchedule(row['زمانبندي تشكيل كلاس']);
  const examDays = exam ? daysUntil(exam.date) : null;
  const examWhen = exam ? formatJalaliWithWeekday(exam.jy, exam.jm, exam.jd) : null;
  const courseName = isBlank(row['نام درس']) ? 'درس بدون نام' : row['نام درس'];
  const professor = isBlank(row['استاد']) ? null : row['استاد'];
  const type = isBlank(row['نوع درس']) ? null : row['نوع درس'];
  const offeringCode = row['كد ارائه كلاس درس'] || row['كد درس'] || '';
  const degree = isBlank(row['مقطع ارائه درس']) ? null : row['مقطع ارائه درس'];

  const nUnits = (v) =>
    isBlank(v)
      ? null
      : Number(String(v).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)));
  const theory = nUnits(row['تعداد واحد نظري']);
  const practical = nUnits(row['تعداد واحد عملي']);
  const unitsTotal = (theory || 0) + (practical || 0);

  const facts = pickColumns(availableColumns, CARD_FACT_COLUMNS).filter(
    (c) => c === 'حداكثر ظرفيت' || !isBlank(row[c])
  );
  const extras = pickColumns(availableColumns, CARD_EXTRA_COLUMNS).filter(
    (c) => !isBlank(row[c])
  );

  const handleCopyCode = (e) => {
    e.stopPropagation();
    if (!offeringCode) return;
    navigator.clipboard.writeText(offeringCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  return (
    <article
      dir="rtl"
      className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs transition-shadow hover:shadow-md"
    >
      {/* Top Banner: Offering Code, Degree & Quick Actions */}
      <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-blue-100 text-[11px] font-black text-blue-800 tabular-nums">
            {faNum(index + 1)}
          </span>

          {offeringCode && (
            <button
              type="button"
              onClick={handleCopyCode}
              title="کپی کد ارائه کلاس"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-extrabold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700"
            >
              <span>کد: {toFaDigits(offeringCode)}</span>
              {copiedCode ? (
                <CheckIcon className="size-3 text-emerald-600" />
              ) : (
                <CopyIcon className="size-3 text-slate-400" />
              )}
            </button>
          )}

          {degree && (
            <span className="truncate rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
              {degree}
            </span>
          )}
        </div>

        {/* Action Button Rail: High-contrast, intuitive tap targets */}
        <div className="flex shrink-0 items-center gap-1">
          {onCompare && (
            <button
              type="button"
              onClick={() => onCompare(row)}
              aria-label="مقایسه سایر اساتید این درس"
              title="مقایسه اساتید و زمان‌بندی"
              className="grid size-9 place-items-center rounded-xl border border-blue-200 bg-blue-50/90 text-blue-700 shadow-xs transition-all hover:bg-blue-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <CompareIcon className="size-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onCopy(row)}
            aria-label="کپی اطلاعات درس"
            title="کپی اطلاعات این درس"
            className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs transition-all hover:bg-slate-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <CopyIcon className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => onToggleBookmark(rowKey)}
            aria-pressed={isBookmarked}
            aria-label={isBookmarked ? 'حذف از سبد انتخاب واحد' : 'افزودن به سبد انتخاب واحد'}
            title={isBookmarked ? 'حذف از سبد' : 'افزودن به سبد'}
            className={`grid size-9 place-items-center rounded-xl border transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
              isBookmarked
                ? 'border-rose-300 bg-rose-50 text-rose-600 shadow-xs hover:bg-rose-100'
                : 'border-slate-200 bg-white text-slate-500 shadow-xs hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600'
            }`}
          >
            <HeartIcon filled={isBookmarked} className="size-[18px]" />
          </button>
        </div>
      </div>

      {/* Main Course Info Body */}
      <div className="p-3 sm:p-3.5 space-y-2.5">
        {/* Title and Instructor */}
        <div>
          <h3
            onClick={() => onOpenDetail?.(row)}
            className="cursor-pointer text-[15px] font-black leading-snug text-slate-900 transition-colors hover:text-blue-700"
          >
            <Highlighted text={String(courseName)} highlighter={highlighter} />
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1 font-bold text-blue-700">
              <UserIcon className="size-3.5 shrink-0 text-blue-500" />
              {professor ? (
                <Highlighted text={professor} highlighter={highlighter} />
              ) : (
                <span className="font-medium text-slate-400">استاد اعلام نشده</span>
              )}
            </span>

            {type && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                {type}
              </span>
            )}

            {unitsTotal > 0 && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">
                {faNum(unitsTotal)} واحد
              </span>
            )}
          </div>
        </div>

        {/* Schedule Box */}
        {schedule ? (
          <div className="flex items-start gap-2 rounded-xl bg-blue-50/70 p-2.5">
            <ClockIcon className="mt-0.5 size-4 shrink-0 text-blue-600" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10.5px] font-black text-blue-700">زمان کلاس:</span>
                {row['مكان برگزاري'] && (
                  <span className="truncate text-[11px] font-bold text-slate-600">
                    <PinIcon className="inline size-3 me-0.5 text-slate-400" />
                    {row['مكان برگزاري']}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[12.5px] font-extrabold text-slate-900 leading-snug">
                <ScheduleCell value={row['زمانبندي تشكيل كلاس']} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5">
            <ClockIcon className="size-3.5 shrink-0 text-slate-400" />
            <span className="text-[11px] font-bold text-slate-400">زمان کلاس: اعلام نشده</span>
          </div>
        )}

        {/* Exam Box */}
        <div
          className={`flex items-start gap-2 rounded-xl p-2.5 ${
            exam ? 'bg-amber-50/70' : 'bg-slate-50 py-1.5'
          }`}
        >
          <CalendarIcon
            className={`size-4 shrink-0 ${exam ? 'mt-0.5 text-amber-600' : 'text-slate-400'}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span
                className={`text-[10.5px] font-black ${
                  exam ? 'text-amber-800' : 'text-slate-400'
                }`}
              >
                زمان امتحان پایان‌ترم:
              </span>
              {examDays !== null && examDays >= 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                    examDays <= 3
                      ? 'bg-rose-100 text-rose-700 animate-pulse'
                      : 'bg-amber-100/90 text-amber-800'
                  }`}
                >
                  {relativeDayLabel(examDays)}
                </span>
              )}
            </div>

            {exam ? (
              <div className="mt-0.5 text-[12.5px] font-extrabold text-slate-900 leading-snug">
                <ExamCell value={row['زمان امتحان']} />
              </div>
            ) : (
              <span className="text-[11px] font-medium text-slate-400">اعلام نشده</span>
            )}
          </div>
        </div>

        {/* Capacity Progress Bar */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
          <div className="flex items-baseline justify-between text-xs mb-1.5">
            <span className="font-bold text-slate-600">
              ظرفیت: {capacity.capacity ? `${faNum(capacity.capacity)} نفر` : 'نامشخص'}
            </span>
            <span
              className={`text-[11px] font-black ${
                tone === 'full'
                  ? 'text-rose-600'
                  : tone === 'high'
                  ? 'text-amber-600'
                  : 'text-emerald-600'
              }`}
            >
              {tone === 'full' ? 'تکمیل' : capacity.pct !== null ? `${faNum(capacity.pct)}٪ پر` : ''}
            </span>
          </div>
          <CapacityBar pct={capacity.pct} tone={tone} />
        </div>
      </div>

      {/* Card Action Footer: Quick Details & Full Modal */}
      <div className="flex items-center border-t border-slate-100 bg-slate-50/50">
        <button
          type="button"
          onClick={() => onOpenDetail?.(row)}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 text-xs font-black text-blue-700 transition-colors hover:bg-blue-50/80 hover:text-blue-800"
        >
          <GraduationCapIcon className="size-4" />
          <span>مشاهده تمام مشخصات درس</span>
          <span className="text-[11px] opacity-70">↗</span>
        </button>

        {extras.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            title={open ? 'بستن مشخصات بیشتر' : 'مشاهده مشخصات بیشتر در همین کارت'}
            className="flex min-h-11 shrink-0 items-center gap-1 border-s border-slate-100 px-3 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <span>{open ? 'بستن' : 'بیشتر'}</span>
            <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Inline quick facts expansion */}
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/80 p-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
            <Fact label="واحد نظری / عملی">
              <span className="inline-flex items-center gap-1">
                <LayersIcon className="size-3.5 text-slate-400" />
                <span className="tabular-nums">
                  {theory === null ? '-' : toFaDigits(theory)} /{' '}
                  {practical === null ? '-' : toFaDigits(practical)}
                </span>
              </span>
            </Fact>

            {schedule && (
              <Fact label="ساعت پایان کلاس">
                <span className="tabular-nums">{toFaDigits(schedule.to)}</span>
              </Fact>
            )}

            {extras.map((col) => (
              <Fact key={col} label={labelOf(col)}>
                {isBlank(row[col]) ? (
                  <span className="text-slate-300">-</span>
                ) : (
                  <span className="break-words">
                    <Highlighted text={displayCell(row[col])} highlighter={highlighter} />
                  </span>
                )}
              </Fact>
            ))}

            <Fact label="شناسه ردیف" className="col-span-2">
              <span className="tabular-nums text-slate-500" dir="ltr">
                {rowKey}
              </span>
            </Fact>
          </div>
        </div>
      )}
    </article>
  );
});

export default MobileCard;
