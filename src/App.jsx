import VirtualTable from './components/VirtualTable';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

const LAST_UPDATE = import.meta.env.VITE_BUILD_TIME || 'تاریخ نامشخص';

const CACHE_KEY = 'usc.cache.v1';
const WIDTHS_KEY = 'usc.colwidths.v1';
const BOOKMARKS_KEY = 'usc.bookmarks.v1';

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

const TelegramIcon = ({ className }) => (
  <img
    src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg"
    className={className}
    alt="TG"
  />
);

const getInitialStateFromURL = () => {
  const params = new URLSearchParams(window.location.search);

  const q = params.get('q') || '';

  const sortCol = params.get('sort') || null;
  const sortDir = params.get('dir') || 'asc';
  const sortConfig = sortCol ? { column: sortCol, direction: sortDir } : { column: null, direction: 'asc' };

  let filters = {};
  try {
    const f = params.get('f');
    if (f) {
      filters = JSON.parse(decodeURIComponent(f));
      Object.keys(filters).forEach(key => {
        if (!Array.isArray(filters[key])) filters[key] = [filters[key]];
      });
    }
  } catch (e) {
    console.warn('خطا در خواندن فیلترهای URL:', e);
    filters = {};
  }

  let sharedBookmarks = null;
  try {
    const b = params.get('b');
    if (b) {
      sharedBookmarks = b.split('||').map(decodeURIComponent);
    }
  } catch (e) {
    console.warn('خطا در خواندن دروس اشتراکی:', e);
  }

  return { q, sortConfig, filters, sharedBookmarks };
};

const updateURL = (search, filters, sortConfig) => {
  const params = new URLSearchParams();

  if (search && search.trim() !== '') {
    params.set('q', search.trim());
  }

  if (sortConfig && sortConfig.column) {
    params.set('sort', sortConfig.column);
    params.set('dir', sortConfig.direction);
  }

  if (filters && Object.keys(filters).length > 0) {
    const cleanFilters = {};
    Object.entries(filters).forEach(([key, val]) => {
      if (Array.isArray(val) && val.length > 0) {
        cleanFilters[key] = val;
      }
    });
    if (Object.keys(cleanFilters).length > 0) {
      params.set('f', encodeURIComponent(JSON.stringify(cleanFilters)));
    }
  }

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({}, '', newUrl);
};

