// Registration Assistant & Selected Courses Cart.
// Displays unit totals, regulatory limits, conflict warnings, batch offering-code copy,
// calendar export, and shareable link generator.

import React, { useRef, useState } from 'react';
import { faNum, rowKeyOf, totalUnits as rowTotalUnits, capacityInfo } from '../lib/format.js';
import { copyText } from '../lib/clipboard.js';
import { useScrollLock, useDialogFocus } from '../lib/hooks.js';
import {
  CloseIcon, CopyIcon, DownloadIcon, TrashIcon, AlertIcon, CheckIcon, ShareIcon, UserIcon, ClockIcon,
} from './icons.jsx';

export default function CartDrawer({
  isOpen,
  onClose,
  courses = [],
  onRemoveCourse,
  onClearAll,
  unitSummary,
  conflictData,
  onExportIcs,
  onNotify,
  onOpenCompare,
  pendingLegacyCount = 0,
  onOpenLegacy,
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  // ENH-3: the destructive clear-all asks for a second tap within 4 seconds
  // instead of wiping a whole semester's selections from one slip.
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimerRef = useRef(null);
  const containerRef = useRef(null);
  useScrollLock(true);
  useDialogFocus(containerRef);

  if (!isOpen) return null;

  const handleClearAllClick = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    clearTimeout(confirmTimerRef.current);
    setConfirmClear(false);
    onClearAll();
  };

  const totalUnits = unitSummary?.totalUnits || 0;
  const theoryUnits = unitSummary?.theoryUnits || 0;
  const practicalUnits = unitSummary?.practicalUnits || 0;

  // Percentage of standard 20 units
  const unitProgress = Math.min(100, Math.round((totalUnits / 20) * 100));

  // Copy all course offering codes at once for easy pasting into university portal
  const handleCopyAllCodes = async () => {
    const codes = courses
      .map((c) => c['كد ارائه كلاس درس'] || c['كد درس'])
      .filter(Boolean);

    if (codes.length === 0) return;

    const ok = await copyText(codes.join('\n'));
    if (ok) {
      setCopiedCode(true);
      onNotify?.('کدهای ارائه تمام دروس با موفقیت در کلیپ‌بورد کپی شد.');
      setTimeout(() => setCopiedCode(false), 2500);
    } else {
      onNotify?.('مرورگر اجازهٔ کپی نداد؛ کدها کپی نشدند.');
    }
  };

  // Generate shareable link
  const handleShareLink = async () => {
    // Producer contract (see App.handleShare): raw '||'-joined keys through
    // searchParams - no per-key encoding, no per-key decoding on read.
    const keys = courses.map((c) => rowKeyOf(c)).filter(Boolean);
    if (keys.length === 0) return;
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('b', keys.join('||'));
    const ok = await copyText(url.toString());
    if (ok) {
      setCopiedLink(true);
      onNotify?.('لینک اشتراک‌گذاری برنامه در کلیپ‌بورد کپی شد.');
      setTimeout(() => setCopiedLink(false), 2500);
    } else {
      onNotify?.('مرورگر اجازهٔ کپی نداد؛ لینک کپی نشد.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="بستن سبد انتخاب واحد"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      />
      <div
        ref={containerRef}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl transition-transform animate-slide-in-right outline-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="سبد انتخاب واحد"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-blue-100 text-blue-700 font-black">
              🛍️
            </span>
            <div>
              <h2 id="cart-drawer-title" className="text-base font-black text-slate-900">
                سبد انتخاب واحد و دستیار آموزشیار
              </h2>
              <p className="text-xs text-slate-500">
                {faNum(courses.length)} درس انتخاب شده
              </p>
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Unit Calculator & Status Card */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-500">جمع کل واحدها:</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-3xl font-black text-slate-900">{faNum(totalUnits)}</span>
                  <span className="text-xs font-bold text-slate-400">از ۲۰ واحد استاندارد</span>
                </div>
              </div>

              <div className="text-end">
                <span className="inline-block rounded-full px-3 py-1 text-xs font-black bg-white shadow-xs border border-slate-200 text-slate-700">
                  {unitSummary?.statusMessage}
                </span>
                <p className="mt-1 text-[11px] text-slate-500">
                  {faNum(theoryUnits)} واحد نظری + {faNum(practicalUnits)} واحد عملی
                </p>
              </div>
            </div>

            {/* Visual Gauge Bar */}
            <div className="mt-3">
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className={`h-full transition-all duration-500 ${
                    totalUnits > 24
                      ? 'bg-rose-500'
                      : totalUnits > 20
                      ? 'bg-amber-500'
                      : totalUnits >= 12
                      ? 'bg-emerald-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${unitProgress}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10.5px] font-bold text-slate-400">
                <span>۰ واحد</span>
                <span>کف مجاز: ۱۲ واحد</span>
                <span>سقف استاندارد: ۲۰ واحد</span>
                <span>سقف ممتازین: ۲۴ واحد</span>
              </div>
            </div>
          </div>

          {/* Conflict Alert Box (if any) */}
          {conflictData?.hasConflicts && (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-950">
              <div className="flex items-center gap-2 font-black text-sm text-rose-900">
                <AlertIcon className="size-5 text-rose-600 shrink-0" />
                <span>تداخل زمانی در برنامه شناسایی شد!</span>
              </div>

              {conflictData.scheduleConflicts.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  <p className="text-xs font-bold text-rose-800">تداخل ساعت کلاسی:</p>
                  {conflictData.scheduleConflicts.map((c, idx) => (
                    <div key={idx} className="rounded-xl border border-rose-200 bg-white/90 p-2.5 text-xs">
                      <div className="font-extrabold text-slate-900">
                        {c.titleA} ⚡ {c.titleB}
                      </div>
                      <div className="mt-1 text-slate-600 text-[11.5px]">
                        روز {c.day}: ({c.timeA}) با ({c.timeB}) تداخل دارد.
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {conflictData.examConflicts.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  <p className="text-xs font-bold text-rose-800">تداخل ساعت امتحان نهایی:</p>
                  {conflictData.examConflicts.map((c, idx) => (
                    <div key={idx} className="rounded-xl border border-rose-200 bg-white/90 p-2.5 text-xs">
                      <div className="font-extrabold text-slate-900">
                        {c.titleA} ⚡ {c.titleB}
                      </div>
                      <div className="mt-1 text-slate-600 text-[11.5px]">
                        تاریخ {c.date}: ساعت {c.timeA} با ساعت {c.timeB} تداخل دارد.
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleCopyAllCodes}
              disabled={courses.length === 0}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <CopyIcon className="size-4" />
              {copiedCode ? 'کپی شد!' : 'کپی همه کدهای ارائه'}
            </button>

            <button
              type="button"
              onClick={onExportIcs}
              disabled={courses.length === 0}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <DownloadIcon className="size-4" />
              خروجی تقویم (.ics)
            </button>

            <button
              type="button"
              onClick={handleShareLink}
              disabled={courses.length === 0}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <ShareIcon className="size-4" />
              {copiedLink ? 'لینک کپی شد!' : 'اشتراک‌گذاری برنامه'}
            </button>

            <button
              type="button"
              onClick={handleClearAllClick}
              disabled={courses.length === 0}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                confirmClear
                  ? 'border-rose-500 bg-rose-600 text-white shadow-sm'
                  : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <TrashIcon className="size-4" />
              {confirmClear ? 'مطمئنید؟ کلیک دوم پاک می‌کند' : 'خالی کردن سبد'}
            </button>
          </div>

          {/* Selected Courses List */}
          <div>
            <h3 className="mb-3 text-xs font-black text-slate-700">
              لیست دروس انتخابی ({faNum(courses.length)}):
            </h3>

            {pendingLegacyCount > 0 && (
              <button
                type="button"
                onClick={onOpenLegacy}
                className="mb-3 flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] font-bold text-amber-800 transition-colors hover:bg-amber-100"
              >
                <span>{faNum(pendingLegacyCount)} نشان قدیمی نیازمند تعیین تکلیف</span>
                <span className="font-black text-amber-900">مشاهده ←</span>
              </button>
            )}

            {courses.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">
                هنوز درسی به سبد اضافه نشده است.
              </p>
            ) : (
              <div className="space-y-2.5">
                {courses.map((course) => {
                  const key = rowKeyOf(course);
                  const title = course['نام درس'] || 'بدون نام';
                  const instructor = course['استاد'] || 'نامشخص';
                  const sched = course['زمانبندي تشكيل كلاس'] || 'نامشخص';
                  const exam = course['زمان امتحان'] || 'نامشخص';
                  const code = course['كد ارائه كلاس درس'] || course['كد درس'] || '';
                  // Theory + practical, matching the drawer's own total (BUG-19).
                  const units = rowTotalUnits(course) ?? 0;
                  // ENH-4: registration-reality signal from data that actually
                  // carries capacity AND enrollment; nothing shown otherwise.
                  const cap = capacityInfo(course);
                  const isConflicted = conflictData?.conflictRowKeys?.has(key);

                  return (
                    <div
                      key={key}
                      className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                        isConflicted
                          ? 'border-rose-300 bg-rose-50/40 shadow-xs'
                          : 'border-slate-200 bg-white shadow-xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-800">
                              {faNum(units)} واحد
                            </span>
                            {cap.pct !== null && cap.pct >= 100 && (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-black text-rose-700">
                                ظرفیت تکمیل
                              </span>
                            )}
                            {cap.pct !== null && cap.pct >= 85 && cap.pct < 100 && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-700">
                                ظرفیت رو به تکمیل
                              </span>
                            )}
                            {isConflicted && (
                              <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                                ⚠ تداخل
                              </span>
                            )}
                            <h4 className="truncate font-black text-slate-900 text-sm" title={title}>
                              {title}
                            </h4>
                          </div>

                          <div className="mt-2 space-y-1 text-xs text-slate-600">
                            <div className="flex items-center gap-1.5">
                              <UserIcon className="size-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">استاد: {instructor}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
                              <ClockIcon className="size-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">کلاس: {sched}</span>
                            </div>
                            {exam && exam !== 'نامشخص' && (
                              <div className="flex items-center gap-1.5 text-[11px] text-amber-800">
                                <span className="font-bold">امتحان:</span>
                                <span className="truncate">{exam}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveCourse(key)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                          title="حذف از سبد"
                        >
                          <CloseIcon className="size-4" />
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <span>کد ارائه:</span>
                          <span className="font-mono font-bold text-slate-800" dir="ltr">{code}</span>
                        </div>

                        {onOpenCompare && (
                          <button
                            type="button"
                            onClick={() => onOpenCompare(course)}
                            className="text-[11.5px] font-bold text-blue-600 hover:underline"
                          >
                            مقایسه اساتید ⇄
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
