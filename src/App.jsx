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
import SharedPlanDialog from './components/SharedPlanDialog.jsx';
import SemesterConfirmDialog from './components/SemesterConfirmDialog.jsx';
import LegacyBookmarkDialog from './components/LegacyBookmarkDialog.jsx';
import { Chip, FilterChip, Segmented, SkeletonRows, Toast } from './components/Bits.jsx';
import {
  CloseIcon, ColumnsIcon, DownloadIcon, FilterIcon, GridIcon, HeartIcon, HelpIcon,
  ListIcon, SearchIcon, SettingsIcon, SparkIcon, TelegramIcon, AlertIcon, CheckIcon,
  CartIcon, CalendarIcon, ClockIcon, BookOpenIcon, CompassIcon,
} from './components/icons.jsx';
import { faNum, courseToText, sortLabel, rowKeyOf, reconcileLegacyKeys } from './lib/format.js';
import { sanitizeSharedKeys, computeImport, computeUndo } from './lib/shareImport.js';
import { labelOf, pickColumns, resolveVisibleColumns, QUICK_FILTER_COLUMNS, isPhantom } from './lib/columns.js';
import { detectConflicts, calculateUnits, generateIcsCalendar } from './lib/conflicts.js';
import { loadSemesterConfig } from './lib/semester.js';
import { timeSource } from './lib/timeSource.js';
import { useDebounced, useIsMobile, useOnMount } from './lib/hooks.js';
import {
  readJson, writeJson, readString, writeString, hasSeenTour,
  CACHE_KEY, WIDTHS_KEY, BOOKMARKS_KEY, DENSITY_KEY, COLUMNS_KEY, HINT_KEY,
  TAB_KEY, SEMESTER_CONFIRM_KEY, LEGACY_KEY,
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
  // Only the two supported directions are accepted (BUG-28).
  const sortDir = params.get('dir') === 'desc' ? 'desc' : 'asc';

  let filters = {};
  try {
    const f = params.get('f');
    // URLSearchParams.get() has already decoded the value exactly once, which
    // matches the params.set() write path - a second decodeURIComponent here
    // used to wipe every restored filter when a value contained '%' (BUG-09).
    if (f) {
      filters = JSON.parse(f);
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
    // searchParams.get() has already fully decoded the value; keys are split
    // on the literal '||' separator and are NOT decoded again (BUG-01: a
    // second decode would break every key containing a literal '%').
    if (b) sharedBookmarks = b.split('||');
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

/** Remove the shared-plan parameter from the address bar without touching
 *  history (BUG-01): once an import is resolved the link must not re-trigger
 *  the flow on refresh. */
const clearShareParamFromUrl = () => {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('b')) return;
    url.searchParams.delete('b');
    window.history.replaceState({ view: true }, '', `${url.pathname}${url.search}`);
  } catch {
    // URL manipulation is best-effort; state handling never depends on it.
  }
};

function App() {
  const isMobile = useIsMobile();
  const [initialCache] = useState(() => readJson(CACHE_KEY));
  const [initState] = useState(() => getInitialStateFromURL());

  const [data, setData] = useState([]);
  const [masterData, setMasterData] = useState([]);
  // False between DATA_LOADED and the first QUERY_RESULTS of that dataset:
  // raw (un-normalized) rows must never paint in between (BUG-24).
  const [rowsReady, setRowsReady] = useState(false);
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
  // The last used tab is remembered (ENH-5); invalid values fall back to the table.
  const [activeTab, setActiveTab] = useState(() => {
    const saved = readString(TAB_KEY);
    return saved === 'weekly' || saved === 'exams' ? saved : 'table';
  });
  useEffect(() => {
    writeString(TAB_KEY, activeTab);
  }, [activeTab]);
  const [cartOpen, setCartOpen] = useState(false);
  const [comparingCourse, setComparingCourse] = useState(null);

  const [facets, setFacets] = useState({});
  const [facetsLoading, setFacetsLoading] = useState(null);
  const [openFacetPanel, setOpenFacetPanel] = useState(null); // Unified: null | { column, variant: 'dropdown' | 'inline' | 'popover' }

  const [colWidths, setColWidths] = useState(() => readJson(WIDTHS_KEY) || {});
  const [selectedColumns, setSelectedColumns] = useState(() => readJson(COLUMNS_KEY));
  const [density, setDensity] = useState(() => readString(DENSITY_KEY) || 'comfortable');

  // Bookmarks start from local storage only (BUG-01): a ?b= link may never
  // touch saved data here. Shared plans are resolved by the import flow below.
  const [bookmarks, setBookmarks] = useState(() => readJson(BOOKMARKS_KEY) || []);
  const [pendingShare, setPendingShare] = useState(null); // validated shared keys awaiting a decision
  const [toastAction, setToastAction] = useState(null); // { label, onClick } rendered inside the toast
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(!!initState.sharedBookmarks);

  const [toastMessage, setToastMessage] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(() => !hasSeenTour());
  const [showHint, setShowHint] = useState(() => !readString(HINT_KEY));
  const [detailCourse, setDetailCourse] = useState(null);
  // Approximate teaching-term presets (ISSUE 1): the owner keeps editable
  // dates in public/semester.json; weekly events are only generated after the
  // user confirms or edits the window in the export dialog. Exam events, which
  // are exact, never need it.
  const [semesterConfig, setSemesterConfig] = useState(null);
  const [semesterDialogOpen, setSemesterDialogOpen] = useState(false);
  const [confirmedSemesters, setConfirmedSemesters] = useState(() => readJson(SEMESTER_CONFIRM_KEY) || {});
  useEffect(() => {
    let cancelled = false;
    loadSemesterConfig(import.meta.env.BASE_URL).then((cfg) => {
      if (!cancelled && cfg) setSemesterConfig(cfg);
    });
    return () => { cancelled = true; };
  }, []);

  // Blur search input when filter sheet opens on mobile (prevents virtual keyboard covering sheet)
  useEffect(() => {
    if (sheetOpen && searchRef.current) {
      searchRef.current.blur();
    }
  }, [sheetOpen]);

  const workerRef = useRef(null);
  const searchRef = useRef(null);
  const facetsRef = useRef({});
  const inFlightFacets = useRef(new Set());
  const requestIdRef = useRef(0);
  const updateStatusTimerRef = useRef(null);

  const debouncedTerm = useDebounced(searchTerm, 300);
  const debouncedUrlTerm = useDebounced(searchTerm, 2000); // Longer debounce for URL sync
  const notify = useCallback((msg) => setToastMessage(msg), []);

  /* Shared-plan import flow (BUG-01): a ?b= link may add, replace, or be
   * declined explicitly - it can never silently overwrite saved selections.
   * All persistence happens in these callbacks, never in state initializers,
   * so StrictMode double-invocation cannot duplicate side effects. */
  const bookmarksRef = useRef(bookmarks);
  const dataRef = useRef(data);
  const dataVersionRef = useRef(0);
  const masterDataRef = useRef(masterData);
  const undoDeltaRef = useRef(null);
  useEffect(() => {
    bookmarksRef.current = bookmarks;
    dataRef.current = data;
    dataVersionRef.current = dataVersion;
    masterDataRef.current = masterData;
  });

  const persistBookmarks = useCallback((next) => {
    const ok = writeJson(BOOKMARKS_KEY, next);
    if (!ok) notify('ذخیره‌سازی دائمی در این مرورگر ممکن نشد؛ تغییرات فقط تا پایان همین جلسه می‌ماند.');
    return ok;
  }, [notify]);

  // Legacy-key reconciliation (BUG-02 + ISSUE 2): bookmarks AND the pending
  // legacy store are re-classified on every dataset change. Resolvable keys
  // migrate automatically; ambiguous/missing ones move to the pending store
  // and open the resolution dialog once per new pending set - postponement is
  // honored via a fingerprint, so the same set never nags twice.
  const [pendingLegacy, setPendingLegacy] = useState([]);
  const [legacyDialogOpen, setLegacyDialogOpen] = useState(false);
  const [legacyFingerprint, setLegacyFingerprint] = useState('');
  const reconcileFingerprintRef = useRef('');
  useEffect(() => {
    if (masterData.length === 0) return;
    const store = readJson(LEGACY_KEY) || { keys: [], dismissed: '' };
    const combined = [...new Set([...bookmarks, ...store.keys])];
    if (combined.length === 0) {
      setPendingLegacy([]);
      return;
    }
    const fingerprint = `${masterData.length}:${combined.join('|')}`;
    if (reconcileFingerprintRef.current === fingerprint) return;
    reconcileFingerprintRef.current = fingerprint;
    const { activeKeys, pendingLegacy: pending, changed } = reconcileLegacyKeys(bookmarks, store.keys, masterData);
    if (changed) {
      reconcileFingerprintRef.current = `${masterData.length}:${activeKeys.join('|')}`;
      setBookmarks(activeKeys);
      persistBookmarks(activeKeys);
    }
    const nextFp = pending.map((u) => u.key).sort().join('|');
    if (store.keys.join('|') !== nextFp) {
      writeJson(LEGACY_KEY, { keys: pending.map((u) => u.key), dismissed: store.dismissed });
    }
    setPendingLegacy(pending);
    setLegacyFingerprint(nextFp);
    if (pending.length > 0 && store.dismissed !== nextFp) setLegacyDialogOpen(true);
    if (pending.length === 0) setLegacyDialogOpen(false);
  }, [masterData, bookmarks, persistBookmarks]);

  const handleLegacyResolve = useCallback((legacyKey, compositeKeys) => {
    const prev = bookmarksRef.current;
    const next = [...prev];
    for (const k of compositeKeys) if (!next.includes(k)) next.push(k);
    setBookmarks(next);
    persistBookmarks(next);
    const store = readJson(LEGACY_KEY) || { keys: [], dismissed: '' };
    const rest = store.keys.filter((k) => k !== legacyKey);
    writeJson(LEGACY_KEY, { keys: rest, dismissed: store.dismissed });
    setPendingLegacy((list) => list.filter((u) => u.key !== legacyKey));
    if (rest.length === 0) setLegacyDialogOpen(false);
    notify(compositeKeys.length === 1
      ? 'نشان قدیمی به‌روزرسانی و به سبد اضافه شد.'
      : `${faNum(compositeKeys.length)} گروه به سبد اضافه شد؛ نشان قدیمی تکلیف شد.`);
  }, [notify, persistBookmarks]);

  const handleLegacyRemove = useCallback((legacyKey) => {
    const store = readJson(LEGACY_KEY) || { keys: [], dismissed: '' };
    const rest = store.keys.filter((k) => k !== legacyKey);
    writeJson(LEGACY_KEY, { keys: rest, dismissed: store.dismissed });
    setPendingLegacy((list) => list.filter((u) => u.key !== legacyKey));
    if (rest.length === 0) setLegacyDialogOpen(false);
    notify('نشان قدیمی حذف شد.');
  }, [notify]);

  const handleLegacyPostpone = useCallback(() => {
    const store = readJson(LEGACY_KEY) || { keys: [], dismissed: '' };
    writeJson(LEGACY_KEY, { keys: store.keys, dismissed: legacyFingerprint });
    setLegacyDialogOpen(false);
  }, [legacyFingerprint]);

  const undoImport = useCallback(() => {
    const delta = undoDeltaRef.current;
    if (!delta) return;
    undoDeltaRef.current = null;
    setToastMessage(null);
    setToastAction(null);
    const next = computeUndo(delta, bookmarksRef.current);
    setBookmarks(next);
    persistBookmarks(next);
    notify('انتخاب‌های قبلی بازگردانی شد.');
  }, [notify, persistBookmarks]);

  const applyImport = useCallback((mode, sharedKeys) => {
    const result = computeImport(mode, bookmarksRef.current, sharedKeys);
    undoDeltaRef.current = (result.added.length > 0 || result.removed.length > 0)
      ? { added: result.added, removed: result.removed }
      : null;
    setBookmarks(result.keys);
    persistBookmarks(result.keys);
    setPendingShare(null);
    setShowBookmarksOnly(true);
    clearShareParamFromUrl();
    if (undoDeltaRef.current) {
      setToastAction({ label: 'بازگردانی انتخاب‌های قبلی', onClick: undoImport });
      notify(mode === 'replace'
        ? `برنامهٔ اشتراکی (${faNum(sharedKeys.length)} درس) جایگزین انتخاب‌های قبلی شد.`
        : `${faNum(result.added.length)} درس از برنامهٔ اشتراکی به انتخاب‌های شما اضافه شد.`);
    } else {
      notify(mode === 'replace'
        ? 'این برنامه از قبل با انتخاب‌های شما یکسان بود.'
        : 'درس‌های این لینک از قبل در فهرست شما هستند.');
    }
  }, [notify, persistBookmarks, undoImport]);

  const cancelShare = useCallback(() => {
    setPendingShare(null);
    setShowBookmarksOnly(false);
    clearShareParamFromUrl();
  }, []);

  // Decide what a shared link means exactly once per page load.
  const shareInitRef = useRef(false);
  useEffect(() => {
    if (shareInitRef.current) return;
    shareInitRef.current = true;
    const shared = sanitizeSharedKeys(initState.sharedBookmarks);
    if (!shared) {
      if (initState.sharedBookmarks) {
        clearShareParamFromUrl();
        notify('لینک برنامهٔ اشتراکی معتبر نیست.');
      }
      return;
    }
    if (bookmarksRef.current.length === 0) {
      applyImport('replace', shared);
      return;
    }
    const localSet = new Set(bookmarksRef.current);
    const identical = shared.length === localSet.size && shared.every((k) => localSet.has(k));
    if (identical) clearShareParamFromUrl();
    else setPendingShare(shared);
  }, [applyImport, notify, initState.sharedBookmarks]);

  /* Worker setup */
  useEffect(() => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

      // Every data.csv response also carries the server's Date header - feed it
      // to the trusted-clock consensus as the highest-quality free sample.
      if (payload?.timeSample) {
        const { dateHeader, t0, t1 } = payload.timeSample;
        timeSource.addHeaderSample('data.csv', dateHeader, t0, t1);
      }

      if (type === 'DATA_LOADED') {
        const fullRows = payload.data || [];
        // Keep the visible table on the normalized query pipeline (BUG-24):
        // master data is stored raw, display rows arrive via QUERY_RESULTS.
        setData([]);
        setRowsReady(false);
        setMasterData(fullRows);
        setAllColumns(payload.columns || []);
        setMasterCount(fullRows.length);
        setIsLoading(false);
        setLoadError(null);
        setDataVersion((v) => v + 1);
        if (payload.csvText) writeJson(CACHE_KEY, { csv: payload.csvText, savedAt: Date.now() });

        // Clear facets when data changes (BUG-006)
        if (payload.changed) {
          setFacets({});
          facetsRef.current = {};
        }

        if (payload.source === 'cache') setStatus('checking');
        else if (payload.changed) {
          setStatus('updated');
          updateStatusTimerRef.current = setTimeout(() => setStatus((s) => (s === 'updated' ? 'uptodate' : s)), 4000);
        } else setStatus('uptodate');
      } else if (type === 'STATUS') {
        if (payload.fresh) setStatus('uptodate');
      } else if (type === 'QUERY_RESULTS') {
        // Discard stale responses from older requests
        if (payload.stale || (payload.requestId !== undefined && payload.requestId < requestIdRef.current)) {
          return;
        }
        setData(payload.rows || []);
        setRowsReady(true);
        setIsLoading(false);
      } else if (type === 'FACETS_RESULT') {
        // Discard facet results computed against an older dataset (BUG-28),
        // mirroring the stale-query guard, without stranding the spinner.
        if (payload.dataVersion !== undefined && payload.dataVersion !== dataVersionRef.current) {
          inFlightFacets.current.delete(payload.column);
          setFacetsLoading((current) => (current === payload.column ? null : current));
          return;
        }
        inFlightFacets.current.delete(payload.column);
        setFacets((prev) => {
          const next = { ...prev, [payload.column]: payload.values };
          facetsRef.current = next;
          return next;
        });
        setFacetsLoading((current) => (current === payload.column ? null : current));
      } else if (type === 'ERROR') {
        setIsLoading(false);
        // Keep updaters pure (BUG-23): decide from the current data length
        // captured in a ref instead of calling setState inside setData.
        if (dataRef.current.length > 0) {
          setStatus('offline');
          notify('اتصال برقرار نشد؛ نسخهٔ ذخیره‌شدهٔ همین دستگاه نمایش داده می‌شود.');
        } else {
          setLoadError(payload.message);
        }
      }
    };

    worker.postMessage({
      type: 'INIT',
      payload: { url: CSV_URL, cachedText: initialCache?.csv || null },
    });

    return () => {
      clearTimeout(updateStatusTimerRef.current);
      worker.onmessage = null;
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || dataVersion === 0) return;
    const reqId = ++requestIdRef.current;
    worker.postMessage({
      type: 'QUERY',
      payload: { search: debouncedTerm, filters, sort: sortConfig, requestId: reqId, dataVersion },
    });
  }, [debouncedTerm, filters, sortConfig, dataVersion]);

  /* URL sync - search term debounced longer (2s) to avoid history pollution; filters/sort immediate */
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedUrlTerm.trim()) params.set('q', debouncedUrlTerm.trim());
    if (sortConfig.column) {
      params.set('sort', sortConfig.column);
      params.set('dir', sortConfig.direction);
    }
    if (Object.keys(filters).length) params.set('f', JSON.stringify(filters));
    const url = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
    window.history.replaceState({ view: true }, '', url);
  }, [debouncedUrlTerm, filters, sortConfig]);

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

  /* Overlay stack + keyboard shortcuts.
   * One Escape priority list for every dismissible overlay (BUG-06/BUG-10):
   * only the topmost entry closes per keypress. Share-import confirmation is
   * deliberately first so a pending ?b= decision always wins. */
  const overlayStackRef = useRef([]);
  useEffect(() => {
    overlayStackRef.current = [
      pendingShare && 'share',
      semesterDialogOpen && 'semester',
      legacyDialogOpen && 'legacy',
      detailCourse && 'detail',
      comparingCourse && 'compare',
      cartOpen && 'cart',
      sheetOpen && 'sheet',
      helpOpen && 'help',
      tourOpen && 'tour',
      openFacetPanel && 'facets',
    ].filter(Boolean);
  });

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || document.activeElement?.isContentEditable === true;
      const key = e.key.toLowerCase();

      if (e.key === 'Escape') {
        // The search box keeps its dedicated behaviour: Escape clears it.
        if (document.activeElement === searchRef.current) {
          setSearchTerm('');
          return;
        }
        const top = overlayStackRef.current[0];
        if (!top) return;
        if (top === 'share') { cancelShare(); return; }
        if (top === 'semester') { handleSemesterCancel(); return; }
        if (top === 'legacy') { handleLegacyPostpone(); return; }
        if (top === 'detail') { setDetailCourse(null); return; }
        if (top === 'compare') { setComparingCourse(null); return; }
        if (top === 'cart') { setCartOpen(false); return; }
        if (top === 'sheet') { setSheetOpen(false); return; }
        if (top === 'help') { setHelpOpen(false); return; }
        if (top === 'tour') { setTourOpen(false); return; }
        if (top === 'facets') { setOpenFacetPanel(null); return; }
        return;
      }

      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (key === 'b' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setCartOpen(true);
      } else if (key === 'b' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowBookmarksOnly((v) => !v);
      } else if (e.key === '?' && !typing) {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // The two dialog-cancel callbacks are stable useCallbacks declared later in
    // this component; Escape handling reads them at call time, not mount time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelShare]);

  /* Dismiss toolbar popovers */
  useEffect(() => {
    if (!openFacetPanel) return undefined;
    const onDown = (e) => {
      if (!e.target.closest?.('[data-facet-panel],[data-facet-toggle],[data-columns-toggle]')) {
        setOpenFacetPanel(null);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpenFacetPanel(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openFacetPanel]);

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
    // Clear in-flight facets when data version changes, so facets can be re-fetched
    inFlightFacets.current.clear();
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
      return next;
    });
  }, []);

  const persistWidths = useCallback(() => writeJson(WIDTHS_KEY, colWidths), [colWidths]);
  const resetAllWidths = useCallback(() => {
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
    const prev = bookmarksRef.current;
    const isAdding = !prev.includes(rowKey);
    const next = isAdding
      ? [...prev, rowKey]
      : prev.filter((id) => id !== rowKey);
    setBookmarks(next);
    persistBookmarks(next);

    // ENH-1: tell the student about a NEW clash the moment it is created,
    // instead of leaving them to discover it inside the cart later.
    if (isAdding && masterDataRef.current.length > 0) {
      const rowsFor = (keys) => {
        const set = new Set(keys);
        return masterDataRef.current.filter((r) => set.has(rowKeyOf(r)));
      };
      const fresh = detectConflicts(rowsFor(next));
      const pair = fresh.scheduleConflicts.find((c) => c.keyA === rowKey || c.keyB === rowKey);
      if (pair) {
        const other = pair.keyA === rowKey ? pair.titleB : pair.titleA;
        notify(`⚠ تداخل ساعت کلاس با «${other}» (${pair.day}، ${pair.timeA}).`);
      } else {
        const examPair = fresh.examConflicts.find((c) => c.keyA === rowKey || c.keyB === rowKey);
        if (examPair) {
          const other = examPair.keyA === rowKey ? examPair.titleB : examPair.titleA;
          notify(`⚠ هم‌زمانی امتحان با «${other}» در تاریخ ${examPair.date}.`);
        }
      }
    }
  }, [persistBookmarks, notify]);

  const handleClearAllBookmarks = useCallback(() => {
    const prev = bookmarksRef.current;
    if (prev.length === 0) {
      notify('سبد انتخاب از قبل خالی است.');
      return;
    }
    setBookmarks([]);
    persistBookmarks([]);
    // ENH-3: the destructive action gets an undo window via the same delta
    // mechanism as shared-plan imports.
    undoDeltaRef.current = { added: [], removed: prev };
    setToastAction({ label: 'بازگردانی دروس', onClick: undoImport });
    notify('تمام دروس نشانه‌گذاری‌شده پاک شدند.');
  }, [notify, persistBookmarks, undoImport]);

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
    if (bookmarks.length === 0) {
      notify('هنوز درسی انتخاب نکرده‌اید؛ چند درس را نشانه‌گذاری کنید تا لینک برنامه ساخته شود.');
      return;
    }
    // Producer contract (shared with CartDrawer): set the raw '||'-joined keys
    // via searchParams; URLSearchParams handles all escaping symmetrically.
    const shareUrlObj = new URL(window.location.href);
    shareUrlObj.search = '';
    shareUrlObj.searchParams.set('b', bookmarks.join('||'));
    const shareUrl = shareUrlObj.toString();
    try {
      await navigator.clipboard.writeText(shareUrl);
      notify('لینک برنامهٔ درسی کپی شد؛ برای دوستانت بفرست 🔗');
    } catch {
      window.prompt('مرورگر از کپی خودکار پشتیبانی نکرد. این لینک را کپی کن:', shareUrl);
    }
  }, [bookmarks, notify]);

  const exportIcs = useCallback((windowDates) => {
    const icsContent = generateIcsCalendar(bookmarkedCourses, {
      semester: windowDates
        ? { semesterStart: windowDates.semesterStart, teachingEnd: windowDates.teachingEnd }
        : null,
      nowMs: timeSource.now(),
    });
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `barnameh_daneshgah_shiraz_${LAST_UPDATE.replace(/ /g, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    notify(windowDates
      ? 'فایل تقویم شامل کلاس‌های هفتگی و امتحانات دانلود شد.'
      : 'فایل تقویم شامل رویدادهای امتحان دانلود شد.');
  }, [bookmarkedCourses, notify]);

  const handleExportIcs = useCallback(() => {
    if (bookmarkedCourses.length === 0) {
      notify('ابتدا دروسی را به سبد نشانه‌گذاری اضافه کنید.');
      return;
    }
    // Approximate presets exist: the user must see and confirm (or edit) the
    // window before weekly events are generated (ISSUE 1). Without a config
    // the export stays exam-only, which needs no dates.
    if (semesterConfig) {
      setSemesterDialogOpen(true);
      return;
    }
    exportIcs(null);
    notify('فایل تقویم شامل رویدادهای امتحان دانلود شد؛ برای افزودن کلاس‌های هفتگی، تاریخ‌های تقریبی ترم باید توسط مدیر سامانه در semester.json تنظیم شود.');
  }, [bookmarkedCourses, semesterConfig, exportIcs, notify]);

  const handleSemesterConfirm = useCallback((w) => {
    const next = { ...confirmedSemesters, [w.type]: { startText: w.startText, endText: w.endText } };
    setConfirmedSemesters(next);
    writeJson(SEMESTER_CONFIRM_KEY, next);
    setSemesterDialogOpen(false);
    exportIcs(w);
  }, [confirmedSemesters, exportIcs]);

  const handleSemesterExamOnly = useCallback(() => {
    setSemesterDialogOpen(false);
    exportIcs(null);
  }, [exportIcs]);

  const handleSemesterCancel = useCallback(() => setSemesterDialogOpen(false), []);

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
    <div className="app-shell relative flex w-full flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-blue-50/40">
      {/* ── Ambient Gemini-style Mesh Gradient Canvas ───────────────────────── */}
      <div className="gemini-ambient-canvas" aria-hidden="true" />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      {/* pt respects the notch/status bar on notched phones (viewport-fit=cover, BUG-20) */}
      <header className="relative z-30 flex-none border-b border-slate-200/70 bg-white/90 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl md:px-5">
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
            <span className="opacity-70">🏷️</span> ساخت سایت: {LAST_UPDATE}
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
              className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 min-h-9 text-xs font-black transition-all ${
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
              className={`relative inline-flex items-center justify-center gap-1 rounded-lg py-1.5 min-h-9 text-xs font-black transition-all ${
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
              className={`inline-flex items-center justify-center gap-1 rounded-lg py-1.5 min-h-9 text-xs font-black transition-all ${
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
                              onClick={() => setOpenFacetPanel(openFacetPanel?.column === '__columns' ? null : { column: '__columns', variant: 'dropdown' })}
                              aria-expanded={openFacetPanel?.column === '__columns'}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[12px] font-bold text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700">
                              <ColumnsIcon className="size-4" />
                              ستون‌ها
                              <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">{faNum(visibleColumns.length)}</span>
                            </button>

                            {openFacetPanel?.column === '__columns' && (
                              <>
                                <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setOpenFacetPanel(null)} />
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
                        const isOpen = openFacetPanel?.column === col;
                        return (
                          <button
                            key={col}
                            type="button"
                            data-facet-toggle
                            onClick={() => {
                              setOpenFacetPanel(isOpen ? null : { column: col, variant: 'inline' });
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

                    {/* Dedicated outside popover layer for quick facet filters (NEVER clipped).
                        Only variant 'inline' (toolbar chips) renders here; header dropdowns are
                        portaled by VirtualTable so the same state never draws two panels. */}
                    {openFacetPanel && openFacetPanel.column !== '__columns' && openFacetPanel.variant === 'inline' && (
                      <>
                        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setOpenFacetPanel(null)} />
                        <div
                          data-facet-panel
                          onClick={(e) => e.stopPropagation()}
                          className="absolute start-0 top-full z-50 mt-1.5 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 animate-pop-in"
                        >
                          <FacetPanel
                            column={openFacetPanel.column}
                            values={facets[openFacetPanel.column] || []}
                            loading={facetsLoading === openFacetPanel.column}
                            selected={filters[openFacetPanel.column] || []}
                            onClose={() => setOpenFacetPanel(null)}
                            onClear={() => handleFilterChange(openFacetPanel.column, null)}
                            onToggle={(v) => {
                              const selected = filters[openFacetPanel.column] || [];
                              const next = selected.includes(v)
                                ? selected.filter((x) => x !== v)
                                : [...selected, v];
                              handleFilterChange(openFacetPanel.column, next.length ? next : null);
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
                        className="hidden shrink-0 rounded-lg px-2 py-1 min-h-9 text-[11.5px] font-bold text-blue-700 underline-offset-2 hover:underline sm:block">
                        راهنما
                      </button>
                      <button type="button" onClick={dismissHint} aria-label="بستن راهنمای اولیه"
                        className="grid size-9 shrink-0 place-items-center rounded-lg text-blue-500 transition-colors hover:bg-blue-100">
                        <CloseIcon className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Table Data View */}
                <div className="relative min-h-0 flex-1">
                {isLoading || (!rowsReady && !loadError) ? (
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
                      conflictRowKeys={conflictData.conflictRowKeys}
                      onToggleBookmark={toggleBookmark}
                      onCopyRow={handleCopy}
                      onCompare={(c) => setComparingCourse(c)}
                      onOpenDetail={setDetailCourse}
                      onClearFilters={clearAllFilters}
                      onClearSearch={() => setSearchTerm('')}
                      hasSearch={!!debouncedTerm}
                      searchTerm={debouncedTerm}
                      openFacetPanel={openFacetPanel}
                      setOpenFacetPanel={setOpenFacetPanel}
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
          openFacetPanel={openFacetPanel}
          setOpenFacetPanel={setOpenFacetPanel}
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
        pendingLegacyCount={pendingLegacy.length}
        onOpenLegacy={() => setLegacyDialogOpen(true)}
      />

      {semesterDialogOpen && semesterConfig && (
        <SemesterConfirmDialog
          config={semesterConfig}
          confirmedByType={confirmedSemesters}
          onConfirm={handleSemesterConfirm}
          onExamOnly={handleSemesterExamOnly}
          onCancel={handleSemesterCancel}
        />
      )}

      {legacyDialogOpen && pendingLegacy.length > 0 && (
        <LegacyBookmarkDialog
          pendingLegacy={pendingLegacy}
          masterData={masterData}
          onResolve={handleLegacyResolve}
          onRemove={handleLegacyRemove}
          onPostpone={handleLegacyPostpone}
        />
      )}

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

      {pendingShare && (
        <SharedPlanDialog
          shared={pendingShare}
          localCount={bookmarks.length}
          onReplace={() => applyImport('replace', pendingShare)}
          onMerge={() => applyImport('merge', pendingShare)}
          onCancel={cancelShare}
        />
      )}

      <Toast
        message={toastMessage}
        onDone={() => { setToastMessage(null); setToastAction(null); }}
        action={toastAction}
        duration={toastAction ? 8000 : 3200}
      />
    </div>
  );
}

export default App;
