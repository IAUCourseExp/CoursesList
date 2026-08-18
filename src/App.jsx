import VirtualTable from './components/VirtualTable';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

const CACHE_KEY = 'usc.cache.v1';
const WIDTHS_KEY = 'usc.colwidths.v1';

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

const LAST_UPDATE = '27 مرداد 1405';

const TelegramIcon = ({ className }) => (
  <img
    src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg"
    className={className}
    alt="TG"
  />
);

const ChannelsPopover = ({ triggerRef, onClose }) => {
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) && !e.target.closest('.channels-popover')) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [onClose, triggerRef]);

  return (
    <div className="channels-popover absolute left-0 top-full mt-1 w-56 bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-200/80 p-3 z-50 text-right">
      <h5 className="text-xs font-bold text-slate-700 flex items-center gap-1 mb-2 border-b border-slate-200/80 pb-1.5">
        <span>📢</span> کانال‌های مرتبط
      </h5>
      <ul className="space-y-1.5 text-xs">
        <li className="flex items-center gap-1">
          <span className="opacity-70">📚</span>
          <span className="font-medium">جزوه:</span>
          <a href="https://t.me/JozveIAU" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
            <TelegramIcon className="w-3 h-3" /> JozveIAU
          </a>
        </li>
        <li className="flex items-center gap-1">
          <span className="opacity-70">⁉️</span>
          <span className="font-medium">تجربیات:</span>
          <a href="https://t.me/IAUCourseExp" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
            <TelegramIcon className="w-3 h-3" /> IAUCourseExp
          </a>
        </li>
        <li className="flex items-center gap-1">
          <span className="opacity-70">💻</span>
          <span className="font-medium">انجمن کامپیوتر:</span>
          <a href="https://t.me/shziaucesa" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
            <TelegramIcon className="w-3 h-3" /> shziaucesa
          </a>
        </li>
      </ul>
    </div>
  );
};

