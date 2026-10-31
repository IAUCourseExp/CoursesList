import Papa from 'papaparse';
import { scheduleSortKey, parseExam } from './lib/datetime.js';
import { PHANTOM_COLUMN, hasRequiredColumns } from './lib/columns.js';
import { normalizeFarsi, normalizeDisplay } from './lib/normalize.js';

let masterData = [];
let columns = [];
let facetCache = {};

const SCHEDULE_COL = 'زمانبندي تشكيل كلاس';
const EXAM_COL = 'زمان امتحان';

// Track the latest data version to reject stale QUERY responses
let currentDataVersion = 0;

// Persian users type ۱۴۰۵, the CSV stores 1405 - unify digits in BOTH directions so
// either spelling searches, filters and highlights identically. The transforms
// live in lib/normalize.js (BUG-08) so the UI highlighter always agrees with
// what the worker searched.

const normCell = (value) => {
  const s = value === null || value === undefined ? '' : String(value).trim();
  return s === '' ? '(خالی)' : normalizeFarsi(s);
};

const displayCell = (value) => {
  const s = value === null || value === undefined ? '' : String(value).trim();
  return s === '' ? '(خالی)' : normalizeDisplay(s);
};

const parseCsv = (csvString) =>
  new Promise((resolve) => {
    Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results),
    });
  });

/**
 * Parse a CSV string and validate that it is a real course dataset (BUG-03).
 * An HTML error page parses without Papa errors but can never contain the
 * application's required columns, so a schema check is the gate: invalid
 * input throws instead of reaching the UI or the cache.
 */
const parseValidDataset = async (csvString, sourceLabel) => {
  const results = await parseCsv(csvString);
  const fields = results.meta?.fields || [];
  if (!hasRequiredColumns(fields)) {
    throw new Error(`${sourceLabel}: پاسخ شبیه فایل دروس نبود (ستون‌های الزامی یافت نشد).`);
  }
  if (!results.data || results.data.length === 0) {
    throw new Error(`${sourceLabel}: فایل دروس خالی بود.`);
  }
  return results;
};

const replaceData = (parsed) => {
  masterData = parsed.data || [];
  // Defensive: drop the empty-named phantom column if the source file ever
  // regresses to a trailing comma (the current file has none - verified - so
  // this is a no-op today, but it keeps the column set and filters clean).
  columns = (parsed.meta?.fields || []).filter((c) => c && c !== PHANTOM_COLUMN);
  if (parsed.meta?.fields?.includes(PHANTOM_COLUMN)) {
    for (const row of masterData) delete row[PHANTOM_COLUMN];
  }
  facetCache = {};
  currentDataVersion += 1;
};

/** Blanks are pushed to the end in BOTH directions - 719 rows have no schedule and
 *  1305 have no room, and nobody wants those first when they sort descending. */
const isBlankCell = (v) => v === null || v === undefined || String(v).trim() === '';

/** Only treat a cell as a number when the WHOLE cell is a number.
 *  (parseFloat("1405/10/05 از 08:00 تا 10:00") used to yield 1405, which made the
 *  exam column sort as if every exam happened on the same day.) */
const pureNumber = (v) => {
  const s = String(v ?? '').trim();
  return /^-?\d+(?:[.,]\d+)?$/.test(s) ? Number(s.replace(',', '.')) : null;
};

const compareCells = (column, a, b) => {
  if (column === SCHEDULE_COL) {
    const ka = scheduleSortKey(a);
    const kb = scheduleSortKey(b);
    if (ka !== null && kb !== null) return ka - kb;
  } else if (column === EXAM_COL) {
    const ea = parseExam(a);
    const eb = parseExam(b);
    if (ea && eb) {
      if (ea.sortKey !== eb.sortKey) return ea.sortKey - eb.sortKey;
      // Zero-pad so single-digit hours sort numerically ('8:00' vs '10:00').
      return (ea.from || '').padStart(5, '0').localeCompare((eb.from || '').padStart(5, '0'));
    }
  }

  const na = pureNumber(a);
  const nb = pureNumber(b);
  if (na !== null && nb !== null) return na - nb;
  if (na !== null && nb === null) return -1;
  if (na === null && nb !== null) return 1;
  return String(a ?? '').localeCompare(String(b ?? ''), 'fa');
};

