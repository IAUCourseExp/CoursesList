// Virtualised course table for desktop and card list for mobile.
// All table items, headers, rows and cells are center aligned for maximum clarity.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import DesktopRow from './DesktopRow.jsx';
import MobileCard from './MobileCard.jsx';
import FacetPanel from './FacetPanel.jsx';
import { CellContent } from './cells.jsx';
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
  conflictRowKeys = new Set(),
  onToggleBookmark,
  onCopyRow,
  onCompare,
  onOpenDetail,
  onClearFilters,
  onClearSearch,
  hasSearch = false,
  openFacetPanel = null, // Unified facet panel state from App
  setOpenFacetPanel = () => {},
}) {
  const isMobile = useIsMobile();
  const parentRef = useRef(null);
  const [draggingCol, setDraggingCol] = useState(null);
  const dragRef = useRef({ col: null, startX: 0, startW: 0 });

  const highlighter = useMemo(() => buildHighlighter(searchTerm), [searchTerm]);
  const bookmarkSet = useMemo(() => new Set(bookmarks), [bookmarks]);

  const rowHeight = ROW_HEIGHTS[density] || ROW_HEIGHTS.comfortable;

  // Track the actual visible width of the table viewport to intelligently stretch columns
  const [containerWidth, setContainerWidth] = useState(0);
  // True only while the browser is actually printing (BUG-32): print gets a
  // full static table instead of the virtualized row window.
  const [printing, setPrinting] = useState(false);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return undefined;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onBefore = () => setPrinting(true);
    const onAfter = () => setPrinting(false);
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);
    return () => {
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
    };
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

  // Re-derive every measurement when the row-height model changes (BUG-07):
  // estimateSize is not a dependency of virtual-core's measurement memo, so
  // switching density (44/56/72px) or crossing the mobile breakpoint must
  // force the recalculation explicitly. measure() clears the size cache, and
  // the next pass rebuilds positions from the current estimateSize; mobile
  // cards re-measure themselves through measureElement as before.
  useLayoutEffect(() => {
    rowVirtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [density, isMobile]);

  const showBackToTop = useScrolledPast(parentRef, 400);
  const scrollToTop = () => {
    parentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // When the result set transitions to empty (e.g. a filter removed the last
  // row while the user was scrolled down), bring the viewport back so the
  // empty state and its recovery actions are actually visible (BUG-16).
  // Ordinary filtering/sorting never touches the scroll position.
  const wasEmptyRef = useRef(true);
  useEffect(() => {
    const empty = data.length === 0;
    if (empty && !wasEmptyRef.current) parentRef.current?.scrollTo({ top: 0 });
    wasEmptyRef.current = empty;
  }, [data.length]);

  // Header facet dropdown (BUG-17): the panel renders through a portal into
  // document.body, anchored to the header toggle button. Rendering it inside
  // the scroll container used to clip it at the scrollport edges (leftmost
  // columns, short viewports) and scroll it out of view. Outside-click and
  // Escape dismissal stay owned by App's single document-level listener.
  const toggleRefsRef = useRef(new Map());
  const [facetRect, setFacetRect] = useState(null);

  const updateFacetRect = useCallback(() => {
    if (openFacetPanel?.variant !== 'dropdown') return;
    const btn = toggleRefsRef.current.get(openFacetPanel.column);
    if (btn) setFacetRect(btn.getBoundingClientRect());
  }, [openFacetPanel]);

  useEffect(() => {
    if (openFacetPanel?.variant !== 'dropdown') {
      setFacetRect(null);
      return undefined;
    }
    updateFacetRect();
    const onReposition = () => updateFacetRect();
    document.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [openFacetPanel, updateFacetRect]);

  // Keep the portaled panel under the toggle and inside the viewport.
  const FACET_PANEL_W = 304; // w-[19rem]
  const facetPortalStyle = useMemo(() => {
    if (!facetRect) return null;
    const left = Math.min(
      Math.max(8, facetRect.left + facetRect.width / 2 - FACET_PANEL_W / 2),
      window.innerWidth - FACET_PANEL_W - 8,
    );
    const top = Math.min(facetRect.bottom + 6, window.innerHeight - 120);
    return { top, left };
  }, [facetRect]);

  // Column resizing handlers
  const startResize = (e, col) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingCol(col);
    dragRef.current = { col, startX: e.clientX, startW: widthOf(col) };
    document.body.classList.add('col-resizing'); // suppress text selection while dragging (BUG-26)

    const onPointerMove = (ev) => {
      const { col: c, startX, startW } = dragRef.current;
      if (!c) return;
      const delta = startX - ev.clientX; // RTL resize delta
      const nextW = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, startW + delta));
      onColumnWidthChange(c, nextW);
    };

    const onPointerUp = () => {
      document.body.classList.remove('col-resizing');
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
    if (openFacetPanel?.column === col) {
      setOpenFacetPanel(null);
    } else {
      setOpenFacetPanel({ column: col, variant: 'dropdown' });
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
          // Conventional data table (WAI-ARIA table pattern), not a grid: cells
          // are not focus targets and there is no arrow-key navigation model.
          // Interactions live in independently focusable widgets inside cells.
          // aria-rowcount/-colcount preserve real totals despite virtualization.
          role={isMobile ? undefined : 'table'}
          aria-rowcount={isMobile ? undefined : data.length + 1}
          aria-colcount={isMobile ? undefined : columns.length + 1}
          style={{
            height: printing ? 'auto' : `${rowVirtualizer.getTotalSize() + (isMobile ? 0 : HEADER_HEIGHT)}px`,
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
                      ref={(el) => {
                        if (el) toggleRefsRef.current.set(col, el);
                        else toggleRefsRef.current.delete(col);
                      }}
                      onClick={(e) => toggleFacet(e, col)}
                      aria-label={`فیلتر ${fullLabelOf(col)}`}
                      aria-expanded={openFacetPanel?.column === col}
                      title={`فیلتر ${fullLabelOf(col)}`}
                      className={`relative grid size-8 shrink-0 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70 ${
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

          {/* Virtual Rows - while printing, a complete static table replaces the
              virtualized window so every result row lands on paper (BUG-32) */}
          {!printing && rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = data[virtualRow.index];
            if (!row) return null;
            const rowKey = rowKeyOf(row);
            const isBookmarked = bookmarkSet.has(rowKey);
            const isConflicted = isBookmarked && conflictRowKeys.has(rowKey);

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
                      isConflicted={isConflicted}
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
                    isConflicted={isConflicted}
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

          {/* Complete static table for print output (BUG-32) */}
          {printing && !isMobile && (
            <div aria-hidden="true">
              {data.map((row, i) => (
                <div
                  key={rowKeyOf(row) || i}
                  role="row"
                  className={`flex border-b border-slate-200 ${i % 2 ? 'bg-slate-50' : 'bg-white'}`}
                  style={{ width: `${effectiveTableWidth}px` }}
                >
                  <div className="shrink-0" style={{ width: `${STAR_WIDTH}px` }} />
                  {[...columns].reverse().map((col) => (
                    <div
                      key={col}
                      role="cell"
                      className="min-w-0 truncate border-e border-slate-100 px-1 py-1 text-center text-[10.5px] leading-snug"
                      style={cellStyle(col)}
                    >
                      <CellContent column={col} row={row} highlighter={highlighter} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
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

      {/* Header facet panel - portaled so the scroll container can never clip it */}
      {openFacetPanel?.variant === 'dropdown' && facetPortalStyle && createPortal(
        <>
          <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setOpenFacetPanel(null)} />
          <div
            data-facet-panel
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`فیلتر ${fullLabelOf(openFacetPanel.column)}`}
            className="fixed z-50 w-[19rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 animate-pop-in"
            style={facetPortalStyle}
          >
            <FacetPanel
              column={openFacetPanel.column}
              values={facets[openFacetPanel.column] || []}
              loading={!facets[openFacetPanel.column] && facetsLoading === openFacetPanel.column}
              selected={filters[openFacetPanel.column] || []}
              onToggle={(v) => {
                const current = filters[openFacetPanel.column] || [];
                const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];
                onFilterChange(openFacetPanel.column, next.length ? next : null);
              }}
              onClear={() => onFilterChange(openFacetPanel.column, null)}
              onClose={() => setOpenFacetPanel(null)}
              variant="header"
              autoFocus
            />
          </div>
        </>,
        document.body,
      )}

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
