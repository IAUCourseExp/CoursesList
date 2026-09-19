// Interactive step-by-step smart tour guide for IAU CoursesList.
// Guides students through key mega-features: Smart Search, Cart & Units,
// Weekly Schedule Matrix, Exam Timeline & Conflicts, and Calendar Export.
// Caches completion state in localStorage and supports manual re-launch.

import React, { useState, useCallback } from 'react';
import { CloseIcon, ChevronRight, ChevronLeft, CompassIcon } from './icons.jsx';
import { faNum } from '../lib/format.js';
import { markTourSeen } from '../lib/storage.js';

const TOUR_STEPS = [
  {
    title: 'به سامانه هوشمند برنامه‌ریزی و انتخاب واحد خوش آمدید! 👋',
    badge: 'شروع و معرفی',
    description:
      'این سامانه به‌صورت اختصاصی برای دانشجویان دانشگاه آزاد واحد شیراز طراحی گردیده تا فرآیند انتخاب واحد، تنظیم برنامه هفتگی، رصد تداخل ساعات کلاسی و تقویم امتحانات با بالاترین دقت و بدون اتلاف وقت انجام پذیرد.',
    icon: '🎓',
    tips: [
      'اجرای مستقیم در مرورگر بدون نیاز به ارسال اطلاعات به سرورهای خارجی',
      'تطابق کامل با ضوابط آموزشی و آیین‌نامه‌های مصوب دانشگاه آزاد واحد شیراز',
      'سازگاری کامل با تلفن همراه، تبلت و رایانه با طراحی واکنش‌گرا',
    ],
  },
  {
    title: 'جستجوی هوشمند و پالایش بدون حساسیت به رسم‌الخط 🔍',
    badge: 'جستجو و فیلترها',
    description:
      'نام درس، استاد، کد ارائه، روز برگزاری یا ساعت مد نظرتان را جستجو کنید. سیستم به‌صورت خودکار نگارش‌های مختلف حروف «ی/ي» و «ک/ك» و ارقام فارسی را تطبیق می‌دهد.',
    icon: '⚡',
    tips: [
      'فیلتر همزمان: با کلیک روی آیکون فیلتر هر ستون، چندین گزینه را همزمان ترکیب نمایید.',
      'مرتب‌سازی هوشمند تقویمی بر مبنای روزهای هفته (شنبه تا جمعه)، ساعات یا تاریخ امتحانات.',
      'کلید میانبر کیبورد: با فشردن کلید / از هر جای صفحه به بخش جستجو هدایت می‌شوید.',
    ],
  },
  {
    title: 'سبد انتخاب واحد و پایش سقف قانونی واحدها 🛒',
    badge: 'سبد انتخاب واحد',
    description:
      'با کلیک روی نشان قلب در ردیف هر درس، آن را به سبد خود بیفزایید. سامانه به‌طور لحظه‌ای حد مجاز سقف واحد (حداقل ۱۲، حالت عادی ۲۰ و حداکثر ۲۴ واحد برای دانشجویان ممتاز با معدل بالای ۱۷) را می‌سنجد.',
    icon: '📊',
    tips: [
      'کپی یک‌جای کدهای ارائه جهت درج سریع در سامانه آموزشیار.',
      'تفکیک دقیق واحدهای نظری و عملی بر اساس سرفصل دانشگاه.',
      'ذخیره خودکار در حافظه دستگاه و قابلیت اشتراک لینک مستقیم برنامه با دوستان.',
    ],
  },
  {
    title: 'ماتریس برنامه هفتگی و تداخل‌سنج هوشمند 🗓️',
    badge: 'برنامه هفتگی',
    description:
      'در سربرگ «برنامه هفتگی»، ساعات کلاسی به صورت بصری روی تقویم شنبه تا پنج‌شنبه/جمعه چیده می‌شوند. دروس همپوشان به صورت کنار هم قرار گرفته و تداخل ساعات کلاس یا همزمانی امتحانات با هشدار مشخص می‌گردد.',
    icon: '⚠️',
    tips: [
      'پشتیبانی کامل از دروسی که دو جلسه در هفته برگزار می‌شوند.',
      'چیدمان موازی در صورت وقوع تداخل زمانی بدون پنهان ماندن هیچ کلاسی.',
      'امکان چاپ یا ذخیره افقی در قالب PDF با گرافیک کامل جهت استفاده آفلاین.',
    ],
  },
  {
    title: 'تقویم امتحانات، نمودار محور زمانی و خروجی .ics ⏰',
    badge: 'امتحانات نهایی',
    description:
      'در سربرگ «زمان‌بندی امتحانات» به ماتریس تقویمی نرم، نمودار افقی محور زمانی با نقاط تاریخ، و شمارشگر معکوس دسترسی دارید تا برای فرجه‌های امتحانی برنامه‌ریزی دقیقی داشته باشید.',
    icon: '📅',
    tips: [
      'نمودار بصری X-Axis با نقاط تعاملی جهت مرور سریع فرجه‌ها.',
      'پایش هوشمند روزهایی که دارای بیش از یک آزمون در یک روز هستند.',
      'تولید فایل تقویم بین‌المللی استاندارد (.ics) جهت افزودن به گوگل کلندر و تقویم گوشی.',
    ],
  },
  {
    title: 'شبکه‌های دانشجویی و وبسایت تجارب 🚀',
    badge: 'پایان تور',
    description:
      'تمامی امکانات برای برنامه‌ریزی موفق ترم تحصیلی مهیا است. برای ارزیابی اساتید، دانلود جزوات و حل تمرین‌ها می‌توانید از مراجع دانشجویی زیر استفاده نمایید:',
    icon: '🎉',
    tips: [
      'وبسایت تجارب اساتید شیراز: iaucourseexp.github.io/iau-experiences',
      'کانال تجربیات اساتید در تلگرام: t.me/IAUCourseExp',
      'کانال جزوه و نمونه‌سوالات: t.me/jozveiau',
      'مشاهده مجدد این راهنما در هر زمان با کلیک روی آیکون قطب‌نما در بالای صفحه.',
    ],
  },
];

