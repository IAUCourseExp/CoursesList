import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import VirtualTable from './components/VirtualTable.jsx';
import FilterSheet from './components/FilterSheet.jsx';
import FacetPanel from './components/FacetPanel.jsx';
import ColumnPicker from './components/ColumnPicker.jsx';
import HelpPanel from './components/HelpPanel.jsx';
import TourGuide from './components/TourGuide.jsx';
import WeeklyTimetable from './components/WeeklyTimetable.jsx';
import ExamTimeline from './components/ExamTimeline.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import CompareModal from './components/CompareModal.jsx';
import CourseDetailModal from './components/CourseDetailModal.jsx';
import { Chip, FilterChip, Segmented, SkeletonRows, Toast } from './components/Bits.jsx';
import {
  CloseIcon, ColumnsIcon, DownloadIcon, FilterIcon, GridIcon, HeartIcon, HelpIcon,
  ListIcon, SearchIcon, SettingsIcon, SparkIcon, TelegramIcon, AlertIcon, CheckIcon,
  CartIcon, CalendarIcon, ClockIcon, BookOpenIcon, CompassIcon,
} from './components/icons.jsx';
import { faNum, courseToText, sortLabel, rowKeyOf } from './lib/format.js';
import { labelOf, pickColumns, resolveVisibleColumns, QUICK_FILTER_COLUMNS, isPhantom } from './lib/columns.js';
import { detectConflicts, calculateUnits, generateIcsCalendar } from './lib/conflicts.js';
import { useDebounced, useIsMobile, useOnMount } from './lib/hooks.js';
import {
  readJson, writeJson, readString, writeString, hasSeenTour,
  CACHE_KEY, WIDTHS_KEY, BOOKMARKS_KEY, DENSITY_KEY, COLUMNS_KEY, HINT_KEY,
} from './lib/storage.js';

const LAST_UPDATE = import.meta.env.VITE_BUILD_TIME || 'تاریخ نامشخص';
const CSV_URL = import.meta.env.BASE_URL + 'data.csv';
const DOWNLOAD_NAME = `لیست_دروس_${LAST_UPDATE.replace(/ /g, '_')}.csv`;

const DENSITY_OPTIONS = [
  { id: 'compact', label: 'فشرده', icon: <ListIcon className="size-3.5" /> },
  { id: 'comfortable', label: 'معمولی', icon: <ListIcon className="size-3.5" /> },
  { id: 'spacious', label: 'راحت', icon: <GridIcon className="size-3.5" /> },
];

/* URL <-> state */
const getInitialStateFromURL = () => {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') || '';
  const sortCol = params.get('sort') || null;
  const sortDir = params.get('dir') || 'asc';

  let filters = {};
  try {
    const f = params.get('f');
    if (f) {
      filters = JSON.parse(decodeURIComponent(f));
      Object.keys(filters).forEach((key) => {
        if (!Array.isArray(filters[key])) filters[key] = [filters[key]];
      });
    }
  } catch {
    filters = {};
  }

  let sharedBookmarks = null;
  try {
    const b = params.get('b');
    if (b) sharedBookmarks = b.split('||').map(decodeURIComponent);
  } catch {
    sharedBookmarks = null;
  }

  return {
    q,
    sortConfig: sortCol ? { column: sortCol, direction: sortDir } : { column: null, direction: 'asc' },
    filters,
    sharedBookmarks,
  };
};