function App() {
  const [initialCache] = useState(() => readJson(CACHE_KEY));

  const initState = getInitialStateFromURL();
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [masterCount, setMasterCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [searchTerm, setSearchTerm] = useState(initState.q);
  const [debouncedTerm, setDebouncedTerm] = useState(initState.q);
  const [sortConfig, setSortConfig] = useState(initState.sortConfig);
  const [filters, setFilters] = useState(initState.filters);
  const [colWidths, setColWidths] = useState(() => readJson(WIDTHS_KEY) || {});
  const [facets, setFacets] = useState({});
  const [facetsLoading, setFacetsLoading] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [status, setStatus] = useState(() => (initialCache?.csv ? 'checking' : 'idle'));
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const [bookmarks, setBookmarks] = useState(() => {
    if (initState.sharedBookmarks) {
      writeJson(BOOKMARKS_KEY, initState.sharedBookmarks);
      return initState.sharedBookmarks;
    }
    return readJson(BOOKMARKS_KEY) || [];
  });

  const [showBookmarksOnly, setShowBookmarksOnly] = useState(!!initState.sharedBookmarks);
  
  const [toastMessage, setToastMessage] = useState(null);

  const workerRef = useRef(null);
  const widthsRef = useRef(colWidths);

  const getRowKey = useCallback((row) => {
    return row['كد ارائه كلاس درس'] || row['كد درس'] || `${row['نام درس']}_${row['استاد'] || 'نامشخص'}`;
  }, []);

  const filteredData = useMemo(() => {
    if (!showBookmarksOnly) return data;
    const keySet = new Set(bookmarks);
    return data.filter(row => keySet.has(getRowKey(row)));
  }, [data, showBookmarksOnly, bookmarks, getRowKey]);

  useEffect(() => {
    updateURL(debouncedTerm, filters, sortConfig);
  }, [debouncedTerm, filters, sortConfig]);

  useEffect(() => {
    const handlePopState = () => {
      const newState = getInitialStateFromURL();
      setSearchTerm(newState.q);
      setSortConfig(newState.sortConfig);
      setFilters(newState.filters);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const visibleColumns = useMemo(() => {
    const alwaysVisible = ['كد درس', 'نام درس', 'نوع درس', 'تعداد واحد نظري', 'تعداد واحد عملي', 'كد ارائه كلاس درس', 'استاد', 'زمانبندي تشكيل كلاس', 'زمان امتحان'];

    if (windowWidth < 768) {
      return columns.filter(col => alwaysVisible.includes(col));
    } else {
      return columns;
    }
  }, [columns, windowWidth]);

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

  const toggleBookmark = useCallback((rowKey) => {
    setBookmarks((prev) => {
      let newBookmarks;
      if (prev.includes(rowKey)) {
        newBookmarks = prev.filter((id) => id !== rowKey);
      } else {
        newBookmarks = [...prev, rowKey];
      }
      writeJson(BOOKMARKS_KEY, newBookmarks);
      return newBookmarks;
    });
  }, []);

  const handleShare = async () => {
    const baseUrl = window.location.origin + window.location.pathname;
    const bParam = bookmarks.map(encodeURIComponent).join('||');
    const shareUrl = `${baseUrl}?b=${bParam}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setToastMessage('لینک این برنامه درسی با موفقیت کپی شد! 🔗');
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      prompt('مرورگر شما از کپی خودکار پشتیبانی نمی‌کند. لطفاً لینک زیر را کپی کنید:', shareUrl);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-blue-50/40">
      <header className="flex-none backdrop-blur-xl bg-white/80 border-b border-slate-200/70 shadow-sm z-30 py-2 md:py-2.5 px-3 md:px-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 w-full">
          
          <div className="flex justify-between items-center w-full md:w-auto gap-4">
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
            
            <span className="text-[10px] md:text-xs font-extrabold bg-blue-50/90 border border-blue-200/70 text-blue-700 px-2.5 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1">
              🔄 {LAST_UPDATE}
            </span>
          </div>

          <div className="flex justify-between items-center w-full md:w-auto gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-slate-600 bg-slate-100/70 px-2.5 py-1.5 rounded-full border border-slate-200/60 shadow-sm whitespace-nowrap">
              <span className="opacity-70 hidden xs:inline text-xs">📢</span>
              <a href="https://t.me/JozveIAU" target="_blank" rel="noreferrer" className="hover:text-blue-600 flex items-center gap-0.5">
                <TelegramIcon className="w-3 h-3" /> <span className="hidden xs:inline">جزوه</span><span className="xs:hidden">جزوه</span>
              </a>
              <span className="text-slate-300">|</span>
              <a href="https://t.me/IAUCourseExp" target="_blank" rel="noreferrer" className="hover:text-blue-600 flex items-center gap-0.5">
                <TelegramIcon className="w-3 h-3" /> <span className="hidden xs:inline">تجربیات</span><span className="xs:hidden">تجربیات</span>
              </a>
            </div>

            <div className="flex items-center gap-1.5">
              <a
                href="https://iaucourseexp.github.io/CoursesCodes/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 md:px-3 md:py-2 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-700 hover:bg-violet-500/20 hover:border-violet-500/50 transition-all text-[11px] md:text-sm font-bold whitespace-nowrap shadow-sm"
                title="ابزار جستجو و دریافت کدهای دروس"
              >
                <span className="text-sm">🔢</span>
                <span className="hidden sm:inline">کد دروس</span>
                <span className="sm:hidden">کد دروس</span>
              </a>

              <a
                href={`${import.meta.env.BASE_URL}data.csv`}
                download={`لیست_دروس_${LAST_UPDATE.replace(/ /g, '_')}.csv`}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 md:px-3 md:py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all text-[11px] md:text-sm font-bold whitespace-nowrap shadow-sm"
              >
                <span className="text-sm">📥</span>
                <span className="hidden xs:inline">دانلود</span>
              </a>
            </div>
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
                <span className="whitespace-nowrap text-sm sm:text-lg bg-blue-50/80 px-2 py-1 rounded-full border border-blue-100/60">
                  <span className="font-black text-blue-700">{filteredData.length.toLocaleString('fa-IR')}</span>
                  <span className="text-slate-500 mx-1">از</span>
                  <span className="font-bold text-slate-600">{masterCount.toLocaleString('fa-IR')}</span>
                </span>
                
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowBookmarksOnly(prev => !prev)}
                    className={`text-sm font-bold whitespace-nowrap px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full transition-all ${
                      showBookmarksOnly
                        ? 'bg-amber-100 text-amber-700 border border-amber-300'
                        : 'text-amber-600 hover:bg-amber-50'
                    }`}
                    title={showBookmarksOnly ? 'نمایش همه‌ی دروس' : 'نمایش فقط دروس نشانه‌گذاری‌شده'}
                  >
                    ❤️ {bookmarks.length.toLocaleString('fa-IR')}
                  </button>

                  {showBookmarksOnly && bookmarks.length > 0 && (
                    <button
                      onClick={handleShare}
                      className="text-[11px] sm:text-sm font-bold whitespace-nowrap px-3 py-2 min-h-[44px] flex items-center justify-center gap-1.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200 transition-all shadow-sm animate-fade-in-up"
                      title="اشتراک‌گذاری این برنامه درسی با دیگران"
                    >
                      🔗 <span className="hidden xs:inline">اشتراک</span>
                    </button>
                  )}
                </div>

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
                    className="inline-flex items-center gap-1 bg-blue-100/80 text-blue-700 border border-blue-200/80 rounded-full px-3 py-2 min-h-[44px] font-medium hover:bg-blue-200/80 transition-colors max-w-[160px] whitespace-nowrap text-sm"
                  >
                    <span className="font-bold">{col}:</span>
                    <span className="truncate">
                      {vals.length === 1 ? vals[0] : `${vals.length.toLocaleString('fa-IR')} مقدار`}
                    </span>
                    <span className="text-blue-400 text-base">✕</span>
                  </button>
                ))}

                <div className="flex items-center gap-1">
                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="text-red-500 hover:text-red-600 font-bold transition-colors text-sm whitespace-nowrap px-2 py-2 min-h-[44px]"
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
                    data={filteredData}
                    columns={visibleColumns}
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
                    bookmarks={bookmarks}
                    onToggleBookmark={toggleBookmark}
                    getRowKey={getRowKey}
                  />
                  {filteredData.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 pointer-events-none">
                      <span className="text-5xl">{showBookmarksOnly ? '❤️' : '🔍'}</span>
                      <p className="text-sm font-bold">
                        {showBookmarksOnly
                          ? 'هیچ درسی نشانه‌گذاری نشده است'
                          : 'موردی مطابق جستجو یا فیلترها یافت نشد'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-slate-800/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in-up border border-slate-700 w-max max-w-[90vw]">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-sm">✓</span>
          <span className="text-xs sm:text-sm font-medium text-right" dir="rtl">{toastMessage}</span>
        </div>
      )}

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
