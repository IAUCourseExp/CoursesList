import React from 'react';
import { HeartIcon, CopyIcon, CompareIcon } from './icons.jsx';
import { CellContent } from './cells.jsx';
import { isEmphasisColumn, isSecondaryColumn } from '../lib/columns.js';

/**
 * One virtualized table row.
 * Every item in rows and cells is center aligned for instant visual clarity.
 */
const DesktopRow = React.memo(function DesktopRow({
  row,
  columns,
  cellStyle,
  starWidth,
  rowHeight,
  isBookmarked,
  onToggleBookmark,
  onCopy,
  onCompare,
  onOpenDetail,
  rowKey,
  striped,
  highlighter,
  density,
}) {
  const textSize = density === 'compact' ? 'text-[12px]' : density === 'spacious' ? 'text-[13.5px]' : 'text-[13px]';
  const padY = density === 'compact' ? 'py-1' : density === 'spacious' ? 'py-2.5' : 'py-2';

  return (
    <div
      className={`absolute left-0 top-0 flex w-full items-stretch border-b border-slate-100 transition-colors ${
        striped ? 'bg-white' : 'bg-slate-50/60'
      } hover:bg-blue-50/50 group/row cursor-pointer`}
      style={{ height: `${rowHeight}px` }}
      role="row"
      onDoubleClick={() => onOpenDetail?.(row)}
    >
      {/* Action rail: high-contrast, intuitive bookmark + compare + copy */}
      <div
        className="flex shrink-0 items-center justify-center gap-1 border-e border-slate-100 bg-inherit px-1.5"
        style={{
          width: `${starWidth}px`,
          minWidth: `${starWidth}px`,
          maxWidth: `${starWidth}px`,
          flex: `0 0 ${starWidth}px`,
          direction: 'rtl',
        }}
        role="cell"
      >
        <button
          type="button"
          data-bookmark-btn
          onClick={(e) => { e.stopPropagation(); onToggleBookmark(rowKey); }}
          aria-pressed={isBookmarked}
          aria-label={isBookmarked ? 'حذف از سبد انتخاب واحد' : 'افزودن به سبد انتخاب واحد'}
          title={isBookmarked ? 'حذف از سبد انتخاب واحد' : 'افزودن به سبد انتخاب واحد'}
          className={`grid size-7 place-items-center rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
            isBookmarked
              ? 'border-rose-300 bg-rose-50 text-rose-600 shadow-xs hover:bg-rose-100 hover:border-rose-400'
              : 'border-slate-200 bg-white text-slate-400 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-500'
          }`}
        >
          <HeartIcon filled={isBookmarked} className="size-[15px]" />
        </button>

        {onCompare && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCompare(row); }}
            aria-label="مقایسه سایر اساتید این درس"
            title="مقایسه اساتید و زمان‌بندی این درس"
            className="grid size-7 place-items-center rounded-lg border border-blue-200 bg-blue-50/80 text-blue-700 transition-all hover:bg-blue-100 hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <CompareIcon className="size-3.5" />
          </button>
        )}

        {onCopy && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCopy(row); }}
            aria-label="کپی مشخصات درس"
            title="کپی اطلاعات درس"
            className="grid size-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <CopyIcon className="size-3.5" />
          </button>
        )}
      </div>

      {/* Data cells: all center aligned */}
      {[...columns].reverse().map((col) => {
        const emphasised = isEmphasisColumn(col);
        const secondary = isSecondaryColumn(col);
        return (
          <div
            key={col}
            role="cell"
            style={cellStyle(col)}
            onClick={(e) => {
              if (emphasised && onOpenDetail) {
                e.stopPropagation();
                onOpenDetail(row);
              }
            }}
            className={`flex shrink-0 min-w-0 items-center justify-center text-center border-e border-slate-100/70 px-2 last:border-e-0 ${padY} ${textSize} ${
              emphasised ? 'hover:text-blue-700 transition-colors' : ''
            }`}
          >
            <div
              className={`w-full min-w-0 truncate text-center leading-snug ${
                emphasised ? 'font-extrabold text-slate-900'
                  : secondary ? 'font-semibold text-slate-700'
                    : 'font-medium text-slate-700'
              }`}
            >
              <CellContent column={col} row={row} highlighter={highlighter} />
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default DesktopRow;