function App() {
  const isMobile = useIsMobile();
  const [initialCache] = useState(() => readJson(CACHE_KEY));
  const [initState] = useState(() => getInitialStateFromURL());

  const [data, setData] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [allColumns, setAllColumns] = useState([]);
  const [masterCount, setMasterCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [status, setStatus] = useState(() => (initialCache?.csv ? 'checking' : 'idle'));

  const [searchTerm, setSearchTerm] = useState(initState.q);
  const [sortConfig, setSortConfig] = useState(initState.sortConfig);
  const [filters, setFilters] = useState(initState.filters);
  const [dataVersion, setDataVersion] = useState(0);

  // Active top-level view: 'table' | 'weekly' | 'exams'
  const [activeTab, setActiveTab] = useState('table');
  const [cartOpen, setCartOpen] = useState(false);
  const [comparingCourse, setComparingCourse] = useState(null);

  const [facets, setFacets] = useState({});
  const [facetsLoading, setFacetsLoading] = useState(null);
  const [openQuickFacet, setOpenQuickFacet] = useState(null);

  const [colWidths, setColWidths] = useState(() => readJson(WIDTHS_KEY) || {});
  const [selectedColumns, setSelectedColumns] = useState(() => readJson(COLUMNS_KEY));
  const [density, setDensity] = useState(() => readString(DENSITY_KEY) || 'comfortable');

  const [bookmarks, setBookmarks] = useState(() => {
    if (initState.sharedBookmarks) {
      writeJson(BOOKMARKS_KEY, initState.sharedBookmarks);
      return initState.sharedBookmarks;
    }
    return readJson(BOOKMARKS_KEY) || [];
  });
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(!!initState.sharedBookmarks);

  const [toastMessage, setToastMessage] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(() => !hasSeenTour());
  const [showHint, setShowHint] = useState(() => !readString(HINT_KEY));
  const [detailCourse, setDetailCourse] = useState(null);

  const workerRef = useRef(null);
  const widthsRef = useRef(colWidths);
  const searchRef = useRef(null);
  const facetsRef = useRef({});
  const inFlightFacets = useRef(new Set());

  const debouncedTerm = useDebounced(searchTerm, 300);
  const notify = useCallback((msg) => setToastMessage(msg), []);

  /* Worker setup */
  useEffect(() => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

      if (type === 'DATA_LOADED') {
        const fullRows = payload.data || [];
        setData(fullRows);
        setMasterData(fullRows);
        setAllColumns(payload.columns || []);
        setMasterCount(fullRows.length);
        setIsLoading(false);
        setLoadError(null);
        setDataVersion((v) => v + 1);
        if (payload.csvText) writeJson(CACHE_KEY, { csv: payload.csvText, savedAt: Date.now() });

        if (payload.source === 'cache') setStatus('checking');
        else if (payload.changed) {
          setStatus('updated');
          setTimeout(() => setStatus((s) => (s === 'updated' ? 'uptodate' : s)), 4000);
        } else setStatus('uptodate');
      } else if (type === 'STATUS') {
        if (payload.fresh) setStatus('uptodate');
      } else if (type === 'QUERY_RESULTS') {
        setData(payload.rows || []);
        setIsLoading(false);
      } else if (type === 'FACETS_RESULT') {
        inFlightFacets.current.delete(payload.column);
        setFacets((prev) => {
          const next = { ...prev, [payload.column]: payload.values };
          facetsRef.current = next;
          return next;
        });
        setFacetsLoading((current) => (current === payload.column ? null : current));
      } else if (type === 'ERROR') {
        setIsLoading(false);
        setData((current) => {
          if (current.length > 0) {
            setStatus('offline');
            notify('اتصال برقرار نشد؛ نسخهٔ ذخیره‌شدهٔ همین دستگاه نمایش داده می‌شود.');
            return current;
          }
          setLoadError(payload.message);
          return current;
        });
      }
    };

    worker.postMessage({
      type: 'INIT',
      payload: { url: CSV_URL, cachedText: initialCache?.csv || null },
    });

    return () => {
      worker.onmessage = null;
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || dataVersion === 0) return;
    worker.postMessage({
      type: 'QUERY',
      payload: { search: debouncedTerm, filters, sort: sortConfig },
    });
  }, [debouncedTerm, filters, sortConfig, dataVersion]);

  /* URL sync */
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedTerm.trim()) params.set('q', debouncedTerm.trim());
    if (sortConfig.column) {
      params.set('sort', sortConfig.column);
      params.set('dir', sortConfig.direction);
    }
    if (Object.keys(filters).length) params.set('f', JSON.stringify(filters));
    const url = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
    window.history.replaceState({ view: true }, '', url);
  }, [debouncedTerm, filters, sortConfig]);

  useEffect(() => {
    const onPopState = () => {
      const s = getInitialStateFromURL();
      setSearchTerm(s.q);
      setSortConfig(s.sortConfig);
      setFilters(s.filters);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /* Keyboard shortcuts */
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && typing && document.activeElement === searchRef.current) {
        setSearchTerm('');
      } else if (e.key.toLowerCase() === 'b' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowBookmarksOnly((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* Dismiss toolbar popovers */
  useEffect(() => {
    if (!openQuickFacet) return undefined;
    const onDown = (e) => {
      if (!e.target.closest?.('[data-facet-panel],[data-facet-toggle],[data-columns-toggle]')) {
        setOpenQuickFacet(null);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpenQuickFacet(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openQuickFacet]);

  /* Derived data */
  const visibleColumns = useMemo(
    () => resolveVisibleColumns(allColumns, selectedColumns),
    [allColumns, selectedColumns]
  );
  const realColumns = useMemo(() => allColumns.filter((c) => !isPhantom(c)), [allColumns]);

  const bookmarkSet = useMemo(() => new Set(bookmarks), [bookmarks]);

  // Master bookmarked courses collection (independent of current table search query)
  const bookmarkedCourses = useMemo(() => {
    if (!masterData.length || !bookmarks.length) return [];
    return masterData.filter((r) => bookmarkSet.has(rowKeyOf(r)));
  }, [masterData, bookmarks, bookmarkSet]);

  // Real-time conflict analysis and unit calculations
  const conflictData = useMemo(() => detectConflicts(bookmarkedCourses), [bookmarkedCourses]);
  const unitSummary = useMemo(() => calculateUnits(bookmarkedCourses), [bookmarkedCourses]);

  const filteredData = useMemo(
    () => (showBookmarksOnly ? data.filter((row) => bookmarkSet.has(rowKeyOf(row))) : data),
    [data, showBookmarksOnly, bookmarkSet]
  );

  const bookmarkRowCount = useMemo(
    () => data.reduce((acc, row) => acc + (bookmarkSet.has(rowKeyOf(row)) ? 1 : 0), 0),
    [data, bookmarkSet]
  );

  const activeFilters = useMemo(
    () => Object.entries(filters).filter(([, v]) => Array.isArray(v) && v.length > 0),
    [filters]
  );
  const hasActiveFilters = activeFilters.length > 0;
  const hasCustomWidths = Object.keys(colWidths).length > 0;
  const quickColumns = useMemo(() => pickColumns(allColumns, QUICK_FILTER_COLUMNS), [allColumns]);

  /* Handlers */
  const handleSort = useCallback((column) => {
    setSortConfig((prev) => {
      if (typeof column === 'object') return column;
      if (prev.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return { column: null, direction: 'asc' };
    });
  }, []);

  const handleFilterChange = useCallback((col, values) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!values || values.length === 0) delete next[col];
      else next[col] = values;
      return next;
    });
  }, []);

  const ensureFacets = useCallback((col) => {
    if (!col) return;
    if (facetsRef.current[col]) return;
    setFacetsLoading(col);
    if (!inFlightFacets.current.has(col)) {
      inFlightFacets.current.add(col);
      workerRef.current?.postMessage({ type: 'FACETS', payload: { column: col } });
    }
  }, []);

  useEffect(() => {
    if (dataVersion === 0) return;
    for (const col of pickColumns(allColumns, QUICK_FILTER_COLUMNS)) {
      if (!facetsRef.current[col] && !inFlightFacets.current.has(col)) {
        inFlightFacets.current.add(col);
        workerRef.current?.postMessage({ type: 'FACETS', payload: { column: col } });
      }
    }
  }, [dataVersion, allColumns]);

  const clearAllFilters = useCallback(() => setFilters({}), []);
  const clearEverything = useCallback(() => {
    setFilters({});
    setSearchTerm('');
    setShowBookmarksOnly(false);
  }, []);

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
  const resetAllWidths = useCallback(() => {
    widthsRef.current = {};
    setColWidths({});
    writeJson(WIDTHS_KEY, {});
  }, []);

  const handleColumnsChange = useCallback((cols) => {
    setSelectedColumns(cols);
    writeJson(COLUMNS_KEY, cols);
  }, []);

  const resetColumns = useCallback(() => {
    setSelectedColumns(null);
    writeJson(COLUMNS_KEY, null);
  }, []);

  const handleDensity = useCallback((d) => {
    setDensity(d);
    writeString(DENSITY_KEY, d);
  }, []);

  const toggleBookmark = useCallback((rowKey) => {
    setBookmarks((prev) => {
      const next = prev.includes(rowKey)
        ? prev.filter((id) => id !== rowKey)
        : [...prev, rowKey];
      writeJson(BOOKMARKS_KEY, next);
      return next;
    });
  }, []);

  const handleClearAllBookmarks = useCallback(() => {
    setBookmarks([]);
    writeJson(BOOKMARKS_KEY, []);
    notify('تمام دروس نشانه‌گذاری‌شده پاک شدند.');
  }, [notify]);

  const handleCopy = useCallback(async (row) => {
    const text = courseToText(row);
    try {
      await navigator.clipboard.writeText(text);
      notify('اطلاعات درس کپی شد 📋');
    } catch {
      notify('مرورگر اجازهٔ کپی نداد؛ متن درس در کنسول چاپ شد.');
      console.info(text);
    }
  }, [notify]);

  const handleShare = useCallback(async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?b=${bookmarks.map(encodeURIComponent).join('||')}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      notify('لینک برنامهٔ درسی کپی شد؛ برای دوستانت بفرست 🔗');
    } catch {
      window.prompt('مرورگر از کپی خودکار پشتیبانی نکرد. این لینک را کپی کن:', shareUrl);
    }
  }, [bookmarks, notify]);

  const handleExportIcs = useCallback(() => {
    if (bookmarkedCourses.length === 0) {
      notify('ابتدا دروسی را به سبد نشانه‌گذاری اضافه کنید.');
      return;
    }
    const icsContent = generateIcsCalendar(bookmarkedCourses);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `barnameh_daneshgah_shiraz_${LAST_UPDATE.replace(/ /g, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    notify('فایل تقویم (.ics) با موفقیت دانلود شد.');
  }, [bookmarkedCourses, notify]);

  const toggleBookmarksOnly = useCallback(() => setShowBookmarksOnly((v) => !v), []);

  useOnMount(() => {
    if (!readString(HINT_KEY)) setShowHint(true);
  });

  const dismissHint = useCallback(() => {
    setShowHint(false);
    writeString(HINT_KEY, '1');
  }, []);

  const statusBadge = {
    checking: { text: 'بررسی بروزرسانی…', cls: 'text-blue-600 bg-blue-50 border-blue-200' },
    updated: { text: 'بروزرسانی شد', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    uptodate: { text: 'بروز است', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    offline: { text: 'آفلاین - نسخهٔ ذخیره‌شده', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
    idle: null,
  }[status];

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-blue-50/40">
      {/* ── Ambient Gemini-style Mesh Gradient Canvas ───────────────────────── */}
      <div className="gemini-ambient-canvas" aria-hidden="true" />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="relative z-30 flex-none border-b border-slate-200/70 bg-white/90 px-3 py-2 backdrop-blur-xl md:px-5">
        {/* Desktop Single-Row Header (lg and above) */}
        <div className="hidden lg:flex mx-auto w-full max-w-[110rem] items-center gap-2 lg:gap-3">
          <div className="premium-nav-matrix shrink-0 overflow-hidden">
            <div className="matrix-bg-rain" aria-hidden="true">
              0101001011010101001010100111010101010100101101010100101010011101
              1010101100101010110101011001010101101010110010101011010101100101
              0111010100101010010110100111010100101010010110100111010100101010
            </div>
            <h1 data-text="لیست دروس دانشگاه آزاد شیراز" className="whitespace-nowrap font-black text-xs sm:text-sm md:text-base">
              لیست دروس دانشگاه آزاد شیراز
            </h1>
          </div>

          <span className="hidden shrink-0 items-center gap-1 rounded-full border border-blue-200/70 bg-blue-50/90 px-2.5 py-1 text-[11px] font-extrabold text-blue-700 xl:inline-flex">
            <span className="opacity-70">🔄</span> {LAST_UPDATE}
          </span>

          {/* View Mode Navigation Tabs */}
          <nav className="flex shrink-0 items-center gap-1 rounded-2xl bg-slate-100/90 p-1 ms-1 sm:ms-2" aria-label="انتخاب نمای برنامه">
            <button
              type="button"
              onClick={() => setActiveTab('table')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-black transition-all ${
                activeTab === 'table'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListIcon className="size-3.5" />
              <span>جدول دروس</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('weekly')}
              className={`relative inline-flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-black transition-all ${
                activeTab === 'weekly'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="size-3.5" />
              <span>برنامه هفتگی</span>
              {bookmarkedCourses.length > 0 && (
                <span className="rounded-full bg-blue-100 px-1.5 text-[10px] text-blue-800">
                  {faNum(bookmarkedCourses.length)}
                </span>
              )}
              {conflictData.hasConflicts && (
                <span className="size-2 rounded-full bg-rose-500 animate-ping" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('exams')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-black transition-all ${
                activeTab === 'exams'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClockIcon className="size-3.5" />
              <span className="hidden sm:inline">روزشمار امتحانات</span>
              <span className="sm:hidden">امتحانات</span>
            </button>
          </nav>

          <div className="flex flex-1 items-center justify-end gap-1.5">
            {/* Cart Assistant Button */}
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              title="مشاهده سبد انتخاب واحد و محاسبات"
              className={`relative shrink-0 whitespace-nowrap inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 text-xs font-black transition-all ${
                conflictData.hasConflicts
                  ? 'border-rose-300 bg-rose-50 text-rose-800 shadow-sm shadow-rose-200'
                  : bookmarkedCourses.length > 0
                  ? 'border-blue-300 bg-blue-50 text-blue-800 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <CartIcon className="size-4" />
              <span className="hidden md:inline">سبد انتخاب واحد</span>
              {bookmarkedCourses.length > 0 && (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10.5px] font-black text-white">
                  {faNum(unitSummary.totalUnits)} واحد
                </span>
              )}
              {conflictData.hasConflicts && (
                <span className="size-2 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </button>

            {/* Website IAU Experiences */}
            <a
              href="https://iaucourseexp.github.io/iau-experiences/"
              target="_blank"
              rel="noreferrer"
              title="وبسایت تجارب اساتید دانشگاه آزاد شیراز"
              className="hidden shrink-0 whitespace-nowrap min-h-10 items-center gap-1.5 rounded-xl border border-emerald-200/90 bg-emerald-50/70 px-2.5 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100/90 2xl:inline-flex"
            >
              <span>🌐 وبسایت تجارب</span>
            </a>

            {/* Telegram 1: Exp */}
            <a
              href="https://t.me/IAUCourseExp"
              target="_blank"
              rel="noreferrer"
              title="کانال تلگرام تجربیات اساتید دانشگاه آزاد شیراز (@IAUCourseExp)"
              className="hidden shrink-0 whitespace-nowrap min-h-10 items-center gap-1.5 rounded-xl border border-sky-200/90 bg-sky-50/70 px-2.5 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-100/90 xl:inline-flex"
            >
              <TelegramIcon className="size-4 text-[#229ED9]" />
              <span>کانال تجربیات</span>
            </a>

            {/* Telegram 2: Jozve */}
            <a
              href="https://t.me/jozveiau"
              target="_blank"
              rel="noreferrer"
              title="کانال تلگرام جزوه و نمونه‌سوالات دانشگاه آزاد شیراز (@jozveiau)"
              className="hidden shrink-0 whitespace-nowrap min-h-10 items-center gap-1.5 rounded-xl border border-indigo-200/90 bg-indigo-50/70 px-2.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100/90 xl:inline-flex"
            >
              <BookOpenIcon className="size-4 text-indigo-600" />
              <span>کانال جزوه</span>
            </a>

            {/* Courses Codes Button */}
            <a
              href="https://iaucourseexp.github.io/CoursesCodes/"
              target="_blank"
              rel="noreferrer"
              title="سامانه و جدول کدهای دروس"
              className="hidden shrink-0 whitespace-nowrap min-h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-2.5 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-100 2xl:inline-flex"
            >
              <span>🔢 کد دروس</span>
            </a>

            {/* Download CSV Button */}
            <a
              href={CSV_URL}
              download={DOWNLOAD_NAME}
              title="دانلود فایل CSV کامل دروس"
              className="hidden shrink-0 whitespace-nowrap min-h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 lg:inline-flex"
            >
              <DownloadIcon className="size-4" />
              <span>CSV</span>
            </a>

            {/* Tour Guide Button */}
            <button
              type="button"
              data-tour-btn
              onClick={() => setTourOpen(true)}
              title="تور راهنمای استفاده از سامانه"
              className="hidden shrink-0 size-10 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 lg:grid"
            >
              <CompassIcon className="size-4.5" />
            </button>

            {/* Help Button */}
            <button
              type="button"
              data-help-btn
              onClick={() => setHelpOpen(true)}
              title="راهنمای جامع مقررات و ابزارها"
              className="hidden shrink-0 size-10 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 lg:grid"
            >
              <HelpIcon className="size-4.5" />
            </button>
          </div>
        </div>

        {/* Mobile & Tablet Header (< lg: 2 clean, immune rows without any horizontal overflow) */}
        <div className="flex flex-col gap-2 lg:hidden">
          {/* Mobile Row 1: Brand & Action Rail */}
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <div className="premium-nav-matrix shrink-0 overflow-hidden px-2 py-1">
              <div className="matrix-bg-rain" aria-hidden="true">
                0101001011010101001010100111010101010100101101010100101010011101
              </div>
              <h1 data-text="دانشگاه آزاد شیراز" className="whitespace-nowrap font-black text-[11px] min-[360px]:text-xs sm:text-sm">
                <span className="hidden min-[380px]:inline">لیست دروس </span>دانشگاه آزاد شیراز
              </h1>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Cart Button */}
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                title="مشاهده سبد انتخاب واحد و محاسبات"
                className={`relative inline-flex min-h-9 items-center gap-1 rounded-xl border px-2 sm:px-2.5 text-xs font-black transition-all ${
                  conflictData.hasConflicts
                    ? 'border-rose-300 bg-rose-50 text-rose-800 shadow-xs'
                    : bookmarkedCourses.length > 0
                    ? 'border-blue-300 bg-blue-50 text-blue-800 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <CartIcon className="size-3.5" />
                <span className="hidden min-[340px]:inline">سبد</span>
                {bookmarkedCourses.length > 0 && (
                  <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9.5px] font-black text-white tabular-nums">
                    {faNum(unitSummary.totalUnits)}
                  </span>
                )}
                {conflictData.hasConflicts && (
                  <span className="size-1.5 rounded-full bg-rose-500 animate-ping" />
                )}
              </button>

              {/* Filter Sheet Button */}
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-label="فیلترها و تنظیمات"
                className="relative grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100"
              >
                <SettingsIcon className="size-4" />
                {(hasActiveFilters || showBookmarksOnly) && (
                  <span className="absolute -end-1 -top-1 size-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
                )}
              </button>

              {/* Help Button */}
              <button
                type="button"
                data-help-btn
                onClick={() => setHelpOpen(true)}
                title="راهنمای جامع مقررات و ابزارها"
                className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600"
              >
                <HelpIcon className="size-4" />
              </button>
            </div>
          </div>

          {/* Mobile Row 2: Balanced 3-Way Segmented Navigation */}
          <nav className="grid grid-cols-3 w-full gap-1 rounded-xl bg-slate-100/90 p-1" aria-label="انتخاب نمای برنامه">
            <button
              type="button"
              onClick={() => setActiveTab('table')}
              className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-black transition-all ${
                activeTab === 'table'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListIcon className="size-3.5" />
              <span>جدول دروس</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('weekly')}
              className={`relative inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-black transition-all ${
                activeTab === 'weekly'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="size-3.5" />
              <span>برنامه هفتگی</span>
              {bookmarkedCourses.length > 0 && (
                <span className="rounded-full bg-blue-100 px-1 text-[10px] font-bold text-blue-800 tabular-nums">
                  {faNum(bookmarkedCourses.length)}
                </span>
              )}
              {conflictData.hasConflicts && (
                <span className="size-1.5 rounded-full bg-rose-500 animate-ping" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('exams')}
              className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-black transition-all ${
                activeTab === 'exams'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClockIcon className="size-3.5" />
              <span>امتحانات</span>
            </button>
          </nav>
        </div>
      </header>

      {/* ── Main Workspace ─────────────────────────────────────────────────── */}
      <main className="min-h-0 w-full flex-1 px-2 pt-2 md:px-4 md:pt-3">
        <div className="flex h-full min-h-0 w-full flex-col">
          <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-xl shadow-slate-300/30 backdrop-blur-sm md:rounded-3xl">

            {/* View: Table View */}
            {activeTab === 'table' && (
              <>
                {/* Toolbar: z-40 so popovers NEVER go under table header */}
                <div className="relative z-40 flex flex-none flex-col gap-2 border-b border-slate-200/80 bg-white/95 px-2.5 py-2 backdrop-blur-sm md:px-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[9rem] flex-1 md:max-w-sm">
                      <SearchIcon className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={searchRef}
                        id="search-courses"
                        type="search"
                        inputMode="search"
                        placeholder="جستجوی درس، استاد، کد درس…"
                        aria-label="جستجوی دروس"
                        className="w-full rounded-xl border border-slate-200 bg-slate-100/80 py-2 pe-9 ps-9 text-[13.5px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      {searchTerm && (
                        <button type="button" onClick={() => setSearchTerm('')} aria-label="پاک کردن جستجو"
                          className="absolute start-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-slate-300/70 text-slate-600 transition-colors hover:bg-slate-400 hover:text-white">
                          <CloseIcon className="size-3.5" />
                        </button>
                      )}
                    </div>

                    <p className="whitespace-nowrap rounded-full border border-blue-100/70 bg-blue-50/80 px-2.5 py-1 text-[12px] font-bold text-slate-600"
                      aria-live="polite" aria-atomic="true">
                      <span className="font-black text-blue-700">{faNum(filteredData.length)}</span>
                      <span className="mx-1 text-slate-400">از</span>
                      <span className="text-slate-600">{faNum(masterCount)}</span>
                      <span className="ms-1 text-slate-400">درس</span>
                    </p>

                    {statusBadge && (
                      <span className={`hidden items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold sm:inline-flex ${statusBadge.cls}`}>
                        {status === 'checking' && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
                        {statusBadge.text}
                      </span>
                    )}

                    <div className="flex flex-1 items-center justify-end gap-1.5">
                      <Chip tone="amber" active={showBookmarksOnly} onClick={toggleBookmarksOnly}
                        title="نمایش فقط دروس نشانه‌گذاری‌شده (Ctrl+B)">
                        <HeartIcon filled={showBookmarksOnly} className="size-3.5" />
                        {bookmarkRowCount > 0 && faNum(bookmarkRowCount)}
                      </Chip>

                      {!isMobile && (
                        <>
                          <Segmented options={DENSITY_OPTIONS} value={density} onChange={handleDensity} label="تراکم جدول" />

                          {/* Column Visibility Menu */}
                          <div className="relative">
                            <button type="button" data-columns-toggle
                              onClick={() => setOpenQuickFacet(openQuickFacet === '__columns' ? null : '__columns')}
                              aria-expanded={openQuickFacet === '__columns'}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[12px] font-bold text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700">
                              <ColumnsIcon className="size-4" />
                              ستون‌ها
                              <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">{faNum(visibleColumns.length)}</span>
                            </button>

                            {openQuickFacet === '__columns' && (
                              <>
                                <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setOpenQuickFacet(null)} />
                                <div data-facet-panel onClick={(e) => e.stopPropagation()}
                                  className="absolute end-0 top-full z-50 mt-1.5 w-[21rem] max-w-[calc(100vw-1rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/20 animate-pop-in">
                                  <ColumnPicker allColumns={realColumns} visible={visibleColumns}
                                    onChange={handleColumnsChange} onReset={resetColumns} />
                                </div>
                              </>
                            )}
                          </div>

                          {hasCustomWidths && (
                            <button type="button" onClick={resetAllWidths} title="بازگرداندن عرض ستون‌ها به پیش‌فرض"
                              className="min-h-9 rounded-xl px-2 text-[11.5px] font-bold text-rose-500 transition-colors hover:bg-rose-50">
                              ↺ عرض
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick Filters and Active Chips */}
                  <div className="relative">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar">
                      {!isMobile && quickColumns.map((col) => {
                        const selected = filters[col] || [];
                        const isOpen = openQuickFacet === col;
                        return (
                          <button
                            key={col}
                            type="button"
                            data-facet-toggle
                            onClick={() => {
                              setOpenQuickFacet(isOpen ? null : col);
                              ensureFacets(col);
                            }}
                            aria-expanded={isOpen}
                            className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-bold transition-colors ${
                              selected.length
                                ? 'border-blue-500 bg-blue-600 text-white'
                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:text-blue-700'
                            }`}
                          >
                            <FilterIcon className="size-3.5" />
                            {labelOf(col)}
                            {selected.length > 0 && (
                              <span className="rounded-full bg-white/25 px-1.5 text-[10.5px]">{faNum(selected.length)}</span>
                            )}
                          </button>
                        );
                      })}

                      {activeFilters.map(([col, values]) => (
                        <FilterChip key={col} label={labelOf(col)} value={values[0] === '(خالی)' ? 'خالی' : values[0]}
                          count={values.length} onRemove={() => handleFilterChange(col, null)} />
                      ))}

                      {hasActiveFilters && (
                        <button type="button" onClick={clearAllFilters}
                          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-bold text-rose-600 transition-colors hover:bg-rose-50">
                          <CloseIcon className="size-3.5" /> حذف همهٔ فیلترها
                        </button>
                      )}

                      {!hasActiveFilters && !hasCustomWidths && (
                        <span className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap px-1 text-[11.5px] text-slate-400 md:inline-flex">
                          <SparkIcon className="size-3.5" />
                          فیلترها را از قیف هر ستون یا چیپ‌های بالا انتخاب کنید
                        </span>
                      )}
                    </div>

                    {/* Dedicated outside popover layer for quick facet filter (NEVER clipped) */}
                    {openQuickFacet && openQuickFacet !== '__columns' && (
                      <>
                        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setOpenQuickFacet(null)} />
                        <div
                          data-facet-panel
                          onClick={(e) => e.stopPropagation()}
                          className="absolute start-0 top-full z-50 mt-1.5 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 animate-pop-in"
                        >
                          <FacetPanel
                            column={openQuickFacet}
                            values={facets[openQuickFacet] || []}
                            loading={facetsLoading === openQuickFacet}
                            selected={filters[openQuickFacet] || []}
                            onClose={() => setOpenQuickFacet(null)}
                            onClear={() => handleFilterChange(openQuickFacet, null)}
                            onToggle={(v) => {
                              const selected = filters[openQuickFacet] || [];
                              const next = selected.includes(v)
                                ? selected.filter((x) => x !== v)
                                : [...selected, v];
                              handleFilterChange(openQuickFacet, next.length ? next : null);
                            }}
                            variant="inline"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {showHint && (
                    <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-[12px] text-blue-800">
                      <SparkIcon className="size-4 shrink-0" />
                      <p className="flex-1 leading-relaxed">
                        {isMobile ? (
                          <>جستجو «ی/ي» و «ک/ك» و اعداد فارسی/انگلیسی را یکسان می‌بیند. برای برنامه هفتگی و روزشمار، تب بالای صفحه را تغییر دهید.</>
                        ) : (
                          <>جستجو «ی/ي» و «ک/ك» و اعداد فارسی را یکسان می‌شناسد. تمام ردیف‌ها و ستون‌ها برای خوانایی سریع وسط‌چین شده‌اند. برای مشاهده برنامه هفتگی روی تب «برنامه هفتگی» بالا کلیک کنید.</>
                        )}
                      </p>
                      <button type="button" onClick={() => setHelpOpen(true)}
                        className="hidden shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-bold text-blue-700 underline-offset-2 hover:underline sm:block">
                        راهنما
                      </button>
                      <button type="button" onClick={dismissHint} aria-label="بستن راهنمای اولیه"
                        className="grid size-7 shrink-0 place-items-center rounded-lg text-blue-500 transition-colors hover:bg-blue-100">
                        <CloseIcon className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Table Data View */}
                <div className="relative min-h-0 flex-1">
                  {isLoading ? (
                    <SkeletonRows isMobile={isMobile} />
                  ) : loadError ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                      <span className="text-4xl">⚠️</span>
                      <p className="text-[14px] font-extrabold text-slate-700">خطا در بارگذاری داده‌ها</p>
                      <p className="max-w-md text-[12px] leading-relaxed text-slate-500" dir="ltr">{loadError}</p>
                      <button type="button" onClick={() => window.location.reload()}
                        className="mt-1 min-h-11 rounded-xl bg-blue-600 px-5 text-[13px] font-bold text-white transition-colors hover:bg-blue-700">
                        تلاش مجدد
                      </button>
                    </div>
                  ) : (
                    <VirtualTable
                      data={filteredData}
                      columns={visibleColumns}
                      allColumns={realColumns}
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      filters={filters}
                      onFilterChange={handleFilterChange}
                      facets={facets}
                      facetsLoading={facetsLoading}
                      onEnsureFacets={ensureFacets}
                      customColWidths={colWidths}
                      onColumnWidthChange={handleColumnResize}
                      onColumnReset={(col) => handleColumnResize(col, null)}
                      onWidthsCommit={persistWidths}
                      density={density}
                      bookmarks={bookmarks}
                      onToggleBookmark={toggleBookmark}
                      onCopyRow={handleCopy}
                      onCompare={(c) => setComparingCourse(c)}
                      onOpenDetail={setDetailCourse}
                      onClearFilters={clearAllFilters}
                      onClearSearch={() => setSearchTerm('')}
                      hasSearch={!!debouncedTerm}
                      searchTerm={debouncedTerm}
                    />
                  )}
                </div>
              </>
            )}

            {/* View: Interactive Weekly Timetable */}
            {activeTab === 'weekly' && (
              <WeeklyTimetable
                courses={bookmarkedCourses}
                onRemoveCourse={toggleBookmark}
                conflictData={conflictData}
                onExportIcs={handleExportIcs}
                unitSummary={unitSummary}
                onOpenDetail={setDetailCourse}
              />
            )}

            {/* View: Exam Timeline & Countdown */}
            {activeTab === 'exams' && (
              <ExamTimeline
                courses={bookmarkedCourses}
                onRemoveCourse={toggleBookmark}
                conflictData={conflictData}
                onOpenDetail={setDetailCourse}
              />
            )}
          </div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="z-10 flex-none border-t border-slate-200/70 bg-white/70 px-3 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] text-center backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10.5px] font-medium leading-relaxed text-slate-500">
          <span className="rainbow-breath">طراحی شده برای دانشجویان دانشگاه آزاد شیراز</span>
          <span className="hidden items-center gap-1 text-slate-400 md:inline-flex">
            مرتب‌سازی: {sortLabel(sortConfig)}
          </span>
          {!isMobile && (
            <span className="hidden text-slate-400 lg:inline">
              کلید <kbd className="rounded border border-slate-300 bg-slate-100 px-1 font-sans">/</kbd> برای جستجو
            </span>
          )}
          {isMobile && (
            <button type="button" onClick={() => setSheetOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold text-blue-600 transition-colors hover:bg-blue-50">
              <SettingsIcon className="size-3.5" /> فیلترها
            </button>
          )}
        </div>
      </footer>

      {/* ── Modals & Drawers ─────────────────────────────────────────────────── */}
      {sheetOpen && (
        <FilterSheet
          onClose={() => setSheetOpen(false)}
          filters={filters}
          onFilterChange={handleFilterChange}
          sortConfig={sortConfig}
          onSort={handleSort}
          facets={facets}
          onEnsureFacets={ensureFacets}
          facetsLoading={facetsLoading}
          density={density}
          onDensityChange={handleDensity}
          allColumns={realColumns}
          visibleColumns={visibleColumns}
          onColumnsChange={handleColumnsChange}
          onColumnsReset={resetColumns}
          isMobile={isMobile}
          bookmarkCount={bookmarkRowCount}
          showBookmarksOnly={showBookmarksOnly}
          onToggleBookmarksOnly={toggleBookmarksOnly}
          onShare={handleShare}
          onHelp={() => { setSheetOpen(false); setHelpOpen(true); }}
          onTour={() => { setSheetOpen(false); setTourOpen(true); }}
          onClearAll={clearEverything}
          resultsCount={filteredData.length}
          totalCount={masterCount}
          csvUrl={CSV_URL}
          filename={DOWNLOAD_NAME}
        />
      )}

      {helpOpen && (
        <HelpPanel
          onClose={() => setHelpOpen(false)}
          onStartTour={() => setTourOpen(true)}
        />
      )}

      <TourGuide
        isOpen={tourOpen}
        onClose={() => setTourOpen(false)}
        onFinish={() => setTourOpen(false)}
      />

      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        courses={bookmarkedCourses}
        onRemoveCourse={toggleBookmark}
        onClearAll={handleClearAllBookmarks}
        unitSummary={unitSummary}
        conflictData={conflictData}
        onExportIcs={handleExportIcs}
        onNotify={notify}
        onOpenCompare={(c) => { setCartOpen(false); setComparingCourse(c); }}
      />

      {comparingCourse && (
        <CompareModal
          course={comparingCourse}
          allCourses={masterData}
          onClose={() => setComparingCourse(null)}
          onToggleBookmark={toggleBookmark}
          bookmarkSet={bookmarkSet}
        />
      )}

      {detailCourse && (
        <CourseDetailModal
          course={detailCourse}
          onClose={() => setDetailCourse(null)}
          isBookmarked={bookmarkSet.has(rowKeyOf(detailCourse))}
          onToggleBookmark={() => toggleBookmark(rowKeyOf(detailCourse))}
          onCompare={(c) => {
            setDetailCourse(null);
            setComparingCourse(c);
          }}
          onNotify={notify}
          hasConflict={conflictData?.conflictRowKeys?.has(rowKeyOf(detailCourse))}
        />
      )}

      <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
    </div>
  );
}

export default App;
