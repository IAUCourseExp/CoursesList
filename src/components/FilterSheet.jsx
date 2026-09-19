// Mobile control centre. The desktop layout puts sorting and filtering in the table
// header - impossible on a phone, where the header is hidden. This sheet gives every
// one of those controls a proper home, in the order people actually need them.

import { useEffect, useState } from 'react';
import {
  CloseIcon, SortIcon, FilterIcon, ColumnsIcon, SlidersIcon, SparkIcon,
  TelegramIcon, DownloadIcon, HelpIcon, HeartIcon, LinkIcon, GridIcon, ListIcon,
  CompassIcon, BookOpenIcon,
} from './icons.jsx';
import { Chip, Section, Segmented } from './Bits.jsx';
import FacetPanel from './FacetPanel.jsx';
import ColumnPicker from './ColumnPicker.jsx';
import { faNum } from '../lib/format.js';
import { useScrollLock } from '../lib/hooks.js';
import {
  labelOf, COLUMN_GROUPS, QUICK_FILTER_COLUMNS, QUICK_SORT_OPTIONS, isPhantom, pickColumns, canonical,
} from '../lib/columns.js';

const QUICK_VALUES_PER_COLUMN = 6;
const DENSITY_OPTIONS = [
  { id: 'compact', label: 'فشرده', icon: <ListIcon className="size-3.5" /> },
  { id: 'comfortable', label: 'معمولی', icon: <ListIcon className="size-3.5" /> },
  { id: 'spacious', label: 'راحت', icon: <GridIcon className="size-3.5" /> },
];

