// Visual Exam Schedule:
// 1. Soft Calendar Matrix View: modern pastel day boxes for days with exams.
// 2. Interactive X-Axis Timeline: animated chronological axis with circular date nodes.
// 3. Chronological Card List with countdown badges and print/PDF support.

import React, { useState, useMemo } from 'react';
import {
  parseExam,
  formatJalaliWithWeekday,
  daysUntil,
  relativeDayLabel,
  toFaDigits,
} from '../lib/datetime.js';
import { faNum, rowKeyOf } from '../lib/format.js';
import {
  AlertIcon,
  ClockIcon,
  PinIcon,
  UserIcon,
  CloseIcon,
  PrinterIcon,
  CalendarIcon,
  ListIcon,
} from './icons.jsx';



export default function ExamTimeline({
  courses = [],
  onRemoveCourse,
  conflictData,
  onOpenDetail,
}) {
  const [viewMode, setViewMode] = useState('matrix'); // 'matrix' | 'timeline' | 'cards'
  const [selectedExamItem, setSelectedExamItem] = useState(null);

  const hasExamConflicts = conflictData?.examConflicts?.length > 0;

  const { timeline, unscheduled, totalExams, sameDayCount } = useMemo(() => {
    const list = [];
    const unsched = [];

    courses.forEach((c) => {
      const p = parseExam(c['زمان امتحان']);
      const key = rowKeyOf(c);
      if (p && p.date) {
        const diff = daysUntil(p.date);
        const { label, weekday, gregorianShort } = formatJalaliWithWeekday(p.jy, p.jm, p.jd);
        list.push({
          course: c,
          key,
          parsed: p,
          label,
          weekday,
          gregorianShort,
          daysLeft: diff,
          dateKey: `${p.jy}-${String(p.jm).padStart(2, '0')}-${String(p.jd).padStart(2, '0')}`,
        });
      } else {
        unsched.push({
          course: c,
          key,
        });
      }
    });

    // Sort chronologically
    list.sort((a, b) => {
      if (a.parsed.sortKey !== b.parsed.sortKey) return a.parsed.sortKey - b.parsed.sortKey;
      return (a.parsed.from || '').localeCompare(b.parsed.from || '');
    });

    // Group by date
    const groups = new Map();
    list.forEach((item) => {
      if (!groups.has(item.dateKey)) groups.set(item.dateKey, []);
      groups.get(item.dateKey).push(item);
    });

    let multiExamDays = 0;
    groups.forEach((items) => {
      if (items.length > 1) multiExamDays++;
    });

    return {
      timeline: Array.from(groups.entries()),
      unscheduled: unsched,
      totalExams: list.length,
      sameDayCount: multiExamDays,
    };
  }, [courses]);

  const handleCardClick = (item) => {
    if (onOpenDetail) {
      onOpenDetail(item.course);
    } else {
      setSelectedExamItem(item);
    }
  };

  if (courses.length === 0) {
    return (
      <div className="flex h-full min-h-[28rem] flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-amber-50 text-3xl text-amber-600">
          ⏰
        </div>
        <h3 className="text-lg font-black text-slate-800">برنامه و روزشمار امتحانات خالی است</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          برای مشاهده تاریخ امتحانات، بررسی تداخل‌ها و ماتریس تقویم، ابتدا دروس مورد نظرتان را از جدول انتخاب و نشانه‌گذاری کنید.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 sm:p-5 thin-scrollbar">
      {/* Overview Stats Bar & Controls */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
            <span>تعداد کل امتحانات:</span>
            <span className="font-black text-amber-950">{faNum(totalExams)} آزمون</span>
          </div>

          {hasExamConflicts && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-100 px-3 py-1.5 text-xs font-black text-rose-900 animate-pulse">
              <AlertIcon className="size-4 shrink-0 text-rose-600" />
              <span>{faNum(conflictData.examConflicts.length)} تداخل ساعت همزمان امتحان!</span>
            </div>
          )}

          {sameDayCount > 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">
              <AlertIcon className="size-4 shrink-0 text-amber-600" />
              <span>{faNum(sameDayCount)} روز دارای چند امتحان</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
              <span>✓ بدون چند امتحانی در یک روز</span>
            </div>
          )}
        </div>

        {/* View Switcher & Print Button */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="تغییر نمای امتحانات">
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                viewMode === 'matrix'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="size-3.5" />
              <span>ماتریس تقویم</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                viewMode === 'timeline'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📈 محور زمانی X</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListIcon className="size-3.5" />
              <span>فهرست روزشمار</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            title="چاپ یا دریافت نسخه PDF برنامه امتحانات"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <PrinterIcon className="size-4 text-slate-600" />
            <span className="hidden sm:inline">چاپ / خروجی PDF</span>
          </button>
        </div>
      </div>

      {/* Official Print Header (Visible only when printed) */}
      <div className="hidden print:block mb-4 text-center border-b pb-3">
        <h2 className="text-lg font-black text-slate-900">برنامه رسمی امتحانات پایان‌ترم دانشگاه آزاد واحد شیراز</h2>
        <p className="text-xs text-slate-600 mt-1 font-bold">
          تعداد کل امتحانات: {faNum(totalExams)} درس | تاریخ چاپ: {new Date().toLocaleDateString('fa-IR')}
        </p>
      </div>

      {/* VIEW 1: SOFT CALENDAR MATRIX VIEW */}
      {viewMode === 'matrix' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {timeline.map(([dateKey, items]) => {
              const first = items[0];
              const hasMultiple = items.length > 1;
              const isUrgent = first.daysLeft !== null && first.daysLeft >= 0 && first.daysLeft <= 3;

              return (
                <div
                  key={dateKey}
                  className={`group relative flex flex-col justify-between rounded-2xl border p-3.5 transition-all hover:shadow-md ${
                    hasMultiple
                      ? 'border-amber-300 bg-amber-50/30'
                      : 'border-slate-200 bg-white hover:border-blue-300'
                  }`}
                >
                  {/* Top Day Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5" dir="rtl">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="grid size-7 place-items-center rounded-lg bg-blue-600 text-xs font-black text-white shadow-xs">
                            {toFaDigits(first.parsed.jd)}
                          </span>
                          <span className="text-[12.5px] font-extrabold text-slate-900">
                            {first.weekday} {first.label}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                          میلادی: {first.gregorianShort}
                        </p>
                      </div>

                      {first.daysLeft !== null && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                            isUrgent
                              ? 'bg-rose-600 text-white animate-pulse'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {relativeDayLabel(first.daysLeft)}
                        </span>
                      )}
                    </div>

                    {/* Courses on this day */}
                    <div className="mt-3 space-y-2">
                      {items.map((item) => {
                        const title = item.course['نام درس'] || 'بدون نام';
                        const time = `${toFaDigits(item.parsed.from)} تا ${toFaDigits(item.parsed.to)}`;
                        const instructor = item.course['استاد'] || '';

                        return (
                          <div
                            key={item.key}
                            onClick={() => handleCardClick(item)}
                            className="w-full text-start rounded-xl border border-slate-200/90 bg-slate-50/90 p-2.5 transition-all hover:border-blue-400 hover:bg-blue-50/60 cursor-pointer shadow-xs"
                            dir="rtl"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-black text-slate-900 truncate">
                                {title}
                              </span>
                              <span className="rounded bg-blue-100/80 px-1.5 py-0.2 text-[10px] font-bold text-blue-800 shrink-0">
                                {item.course['تعداد واحد نظري'] || '0'} واحد
                              </span>
                            </div>

                            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-600">
                              <span className="font-bold text-amber-800">
                                ساعت {time}
                              </span>
                              {instructor && (
                                <span className="truncate text-slate-500 max-w-[50%]">
                                  {instructor}
                                </span>
                              )}
                            </div>

                            {item.course['مكان برگزاري'] && (
                              <div className="mt-1 text-[10px] text-slate-400 truncate">
                                📍 {item.course['مكان برگزاري']}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Day Footer note if multiple exams */}
                  {hasMultiple && (
                    <div className="mt-3 flex items-center gap-1 rounded-lg bg-amber-100/70 px-2 py-1 text-[10px] font-bold text-amber-800">
                      <AlertIcon className="size-3 shrink-0" />
                      <span>{faNum(items.length)} امتحان در یک روز!</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: ANIMATED X-AXIS TIMELINE WITH CIRCULAR DATE NODES */}
      {viewMode === 'timeline' && (
        <div className="min-w-0 flex-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* w-max makes the wrapper exactly as wide as the sum of the
              columns, so nothing shrinks or stretches unexpectedly. mx-auto
              centres the whole timeline when only a few dates exist and the
              viewport is wide. */}
          <div className="mx-auto w-max px-6 py-6 sm:px-10 sm:py-8">
            <div className="mb-6 text-center">
              <h3 className="text-sm font-black text-slate-900">محور زمانی پیوسته امتحانات پایان‌ترم</h3>
              <p className="mt-0.5 text-xs text-slate-500">روی هر نقطه زمانی برای مشاهده مشخصات کامل کلیک کنید</p>
            </div>

            <div className="relative">
              {/* Axis line. Every column below is stacked as
                  h-28 (card) + h-3 (stem) + size-12 (node). The node's
                  vertical centre therefore always lands at
                  7rem + 0.75rem + 1.5rem = 9.25rem from the top of the row.
                  One absolute line at that Y crosses every node, so no
                  per-column segment math and no JS measurement are needed. */}
              <div
                className="pointer-events-none absolute right-0 left-0 h-0.5 -translate-y-1/2 rounded-full bg-gradient-to-l from-blue-400 via-indigo-500 to-amber-500"
                style={{ top: '9.25rem' }}
                aria-hidden="true"
              />

              <div className="relative flex items-start gap-3" dir="rtl">
                {timeline.map(([dateKey, items]) => {
                  const first = items[0];
                  const hasMultiple = items.length > 1;

                  return (
                    <div key={dateKey} className="flex w-48 flex-col items-center">
                      {/* Card. h-28 is enforced so every column's node row
                          lines up horizontally with the others. w-full
                          guarantees the card never exceeds its column, so
                          overlap with a neighbour is impossible. All cards
                          sit above the axis (no alternating layout). */}
                      <button
                        type="button"
                        onClick={() => handleCardClick(first)}
                        className={`flex h-28 w-full cursor-pointer flex-col gap-1 overflow-hidden rounded-2xl border p-2.5 text-center shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          hasMultiple
                            ? 'border-amber-300 bg-amber-50/90 text-amber-950'
                            : 'border-blue-200 bg-white text-slate-900 hover:border-blue-400'
                        }`}
                        title={`${first.course['نام درس']} - ${first.weekday} ${first.label}`}
                      >
                        <div className="truncate text-[11.5px] font-black" title={first.course['نام درس']}>
                          {first.course['نام درس']}
                        </div>
                        {hasMultiple && (
                          <div className="text-[10px] font-bold text-amber-700">
                            + {faNum(items.length - 1)} امتحان دیگر
                          </div>
                        )}
                        <div className="text-[10.5px] font-bold text-amber-800 tabular-nums">
                          ساعت {toFaDigits(first.parsed.from)} تا {toFaDigits(first.parsed.to)}
                        </div>
                        <div className="mt-auto truncate text-[10px] text-slate-500">
                          {first.course['استاد'] || 'استاد مشخص نشده'}
                        </div>
                      </button>

                      {/* Stem: a real layout element (not absolute), so it
                          always reaches from the card bottom to the node
                          top no matter how tall the card content is. */}
                      <div className="h-3 w-0.5 shrink-0 bg-blue-400" aria-hidden="true" />

                      {/* Node on the axis. The fixed card + stem heights above
                          place this button's centre exactly on the axis line. */}
                      <button
                        type="button"
                        onClick={() => handleCardClick(first)}
                        className={`relative z-10 grid size-12 shrink-0 place-items-center rounded-full border-4 border-white shadow-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          hasMultiple ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
                        }`}
                        title={`${first.weekday} ${first.label}`}
                        aria-label={`امتحان ${first.weekday} ${first.label}`}
                      >
                        <span className="text-xs font-black tabular-nums">
                          {toFaDigits(first.parsed.jd)}
                        </span>
                      </button>

                      {/* Date label under the node */}
                      <div className="mt-2 text-center whitespace-nowrap">
                        <span className="block text-[11px] font-extrabold text-slate-800">
                          {first.weekday}
                        </span>
                        <span className="block text-[9.5px] font-bold text-slate-500">
                          {first.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: CHRONOLOGICAL CARDS LIST VIEW */}
      {viewMode === 'cards' && (
        <div className="space-y-4">
          {timeline.map(([dateKey, items]) => {
            const first = items[0];
            const hasMultiple = items.length > 1;
            const isUrgent = first.daysLeft !== null && first.daysLeft >= 0 && first.daysLeft <= 3;

            return (
              <div
                key={dateKey}
                className={`rounded-2xl border p-4 shadow-xs transition-all ${
                  hasMultiple ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white'
                }`}
              >
                {/* Date Row Header */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5" dir="rtl">
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-xl bg-blue-600 text-xs font-black text-white shadow-xs">
                      {toFaDigits(first.parsed.jd)}
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        {first.weekday} {first.label}
                      </h4>
                      <span className="text-[10px] text-slate-400">میلادی: {first.gregorianShort}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {hasMultiple && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-black text-amber-800">
                        <AlertIcon className="size-3.5" />
                        {faNum(items.length)} امتحان در این روز
                      </span>
                    )}

                    {first.daysLeft !== null && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          isUrgent ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {relativeDayLabel(first.daysLeft)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Exam cards in this day */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => {
                    const { course, key, parsed } = item;
                    const title = course['نام درس'] || 'بدون نام';
                    const instructor = course['استاد'] || 'نامشخص';
                    const room = course['مكان برگزاري'] || '';
                    const code = course['كد ارائه كلاس درس'] || '';

                    return (
                      <div
                        key={key}
                        onClick={() => handleCardClick(item)}
                        className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 cursor-pointer transition-all hover:border-blue-400 hover:shadow-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h5 className="text-xs font-black text-slate-900 leading-snug">{title}</h5>
                          {onRemoveCourse && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onRemoveCourse(key); }}
                              className="text-slate-400 hover:text-rose-600 print:hidden"
                              title="حذف"
                            >
                              <CloseIcon className="size-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="my-2 space-y-1 text-xs text-slate-600" dir="rtl">
                          <div className="flex items-center gap-1.5 font-bold text-amber-900">
                            <ClockIcon className="size-3.5 text-amber-600 shrink-0" />
                            <span>ساعت امتحان: {toFaDigits(parsed.from)} تا {toFaDigits(parsed.to)}</span>
                          </div>

                          <div className="flex items-center gap-1.5 text-slate-600">
                            <UserIcon className="size-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">استاد: {instructor}</span>
                          </div>

                          {room && (
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <PinIcon className="size-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">محل: {room}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-200/60 pt-1.5 text-[10.5px] text-slate-500">
                          <span>کد ارائه:</span>
                          <span className="font-mono font-bold" dir="ltr">{code}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unscheduled exams list */}
      {unscheduled.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 print-avoid-break">
          <h4 className="text-xs font-black text-slate-700">
            دروس با تاریخ امتحان نامشخص ({faNum(unscheduled.length)} درس):
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {unscheduled.map(({ course, key }) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
              >
                {course['نام درس']}
                {onRemoveCourse && (
                  <button
                    type="button"
                    onClick={() => onRemoveCourse(key)}
                    className="text-slate-400 hover:text-rose-600 print:hidden"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Fallback Simple Modal if onOpenDetail is not available */}
      {selectedExamItem && !onOpenDetail && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="بستن جزئیات"
            onClick={() => setSelectedExamItem(null)}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
          />

          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl animate-sheet-up">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-black text-blue-700">
                  {selectedExamItem.course['تعداد واحد نظري'] || '۰'} واحد نظری
                </span>
                <h3 className="mt-1.5 text-base font-black text-slate-900">
                  {selectedExamItem.course['نام درس']}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedExamItem(null)}
                className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <CloseIcon className="size-4.5" />
              </button>
            </div>

            <div className="my-4 space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="text-slate-500 font-bold">تاریخ و روز امتحان:</span>
                <span className="font-black text-slate-900">
                  {selectedExamItem.weekday} {selectedExamItem.label}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-amber-50/70 p-2.5 text-amber-900">
                <span className="font-bold">ساعت دقیق آزمون:</span>
                <span className="font-black">
                  {toFaDigits(selectedExamItem.parsed.from)} الی {toFaDigits(selectedExamItem.parsed.to)}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="text-slate-500 font-bold">استاد درس:</span>
                <span className="font-black text-slate-800">
                  {selectedExamItem.course['استاد'] || 'مشخص نشده'}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="text-slate-500 font-bold">کد ارائه کلاس درس:</span>
                <span className="font-mono font-black text-blue-700" dir="ltr">
                  {selectedExamItem.course['كد ارائه كلاس درس']}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="text-slate-500 font-bold">محل برگزاری آزمون:</span>
                <span className="font-medium text-slate-700">
                  {selectedExamItem.course['مكان برگزاري'] || 'محل آزمون متعاقباً اعلام می‌شود'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setSelectedExamItem(null)}
                className="ms-auto rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
