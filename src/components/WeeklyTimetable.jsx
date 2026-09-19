// Interactive Weekly Timetable Grid.
// Supports multi-section courses, side-by-side multi-course conflict rendering,
// list/grid view switching, and landscape PDF/print styling.

import React, { useMemo, useState } from 'react';
import { parseSchedule, toFaDigits, FA_DAYS } from '../lib/datetime.js';
import { faNum, rowKeyOf } from '../lib/format.js';
import { DownloadIcon, CloseIcon, AlertIcon, CheckIcon, PrinterIcon, CalendarIcon, ListIcon } from './icons.jsx';

const GRID_START_MIN = 7 * 60 + 30; // 07:30 (450)
const GRID_END_MIN = 20 * 60 + 30;   // 20:30 (1230)
const TOTAL_MIN = GRID_END_MIN - GRID_START_MIN; // 780 minutes

const TIME_MARKS = [
  '07:30', '09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00', '19:30', '20:30',
];

const COURSE_PALETTES = [
  { bg: 'bg-blue-50 border-blue-200 text-blue-900', badge: 'bg-blue-100 text-blue-800' },
  { bg: 'bg-emerald-50 border-emerald-200 text-emerald-900', badge: 'bg-emerald-100 text-emerald-800' },
  { bg: 'bg-violet-50 border-violet-200 text-violet-900', badge: 'bg-violet-100 text-violet-800' },
  { bg: 'bg-amber-50 border-amber-200 text-amber-900', badge: 'bg-amber-100 text-amber-800' },
  { bg: 'bg-teal-50 border-teal-200 text-teal-900', badge: 'bg-teal-100 text-teal-800' },
  { bg: 'bg-indigo-50 border-indigo-200 text-indigo-900', badge: 'bg-indigo-100 text-indigo-800' },
  { bg: 'bg-cyan-50 border-cyan-200 text-cyan-900', badge: 'bg-cyan-100 text-cyan-800' },
];

function getPalette(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return COURSE_PALETTES[Math.abs(hash) % COURSE_PALETTES.length];
}

/**
 * Packs overlapping time slots on a given day side-by-side into parallel lanes.
 */
function layoutDaySlots(daySlots) {
  if (daySlots.length === 0) return [];
  const sorted = [...daySlots].sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);

  const clusters = [];
  let currentCluster = [];
  let clusterEnd = -1;

  for (const item of sorted) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterEnd = item.endMinutes;
    } else {
      if (item.startMinutes < clusterEnd) {
        currentCluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.endMinutes);
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterEnd = item.endMinutes;
      }
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  const result = [];
  for (const cluster of clusters) {
    const lanes = [];
    const clusterItemsWithLane = [];

    for (const item of cluster) {
      let placedLane = -1;
      for (let l = 0; l < lanes.length; l++) {
        if (lanes[l] <= item.startMinutes) {
          placedLane = l;
          lanes[l] = item.endMinutes;
          break;
        }
      }
      if (placedLane === -1) {
        placedLane = lanes.length;
        lanes.push(item.endMinutes);
      }
      clusterItemsWithLane.push({ item, lane: placedLane });
    }

    const totalLanes = lanes.length;
    for (const { item, lane } of clusterItemsWithLane) {
      result.push({
        ...item,
        lane,
        totalLanes,
        widthPct: 100 / totalLanes,
        leftPct: (lane / totalLanes) * 100,
      });
    }
  }

  return result;
}

