// Value picker for one column: search box + counted value list.
// Used three ways: desktop header dropdown, mobile sheet accordion, quick-filter chip menu.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CloseIcon, SearchIcon } from './icons.jsx';
import { faNum } from '../lib/format.js';
import { fullLabelOf } from '../lib/columns.js';

const RENDER_CAP = 300;

/** Persian/Arabic-normalised substring match, used for the in-panel search box. */
const normalize = (s) =>
  String(s ?? '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .replace(/[\u200c\u200e\u200f]/g, '')
    .toLowerCase()
    .trim();

export default function FacetPanel({
  column,
  values = [],
  loading = false,
  selected = [],
  onToggle,
  onClear,
  onClose,
  variant = 'dropdown',
  autoFocus = true,
}) {
  const [q, setQ] = useState('');
  const [lastColumn, setLastColumn] = useState(column);
  const inputRef = useRef(null);

  // Switching to another column must clear the search box. Adjusting state during render
  // (React's documented pattern) avoids an extra effect + second render pass.
  if (lastColumn !== column) {
    setLastColumn(column);
    setQ('');
  }
  useEffect(() => {
    if (autoFocus && !loading) inputRef.current?.focus();
  }, [autoFocus, loading, column]);

  const selectedSet = useMemo(() => new Set(selected || []), [selected]);
  const filtered = useMemo(() => {
    const needle = normalize(q);
    return needle ? values.filter((v) => normalize(v.value).includes(needle)) : values;
  }, [q, values]);
  const shown = filtered.slice(0, RENDER_CAP);

  const isDropdown = variant === 'dropdown';

  const body = (
    <>
      <div className="border-b border-slate-100 p-2">
        <div className="relative">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } }}
            placeholder="جستجو در مقادیر…"
            aria-label={`جستجو در مقادیر ${fullLabelOf(column)}`}
            className="w-full rounded-lg border border-transparent bg-slate-100/90 py-2 pe-8 ps-3 text-[13px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
          <SearchIcon className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      <div className="max-h-[min(56vh,20rem)] overflow-y-auto overscroll-contain py-1 thin-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-8" aria-label="در حال بارگذاری مقادیر">
            <span className="size-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-slate-400">موردی یافت نشد</p>
        ) : (
          <>
            {shown.map((v) => {
              const checked = selectedSet.has(v.value);
              return (
                <label
                  key={v.value}
                  className={`mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                    checked ? 'bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(v.value)}
                    className="size-4 shrink-0 accent-blue-600"
                  />
                  <span className={`min-w-0 flex-1 truncate ${v.value === '(خالی)' ? 'text-slate-400' : ''}`} title={v.value}>
                    {v.value === '(خالی)' ? 'خالی' : v.value}
                  </span>
                  <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-400">{faNum(v.count)}</span>
                </label>
              );
            })}
            {filtered.length > RENDER_CAP && (
              <p className="py-2 text-center text-[11px] text-slate-400">
                {faNum(filtered.length - RENDER_CAP)} مقدار دیگر - برای دیدن، جستجو کنید
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-2 text-[11.5px]">
        <span className="text-slate-500">
          {selectedSet.size ? `${faNum(selectedSet.size)} مقدار انتخاب شد` : 'همه مقادیر نمایش داده می‌شوند'}
        </span>
        {selectedSet.size > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 font-bold text-rose-600 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
          >
            <CloseIcon className="size-3.5" />
            حذف فیلتر
          </button>
        )}
      </div>
    </>
  );

  if (!isDropdown) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {body}
      </div>
    );
  }

  return (
    <div
      data-facet-panel
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={`فیلتر ${fullLabelOf(column)}`}
      className="absolute top-full z-50 mt-1.5 flex w-[19rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 animate-pop-in end-0"
    >
      {body}
    </div>
  );
}
