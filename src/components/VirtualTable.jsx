import React, { useRef, useEffect, useLayoutEffect, useMemo, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const DEFAULT_WIDTHS = {
  'نام درس': 300,
  'زمانبندي تشکيل کلاس': 400,
  'مکان برگزاري': 350,
  'استاد': 220,
  'دانشجويان مجاز به اخذ کلاس': 300,
  'كد درس': 120,
  'كد ارائه کلاس درس': 140,
  'تعداد واحد نظري': 100,
  'تعداد واحد عملي': 100,
  'حداكثر ظرفيت': 100,
  'تعداد ثبت نامي تاكنون': 120,
  'نوع درس': 130,
  'نام كلاس درس': 200,
  'ساير اساتيد': 200,
  'زمان امتحان': 200,
  'مقطع ارائه درس': 150,
  'نوع ارائه': 120,
  'سطح ارائه': 120,
  'گروه آموزشی': 200,
  'دانشکده': 200,
  'واحد': 150,
  'استان': 120,
};

const MIN_COL_WIDTH = 70;
const MAX_COL_WIDTH = 640;
const FACET_RENDER_CAP = 300;
const HEADER_HEIGHT = 80;

const normHeader = (s) => s.replace(/\u064A/g, '\u06CC').replace(/\u0643/g, '\u06A9');
const DEFAULT_WIDTHS_BY_NORM = Object.fromEntries(
  Object.entries(DEFAULT_WIDTHS).map(([k, v]) => [normHeader(k), v])
);

const defaultWidth = (colName) => DEFAULT_WIDTHS_BY_NORM[normHeader(colName)] ?? 180;

const FunnelIcon = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5z" />
  </svg>
);

