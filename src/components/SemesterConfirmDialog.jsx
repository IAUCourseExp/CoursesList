// Teaching-window confirmation before weekly events enter the calendar (ISSUE 1).
// The term dates are APPROXIMATE presets; this dialog is the only path that
// turns them into weekly ICS events, so the user always sees and can edit the
// exact window used. Exam-only export stays available without any dates.

import { useMemo, useRef, useState } from 'react';
import { parseJalaliDate } from '../lib/semester.js';
import { useDialogFocus } from '../lib/hooks.js';
import { toFaDigits } from '../lib/datetime.js';

/**
 * @param {object} config - { active, semesters: {type: {semesterStart, teachingEnd, label, startText, endText}} }
 * @param {object} confirmedByType - per-type previously confirmed Jalali text {startText, endText}
 * @param {(w: {type: string, semesterStart: Date, teachingEnd: Date, startText: string, endText: string}) => void} onConfirm
 * @param {() => void} onExamOnly
 * @param {() => void} onCancel
 */
export default function SemesterConfirmDialog({ config, confirmedByType = {}, onConfirm, onExamOnly, onCancel }) {
  const containerRef = useRef(null);
  useDialogFocus(containerRef);

  const [type, setType] = useState(config.active);
  const entry = config.semesters[type];
  const [startText, setStartText] = useState(confirmedByType[type]?.startText ?? entry.startText);
  const [endText, setEndText] = useState(confirmedByType[type]?.endText ?? entry.endText);
  const [error, setError] = useState('');

  // Switching type re-fills the fields from that type's preset/confirmation.
  const pickType = (t) => {
    setType(t);
    setError('');
    setStartText(confirmedByType[t]?.startText ?? config.semesters[t].startText);
    setEndText(confirmedByType[t]?.endText ?? config.semesters[t].endText);
  };

  const types = useMemo(() => Object.keys(config.semesters), [config]);

  const confirm = () => {
    const semesterStart = parseJalaliDate(startText);
    const teachingEnd = parseJalaliDate(endText);
    if (!semesterStart || !teachingEnd) {
      setError('قالب تاریخ باید ۱۴۰۵/۰۷/۰۱ باشد و روز آن در تقویم وجود داشته باشد.');
      return;
    }
    if (teachingEnd <= semesterStart) {
      setError('پایان کلاس‌ها باید بعد از شروع ترم باشد.');
      return;
    }
    onConfirm({ type, semesterStart, teachingEnd, startText: startText.trim(), endText: endText.trim() });
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center" role="presentation">
      <button
        type="button"
        aria-label="بستن بدون ساختن تقویم"
        onClick={onCancel}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      />
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="semester-confirm-title"
        aria-describedby="semester-confirm-note"
        className="relative mx-3 mb-4 w-full max-w-md flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/25 animate-pop-in outline-none sm:mx-0 sm:mb-0"
      >
        <h2 id="semester-confirm-title" className="text-[15px] font-black text-slate-900">
          ساخت تقویم هفتگی
        </h2>
        <p id="semester-confirm-note" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold leading-relaxed text-amber-900">
          تاریخ‌های ترم تقریبی هستند و ملاک رسمی نیستند. پیش از ساختن رویدادهای هفتگی، آن‌ها را بررسی کنید یا به تاریخ واقعی ترم تغییر دهید.
        </p>

        <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pickType(t)}
              aria-pressed={type === t}
              className={`min-h-9 flex-1 rounded-lg px-2 text-[11.5px] font-black transition-colors ${
                type === t ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {config.semesters[t].label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-bold text-slate-500">شروع آموزش</span>
            <input
              dir="ltr"
              value={startText}
              onChange={(e) => { setStartText(e.target.value); setError(''); }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[13px] font-bold tabular-nums text-slate-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-bold text-slate-500">پایان کلاس‌ها</span>
            <input
              dir="ltr"
              value={endText}
              onChange={(e) => { setEndText(e.target.value); setError(''); }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[13px] font-bold tabular-nums text-slate-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>
        <p className="mt-1 text-[10.5px] text-slate-400">قالب: {toFaDigits('1405/07/01')} (شمسی)</p>

        {error && (
          <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-1.5 text-[11.5px] font-bold text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={confirm}
            className="min-h-11 rounded-xl bg-blue-600 px-4 text-[13px] font-black text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            ساخت تقویم با این تاریخ‌ها
          </button>
          <button
            type="button"
            onClick={onExamOnly}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
          >
            فقط رویدادهای امتحان
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-xl px-4 text-[12.5px] font-bold text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
          >
            انصراف
          </button>
        </div>
      </div>
    </div>
  );
}
