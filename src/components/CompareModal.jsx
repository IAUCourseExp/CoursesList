// Course Section Comparison Tool.
// Compares all sections/instructors of the same course side-by-side,
// making it easy for students to pick the best schedule and professor.

import React, { useMemo } from 'react';
import { CloseIcon, UserIcon, ClockIcon, PinIcon, CheckIcon } from './icons.jsx';
import { faNum, rowKeyOf } from '../lib/format.js';
import { parseSchedule, parseExam, toFaDigits } from '../lib/datetime.js';
import { canonical } from '../lib/columns.js';

export default function CompareModal({
  course,
  allCourses = [],
  onClose,
  onToggleBookmark,
  bookmarkSet = new Set(),
}) {
  const courseName = course ? (course['نام درس'] || '') : '';
  const targetCanon = canonical(courseName);

  // Find all sections with identical course name using canonical normalisation (Arabic/Persian yeh/kaf)
  const sections = useMemo(() => {
    if (!targetCanon) return [];
    const pool = allCourses.length > 0 ? allCourses : (course ? [course] : []);
    const matches = pool.filter((c) => canonical(c['نام درس']) === targetCanon);
    return matches.length > 0 ? matches : (course ? [course] : []);
  }, [targetCanon, allCourses, course]);

  if (!course) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6 backdrop-blur-xs animate-fade-in" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-3xl bg-white shadow-2xl animate-pop-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`مقایسه اساتید و گروه‌های درس ${courseName}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-blue-100 text-xl text-blue-700 font-bold">
              ⇄
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                  {course['مقطع ارائه درس'] || 'دانشگاه'}
                </span>
                <span className="text-xs text-slate-400">
                  {faNum(sections.length)} گروه درسی ارائه شده
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900 sm:text-lg">
                مقایسه اساتید و زمان‌بندی: {courseName}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="بستن"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        {/* Comparison Grid */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((sec, idx) => {
              const key = rowKeyOf(sec);
              const isSelected = bookmarkSet.has(key);
              const sched = parseSchedule(sec['زمانبندي تشكيل كلاس']);
              const exam = parseExam(sec['زمان امتحان']);
              const instructor = sec['استاد'] || 'نامشخص';
              const code = sec['كد ارائه كلاس درس'] || '';
              const capacity = sec['حداكثر ظرفيت'] || '-';
              const room = sec['مكان برگزاري'] || '';

              return (
                <div
                  key={key || idx}
                  className={`flex flex-col justify-between rounded-2xl border p-4 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-300 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div>
                    {/* Top Section Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-lg bg-slate-100 text-xs font-black text-slate-700">
                          {faNum(idx + 1)}
                        </span>
                        <div className="flex items-center gap-1.5 font-black text-slate-900 text-sm">
                          <UserIcon className="size-4 text-slate-400" />
                          <span>{instructor}</span>
                        </div>
                      </div>

                      {isSelected && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-black text-emerald-800">
                          <CheckIcon className="size-3" />
                          انتخاب شده
                        </span>
                      )}
                    </div>

                    {/* Section Details */}
                    <div className="my-3 space-y-2 text-xs text-slate-600">
                      <div>
                        <span className="text-[11px] font-bold text-slate-400">ساعت کلاس:</span>
                        <div className="mt-0.5 font-bold text-slate-800 flex items-center gap-1">
                          <ClockIcon className="size-3.5 text-blue-500 shrink-0" />
                          <span>
                            {sched
                              ? `${sched.day} ${toFaDigits(sched.from)} تا ${toFaDigits(sched.to)}`
                              : sec['زمانبندي تشكيل كلاس'] || 'نامشخص'}
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold text-slate-400">امتحان نهایی:</span>
                        <div className="mt-0.5 text-slate-700">
                          {exam
                            ? `${exam.jy}/${exam.jm}/${exam.jd} (${toFaDigits(exam.from)} تا ${toFaDigits(exam.to)})`
                            : sec['زمان امتحان'] || 'نامشخص'}
                        </div>
                      </div>

                      {room && (
                        <div>
                          <span className="text-[11px] font-bold text-slate-400">مکان برگزاری:</span>
                          <div className="mt-0.5 text-slate-700 flex items-center gap-1">
                            <PinIcon className="size-3.5 text-slate-400 shrink-0" />
                            <span>{room}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                        <span className="text-slate-400">ظرفیت:</span>
                        <span className="font-bold text-slate-700">{capacity}</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">کد ارائه:</span>
                        <span className="font-mono font-bold text-slate-800" dir="ltr">{code}</span>
                      </div>
                    </div>
                  </div>

                  {/* Select / Deselect Button */}
                  <button
                    type="button"
                    onClick={() => onToggleBookmark(key)}
                    className={`mt-2 w-full rounded-xl py-2 text-xs font-black transition-colors ${
                      isSelected
                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'
                    }`}
                  >
                    {isSelected ? 'حذف این گروه از سبد' : 'انتخاب این گروه'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