export default function TourGuide({ isOpen, onClose, onFinish }) {
  const [stepIndex, setStepIndex] = useState(0);

  const handleNext = useCallback(() => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      markTourSeen();
      setStepIndex(0);
      if (onFinish) onFinish();
      if (onClose) onClose();
    }
  }, [stepIndex, onFinish, onClose]);

  const handlePrev = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    }
  }, [stepIndex]);

  const handleSkip = useCallback(() => {
    markTourSeen();
    setStepIndex(0);
    if (onClose) onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const currentStep = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const progressPercent = Math.round(((stepIndex + 1) / TOUR_STEPS.length) * 100);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-step-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="بستن تور راهنما"
        onClick={handleSkip}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
      />

      {/* Modal Card */}
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-2xl animate-sheet-up">
        {/* Header with Progress Bar */}
        <div className="border-b border-slate-100 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-blue-600 text-white shadow-xs">
                <CompassIcon className="size-4.5" />
              </span>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                  راهنمای هوشمند سیستم
                </span>
                <span className="mx-2 text-slate-300">|</span>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-extrabold text-blue-700">
                  {currentStep.badge}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSkip}
              className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
              title="بستن و رد کردن تور"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[11px] font-bold text-slate-500">
              {faNum(stepIndex + 1)} از {faNum(TOUR_STEPS.length)}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 text-2xl shadow-inner border border-blue-100/60">
              {currentStep.icon}
            </div>
            <div className="min-w-0">
              <h3 id="tour-step-title" className="text-base font-black text-slate-900 leading-snug">
                {currentStep.title}
              </h3>
              <p className="mt-1.5 text-xs sm:text-[13px] leading-relaxed text-slate-600">
                {currentStep.description}
              </p>
            </div>
          </div>

          {/* Feature Highlights / Tips */}
          {currentStep.tips && currentStep.tips.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5">
              <span className="text-[11px] font-black text-slate-700">نکات کلیدی این بخش:</span>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {currentStep.tips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-0.5 text-blue-500">✓</span>
                    <span className="leading-relaxed">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-white p-4">
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors px-2 py-1"
          >
            رد کردن تور
          </button>

          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight className="size-3.5" />
                <span>قبلی</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-xs font-black text-white shadow-md shadow-blue-500/25 hover:from-blue-700 hover:to-indigo-700 transition-all"
            >
              <span>{isLast ? 'شروع و ورود به سامانه' : 'مرحله بعدی'}</span>
              {!isLast && <ChevronLeft className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
