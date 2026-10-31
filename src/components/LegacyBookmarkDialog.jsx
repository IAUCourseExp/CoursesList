// Resolution interface for legacy bookmarks that stored only an offering code
// (ISSUE 2). Ambiguous codes (several current offerings share them) are never
// assigned automatically: the student sees every candidate with its professor,
// schedule and exam, and picks one or more. Codes missing from the current
// dataset are shown separately and are only ever removed by an explicit user
// action. «بعداً» keeps everything pending without any loss.

import { useMemo, useRef, useState } from 'react';
import { canonicalKeyField, rowKeyOf, isBlank, faNum } from '../lib/format.js';
import { toFaDigits } from '../lib/datetime.js';
import { useDialogFocus } from '../lib/hooks.js';

const OFFERING_CODE_KEY = 'كد ارائه كلاس درس';

/**
 * @param {Array<{key: string, code: string, kind: 'ambiguous'|'missing'}>} pendingLegacy
 * @param {object[]} masterData - current dataset for candidate lookup
 * @param {(legacyKey: string, compositeKeys: string[]) => void} onResolve
 * @param {(legacyKey: string) => void} onRemove - explicit user-approved discard (missing kind)
 * @param {() => void} onPostpone
 */
export default function LegacyBookmarkDialog({ pendingLegacy, masterData, onResolve, onRemove, onPostpone }) {
  const containerRef = useRef(null);
  useDialogFocus(containerRef);

  // One selection set per pending item, keyed by the legacy key.
  const [selected, setSelected] = useState(() => new Map());

  const toggleCandidate = (legacyKey, compositeKey) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(legacyKey) || []);
      if (set.has(compositeKey)) set.delete(compositeKey);
      else set.add(compositeKey);
      next.set(legacyKey, set);
      return next;
    });
  };

  const items = useMemo(() => pendingLegacy.map((item) => ({
    ...item,
    candidates: item.kind === 'ambiguous'
      ? masterData.filter((r) => canonicalKeyField(r[OFFERING_CODE_KEY]) === item.code)
      : [],
  })), [pendingLegacy, masterData]);

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center" role="presentation">
      <button
        type="button"
        aria-label="بستن و تکلیف کردن بعداً"
        onClick={onPostpone}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      />
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legacy-resolve-title"
        aria-describedby="legacy-resolve-desc"
        className="relative mx-3 mb-4 flex max-h-[90dvh] w-full max-w-lg flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/25 animate-pop-in outline-none sm:mx-0 sm:mb-0"
      >
        <div className="flex-none border-b border-slate-100 p-5 pb-3">
          <h2 id="legacy-resolve-title" className="text-[15px] font-black text-slate-900">
            تکمیل نشان‌های قدیمی
          </h2>
          <p id="legacy-resolve-desc" className="mt-1.5 text-[12px] leading-relaxed text-slate-600">
            {faNum(pendingLegacy.length)} نشان قدیمی فقط شمارهٔ ارائه را ذخیره کرده بود و این شماره اکنون به بیش از یک گروه درسی مربوط می‌شود یا در فایل فعلی وجود ندارد. گروه‌های درست را انتخاب کنید یا تصمیم را به بعد موکول کنید؛ هیچ‌چیز بدون انتخاب شما حذف یا جایگزین نمی‌شود.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 thin-scrollbar">
          {items.map((item) => {
            const chosen = selected.get(item.key) || new Set();
            return (
              <div key={item.key} className="rounded-2xl border border-slate-200 bg-white p-3.5">
                <p className="text-[12px] font-black text-slate-800">
                  کد ارائه: <span dir="ltr" className="font-mono">{toFaDigits(item.code)}</span>
                </p>

                {item.kind === 'ambiguous' && (
                  <>
                    <p className="mt-1 text-[11.5px] text-slate-500">
                      این کد به {toFaDigits(item.candidates.length)} گروه درسی فعلی مربوط است؛ هر کدام را بخواهید انتخاب کنید.
                    </p>
                    <div className="mt-2 space-y-2">
                      {item.candidates.map((row) => {
                        const ck = rowKeyOf(row);
                        const checked = chosen.has(ck);
                        return (
                          <label
                            key={ck}
                            className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-colors ${
                              checked ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCandidate(item.key, ck)}
                              className="mt-0.5 size-4 shrink-0 accent-blue-600"
                            />
                            <span className="min-w-0 text-[11.5px] leading-relaxed text-slate-700">
                              <span className="block font-black text-slate-900">{row['نام درس']}</span>
                              <span className="block">استاد: {isBlank(row['استاد']) ? 'نامشخص' : row['استاد']}</span>
                              <span className="block truncate">کلاس: {isBlank(row['زمانبندي تشكيل كلاس']) ? 'نامشخص' : row['زمانبندي تشكيل كلاس']}</span>
                              <span className="block truncate">امتحان: {isBlank(row['زمان امتحان']) ? 'نامشخص' : row['زمان امتحان']}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={chosen.size === 0}
                      onClick={() => onResolve(item.key, [...chosen])}
                      className="mt-2.5 min-h-10 w-full rounded-xl bg-blue-600 px-4 text-[12.5px] font-black text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
                    >
                      افزودن به انتخاب‌ها
                    </button>
                  </>
                )}

                {item.kind === 'missing' && (
                  <>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
                      این کد در فایل فعلی وجود ندارد؛ احتمالاً مربوط به ترم قبل است. اگر آن را نگه دارید، با به‌روزرسانی داده‌ها دوباره بررسی می‌شود.
                    </p>
                    <button
                      type="button"
                      onClick={() => onRemove(item.key)}
                      className="mt-2.5 min-h-10 w-full rounded-xl border border-rose-200 bg-rose-50 px-4 text-[12.5px] font-bold text-rose-700 transition-colors hover:bg-rose-100"
                    >
                      حذف این نشان
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex-none border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={onPostpone}
            className="min-h-10 w-full rounded-xl px-4 text-[12.5px] font-bold text-slate-600 transition-colors hover:bg-slate-100"
          >
            بعداً تصمیم می‌گیرم
          </button>
        </div>
      </div>
    </div>
  );
}
