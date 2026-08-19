import React, { useRef, useEffect, useLayoutEffect, useMemo, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const DEFAULT_WIDTHS = {
  '_star': 50,
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
const HEADER_HEIGHT = 85;
const MOBILE_TOP_GAP = 16;

const normHeader = (s) => s.replace(/\u064A/g, '\u06CC').replace(/\u0643/g, '\u06A9');
const DEFAULT_WIDTHS_BY_NORM = Object.fromEntries(
  Object.entries(DEFAULT_WIDTHS).map(([k, v]) => [normHeader(k), v])
);

const defaultWidth = (colName) => {
  if (colName === '_star') return 50;
  return DEFAULT_WIDTHS_BY_NORM[normHeader(colName)] ?? 180;
};

const FunnelIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
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
  bookmarks = [],
  onToggleBookmark = () => {},
  
}) => {
  const parentRef = useRef();
  const [openFacet, setOpenFacet] = useState(null);
  const [facetSearch, setFacetSearch] = useState('');
  const [draggingCol, setDraggingCol] = useState(null);

  const [showBackToTop, setShowBackToTop] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleScroll = () => {
      if (parentRef.current) {
        const scrollTop = parentRef.current.scrollTop;
        setShowBackToTop(scrollTop > 150);
      }
    };

    const el = parentRef.current;
    if (el) {
      el.addEventListener('scroll', handleScroll);
      return () => el.removeEventListener('scroll', handleScroll);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const bookmarkSet = useMemo(() => new Set(bookmarks), [bookmarks]);
  const isMobile = windowWidth < 768;

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
    estimateSize: () => isMobile ? 160 : 45,
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
      if (isFirstLoad.current) {
        parentRef.current.scrollTop = 0;
      }
      
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

  const getRowKey = useCallback((row) => {
    return row['كد ارائه كلاس درس'] || row['كد درس'] || `${row['نام درس']}_${row['استاد'] || 'نامشخص'}`;
  }, []);

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
    const align = rect.left < window.innerWidth / 2 ? 'left' : 'right';
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
              className="w-full text-xs px-3 py-2 pr-8 rounded-lg bg-slate-100/80 border border-transparent focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors text-right text-slate-800 placeholder:text-slate-400"
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
        className={`h-full w-full ${isMobile ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto'} bg-white custom-scrollbar`}
        style={{ direction: 'ltr' }}
      >
        {showBackToTop && isMobile && (
          <button
            onClick={() => {
              if (parentRef.current) {
                parentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="fixed bottom-20 right-4 z-50 bg-blue-600 text-white rounded-full shadow-2xl shadow-blue-500/50 p-3 transition-all hover:bg-blue-700 active:scale-95 animate-fade-in-up"
            aria-label="بازگشت به بالا"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
        )}

        <div
          style={{
            height: `${rowVirtualizer.getTotalSize() + (isMobile ? MOBILE_TOP_GAP : HEADER_HEIGHT)}px`,
            width: '100%',
            minWidth: isMobile ? '100%' : `${minTableWidth}px`,
            position: 'relative',
            direction: 'ltr',
          }}
        >
          <div className={`sticky top-0 z-30 flex h-20 bg-slate-900/95 backdrop-blur text-white shadow-lg shadow-slate-900/20 w-full ${isMobile ? 'hidden' : ''}`}>
            {['_star', ...columns].reverse().map((col) => {
              if (col === '_star') {
                return (
                  <div
                    key={col}
                    style={{ width: '50px', flexShrink: 0, direction: 'rtl' }}
                    className="relative border-l border-slate-700/60 flex items-center justify-center bg-slate-900/95 px-1"
                  >
                    <span className="text-white text-sm">⭐</span>
                  </div>
                );
              }
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

          {}
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = data[virtualRow.index];
            const rowKey = getRowKey(row);
            const isBookmarked = bookmarkSet.has(rowKey);

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={isMobile ? rowVirtualizer.measureElement : null}
                className={`absolute top-0 left-0 w-full transition-colors duration-150 ${
                  isMobile
                    ? 'px-2'
                    : `border-b border-slate-100 flex items-center ${
                        virtualRow.index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                      } hover:bg-blue-50/70`
                }`}
                style={{
                  transform: `translateY(${virtualRow.start + (isMobile ? MOBILE_TOP_GAP : HEADER_HEIGHT)}px)`,
                  ...(isMobile ? { paddingBottom: '12px', height: 'auto' } : { height: `${virtualRow.size}px` }),
                }}
              >
                {isMobile ? (
                  <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/60 border border-slate-200/80 p-4 w-full h-full">
                    
                    <div className="flex flex-row-reverse justify-between items-start mb-4 pb-3 border-b border-slate-100/80">
                      <div className="flex-1 text-right min-w-0 pl-3">
                        <h3 className="text-[13px] font-extrabold text-slate-800 break-words whitespace-normal leading-relaxed">{row['نام درس'] || 'بدون نام'}</h3>
                        <p className="text-[11px] text-blue-600 font-bold mt-1.5 break-words whitespace-normal leading-relaxed">{row['استاد'] || 'نامشخص'}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleBookmark(rowKey);
                        }}
                        className={`text-xl transition-all transform hover:scale-110 flex-shrink-0 mt-0.5 ${
                          isBookmarked ? 'text-red-500' : 'text-slate-300'
                        }`}
                      >
                        {isBookmarked ? '❤️' : '🤍'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-[11px] w-full mb-3" dir="rtl">
                      {columns.map((col) => {
                        if (['نام درس', 'استاد', 'زمانبندي تشكيل كلاس', 'زمان امتحان'].includes(col)) return null;
                        return (
                          <div key={col} className="flex flex-col items-start text-right min-w-0 w-full">
                            <span className="text-[10px] font-bold text-slate-400 mb-1 break-words whitespace-normal leading-tight">
                              {col}
                            </span>
                            <span className="text-slate-700 font-medium break-words whitespace-normal leading-relaxed w-full">
                              {row[col] || '---'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-col gap-2 pt-3 border-t border-slate-100/80 w-full" dir="rtl">
                      
                      {columns.includes('زمانبندي تشكيل كلاس') && (
                        <div className="flex items-start gap-2.5 bg-blue-50/60 p-2.5 rounded-xl text-right w-full">
                          <span className="text-blue-500 mt-0.5 text-base flex-shrink-0">🗓️</span>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-[10px] font-extrabold text-blue-600 mb-0.5">زمانبندي تشكيل كلاس</span>
                            <span className="text-slate-700 text-[11px] font-medium leading-relaxed break-words whitespace-normal w-full">
                              {row['زمانبندي تشكيل كلاس'] || '---'}
                            </span>
                          </div>
                        </div>
                      )}

                      {columns.includes('زمان امتحان') && (
                        <div className="flex items-start gap-2.5 bg-amber-50/60 p-2.5 rounded-xl text-right w-full">
                          <span className="text-amber-500 mt-0.5 text-base flex-shrink-0">⚠️</span>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-[10px] font-extrabold text-amber-600 mb-0.5">زمان امتحان</span>
                            <span className="text-slate-700 text-[11px] font-medium leading-relaxed break-words whitespace-normal w-full">
                              {row['زمان امتحان'] || '---'}
                            </span>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center">
                    {['_star', ...columns].reverse().map((col) => {
                      if (col === '_star') {
                        return (
                          <div
                            key={col}
                            style={{ width: '50px', flexShrink: 0, direction: 'rtl' }}
                            className="px-1 flex items-center justify-center border-l border-slate-100/80 last:border-l-0 h-full"
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleBookmark(rowKey);
                              }}
                              className={`text-xl transition-all transform hover:scale-125 ${
                                isBookmarked ? 'text-red-500' : 'text-slate-300 hover:text-red-300'
                              }`}
                              title={isBookmarked ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
                            >
                              {isBookmarked ? '❤️' : '🤍'}
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={col}
                          style={cellStyle(col)}
                          className="px-2 md:px-3 text-[11px] md:text-[12px] text-slate-600 font-medium flex items-center justify-center text-center border-l border-slate-100/80 last:border-l-0 overflow-hidden h-full"
                        >
                          <span className="break-words w-full leading-relaxed block overflow-hidden whitespace-normal">
                            {row[col] || '---'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VirtualTable;