// Comprehensive Mobile and Desktop Course Detail Modal.
// Displays all 22 educational attributes with clear categorization, copyable codes,
// capacity progress bar, exam countdown, conflict indicators, and quick action buttons.

import React, { useState } from 'react';
import {
  CloseIcon,
  HeartIcon,
  CopyIcon,
  CompareIcon,
  CalendarIcon,
  ClockIcon,
  PinIcon,
  UserIcon,
  LayersIcon,
  CheckIcon,
  GraduationCapIcon,
  AlertIcon,
} from './icons.jsx';
import { CapacityBar } from './Bits.jsx';
import {
  isBlank,
  faNum,
  capacityInfo,
  fillTone,
  displayCell,
} from '../lib/format.js';
import {
  parseExam,
  parseSchedule,
  toFaDigits,
  formatJalaliWithWeekday,
  daysUntil,
  relativeDayLabel,
} from '../lib/datetime.js';
import { useScrollLock } from '../lib/hooks.js';

export default function CourseDetailModal({
  course,
  onClose,
  isBookmarked,
  onToggleBookmark,
  onCompare,
  onNotify,
  hasConflict = false,
}) {
  useScrollLock(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  if (!course) return null;

  const title = isBlank(course['نام درس']) ? 'درس بدون نام' : course['نام درس'];
  const offeringCode = course['كد ارائه كلاس درس'] || course['كد درس'] || '';
  const courseCode = course['كد درس'] || '';
  const professor = isBlank(course['استاد']) ? 'استاد مشخص نشده است' : course['استاد'];
  const otherProfessors = isBlank(course['ساير اساتيد']) ? null : course['ساير اساتيد'];

  const capacity = capacityInfo(course);
  const tone = fillTone(capacity.pct);
  const exam = parseExam(course['زمان امتحان']);
  const schedule = parseSchedule(course['زمانبندي تشكيل كلاس']);
  const examDays = exam ? daysUntil(exam.date) : null;
  const examWhen = exam ? formatJalaliWithWeekday(exam.jy, exam.jm, exam.jd) : null;

  const nUnits = (v) =>
    isBlank(v)
      ? null
      : Number(String(v).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)));
  const theory = nUnits(course['تعداد واحد نظري']) || 0;
  const practical = nUnits(course['تعداد واحد عملي']) || 0;
  const totalUnits = theory + practical;

  const handleCopyOfferingCode = () => {
    if (!offeringCode) return;
    navigator.clipboard.writeText(offeringCode).then(() => {
      setCopiedCode(true);
      onNotify?.(`کد ارائه (${offeringCode}) در کلیپ‌بورد کپی شد.`);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const handleCopyFullInfo = () => {
    const text = [
      `نام درس: ${title}`,
      `کد ارائه: ${offeringCode}`,
      `استاد: ${professor}`,
      `واحد: ${totalUnits} (${theory} نظری + ${practical} عملی)`,
      `زمان کلاس: ${course['زمانبندي تشكيل كلاس'] || 'نامشخص'}`,
      `مکان: ${course['مكان برگزاري'] || 'نامشخص'}`,
      `زمان امتحان: ${course['زمان امتحان'] || 'نامشخص'}`,
      `دانشکده: ${course['دانشكده'] || 'نامشخص'}`,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopiedAll(true);
      onNotify?.('اطلاعات کامل درس کپی شد.');
      setTimeout(() => setCopiedAll(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-detail-title"
    >
      <button
        type="button"
        aria-label="بستن پنجره"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
      />

      <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-2xl animate-sheet-up sm:max-h-[88vh] sm:rounded-3xl">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              {offeringCode && (
                <button
                  type="button"
                  onClick={handleCopyOfferingCode}
                  title="کلیک برای کپی کد ارائه"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <CopyIcon className="size-3.5" />
                  <span>کد ارائه: {toFaDigits(offeringCode)}</span>
                  {copiedCode && <span className="text-[10px] text-emerald-600 font-bold">✓ کپی شد</span>}
                </button>
              )}

              {course['مقطع ارائه درس'] && (
                <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  {course['مقطع ارائه درس']}
                </span>
              )}

              {course['نوع ارائه'] && (
                <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                  {course['نوع ارائه']}
                </span>
              )}

              {hasConflict && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-800 animate-pulse">
                  <AlertIcon className="size-3 text-rose-600" />
                  تداخل با دروس انتخابی
                </span>
              )}
            </div>

            <h2 id="course-detail-title" className="text-base sm:text-lg font-black text-slate-900 leading-snug">
              {title}
            </h2>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-bold">
              <span className="inline-flex items-center gap-1 text-blue-700 font-black">
                <UserIcon className="size-3.5" />
                {professor}
              </span>
              <span>·</span>
              <span className="text-emerald-700">
                {faNum(totalUnits)} واحد ({faNum(theory)} نظری + {faNum(practical)} عملی)
              </span>
              {courseCode && (
                <>
                  <span>·</span>
                  <span className="tabular-nums">کد درس: {toFaDigits(courseCode)}</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 thin-scrollbar">
          {/* Section 1: Schedule and Exam Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Class Schedule Box */}
            <div className="rounded-2xl border border-blue-200/80 bg-blue-50/50 p-3.5">
              <div className="flex items-center gap-2 mb-2 text-blue-800 font-black text-xs">
                <ClockIcon className="size-4 text-blue-600" />
                <span>زمان‌بندی کلاس درس</span>
              </div>
              <p className="text-sm font-extrabold text-slate-900 leading-relaxed">
                {schedule ? course['زمانبندي تشكيل كلاس'] : 'هنوز زمان تشکیل کلاس اعلام نشده است'}
              </p>
              {course['مكان برگزاري'] && (
                <div className="mt-2.5 flex items-start gap-1.5 text-xs text-slate-600">
                  <PinIcon className="size-3.5 mt-0.5 shrink-0 text-slate-400" />
                  <span>مکان: {course['مكان برگزاري']}</span>
                </div>
              )}
            </div>

            {/* Exam Box */}
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-amber-900 font-black text-xs">
                  <CalendarIcon className="size-4 text-amber-600" />
                  <span>برنامه امتحان پایان‌ترم</span>
                </div>
                {examDays !== null && examDays >= 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-black ${
                      examDays <= 3 ? 'bg-rose-100 text-rose-800 animate-pulse' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {relativeDayLabel(examDays)}
                  </span>
                )}
              </div>
              <p className="text-sm font-extrabold text-slate-900 leading-relaxed">
                {exam ? course['زمان امتحان'] : 'هنوز زمان امتحان اعلام نشده است'}
              </p>
              {examWhen && (
                <p className="mt-2.5 text-xs text-slate-500">
                  {examWhen.weekday} {examWhen.label} · میلادی: {examWhen.gregorianShort}
                </p>
              )}
            </div>
          </div>

          {/* Section 2: Capacity & Registration Status */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-600">وضعیت ظرفیت و ثبت‌نام:</span>
              <span
                className={`text-xs font-black ${
                  tone === 'full' ? 'text-rose-600' : tone === 'high' ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {capacity.pct !== null ? `${faNum(capacity.pct)}٪ تکمیل شده` : 'ظرفیت نامحدود یا نامشخص'}
              </span>
            </div>

            <CapacityBar pct={capacity.pct} tone={tone} />

            <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
              <span>حداکثر ظرفیت: {capacity.capacity ? `${faNum(capacity.capacity)} نفر` : 'اعلام نشده'}</span>
              <span>ثبت‌نامی تاکنون: {capacity.enrolled ? `${faNum(capacity.enrolled)} نفر` : 'اعلام نشده'}</span>
            </div>
          </div>

          {/* Section 3: Educational Details Grid */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-xs font-black text-slate-800 mb-3 flex items-center gap-1.5">
              <GraduationCapIcon className="size-4 text-blue-600" />
              <span>مشخصات آموزشی و سازمانی</span>
            </h3>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <dt className="text-slate-400 font-bold mb-0.5">دانشکده:</dt>
                <dd className="font-extrabold text-slate-800">{displayCell(course['دانشكده'])}</dd>
              </div>

              <div>
                <dt className="text-slate-400 font-bold mb-0.5">گروه آموزشی:</dt>
                <dd className="font-extrabold text-slate-800">{displayCell(course['گروه آموزشي'])}</dd>
              </div>

              <div>
                <dt className="text-slate-400 font-bold mb-0.5">نوع درس:</dt>
                <dd className="font-extrabold text-slate-800">{displayCell(course['نوع درس'])}</dd>
              </div>

              <div>
                <dt className="text-slate-400 font-bold mb-0.5">سطح ارائه:</dt>
                <dd className="font-extrabold text-slate-800">{displayCell(course['سطح ارائه'])}</dd>
              </div>

              <div>
                <dt className="text-slate-400 font-bold mb-0.5">دانشجویان مجاز:</dt>
                <dd className="font-extrabold text-slate-800">{displayCell(course['دانشجويان مجاز به اخذ كلاس'])}</dd>
              </div>

              {otherProfessors && (
                <div>
                  <dt className="text-slate-400 font-bold mb-0.5">سایر اساتید:</dt>
                  <dd className="font-extrabold text-slate-800">{otherProfessors}</dd>
                </div>
              )}

              <div>
                <dt className="text-slate-400 font-bold mb-0.5">واحد و استان:</dt>
                <dd className="font-extrabold text-slate-800">
                  {displayCell(course['واحد'])} · {displayCell(course['استان'])}
                </dd>
              </div>

              {course['نام كلاس درس'] && (
                <div>
                  <dt className="text-slate-400 font-bold mb-0.5">نام کلاس درس:</dt>
                  <dd className="font-extrabold text-slate-800">{course['نام كلاس درس']}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Footer Actions */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white p-3.5 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyFullInfo}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <CopyIcon className="size-4" />
              <span>{copiedAll ? 'کپی شد!' : 'کپی کل مشخصات'}</span>
            </button>

            {onCompare && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCompare(course);
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <CompareIcon className="size-4" />
                <span>مقایسه سایر اساتید</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              onToggleBookmark();
            }}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-5 text-xs font-black transition-all shadow-sm ${
              isBookmarked
                ? 'bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
            }`}
          >
            <HeartIcon filled={isBookmarked} className="size-4" />
            <span>{isBookmarked ? 'حذف از سبد انتخاب واحد' : 'افزودن به سبد انتخاب واحد'}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