function App() {
  const [initialCache] = useState(() => readJson(CACHE_KEY));

  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [masterCount, setMasterCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ column: null, direction: 'asc' });
  const [filters, setFilters] = useState({});
  const [colWidths, setColWidths] = useState(() => readJson(WIDTHS_KEY) || {});
  const [facets, setFacets] = useState({});
  const [facetsLoading, setFacetsLoading] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [status, setStatus] = useState(() => (initialCache?.csv ? 'checking' : 'idle'));
  const [showChannelsPopover, setShowChannelsPopover] = useState(false);
  const channelsBtnRef = useRef(null);

  const workerRef = useRef(null);
  const widthsRef = useRef(colWidths);

  useEffect(() => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'DATA_LOADED') {
        setData(payload.data || []);
        setColumns(payload.columns || []);
        setMasterCount((payload.data || []).length);
        setIsLoading(false);
        setLoadError(null);
        setDataVersion((v) => v + 1);

        if (payload.csvText) {
          writeJson(CACHE_KEY, { csv: payload.csvText, savedAt: Date.now() });
        }
        if (payload.source === 'cache') {
          setStatus('checking');
        } else if (payload.changed) {
          setStatus('updated');
          setTimeout(() => setStatus((s) => (s === 'updated' ? 'uptodate' : s)), 4000);
        } else {
          setStatus('uptodate');
        }
      } else if (type === 'STATUS') {
        if (payload.fresh) setStatus('uptodate');
      } else if (type === 'QUERY_RESULTS') {
        setData(payload.rows || []);
        setIsLoading(false);
      } else if (type === 'FACETS_RESULT') {
        setFacets((prev) => ({ ...prev, [payload.column]: payload.values }));
        setFacetsLoading((prev) => (prev === payload.column ? null : prev));
      } else if (type === 'ERROR') {
        setIsLoading(false);
        setLoadError(payload.message);
      }
    };

    worker.postMessage({
      type: 'INIT',
      payload: { url: import.meta.env.BASE_URL + 'data.csv', cachedText: initialCache?.csv || null },
    });

    return () => {
      worker.onmessage = null;
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || dataVersion === 0) return;
    worker.postMessage({
      type: 'QUERY',
      payload: { search: debouncedTerm, filters, sort: sortConfig },
    });
  }, [debouncedTerm, filters, sortConfig, dataVersion]);

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (value === '') setDebouncedTerm('');
  };

  const handleSort = (columnName) => {
    setSortConfig((prev) => {
      if (prev.column !== columnName) return { column: columnName, direction: 'asc' };
      if (prev.direction === 'asc') return { column: columnName, direction: 'desc' };
      return { column: null, direction: 'asc' };
    });
  };

  const handleFilterChange = useCallback((col, values) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!values || values.length === 0) delete next[col];
      else next[col] = values;
      return next;
    });
  }, []);

  const clearAllFilters = () => setFilters({});

  const handleColumnResize = useCallback((col, width) => {
    setColWidths((prev) => {
      const next = { ...prev };
      if (width == null) delete next[col];
      else next[col] = width;
      widthsRef.current = next;
      return next;
    });
  }, []);

  const persistWidths = useCallback(() => writeJson(WIDTHS_KEY, widthsRef.current), []);

  const resetAllWidths = () => {
    widthsRef.current = {};
    setColWidths({});
    writeJson(WIDTHS_KEY, {});
  };

  const ensureFacets = useCallback(
    (col) => {
      if (facets[col] || facetsLoading === col) return;
      setFacetsLoading(col);
      workerRef.current?.postMessage({ type: 'FACETS', payload: { column: col } });
    },
    [facets, facetsLoading]
  );

  const hasActiveFilters = Object.keys(filters).length > 0;
  const hasCustomWidths = useMemo(() => Object.keys(colWidths).length > 0, [colWidths]);

  const closeChannelsPopover = () => setShowChannelsPopover(false);

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-blue-50/40">
      <header className="flex-none backdrop-blur-xl bg-white/70 border-b border-slate-200/70 shadow-sm z-30 py-1.5 px-3 md:px-4">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="premium-nav-matrix">
              <div className="matrix-bg-rain">
                0101001011010101001010100111010101010100101101010100101010011101
                1010101100101010110101011001010101101010110010101011010101100101
                0111010100101010010110100111010100101010010110100111010100101010
                1101010110010101011010101100101010110101011001010101101010110010
              </div>
              <h1 data-text="لیست دروس دانشگاه آزاد شیراز">
                لیست دروس دانشگاه آزاد شیراز
              </h1>
            </div>
            <span className="text-xs sm:text-sm md:text-base font-extrabold bg-blue-50/90 border border-blue-200/70 text-blue-700 px-3 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1">
              🔄 {LAST_UPDATE}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`${import.meta.env.BASE_URL}data.csv`}
              download={`لیست_دروس_${LAST_UPDATE.replace(/ /g, '_')}.csv`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all text-[11px] sm:text-xs font-bold whitespace-nowrap"
            >
              <span>📥</span>
              <span className="hidden xs:inline">دانلود</span>
            </a>

            <div className="hidden sm:flex items-center gap-2 text-[10px] sm:text-[11px] text-slate-600 bg-slate-100/70 px-2.5 py-1 rounded-full border border-slate-200/60 shadow-sm">
              <span className="opacity-70">📢</span>
              <a href="https://t.me/JozveIAU" target="_blank" rel="noreferrer" className="hover:text-blue-600 flex items-center gap-0.5">
                <TelegramIcon className="w-3 h-3" /> جزوه
              </a>
              <span className="text-slate-300">|</span>
              <a href="https://t.me/IAUCourseExp" target="_blank" rel="noreferrer" className="hover:text-blue-600 flex items-center gap-0.5">
                <TelegramIcon className="w-3 h-3" /> تجربیات
              </a>
              <span className="text-slate-300">|</span>
              <a href="https://t.me/shziaucesa" target="_blank" rel="noreferrer" className="hover:text-blue-600 flex items-center gap-0.5">
                <TelegramIcon className="w-3 h-3" /> انجمن کامپیوتر
              </a>
            </div>

            <button
              ref={channelsBtnRef}
              onClick={() => setShowChannelsPopover((v) => !v)}
              className="sm:hidden p-1 rounded-lg hover:bg-slate-200/70 transition-colors text-slate-600 relative"
              title="کانال‌های مرتبط"
            >
              <span className="text-lg">📢</span>
              {showChannelsPopover && (
                <ChannelsPopover
                  triggerRef={channelsBtnRef}
                  onClose={closeChannelsPopover}
                />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 w-full px-2 md:px-4 pt-1.5 pb-2 md:pb-4">
        <div className="h-full flex flex-col min-h-0 w-full">
          <div className="flex-1 min-h-0 bg-white/90 backdrop-blur-sm shadow-2xl shadow-slate-300/40 rounded-2xl md:rounded-3xl w-full border border-slate-200/80 overflow-hidden relative flex flex-col">
            
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200/80 px-3 py-2 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[120px] max-w-xs">
                <input
                  id="search-courses"
                  type="text"
                  inputMode="search"
                  placeholder="جستجو..."
                  className="w-full px-3 py-1.5 pr-8 pl-7 bg-slate-100/80 rounded-xl border border-slate-200/60 focus:border-blue-400 focus:ring-2 focus:ring-blue-100/70 focus:outline-none transition-all text-sm placeholder:text-slate-400 text-right"
                  value={searchTerm}
                  onChange={handleSearch}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-sm select-none pointer-events-none">
                  🔍
                </div>
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setDebouncedTerm('');
                    }}
                    aria-label="پاک کردن جستجو"
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-300/70 hover:bg-slate-400 text-slate-600 text-[9px] flex items-center justify-center transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                <span className="whitespace-nowrap text-lg">
                  <span className="font-black text-slate-700">{data.length.toLocaleString('fa-IR')}</span>
                  {' '}از {masterCount.toLocaleString('fa-IR')}
                </span>

                {status === 'checking' && (
                  <span className="flex items-center gap-1 text-blue-500 font-medium whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    بررسی…
                  </span>
                )}
                {status === 'updated' && (
                  <span className="text-emerald-600 font-bold whitespace-nowrap">✓ بروزرسانی شد</span>
                )}

                {Object.entries(filters).map(([col, vals]) => (
                  <button
                    key={col}
                    onClick={() => handleFilterChange(col, null)}
                    title="حذف این فیلتر"
                    className="inline-flex items-center gap-1 bg-blue-100/80 text-blue-700 border border-blue-200/80 rounded-full px-2 py-0.5 font-medium hover:bg-blue-200/80 transition-colors max-w-[140px] whitespace-nowrap"
                  >
                    <span className="font-bold">{col}:</span>
                    <span className="truncate">
                      {vals.length === 1 ? vals[0] : `${vals.length.toLocaleString('fa-IR')} مقدار`}
                    </span>
                    <span className="text-blue-400">✕</span>
                  </button>
                ))}

                <div className="flex items-center gap-1">
                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="text-red-500 hover:text-red-600 font-bold transition-colors text-[11px] whitespace-nowrap"
                    >
                      ✕ حذف فیلترها
                    </button>
                  )}
                  {hasCustomWidths && (
                    <button
                      onClick={resetAllWidths}
                      className="text-red-400 hover:text-red-700 font-medium transition-colors text-[11px] whitespace-nowrap animate-pulse hover:animate-none"
                    >
                      ↺ عرض پیش‌فرض
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 relative">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-14 w-14 border-t-4 border-b-4 border-blue-600"></div>
                  <p className="mt-5 text-slate-500 text-sm md:text-lg animate-pulse text-center px-4">
                    در حال بارگذاری لیست دروس...
                  </p>
                </div>
              ) : loadError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
                  <span className="text-5xl">⚠️</span>
                  <p className="text-slate-600 font-bold text-sm">خطا در بارگذاری داده‌ها</p>
                  <p className="text-slate-400 text-xs" dir="ltr">{loadError}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="mt-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
                  >
                    تلاش مجدد
                  </button>
                </div>
              ) : (
                <>
                  <VirtualTable
                    data={data}
                    columns={columns}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    facets={facets}
                    onEnsureFacets={ensureFacets}
                    facetsLoading={facetsLoading}
                    colWidths={colWidths}
                    onColumnResize={handleColumnResize}
                    onWidthsCommit={persistWidths}
                    onColumnReset={(col) => handleColumnResize(col, null)}
                  />
                  {data.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 pointer-events-none">
                      <span className="text-5xl">🔍</span>
                      <p className="text-sm font-bold">موردی مطابق جستجو یا فیلترها یافت نشد</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="flex-none py-1.5 bg-white/70 backdrop-blur-md border-t border-slate-200/70 text-center z-10">
        <div className="text-[10px] sm:text-[11px] text-slate-500 font-medium px-3 leading-relaxed">
          <span className="rainbow-breath">
            طراحی شده برای دانشجویان دانشگاه آزاد شیراز
          </span>
          <span className="hidden sm:inline text-slate-400">
            {' '}· کشیدن لبه‌ی سرستون‌ها = تغییر عرض (دوبار کلیک = پیش‌فرض)
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;