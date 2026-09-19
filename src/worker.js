import Papa from 'papaparse';
import { scheduleSortKey, parseExam } from './lib/datetime.js';
import { PHANTOM_COLUMN } from './lib/columns.js';

let masterData = [];
let columns = [];
let facetCache = {};

const SCHEDULE_COL = 'زمانبندي تشكيل كلاس';
const EXAM_COL = 'زمان امتحان';

// Persian users type ۱۴۰۵, the CSV stores 1405 - unify digits in BOTH directions so
// either spelling searches, filters and highlights identically.
const toAsciiDigits = (s) =>
  String(s)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));

const normalizeFarsi = (text) => {
  if (text === null || text === undefined) return '';
  return toAsciiDigits(String(text))
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .toLowerCase()
    .trim();
};

const normalizeDisplay = (text) => {
  if (text === null || text === undefined) return '';
  return toAsciiDigits(String(text))
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .trim();
};

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

const replaceData = (parsed) => {
  masterData = parsed.data || [];
  // Drop the empty-named column created by the trailing comma on every line of data.csv;
  // it is blank in all 2565 rows and only ever added a dead column + dead filter.
  columns = (parsed.meta?.fields || []).filter((c) => c && c !== PHANTOM_COLUMN);
  if (parsed.meta?.fields?.includes(PHANTOM_COLUMN)) {
    for (const row of masterData) delete row[PHANTOM_COLUMN];
  }
  facetCache = {};
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
      return (ea.from || '').localeCompare(eb.from || '');
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

      if (cachedText) {
        replaceData(await parseCsv(cachedText));
        self.postMessage({
          type: 'DATA_LOADED',
          payload: { source: 'cache', changed: false, data: masterData, columns },
        });

        const res = await fetch(url, { cache: 'no-cache' });
        const text = await res.text();
        if (text === cachedText) {
          self.postMessage({ type: 'STATUS', payload: { fresh: true } });
        } else {
          replaceData(await parseCsv(text));
          self.postMessage({
            type: 'DATA_LOADED',
            payload: {
              source: 'network',
              changed: true,
              data: masterData,
              columns,
              csvText: text,
            },
          });
        }
      } else {
        const res = await fetch(url, { cache: 'no-cache' });
        const text = await res.text();
        replaceData(await parseCsv(text));
        self.postMessage({
          type: 'DATA_LOADED',
          payload: {
            source: 'network',
            changed: false,
            data: masterData,
            columns,
            csvText: text,
          },
        });
      }
    }

    if (type === 'QUERY') {
      const rows = applyQuery(payload || {});
      const displayRows = rows.map((row) => {
        const newRow = {};
        for (const col of columns) {
          newRow[col] = displayCell(row[col]);
        }
        return newRow;
      });
      self.postMessage({ type: 'QUERY_RESULTS', payload: { rows: displayRows } });
    }

    if (type === 'FACETS') {
      const column = payload?.column;
      if (columns.includes(column)) {
        self.postMessage({
          type: 'FACETS_RESULT',
          payload: { column, values: buildFacets(column) },
        });
      }
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', payload: { message: String(err?.message || err) } });
  }
};
