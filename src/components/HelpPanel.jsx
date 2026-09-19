// Comprehensive Academic and Feature Knowledge Base Modal.
// Provides IAU Shiraz academic regulations (units, GPA rules, probation, conflicts),
// feature walkthroughs, keyboard shortcuts, Telegram channels, and tour relaunch.

import React, { useState } from 'react';
import {
  CloseIcon,
  SearchIcon,
  FilterIcon,
  HeartIcon,
  SortIcon,
  ChevronDown,
  CalendarIcon,
  ClockIcon,
  CartIcon,
  AlertIcon,
  TelegramIcon,
  CompassIcon,
  BookOpenIcon,
  GraduationCapIcon,
} from './icons.jsx';
import { useScrollLock } from '../lib/hooks.js';

const Kbd = ({ children }) => (
  <kbd className="mx-0.5 rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-sans text-[11px] font-bold text-slate-700 shadow-2xs">
    {children}
  </kbd>
);

export default function HelpPanel({ onClose, onStartTour }) {
  useScrollLock(true);
  const [activeTab, setActiveTab] = useState('regulations'); // 'regulations' | 'features' | 'shortcuts' | 'channels'

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <button
        type="button"
        aria-label="بستن راهنما"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
      />

      <div className="relative flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-2xl animate-sheet-up sm:max-h-[88vh] sm:rounded-3xl">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3.5">
          <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <GraduationCapIcon className="size-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="help-title" className="text-base font-black text-slate-900">
              راهنمای جامع دانشجویان و سامانه انتخاب واحد
            </h2>
            <p className="text-xs text-slate-500 truncate">
              مقررات آموزشی، آموزش ابزارهای هوشمند، کلیدهای میانبر و کانال‌های اطلاع‌رسانی
            </p>
          </div>

          {onStartTour && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartTour();
              }}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100"
              title="مشاهده تور آموزشی تعاملی"
            >
              <CompassIcon className="size-3.5" />
              <span>تور تعاملی</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="grid size-9 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-white px-3 py-2 gap-1 overflow-x-auto thin-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('regulations')}
            className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
              activeTab === 'regulations'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            📜 قوانین و مقررات آموزشی
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('features')}
            className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
              activeTab === 'features'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            ⚡ امکانات هوشمند سامانه
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shortcuts')}
            className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
              activeTab === 'shortcuts'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            ⌨️ کلیدهای میانبر
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('channels')}
            className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
              activeTab === 'channels'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            📢 کانال‌های تلگرام و منابع
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5 thin-scrollbar">
          {/* TAB 1: REGULATIONS */}
          {activeTab === 'regulations' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-4">
                <h3 className="flex items-center gap-2 text-sm font-black text-blue-900">
                  <span className="text-base">⚖️</span>
                  <span>سقف مجاز تعداد واحدهای درسی در هر ترم</span>
                </h3>
                <ul className="mt-2.5 space-y-2 text-xs leading-relaxed text-blue-950">
                  <li className="flex items-start gap-2">
                    <span className="font-black text-blue-600">•</span>
                    <span>
                      <b>حداقل تعداد واحد در ترم عادی:</b> ۱۲ واحد درسی (کمتر از ۱۲ واحد مجاز نبوده و ترم حذف خواهد شد).
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-black text-blue-600">•</span>
                    <span>
                      <b>حداکثر سقف استاندارد:</b> ۲۰ واحد درسی برای تمامی دانشجویان عادی.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-black text-emerald-600">•</span>
                    <span className="rounded-md bg-white/90 p-1 font-bold border border-emerald-300 text-emerald-900">
                      مجاز فقط برای دانشجویان ممتاز با معدل بالای ۱۷ و درس نیوفتاده در ترم گذشته:
                    </span>
                    <span className="me-1">امکان انتخاب تا سقف <b>۲۴ واحد درسی</b>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-black text-rose-600">•</span>
                    <span>
                      <b>دانشجویان مشروط (معدل ترم کمتر از ۱۲):</b> سقف انتخاب واحد حداکثر <b>۱۴ واحد درسی</b> است.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-black text-blue-600">•</span>
                    <span>
                      <b>ترم تابستان:</b> حداکثر سقف مجاز انتخاب واحد ۶ واحد (و برای فارغ‌التحصیلان تا ۸ واحد با مجوز آموزش) است.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-rose-200/80 bg-rose-50/70 p-4">
                <h3 className="flex items-center gap-2 text-sm font-black text-rose-900">
                  <AlertIcon className="size-4.5 text-rose-600 shrink-0" />
                  <span>قوانین تداخل ساعت کلاس و تاریخ امتحانات</span>
                </h3>
                <div className="mt-2 space-y-2 text-xs leading-relaxed text-rose-950">
                  <p>
                    طبق مقررات آموزشی دانشگاه آزاد واحد شیراز، <b>اخذ دروسی که دارای تداخل زمانی ساعت برگزاری کلاس هستند اکیداً غیرمجاز است</b> و سامانه آموزشیار در زمان ثبت‌نام خطا می‌دهد.
                  </p>
                  <p>
                    همچنین دروسی که دارای <b>تداخل تاریخ و ساعت امتحان پایانی</b> باشند، امکان حضور همزمان در جلسه آزمون را از شما سلب کرده و در کارنامه غیبت رد خواهد شد. سیستم تداخل‌سنج این سامانه به طور خودکار این موارد را به شما هشدار می‌دهد.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <h3 className="text-sm font-black text-slate-800">پیش‌نیاز و هم‌نیاز دروس</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  رعایت پیش‌نیازها و هم‌نیازها طبق چارت رشته الزامی است. در صورتی که درسی را در ترم گذشته افتاده باشید، می‌توانید در ترم جدید آن درس را به همراه درس پس‌نیاز به‌صورت هم‌نیاز اخذ نمایید.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: FEATURES */}
          {activeTab === 'features' && (
            <div className="space-y-3.5">
              <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <SearchIcon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <h4 className="text-[13px] font-black text-slate-900">جستجوی هوشمند بدون حساسیت به املا</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    حروف «ی/ي»، «ک/ك»، فاصله‌های مجازی و اعداد فارسی/انگلیسی همگی یکسان‌سازی شده‌اند. کافی است نام درس، نام خانوادگی استاد، کد درس یا روز هفته را جستجو کنید.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <CartIcon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <h4 className="text-[13px] font-black text-slate-900">سبد انتخاب واحد و کپی گروهی کدها</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    با کلیک بر روی آیکن قلب، دروس را ذخیره کنید. در پنل سبد، مجموع واحدهای نظری و عملی، وضعیت مجاز و با زدن یک کلیک، تمام کدهای ارائه به ترتیب برای چسباندن در آموزشیار کپی می‌شوند.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <CalendarIcon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <h4 className="text-[13px] font-black text-slate-900">برنامه هفتگی ماتریسی دیداری</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    جدول گرافیکی شنبه تا جمعه با ساعات استاندارد دانشگاه (۰۸:۰۰ تا ۱۸:۰۰). کلاس‌ها در خانه روز و ساعت متناظر قرار گرفته و در صورت تداخل، کادر کلاس قرمز رنگ و چشمک‌زن می‌شود.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
                  <ClockIcon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <h4 className="text-[13px] font-black text-slate-900">روزشمار امتحانات و تقویم فشرده</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    مشاهده دوگانه: خط زمانی با برچسب‌های روزهای مانده، و ماتریس تقویم روزانه با قابلیت کلیک روی هر کاشی جهت مشاهده جزئیات امتحان، استاد و مکان برگزاری.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                  📅
                </span>
                <div className="min-w-0">
                  <h4 className="text-[13px] font-black text-slate-900">خروجی تقویم استاندارد (RFC 5545 .ics)</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    با یک کلیک فایل تقویم را دانلود کرده و در گوگل کلندر (Google Calendar)، تقویم آیفون یا اوت‌لوک وارد کنید تا ساعت تمام کلاس‌ها و یادآور امتحانات روی گوشی فعال شود.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: KEYBOARD SHORTCUTS */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                با استفاده از کلیدهای میانبر، با سرعت بسیار بالاتری بدون نیاز به ماوس در سامانه پیمایش کنید:
              </p>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-slate-100">
                    <tr className="flex items-center justify-between p-3 hover:bg-slate-50">
                      <span className="text-slate-700 font-medium">رفتن سریع به کادر جستجو</span>
                      <div className="flex items-center gap-1">
                        <Kbd>/</Kbd> <span className="text-slate-400">یا</span> <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>
                      </div>
                    </tr>
                    <tr className="flex items-center justify-between p-3 hover:bg-slate-50">
                      <span className="text-slate-700 font-medium">نمایش دروس انتخاب‌شده (سبد)</span>
                      <div className="flex items-center gap-1">
                        <Kbd>B</Kbd> <span className="text-slate-400">یا</span> <Kbd>Ctrl</Kbd>+<Kbd>B</Kbd>
                      </div>
                    </tr>
                    <tr className="flex items-center justify-between p-3 hover:bg-slate-50">
                      <span className="text-slate-700 font-medium">بستن پنجره‌ها و پنل‌های باز</span>
                      <div>
                        <Kbd>Esc</Kbd>
                      </div>
                    </tr>
                    <tr className="flex items-center justify-between p-3 hover:bg-slate-50">
                      <span className="text-slate-700 font-medium">باز کردن راهنمای جامع</span>
                      <div>
                        <Kbd>?</Kbd>
                      </div>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: CHANNELS & RESOURCES */}
          {activeTab === 'channels' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 font-bold">
                شبکه‌های ارتباطی و مراجع دانشجویی دانشگاه آزاد واحد شیراز:
              </p>

              <div className="space-y-3">
                {/* Website IAU Experiences */}
                <a
                  href="https://iaucourseexp.github.io/iau-experiences/"
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center justify-between rounded-2xl border border-emerald-200/90 bg-emerald-50/60 p-4 transition-all hover:bg-emerald-100/80 hover:shadow-md hover:border-emerald-300"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm text-lg font-bold">
                      🌐
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-emerald-700">
                        وبسایت تجارب اساتید شیراز
                      </h4>
                      <p className="text-xs text-slate-500">پایگاه جامع تجربیات آموزشی و بازخورد دانشجویان درباره اساتید</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-700">
                    ورود به وبسایت ↗
                  </span>
                </a>

                {/* Telegram 1: Exp */}
                <a
                  href="https://t.me/IAUCourseExp"
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center justify-between rounded-2xl border border-blue-200/90 bg-blue-50/60 p-4 transition-all hover:bg-blue-100/80 hover:shadow-md hover:border-blue-300"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-2xl bg-[#229ED9] text-white shadow-sm">
                      <TelegramIcon className="size-6" />
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-blue-700">
                        کانال تجربیات
                      </h4>
                      <p className="text-xs text-slate-500">نظرات و تجربیات دانشجویان درباره تدریس و نمره‌دهی اساتید</p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-blue-700 dir-ltr" dir="ltr">
                    @IAUCourseExp
                  </span>
                </a>

                {/* Telegram 2: Jozve */}
                <a
                  href="https://t.me/jozveiau"
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center justify-between rounded-2xl border border-indigo-200/90 bg-indigo-50/60 p-4 transition-all hover:bg-indigo-100/80 hover:shadow-md hover:border-indigo-300"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-2xl bg-indigo-600 text-white shadow-sm">
                      <BookOpenIcon className="size-5.5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-indigo-700">
                        کانال جزوه
                      </h4>
                      <p className="text-xs text-slate-500">بانک جزوات، حل‌المسائل و نمونه‌سوالات امتحانی دانشگاه آزاد شیراز</p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-indigo-700 dir-ltr" dir="ltr">
                    @jozveiau
                  </span>
                </a>

                {/* Course Codes System */}
                <a
                  href="https://iaucourseexp.github.io/CoursesCodes/"
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center justify-between rounded-2xl border border-violet-200/90 bg-violet-50/60 p-4 transition-all hover:bg-violet-100/80 hover:shadow-md hover:border-violet-300"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-2xl bg-violet-600 text-white shadow-sm text-lg">
                      🔢
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 group-hover:text-violet-700">
                        سامانه کدهای دروس دانشگاه
                      </h4>
                      <p className="text-xs text-slate-500">جدول جامع تمامی کدهای دروس و رشته‌های دانشگاه آزاد شیراز</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-violet-700">
                    مشاهده سامانه ↗
                  </span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white p-3.5">
          {onStartTour && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartTour();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <CompassIcon className="size-4 text-blue-600" />
              <span>مشاهده مجدد تور راهنما</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="ms-auto min-h-10 rounded-xl bg-blue-600 px-6 text-xs font-extrabold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 shadow-sm shadow-blue-500/20"
          >
            متوجه شدم و بستن
          </button>
        </footer>
      </div>
    </div>
  );
}