const applyQuery = ({ search, filters, sort }) => {
  let rows = masterData;

  const q = normalizeFarsi(search || '');
  if (q) {
    rows = rows.filter((row) =>
      Object.values(row).some((v) => normalizeFarsi(v).includes(q))
    );
  }

  const activeFilters = Object.entries(filters || {}).filter(
    ([, vals]) => Array.isArray(vals) && vals.length > 0
  );
  if (activeFilters.length) {
    const allowed = activeFilters.map(
      ([col, vals]) => [col, new Set(vals.map(normalizeFarsi))]
    );
    rows = rows.filter((row) =>
      allowed.every(([col, set]) => set.has(normCell(row[col])))
    );
  }

  if (sort && sort.column) {
    const { column, direction } = sort;
    const flip = direction === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const va = a[column];
      const vb = b[column];
      const aBlank = isBlankCell(va);
      const bBlank = isBlankCell(vb);
      if (aBlank !== bBlank) return aBlank ? 1 : -1; // blanks always last
      if (aBlank && bBlank) return 0;
      return flip * compareCells(column, va, vb);
    });
  }

  return rows;
};

const buildFacets = (column) => {
  if (facetCache[column]) return facetCache[column];

  const counts = new Map();
  for (const row of masterData) {
    const v = displayCell(row[column]);
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const values = [...counts.entries()].map(([value, count]) => ({ value, count }));
  values.sort(
    (a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value), 'fa')
  );
  facetCache[column] = values;
  return values;
};

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  try {
    if (type === 'INIT') {
      const { url, cachedText } = payload || {};

      const fetchCsv = async () => {
        const t0 = Date.now();
        const res = await fetch(url, { cache: 'no-cache' });
        const dateHeader = res.headers.get('date');
        // Never treat an HTTP error page as course data (BUG-03): let the
        // caller's try/catch turn this into the offline/cache fallback path.
        if (!res.ok) {
          throw new Error(`درخواست فایل دروس ناموفق بود (HTTP ${res.status}).`);
        }
        const text = await res.text();
        const t1 = Date.now();
        // The response Date header doubles as a free network-clock sample for
        // the countdown's time-source consensus (see lib/timeSource.js).
        return { text, timeSample: dateHeader ? { dateHeader, t0, t1 } : null };
      };

      let cacheUsable = false;
      if (cachedText) {
        // Only a cache that still validates against the schema may paint first;
        // a stale or corrupt cache falls through to the network fetch.
        try {
          replaceData(await parseValidDataset(cachedText, 'حافظهٔ محلی'));
          cacheUsable = true;
        } catch {
          cacheUsable = false;
        }
      }
      if (cacheUsable) {
        self.postMessage({
          type: 'DATA_LOADED',
          payload: { source: 'cache', changed: false, data: masterData, columns, dataVersion: currentDataVersion },
        });

        const { text, timeSample } = await fetchCsv();
        if (text === cachedText) {
          self.postMessage({ type: 'STATUS', payload: { fresh: true, timeSample } });
        } else {
          replaceData(await parseValidDataset(text, 'فایل تازه'));
          self.postMessage({
            type: 'DATA_LOADED',
            payload: {
              source: 'network',
              changed: true,
              data: masterData,
              columns,
              csvText: text,
              timeSample,
              dataVersion: currentDataVersion,
            },
          });
        }
      } else {
        const { text, timeSample } = await fetchCsv();
        replaceData(await parseValidDataset(text, 'فایل تازه'));
        self.postMessage({
          type: 'DATA_LOADED',
          payload: {
            source: 'network',
            changed: false,
            data: masterData,
            columns,
            csvText: text,
            timeSample,
            dataVersion: currentDataVersion,
          },
        });
      }
    }

    if (type === 'QUERY') {
      const requestId = payload?.requestId;
      const queryDataVersion = payload?.dataVersion;
      
      // Reject stale queries against old data version
      if (queryDataVersion !== undefined && queryDataVersion !== currentDataVersion) {
        if (requestId !== undefined) {
          self.postMessage({ 
            type: 'QUERY_RESULTS', 
            payload: { rows: [], stale: true, requestId } 
          });
        }
        return;
      }
      
      const rows = applyQuery(payload || {});
      const displayRows = rows.map((row) => {
        const newRow = {};
        for (const col of columns) {
          newRow[col] = displayCell(row[col]);
        }
        return newRow;
      });
      const response = { type: 'QUERY_RESULTS', payload: { rows: displayRows, dataVersion: currentDataVersion } };
      if (requestId !== undefined) response.payload.requestId = requestId;
      self.postMessage(response);
    }

    if (type === 'FACETS') {
      const column = payload?.column;
      if (columns.includes(column)) {
        self.postMessage({
          type: 'FACETS_RESULT',
          payload: { column, values: buildFacets(column), dataVersion: currentDataVersion },
        });
      }
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', payload: { message: String(err?.message || err) } });
  }
};