export default function WeeklyTimetable({
  courses = [],
  onRemoveCourse,
  conflictData,
  onExportIcs,
  unitSummary,
  onOpenDetail,
}) {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // Extract all sessions (supporting multi-section slots per course)
  const { scheduled, unscheduled, daysUsed } = useMemo(() => {
    const sched = [];
    const unsched = [];
    const days = new Set([0, 1, 2, 3, 4, 5]); // default Sat to Thu

    courses.forEach((c) => {
      const parsed = parseSchedule(c['زمانبندي تشكيل كلاس']);
      const key = rowKeyOf(c);
      const isConflicted = conflictData?.conflictRowKeys?.has(key);

      const slots = parsed?.slots?.length ? parsed.slots : (parsed ? [parsed] : []);

      if (slots.length > 0) {
        slots.forEach((s, sIdx) => {
          if (s.dayIndex !== null && s.startMinutes && s.endMinutes) {
            sched.push({
              course: c,
              key: `${key}-slot-${sIdx}`,
              courseKey: key,
              slotIndex: sIdx,
              slotCount: slots.length,
              dayIndex: s.dayIndex,
              day: s.day,
              from: s.from,
              to: s.to,
              startMinutes: s.startMinutes,
              endMinutes: s.endMinutes,
              isConflicted,
            });
            days.add(s.dayIndex);
          }
        });
      } else {
        unsched.push({
          course: c,
          key,
          isConflicted,
        });
      }
    });

    const hasFriday = sched.some((s) => s.dayIndex === 6);
    const dayIndices = hasFriday ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5];

    return { scheduled: sched, unscheduled: unsched, daysUsed: dayIndices };
  }, [courses, conflictData]);

  // Group and pack by day with side-by-side lane layout
  const dayLanesMap = useMemo(() => {
    const map = new Map();
    daysUsed.forEach((dayIdx) => {
      const daySlots = scheduled.filter((s) => s.dayIndex === dayIdx);
      map.set(dayIdx, layoutDaySlots(daySlots));
    });
    return map;
  }, [daysUsed, scheduled]);

  const handlePrint = () => {
    window.print();
  };

  if (courses.length === 0) {
    return (
      <div className="flex h-full min-h-[28rem] flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-blue-50 text-3xl text-blue-600">
          📅
        </div>
        <h3 className="text-lg font-black text-slate-800">برنامه هفتگی شما خالی است</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          برای ساخت برنامه هفتگی و بررسی تداخل ساعات کلاسی، از جدول دروس با کلیک روی آیکون قلب (♥)، دروس مد نظرتان را انتخاب کنید.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 sm:p-5">
      {/* Printable Landscape Styles injected directly */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 8mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Official Landscape Print Header */}
      <div className="hidden print:block mb-4 text-center border-b pb-3">
        <h2 className="text-lg font-black text-slate-900">
          برنامه رسمی هفتگی دروس - دانشگاه آزاد واحد شیراز
        </h2>
        <div className="mt-1 flex items-center justify-center gap-4 text-xs font-bold text-slate-600">
          <span>تعداد دروس: {faNum(courses.length)} درس</span>
          <span>•</span>
          <span>مجموع واحد: {faNum(unitSummary?.totalUnits || 0)} واحد</span>
          <span>•</span>
          <span>تاریخ گزارش: {new Date().toLocaleDateString('fa-IR')}</span>
        </div>
      </div>

      {/* Top action and info bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3.5 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
            <span>دروس انتخابی:</span>
            <span className="font-black text-blue-900">{faNum(courses.length)} درس</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
            <span>مجموع واحدها:</span>
            <span className="font-black text-indigo-900">{faNum(unitSummary?.totalUnits || 0)} واحد</span>
            <span className="text-[11px] text-indigo-400">({faNum(unitSummary?.theoryUnits || 0)} نظری + {faNum(unitSummary?.practicalUnits || 0)} عملی)</span>
          </div>

          {conflictData?.hasConflicts ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">
              <AlertIcon className="size-4 shrink-0 text-rose-600" />
              <span>{faNum(conflictData.scheduleConflicts.length + conflictData.examConflicts.length)} تداخل زمانی شناسایی شد!</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
              <CheckIcon className="size-4 shrink-0 text-emerald-600" />
              <span>هیچ تداخل زمانی در ساعات کلاس وجود ندارد</span>
            </div>
          )}
        </div>

        {/* View toggles and Print/Export Actions */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="تغییر نمای هفتگی">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                viewMode === 'grid'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="size-3.5" />
              <span>نمای ماتریسی</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListIcon className="size-3.5" />
              <span>نمای فهرستی</span>
            </button>
          </div>

          {/* Dedicated Download PDF / Print Button */}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-300"
            title="دانلود نسخه PDF یا چاپ با چیدمان افقی Landscape"
          >
            <PrinterIcon className="size-3.5 text-slate-600" />
            <span>دانلود PDF برنامه</span>
          </button>

          {/* Calendar Export */}
          <button
            type="button"
            onClick={onExportIcs}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700"
            title="دانلود فایل تقویم برای گوگل کلندر و آیفون"
          >
            <DownloadIcon className="size-3.5" />
            <span>تقویم (.ics)</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: INTERACTIVE WEEKLY MATRIX WITH SIDE-BY-SIDE CONFLICT RENDERING */}
      {viewMode === 'grid' && (
        <div className="min-w-0 flex-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[56rem] p-4">
            {/* Day Headers */}
            <div
              className="grid border-b border-slate-200 pb-2.5 text-center"
              style={{ gridTemplateColumns: `5rem repeat(${daysUsed.length}, minmax(0, 1fr))` }}
            >
              <div className="text-xs font-extrabold text-slate-400">ساعت</div>
              {daysUsed.map((dayIdx) => (
                <div key={dayIdx} className="text-sm font-black text-slate-800">
                  {FA_DAYS[dayIdx]}
                </div>
              ))}
            </div>

            {/* Time Rows and Day Columns */}
            <div
              className="relative grid"
              style={{
                gridTemplateColumns: `5rem repeat(${daysUsed.length}, minmax(0, 1fr))`,
                minHeight: '44rem',
              }}
            >
              {/* Time labels axis */}
              <div className="relative border-e border-slate-100 py-1 pe-2">
                {TIME_MARKS.map((tm) => {
                  const [h, m] = tm.split(':').map(Number);
                  const currentMin = h * 60 + m;
                  const topPct = ((currentMin - GRID_START_MIN) / TOTAL_MIN) * 100;
                  return (
                    <div
                      key={tm}
                      className="absolute end-2 text-start text-[11px] font-bold tabular-nums text-slate-400"
                      style={{ top: `${topPct}%`, transform: 'translateY(-50%)' }}
                    >
                      {toFaDigits(tm)}
                    </div>
                  );
                })}
              </div>

              {/* Day columns with side-by-side packed lanes */}
              {daysUsed.map((dayIdx) => {
                const dayItems = dayLanesMap.get(dayIdx) || [];
                return (
                  <div
                    key={dayIdx}
                    className="relative border-e border-slate-100 last:border-e-0"
                  >
                    {/* Subtle horizontal grid lines */}
                    {TIME_MARKS.map((tm) => {
                      const [h, m] = tm.split(':').map(Number);
                      const currentMin = h * 60 + m;
                      const topPct = ((currentMin - GRID_START_MIN) / TOTAL_MIN) * 100;
                      return (
                        <div
                          key={tm}
                          className="pointer-events-none absolute inset-x-0 border-b border-dashed border-slate-100"
                          style={{ top: `${topPct}%` }}
                        />
                      );
                    })}

                    {/* Render Course Sessions Side-By-Side */}
                    {dayItems.map(({ course, key, courseKey, from, to, startMinutes, endMinutes, isConflicted, slotCount, widthPct, leftPct, totalLanes }) => {
                      const topPct = Math.max(0, ((startMinutes - GRID_START_MIN) / TOTAL_MIN) * 100);
                      const heightPct = Math.max(
                        6.5,
                        ((endMinutes - startMinutes) / TOTAL_MIN) * 100
                      );
                      const title = course['نام درس'] || 'بدون نام';
                      const instructor = course['استاد'] || '';
                      const room = course['مكان برگزاري'] || '';
                      const code = course['كد ارائه كلاس درس'] || '';
                      const palette = getPalette(title);
                      const isMultiLane = totalLanes > 1;

                      return (
                        <div
                          key={key}
                          onClick={() => onOpenDetail?.(course)}
                          className={`absolute flex flex-col justify-between overflow-hidden rounded-xl border p-1.5 text-center transition-all cursor-pointer hover:z-30 hover:shadow-lg ${
                            isConflicted
                              ? 'border-rose-400 bg-rose-50/95 text-rose-950 ring-2 ring-rose-400/80 shadow-md'
                              : `${palette.bg} shadow-xs`
                          }`}
                          style={{
                            top: `${topPct}%`,
                            height: `${heightPct}%`,
                            width: `calc(${widthPct}% - 4px)`,
                            left: `calc(${leftPct}% + 2px)`,
                          }}
                          title={`${title} - ${instructor || 'استاد اعلام نشده'} (${from} تا ${to})`}
                        >
                          <div className="flex items-start justify-between gap-0.5">
                            {isConflicted && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-rose-600 px-1 py-0.2 text-[9px] font-black text-white shrink-0">
                                ⚠ تداخل
                              </span>
                            )}
                            <span className="mx-auto truncate text-[11.5px] font-black leading-tight text-slate-900">
                              {title}
                            </span>
                            {onRemoveCourse && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onRemoveCourse(courseKey); }}
                                className="rounded p-0.5 text-slate-400 hover:bg-slate-200/60 hover:text-rose-600 transition-colors shrink-0 print:hidden"
                                title="حذف از برنامه"
                              >
                                <CloseIcon className="size-3" />
                              </button>
                            )}
                          </div>

                          <div className="my-0.5 flex flex-col items-center justify-center gap-0.5 text-[10.5px] leading-tight text-slate-600">
                            {instructor && (
                              <span className="truncate font-semibold text-slate-700">
                                {instructor}
                              </span>
                            )}
                            {room && !isMultiLane && (
                              <span className="truncate text-[10px] text-slate-500">
                                📍 {room}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[9.5px] font-bold text-slate-600 border-t border-slate-200/60 pt-0.5" dir="rtl">
                            <span className="tabular-nums">
                              {toFaDigits(from)} تا {toFaDigits(to)}
                            </span>
                            {slotCount > 1 && (
                              <span className="rounded bg-white/80 px-1 py-0.2 text-[8.5px] font-extrabold text-blue-700">
                                ۲ جلسه‌ای
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: ORDERED LIST VIEW BY DAY */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {daysUsed.map((dayIdx) => {
            const dayItems = dayLanesMap.get(dayIdx) || [];
            if (dayItems.length === 0) return null;
            return (
              <div key={dayIdx} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-black text-slate-900">{FA_DAYS[dayIdx]}</h3>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-extrabold text-blue-700">
                    {faNum(dayItems.length)} جلسه در این روز
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {dayItems.map(({ course, key, courseKey, from, to, isConflicted }) => {
                    const title = course['نام درس'] || 'بدون نام';
                    const instructor = course['استاد'] || '';
                    const room = course['مكان برگزاري'] || '';
                    const code = course['كد ارائه كلاس درس'] || '';

                    return (
                      <div
                        key={key}
                        onClick={() => onOpenDetail?.(course)}
                        className={`flex flex-col justify-between rounded-xl border p-3 cursor-pointer transition-all hover:border-blue-400 hover:shadow-xs ${
                          isConflicted ? 'border-rose-300 bg-rose-50/70' : 'border-slate-200 bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-black text-slate-900 leading-snug">{title}</h4>
                          {onRemoveCourse && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onRemoveCourse(courseKey); }}
                              className="text-slate-400 hover:text-rose-600 print:hidden"
                              title="حذف"
                            >
                              <CloseIcon className="size-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="my-2 space-y-1 text-xs text-slate-600" dir="rtl">
                          <div className="flex items-center gap-1.5 font-bold text-blue-800">
                            <span>ساعت:</span>
                            <span className="tabular-nums">{toFaDigits(from)} تا {toFaDigits(to)}</span>
                          </div>
                          {instructor && <div>استاد: {instructor}</div>}
                          {room && <div>مکان: {room}</div>}
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

      {/* Unscheduled courses panel */}
      {unscheduled.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 print-avoid-break">
          <h4 className="text-xs font-black text-amber-900">
            ⚠️ دروس انتخاب شده بدون زمان‌بندی اعلام‌شده در جدول ({faNum(unscheduled.length)} درس):
          </h4>
          <p className="mt-1 text-[11.5px] text-amber-700">
            ساعت کلاس این دروس هنوز در فایل اکسل دانشگاه مشخص نشده و در جدول گرافیکی بالا قرار نمی‌گیرند.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {unscheduled.map(({ course, key }) => (
              <div
                key={key}
                className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs shadow-xs"
              >
                <span className="font-bold text-slate-800">{course['نام درس']}</span>
                {course['استاد'] && <span className="text-slate-500">({course['استاد']})</span>}
                {onRemoveCourse && (
                  <button
                    type="button"
                    onClick={() => onRemoveCourse(key)}
                    className="text-slate-400 hover:text-rose-600 print:hidden"
                    title="حذف"
                  >
                    <CloseIcon className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
