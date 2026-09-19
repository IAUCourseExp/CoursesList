// Column visibility picker, grouped by topic, with a live count and reset.
// The default set is deliberately small (9 columns) so the table fits without
// horizontal hunting; everything else is one tap away.

import { COLUMN_GROUPS, labelOf, fullLabelOf } from '../lib/columns.js';
import { faNum } from '../lib/format.js';

export default function ColumnPicker({ allColumns, visible, onChange, onReset, compact = false }) {
  const visibleSet = new Set(visible);
  const toggle = (col) => {
    const next = new Set(visibleSet);
    if (next.has(col)) next.delete(col);
    else next.add(col);
    // Keep the canonical order from the data file, not the click order.
    onChange(allColumns.filter((c) => next.has(c)));
  };

  return (
    <div className={compact ? '' : 'min-w-[17rem]'}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[12px] font-bold text-slate-500">
          {faNum(visible.length)} از {faNum(allColumns.length)} ستون نمایش داده می‌شود
        </p>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg px-2 py-1 text-[11.5px] font-bold text-blue-600 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          ↺ پیش‌فرض
        </button>
      </div>

      <div className="max-h-[min(52vh,22rem)] space-y-3 overflow-y-auto overscroll-contain pe-1 thin-scrollbar">
        {COLUMN_GROUPS.map((group) => {
          const cols = group.columns.filter((c) => allColumns.includes(c));
          if (cols.length === 0) return null;
          return (
            <div key={group.title}>
              <p className="mb-1.5 text-[11px] font-extrabold tracking-wide text-slate-400">{group.title}</p>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {cols.map((col) => {
                  const active = visibleSet.has(col);
                  return (
                    <label
                      key={col}
                      title={fullLabelOf(col)}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-colors ${
                        active ? 'bg-blue-50 text-blue-900' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggle(col)}
                        className="size-4 shrink-0 accent-blue-600"
                      />
                      <span className="truncate">{labelOf(col)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] font-bold text-amber-700">
          حداقل یک ستون باید نمایش داده شود.
        </p>
      )}
    </div>
  );
}
