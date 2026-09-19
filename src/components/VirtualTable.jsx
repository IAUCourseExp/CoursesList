// Virtualised course table for desktop and card list for mobile.
// All table items, headers, rows and cells are center aligned for maximum clarity.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import DesktopRow from './DesktopRow.jsx';
import MobileCard from './MobileCard.jsx';
import FacetPanel from './FacetPanel.jsx';
import { ArrowUpIcon, FilterIcon, SearchIcon } from './icons.jsx';
import { EmptyState } from './Bits.jsx';
import { buildHighlighter, faNum, rowKeyOf } from '../lib/format.js';
import { defaultWidthOf, fullLabelOf, labelOf } from '../lib/columns.js';
import { useIsMobile, useScrolledPast } from '../lib/hooks.js';

const MIN_COL_WIDTH = 70;
const MAX_COL_WIDTH = 640;
const STAR_WIDTH = 96; // Accommodates high-contrast bookmark + compare + copy rail

const ROW_HEIGHTS = {
  compact: 44,
  comfortable: 56,
  spacious: 72,
};

const HEADER_HEIGHT = 62;
const ESTIMATED_CARD = 420;

export default function VirtualTable({
  data = [],
  columns = [],
  allColumns = [],
  searchTerm = '',
  sortConfig = { column: null, direction: 'asc' },
  onSort,
  filters = {},
  onFilterChange,
  facets = {},
  facetsLoading = null,
  onEnsureFacets,
  customColWidths = {},
  onColumnWidthChange,
  onColumnReset,
  onWidthsCommit,
  density = 'comfortable',
  bookmarks = [],
  onToggleBookmark,
  onCopyRow,
  onCompare,
  onOpenDetail,
  onClearFilters,
  onClearSearch,
  hasSearch = false,
}) {
  const isMobile = useIsMobile();
  const parentRef = useRef(null);
  const [openFacet, setOpenFacet] = useState(null);
  const [draggingCol, setDraggingCol] = useState(null);
  const dragRef = useRef({ col: null, startX: 0, startW: 0 });

  const highlighter = useMemo(() => buildHighlighter(searchTerm), [searchTerm]);
  const bookmarkSet = useMemo(() => new Set(bookmarks), [bookmarks]);

  const rowHeight = ROW_HEIGHTS[density] || ROW_HEIGHTS.comfortable;

  // Track the actual visible width of the table viewport to intelligently stretch columns
  const [containerWidth, setContainerWidth] = useState(0);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return undefined;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseWidthOf = useCallback(
    (col) => customColWidths[col] ?? defaultWidthOf(col),
    [customColWidths]
  );

  // Compute smart responsive column widths:
  // If the viewport is wider than default widths, proportionally expand all columns to fill 100% of the screen.
  // If user adds more columns or is on a narrow screen, preserve minimums and allow smooth horizontal scrolling.
  const { columnWidths, effectiveTableWidth } = useMemo(() => {
    if (!columns || columns.length === 0) {
      return { columnWidths: {}, effectiveTableWidth: containerWidth || 1000 };
    }

    const baseSum = columns.reduce((acc, c) => acc + baseWidthOf(c), 0);
    const totalBase = STAR_WIDTH + baseSum;
    const targetWidth = Math.max(containerWidth, totalBase);
    const availableDataWidth = targetWidth - STAR_WIDTH;

    const scale = availableDataWidth > baseSum && baseSum > 0 ? availableDataWidth / baseSum : 1;

    const widths = {};
    let allocated = 0;
    columns.forEach((col) => {
      const w = Math.round(baseWidthOf(col) * scale);
      widths[col] = w;
      allocated += w;
    });

    // Absorb any rounding remainder on the widest column
    const remainder = availableDataWidth - allocated;
    if (remainder !== 0 && columns.length > 0) {
      const widestCol = columns.reduce(
        (a, b) => (baseWidthOf(a) >= baseWidthOf(b) ? a : b),
        columns[0]
      );
      widths[widestCol] = Math.max(MIN_COL_WIDTH, widths[widestCol] + remainder);
    }

    const finalSum = STAR_WIDTH + Object.values(widths).reduce((a, b) => a + b, 0);
    return {
      columnWidths: widths,
      effectiveTableWidth: Math.max(targetWidth, finalSum),
    };
  }, [columns, baseWidthOf, containerWidth]);

  const widthOf = useCallback(
    (col) => columnWidths[col] ?? baseWidthOf(col),
    [columnWidths, baseWidthOf]
  );

  const cellStyle = useCallback(
    (col) => {
      const w = widthOf(col);
      return {
        width: `${w}px`,
        minWidth: `${w}px`,
        maxWidth: `${w}px`,
        flex: `0 0 ${w}px`,
      };
    },
    [widthOf]
  );

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (isMobile ? ESTIMATED_CARD : rowHeight),
    getItemKey: useCallback((index) => (data[index] ? rowKeyOf(data[index]) : index), [data]),
    overscan: isMobile ? 8 : 14,
  });

  const showBackToTop = useScrolledPast(parentRef, 400);
  const scrollToTop = () => {
    parentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useLayoutEffect(() => {
    if (isMobile) return;
    const el = parentRef.current;
    if (el && el.scrollLeft === 0 && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = el.scrollWidth - el.clientWidth;
    }
  }, [isMobile, columns]);

  // Dismiss open header facet when clicking outside or pressing Escape
  useEffect(() => {
    if (!openFacet) return undefined;
    const onDown = (e) => {
      if (!e.target.closest?.('[data-facet-panel],[data-facet-toggle]')) {
        setOpenFacet(null);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenFacet(null);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openFacet]);

  // Column resizing handlers
  const startResize = (e, col) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingCol(col);
    dragRef.current = { col, startX: e.clientX, startW: widthOf(col) };

    const onPointerMove = (ev) => {
      const { col: c, startX, startW } = dragRef.current;
      if (!c) return;
      const delta = startX - ev.clientX; // RTL resize delta
      const nextW = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, startW + delta));
      onColumnWidthChange(c, nextW);
    };

    const onPointerUp = () => {
      setDraggingCol(null);
      dragRef.current = { col: null, startX: 0, startW: 0 };
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      onWidthsCommit();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const toggleFacet = (e, col) => {
    e.stopPropagation();
    if (openFacet === col) {
      setOpenFacet(null);
    } else {
      setOpenFacet(col);
      onEnsureFacets(col);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      {/* Scrollable Virtual Container without contain:strict to prevent clipping dropdowns */}
      <div
        ref={parentRef}
        className="relative h-full min-h-0 w-full flex-1 overflow-auto bg-white thin-scrollbar"
        tabIndex={0}
        aria-label="جدول دروس"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize() + (isMobile ? 0 : HEADER_HEIGHT)}px`,
            width: isMobile ? '100%' : `${effectiveTableWidth}px`,
            minWidth: '100%',
            position: 'relative',
            direction: 'ltr',
          }}
        >
          {/* Desktop Table Header */}
          {!isMobile && (
            <div
              className="sticky top-0 z-30 flex border-b border-slate-700/60 bg-slate-800 text-white"
              style={{
                height: `${HEADER_HEIGHT}px`,
                width: `${effectiveTableWidth}px`,
                minWidth: '100%',
              }}
              role="row"
            >
              {/* Action rail header */}
              <div
                className="flex shrink-0 items-center justify-center border-e border-slate-700/50 bg-slate-800"
                style={{
                  width: `${STAR_WIDTH}px`,
                  minWidth: `${STAR_WIDTH}px`,
                  maxWidth: `${STAR_WIDTH}px`,
                  flex: `0 0 ${STAR_WIDTH}px`,
                }}
                role="columnheader"
                aria-label="عملیات و نشانه‌گذاری"
              >
                <span className="text-[14px] font-bold text-slate-300">عملیات</span>
              </div>

              {/* Data column headers */}
              {[...columns].reverse().map((col) => {
                const isActive = sortConfig.column === col;
                const dir = sortConfig.direction;
                const selectedCount = filters[col]?.length || 0;

                return (
                  <div
                    key={col}
                    role="columnheader"
                    aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    style={cellStyle(col)}
                    className="group/header relative flex shrink-0 items-center justify-center border-e border-slate-700/50 bg-slate-800 px-2 transition-colors hover:bg-slate-700/70"
                  >
                    <button
                      type="button"
                      onClick={() => onSort(col)}
                      title={`مرتب‌سازی بر اساس ${fullLabelOf(col)}`}
                      className="flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
                    >
                      <span
                        className={`grid size-5 shrink-0 place-items-center rounded text-[13px] ${
                          isActive ? 'text-blue-300' : 'text-slate-400 opacity-0 transition-opacity group-hover/header:opacity-100'
                        }`}
                        aria-hidden="true"
                      >
                        {isActive ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                      <span
                        className={`min-w-0 text-center text-[12.5px] font-bold leading-[1.25] text-slate-100 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] ${
                          isActive ? 'font-extrabold text-white' : ''
                        }`}
                      >
                        {labelOf(col)}
                      </span>
                    </button>

                    <button
                      type="button"
                      data-facet-toggle
                      onClick={(e) => toggleFacet(e, col)}
                      aria-label={`فیلتر ${fullLabelOf(col)}`}
                      aria-expanded={openFacet === col}
                      title={`فیلتر ${fullLabelOf(col)}`}
                      className={`relative grid size-7 shrink-0 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 ${
                        selectedCount
                          ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/40'
                          : 'bg-white/10 text-slate-300 hover:bg-white/25'
                      }`}
                    >
                      <FilterIcon className="size-3.5" />
                      {selectedCount > 0 && (
                        <span className="absolute -end-1 -top-1 grid size-4 place-items-center rounded-full bg-emerald-400 text-[9px] font-black text-slate-900 ring-2 ring-slate-800">
                          {faNum(selectedCount)}
                        </span>
                      )}
                    </button>

                    {/* Popover facet dropdown anchored to the header cell */}
                    {openFacet === col && (
                      <div className="absolute top-full end-0 z-50">
                        <FacetPanel
                          column={col}
                          values={facets[col] || []}
                          loading={!facets[col] && facetsLoading === col}
                          selected={filters[col] || []}
                          onToggle={(v) => {
                            const current = filters[col] || [];
                            const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];
                            onFilterChange(col, next.length ? next : null);
                          }}
                          onClear={() => onFilterChange(col, null)}
                          onClose={() => setOpenFacet(null)}
                          variant="dropdown"
                          autoFocus
                        />
                      </div>
                    )}

                    {/* Column Resizer Handle */}
                    <div
                      onPointerDown={(e) => startResize(e, col)}
                      onDoubleClick={(e) => { e.stopPropagation(); onColumnReset(col); onWidthsCommit(); }}
                      onClick={(e) => e.stopPropagation()}
                      role="separator"
                      aria-label={`تغییر عرض ستون ${fullLabelOf(col)}`}
                      title="کشیدن = تغییر عرض · دوبار کلیک = پیش‌فرض"
                      className="absolute end-0 top-0 z-20 flex h-full w-3.5 translate-x-1/2 cursor-col-resize touch-none items-center justify-center"
                    >
                      <span className={`h-8 w-[3px] rounded-full transition-colors ${
                        draggingCol === col ? 'bg-blue-400' : 'bg-transparent group-hover/header:bg-slate-500'
                      }`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Virtual Rows */}
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = data[virtualRow.index];
            if (!row) return null;
            const rowKey = rowKeyOf(row);
            const isBookmarked = bookmarkSet.has(rowKey);

            return (
              <div
                key={virtualRow.key}
                ref={isMobile ? rowVirtualizer.measureElement : undefined}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start + (isMobile ? 0 : HEADER_HEIGHT)}px)`,
                }}
              >
                {isMobile ? (
                  <div className="px-2.5 py-1.5 sm:px-3 sm:py-2">
                    <MobileCard
                      row={row}
                      index={virtualRow.index}
                      rowKey={rowKey}
                      isBookmarked={isBookmarked}
                      onToggleBookmark={onToggleBookmark}
                      onCopy={onCopyRow}
                      onCompare={onCompare}
                      onOpenDetail={onOpenDetail}
                      highlighter={highlighter}
                      availableColumns={allColumns.length > 0 ? allColumns : columns}
                    />
                  </div>
                ) : (
                  <DesktopRow
                    row={row}
                    columns={columns}
                    cellStyle={cellStyle}
                    starWidth={STAR_WIDTH}
                    rowHeight={rowHeight}
                    isBookmarked={isBookmarked}
                    onToggleBookmark={onToggleBookmark}
                    onCopy={onCopyRow}
                    onCompare={onCompare}
                    onOpenDetail={onOpenDetail}
                    rowKey={rowKey}
                    striped={virtualRow.index % 2 === 0}
                    highlighter={highlighter}
                    density={density}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Empty State with action buttons */}
        {data.length === 0 && (
          <EmptyState
            title="هیچ درسی با این مشخصات یافت نشد"
            hint={
              hasSearch || Object.keys(filters).length
                ? 'فیلترها یا عبارت جستجو را تغییر دهید تا نتایج نمایش داده شوند.'
                : 'در حال حاضر هیچ ردیفی برای نمایش وجود ندارد.'
            }
            actions={
              <>
                {hasSearch && (
                  <button
                    type="button"
                    onClick={onClearSearch}
                    className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-blue-600 px-3 text-[12.5px] font-bold text-white transition-colors hover:bg-blue-700"
                  >
                    پاک کردن جستجو
                  </button>
                )}
                {Object.keys(filters).length > 0 && (
                  <button
                    type="button"
                    onClick={onClearFilters}
                    className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-[12.5px] font-bold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    حذف فیلترها
                  </button>
                )}
              </>
            }
          />
        )}
      </div>

      {/* Back to Top floating button */}
      {showBackToTop && (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="بازگشت به ابتدای جدول"
          title="بازگشت به ابتدا"
          className="fixed bottom-6 end-6 z-40 grid size-11 place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 active:scale-95"
        >
          <ArrowUpIcon className="size-5" />
        </button>
      )}
    </div>
  );
}