const VirtualTable = ({
  data,
  columns,
  sortConfig,
  onSort,
  filters,
  onFilterChange,
  facets,
  onEnsureFacets,
  facetsLoading,
  colWidths,
  onColumnResize,
  onWidthsCommit,
  onColumnReset,
}) => {
  const parentRef = useRef();
  const [openFacet, setOpenFacet] = useState(null);
  const [facetSearch, setFacetSearch] = useState('');
  const [draggingCol, setDraggingCol] = useState(null);

  const widthOf = useCallback(
    (col) => colWidths[col] ?? defaultWidth(col),
    [colWidths]
  );

  const cellStyle = useCallback(
    (col) => ({
      width: `${widthOf(col)}px`,
      flexGrow: colWidths[col] != null ? 0 : 1,
      flexShrink: 0,
      direction: 'rtl',
    }),
    [colWidths, widthOf]
  );

  const minTableWidth = useMemo(
    () => columns.reduce((acc, col) => acc + widthOf(col), 0),
    [columns, widthOf]
  );

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 10,
  });

  const lastScrollLeft = useRef(0);
  const isFirstLoad = useRef(true);

  const handleScroll = (e) => {
    lastScrollLeft.current = e.target.scrollLeft;
    setOpenFacet((prev) => (prev ? null : prev));
  };

  useLayoutEffect(() => {
    if (parentRef.current) {
      if (isFirstLoad.current && data.length > 0) {
        const maxScroll = parentRef.current.scrollWidth - parentRef.current.clientWidth;
        parentRef.current.scrollLeft = maxScroll;
        lastScrollLeft.current = maxScroll;
        isFirstLoad.current = false;
      } else if (!isFirstLoad.current) {
        parentRef.current.scrollLeft = lastScrollLeft.current;
      }
    }
  }, [data]);

  const startResize = (e, col) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = widthOf(col);
    let lastW = startW;

    setDraggingCol(col);
    document.body.classList.add('col-resizing');

    const onMove = (ev) => {
      const w = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, startW - (startX - ev.clientX)));
      if (Math.abs(w - lastW) >= 1) {
        lastW = w;
        onColumnResize(col, w);
      }
    };
    const onUp = (ev) => {
      try { el.releasePointerCapture(ev.pointerId); } catch { }
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('col-resizing');
      setDraggingCol(null);
      onWidthsCommit();
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const toggleFacet = (e, col) => {
    if (openFacet?.col === col) {
      setOpenFacet(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const align = rect.left < 300 ? 'left' : 'right';
    setFacetSearch('');
    setOpenFacet({ col, align });
    onEnsureFacets(col);
  };

  const toggleValue = (col, value) => {
    const current = filters[col];
    if (!current) {
      onFilterChange(col, [value]);
      return;
    }
    const set = new Set(current);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onFilterChange(col, set.size ? [...set] : null);
  };

  useEffect(() => {
    if (!openFacet) return;
    const onDocDown = (e) => {
      if (!e.target.closest?.('[data-facet-panel],[data-facet-toggle]')) {
        setOpenFacet(null);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenFacet(null);
    };
    document.addEventListener('pointerdown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openFacet]);

  const renderFacetPanel = (col) => {
    const values = facets[col] || [];
    const q = facetSearch.trim();
    const filtered = q ? values.filter((v) => v.value.includes(q)) : values;
    const shown = filtered.slice(0, FACET_RENDER_CAP);
    const selected = filters[col];
    const selectedCount = selected?.length || 0;

    return (
      <div
        data-facet-panel
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-full mt-1.5 z-50 w-72 max-w-[calc(100vw-1.25rem)] bg-white rounded-2xl shadow-2xl shadow-slate-900/25 border border-slate-200/90 overflow-hidden flex flex-col ${
          openFacet.align === 'left' ? 'left-0' : 'right-0'
        }`}
      >
        <div className="p-2 border-b border-slate-100">
          <div className="relative">
            <input
              autoFocus
              value={facetSearch}
              onChange={(e) => setFacetSearch(e.target.value)}
              placeholder="جستجو در مقادیر..."
              className="w-full text-xs px-3 py-2 pr-8 rounded-lg bg-slate-100/80 border border-transparent focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors text-right"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none pointer-events-none">
              🔍
            </span>
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto custom-scrollbar py-1">
          {facetsLoading === col ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-6">مقداری یافت نشد</p>
          ) : (
            <>
              {shown.map((v) => {
                const checked = selected ? selected.includes(v.value) : false;
                return (
                  <label
                    key={v.value}
                    className="flex items-center gap-2.5 px-3 py-1.5 mx-1.5 rounded-lg hover:bg-blue-50 cursor-pointer text-xs text-slate-700 transition-colors"
                  >
                    <input
                      type="checkbox"
                      className="accent-blue-600 w-3.5 h-3.5 pointer-events-none"
                      checked={checked}
                      onChange={() => toggleValue(col, v.value)}
                    />
                    <span className="flex-1 truncate" title={v.value}>{v.value}</span>
                    <span className="text-[10px] text-slate-400 font-bold tabular-nums whitespace-nowrap">
                      {v.count.toLocaleString('fa-IR')}
                    </span>
                  </label>
                );
              })}
              {filtered.length > FACET_RENDER_CAP && (
                <p className="text-center text-[10px] text-slate-400 py-2">
                  برای دیدن بقیه، جستجو کنید…
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-100 bg-slate-50/80 text-[11px]">
          <span className="text-slate-400">
            {selectedCount ? `${selectedCount.toLocaleString('fa-IR')} مقدار انتخاب شد` : 'همه مقادیر نمایش داده می‌شوند'}
          </span>
          {selectedCount > 0 && (
            <button
              onClick={() => onFilterChange(col, null)}
              className="font-bold text-red-500 hover:text-red-600 transition-colors"
            >
              ✕ حذف فیلتر
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full overflow-hidden">
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="h-full w-full overflow-auto bg-white custom-scrollbar"
        style={{ direction: 'ltr' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize() + HEADER_HEIGHT}px`,
            width: '100%',
            minWidth: `${minTableWidth}px`,
            position: 'relative',
            direction: 'ltr',
          }}
        >
          <div className="sticky top-0 z-30 flex h-20 bg-slate-900/95 backdrop-blur text-white shadow-lg shadow-slate-900/20 w-full">
            {[...columns].reverse().map((col) => {
              const isActiveFilter = filters[col]?.length > 0;
              return (
                <div
                  key={col}
                  onClick={() => onSort(col)}
                  style={cellStyle(col)}
                  className="relative border-l border-slate-700/60 flex items-center justify-center hover:bg-slate-700/50 transition-colors select-none group/header cursor-pointer px-2"
                >
                  <button
                    data-facet-toggle
                    onClick={(e) => { e.stopPropagation(); toggleFacet(e, col); }}
                    title={`فیلتر ${col}`}
                    className={`relative shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                      isActiveFilter
                        ? 'bg-blue-500 text-white shadow-md shadow-blue-500/40'
                        : 'bg-white/10 hover:bg-white/25 text-slate-300'
                    }`}
                  >
                    <FunnelIcon className="w-3.5 h-3.5" />
                    {isActiveFilter && (
                      <span className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
                    )}
                  </button>

                  <div className="flex flex-row-reverse items-center gap-2 justify-center flex-1 min-w-0">
                    <div className="flex flex-col items-center justify-center min-w-[14px]">
                      {sortConfig.column === col ? (
                        <span className="text-blue-400 text-base animate-pulse">
                          {sortConfig.direction === 'asc' ? '▴' : '▾'}
                        </span>
                      ) : (
                        <div className="flex flex-col -space-y-1 opacity-25 group-hover/header:opacity-80 transition-opacity">
                          <span className="text-[18px]">▴</span>
                          <span className="text-[18px]">▾</span>
                        </div>
                      )}
                    </div>

                    <span className="break-words leading-tight text-[12px] md:text-[13px]">{col}</span>
                  </div>

                  {openFacet?.col === col && renderFacetPanel(col)}

                  <div
                    onPointerDown={(e) => startResize(e, col)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onColumnReset(col);
                      onWidthsCommit();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    title="کشیدن = تغییر عرض · دوبار کلیک = پیش‌فرض"
                    className="absolute right-0 translate-x-1/2 top-0 h-full w-[14px] cursor-col-resize touch-none z-20 flex items-center justify-center"
                  >
                    <span
                      className={`w-[3px] h-9 rounded-full transition-colors ${
                        draggingCol === col
                          ? 'bg-blue-400'
                          : 'bg-transparent group-hover/header:bg-slate-500'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = data[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                className={`absolute top-0 left-0 w-full border-b border-slate-100 flex items-center transition-colors duration-150 ${
                  virtualRow.index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                } hover:bg-blue-50/70`}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start + HEADER_HEIGHT}px)`,
                }}
              >
                {[...columns].reverse().map((col) => (
                  <div
                    key={col}
                    style={cellStyle(col)}
                    className="px-3 md:px-4 text-[12px] md:text-[13px] text-slate-600 font-medium flex items-center justify-center text-center border-l border-slate-100/80 last:border-l-0 overflow-hidden"
                  >
                    <span className="break-words w-full leading-relaxed block overflow-hidden whitespace-normal">
                      {row[col] || '---'}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VirtualTable;