export default function FilterSheet({
  onClose,
  filters,
  onFilterChange,
  sortConfig,
  onSort,
  facets,
  onEnsureFacets,
  facetsLoading,
  density,
  onDensityChange,
  allColumns,
  visibleColumns,
  onColumnsChange,
  onColumnsReset,
  isMobile = true,
  bookmarkCount,
  showBookmarksOnly,
  onToggleBookmarksOnly,
  onShare,
  onHelp,
  onTour,
  onClearAll,
  resultsCount,
  totalCount,
  csvUrl,
  filename,
}) {
  useScrollLock(true);
  const [openValueList, setOpenValueList] = useState(null);

  const quickColumns = pickColumns(allColumns, QUICK_FILTER_COLUMNS);
  const realColumns = allColumns.filter((c) => !isPhantom(c));

  useEffect(() => {
    quickColumns.forEach((c) => onEnsureFacets(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleValue = (col, value) => {
    const current = filters[col] || [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onFilterChange(col, next.length ? next : null);
  };

  const activeFilterCount = Object.values(filters).reduce((a, v) => a + (v?.length || 0), 0);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="فیلترها و تنظیمات">
      <button type="button" aria-label="بستن" onClick={onClose} className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" />

      <div className={`relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-2xl animate-sheet-up ${isMobile ? '' : 'max-w-2xl sm:max-h-[88vh] sm:rounded-3xl'}`}>
        <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
          <span className="grid size-9 place-items-center rounded-xl bg-blue-600 text-white">
            <SlidersIcon className="size-4.5" />
          </span>
          <div className="flex-1">
            <h2 id="mobile-filter-sheet-title" className="text-[15px] font-extrabold text-slate-800">فیلترها و تنظیمات</h2>
            <p className="text-[11.5px] text-slate-500">
              {faNum(resultsCount)} از {faNum(totalCount)} درس نمایش داده می‌شود
              {activeFilterCount > 0 && <> · {faNum(activeFilterCount)} فیلتر فعال</>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن فیلترها"
            className="grid size-10 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain thin-scrollbar">
          {/* ── sort ────────────────────────────────────────────────────────── */}
          <Section title="مرتب‌سازی" icon={<SortIcon className="size-4.5" />} defaultOpen
            meta={sortConfig.column ? labelOf(sortConfig.column) : 'پیش‌فرض'}>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={!sortConfig.column} onClick={() => onSort({ column: null, direction: 'asc' })}>
                پیش‌فرض (ترتیب فایل)
              </Chip>
              {QUICK_SORT_OPTIONS.map((o) => ({ ...o, raw: allColumns.find((c) => canonical(c) === canonical(o.column)) }))
                .filter((o) => o.raw).map((o) => {
                const active = sortConfig.column === o.raw && sortConfig.direction === o.direction;
                return (
                  <Chip
                    key={o.label}
                    active={active}
                    onClick={() => onSort(active ? { column: null, direction: 'asc' } : { column: o.raw, direction: o.direction })}
                  >
                    {o.label}
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* ── quick filters ───────────────────────────────────────────────── */}
          <Section title="فیلترهای سریع" icon={<SparkIcon className="size-4.5" />} defaultOpen>
            <div className="space-y-3">
              {quickColumns.map((col) => {
                const values = (facets[col] || []).slice(0, QUICK_VALUES_PER_COLUMN);
                const selected = filters[col] || [];
                const expanded = openValueList === col;
                return (
                  <div key={col}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-[12px] font-extrabold text-slate-600">{labelOf(col)}</p>
                      <button
                        type="button"
                        onClick={() => { setOpenValueList(expanded ? null : col); if (!expanded) onEnsureFacets(col); }}
                        className="rounded-lg px-2 py-1 text-[11.5px] font-bold text-blue-600 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                      >
                        {expanded ? 'بستن' : 'همهٔ مقادیر'}
                      </button>
                    </div>

                    {expanded ? (
                      <FacetPanel
                        variant="inline"
                        column={col}
                        values={facets[col] || []}
                        loading={facetsLoading === col}
                        selected={selected}
                        onToggle={(v) => toggleValue(col, v)}
                        onClear={() => onFilterChange(col, null)}
                        onClose={() => setOpenValueList(null)}
                      />
                    ) : values.length === 0 ? (
                      <p className="rounded-lg bg-slate-100/70 px-3 py-2 text-[11.5px] text-slate-400">در حال بارگذاری مقادیر…</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {values.map((v) => (
                          <Chip
                            key={v.value}
                            tone={selected.includes(v.value) ? 'blue' : 'slate'}
                            active={selected.includes(v.value)}
                            onClick={() => toggleValue(col, v.value)}
                            title={`${v.value} - ${faNum(v.count)} درس`}
                          >
                            {v.value === '(خالی)' ? 'خالی' : v.value}
                            <span className="text-[10.5px] font-bold opacity-70">{faNum(v.count)}</span>
                          </Chip>
                        ))}
                        {(facets[col] || []).length > QUICK_VALUES_PER_COLUMN && (
                          <Chip tone="slate" onClick={() => { setOpenValueList(col); onEnsureFacets(col); }}>
                            + {faNum((facets[col] || []).length - QUICK_VALUES_PER_COLUMN)} مورد دیگر
                          </Chip>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ── every other column ─────────────────────────────────────────── */}
          <Section title="فیلتر ستون‌به‌ستون" icon={<FilterIcon className="size-4.5" />}>
            <div className="space-y-3">
              {COLUMN_GROUPS.map((group) => {
                const cols = pickColumns(realColumns, group.columns)
                  .filter((c) => !quickColumns.includes(c));
                if (!cols.length) return null;
                return (
                  <div key={group.title}>
                    <p className="mb-1.5 text-[11px] font-extrabold text-slate-400">{group.title}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cols.map((col) => {
                        const count = filters[col]?.length || 0;
                        const expanded = openValueList === col;
                        return (
                          <Chip
                            key={col}
                            tone={count ? 'blue' : 'slate'}
                            active={!!count}
                            onClick={() => { setOpenValueList(expanded ? null : col); if (!expanded) onEnsureFacets(col); }}
                            title={`فیلتر ${col}`}
                          >
                            <FilterIcon className="size-3.5" />
                            {labelOf(col)}
                            {count > 0 && <span className="rounded-full bg-white/25 px-1.5 text-[10.5px]">{faNum(count)}</span>}
                          </Chip>
                        );
                      })}
                    </div>
                    {openValueList && cols.includes(openValueList) && (
                      <div className="mt-2">
                        <FacetPanel
                          variant="inline"
                          column={openValueList}
                          values={facets[openValueList] || []}
                          loading={facetsLoading === openValueList}
                          selected={filters[openValueList] || []}
                          onToggle={(v) => toggleValue(openValueList, v)}
                          onClear={() => onFilterChange(openValueList, null)}
                          onClose={() => setOpenValueList(null)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ── appearance ─────────────────────────────────────────────────── */}
          <Section title="نمایش" icon={<SlidersIcon className="size-4.5" />}>
            <div className="space-y-3">
              {isMobile && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12.5px] font-bold text-slate-600">تراکم کارت‌ها</p>
                  <Segmented options={DENSITY_OPTIONS} value={density} onChange={onDensityChange} label="تراکم نمایش" />
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12.5px] font-bold text-slate-600">فقط نشانه‌گذاری‌شده‌ها</p>
                <Chip tone="amber" active={showBookmarksOnly} onClick={onToggleBookmarksOnly}>
                  <HeartIcon filled={showBookmarksOnly} className="size-3.5" />
                  {faNum(bookmarkCount)} درس
                </Chip>
              </div>

              {bookmarkCount > 0 && (
                <button
                  type="button"
                  onClick={onShare}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-[12.5px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
                >
                  <LinkIcon className="size-4" />
                  کپی لینک برنامهٔ درسی ({faNum(bookmarkCount)} درس)
                </button>
              )}
            </div>
          </Section>

          {/* ── columns (desktop layout only) ──────────────────────────────── */}
          {!isMobile && (
            <Section title="ستون‌های جدول" icon={<ColumnsIcon className="size-4.5" />}
              meta={`${faNum(visibleColumns.length)} از ${faNum(realColumns.length)}`}>
              <ColumnPicker
                allColumns={realColumns}
                visible={visibleColumns}
                onChange={onColumnsChange}
                onReset={onColumnsReset}
              />
            </Section>
          )}

          {/* ── links ──────────────────────────────────────────────────────── */}
          <Section title="پایگاه‌ها و کانال‌های دانشجویی" icon={<LinkIcon className="size-4.5" />} defaultOpen={true}>
            <div className="grid grid-cols-2 gap-2">
              <a href="https://iaucourseexp.github.io/iau-experiences/" target="_blank" rel="noreferrer"
                className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-[12.5px] font-bold text-emerald-800 transition-colors hover:border-emerald-300">
                🌐 وبسایت تجارب اساتید شیراز
              </a>
              <a href="https://t.me/IAUCourseExp" target="_blank" rel="noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 text-[12.5px] font-bold text-sky-800 transition-colors hover:border-sky-300">
                <TelegramIcon className="size-4 text-[#229ED9]" /> کانال تجربیات
              </a>
              <a href="https://t.me/jozveiau" target="_blank" rel="noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 text-[12.5px] font-bold text-indigo-800 transition-colors hover:border-indigo-300">
                <BookOpenIcon className="size-4 text-indigo-600" /> کانال جزوه
              </a>
              <a href="https://iaucourseexp.github.io/CoursesCodes/" target="_blank" rel="noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-[12.5px] font-bold text-violet-700 transition-colors hover:border-violet-300">
                🔢 کد دروس
              </a>
              {csvUrl && (
                <a href={csvUrl} download={filename}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-[12.5px] font-bold text-emerald-700 transition-colors hover:border-emerald-300">
                  <DownloadIcon className="size-4" /> دانلود CSV
                </a>
              )}
              {onTour && (
                <button type="button" onClick={() => { onClose(); onTour(); }}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 text-[12.5px] font-bold text-blue-700 transition-colors hover:border-blue-300">
                  <CompassIcon className="size-4 text-blue-600" /> تور راهنما
                </button>
              )}
              <button type="button" onClick={onHelp}
                className={`${onTour ? '' : 'col-span-2'} flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[12.5px] font-bold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700`}>
                <HelpIcon className="size-4" /> راهنمای استفاده
              </button>
            </div>
          </Section>
        </div>

        <footer className="flex items-center gap-2 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => { onClearAll(); }}
            disabled={activeFilterCount === 0 && !showBookmarksOnly}
            className="min-h-12 shrink-0 rounded-xl border border-slate-200 px-4 text-[13px] font-bold text-slate-600 transition-colors enabled:hover:border-rose-300 enabled:hover:bg-rose-50 enabled:hover:text-rose-600 disabled:opacity-40"
          >
            پاک کردن همه
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 flex-1 rounded-xl bg-blue-600 text-[13.5px] font-extrabold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            نمایش {faNum(resultsCount)} درس
          </button>
        </footer>
      </div>
    </div>
  );
}
