// Confirmation sheet for opening a shared plan link while the visitor already
// has saved selections (BUG-01). Rendering this dialog is the only path that
// lets a ?b= link modify existing bookmarks, so nothing can be overwritten
// without an explicit choice.

import { useRef } from 'react';
import { useDialogFocus } from '../lib/hooks.js';

/**
 * @param {string[]} shared  validated incoming keys
 * @param {number} localCount size of the visitor's current selection
 * @param {() => void} onReplace
 * @param {() => void} onMerge
 * @param {() => void} onCancel
 */
export default function SharedPlanDialog({ shared, localCount, onReplace, onMerge, onCancel }) {
  const containerRef = useRef(null);
  // Focus in / Tab containment / focus restore come from the shared hook.
  useDialogFocus(containerRef);

  const sharedCount = shared.length;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center" role="presentation">
      <button
        type="button"
        aria-label="بستن بدون تغییر انتخاب‌ها"
        onClick={onCancel}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      />
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shared-plan-title"
        aria-describedby="shared-plan-desc"
        className="relative mx-3 mb-4 w-full max-w-md flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/25 animate-pop-in outline-none sm:mx-0 sm:mb-0"
      >
        <h2 id="shared-plan-title" className="text-[15px] font-black text-slate-900">
          برنامهٔ اشتراکی
        </h2>
        <p id="shared-plan-desc" className="mt-2 text-[12.5px] leading-relaxed text-slate-600">
          این لینک شامل {sharedCount} درس انتخاب‌شده است و شما هم اکنون {localCount} درس در فهرست دارید.
          انتخاب‌های فعلی شما جایگزین شوند یا درس‌های جدید به آن‌ها اضافه شوند؟
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onReplace}
            className="min-h-11 rounded-xl bg-blue-600 px-4 text-[13px] font-black text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            جایگزینی انتخاب‌های فعلی
          </button>
          <button
            type="button"
            onClick={onMerge}
            className="min-h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 text-[13px] font-black text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            ادغام با انتخاب‌های من
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-xl px-4 text-[13px] font-bold text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
          >
            انصراف
          </button>
        </div>
      </div>
    </div>
  );
}
