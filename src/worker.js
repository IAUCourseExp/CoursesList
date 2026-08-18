import Papa from 'papaparse';

let masterData = [];
let columns = [];
let facetCache = {};

const normalizeFarsi = (text) => {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .toLowerCase()
    .trim();
};

const normalizeDisplay = (text) => {
  if (text === null || text === undefined) return '';
  return String(text)
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
  columns = parsed.meta?.fields || [];
  facetCache = {};
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
    rows = [...rows].sort((a, b) => {
      const va = a[column] ?? '';
      const vb = b[column] ?? '';
      const na = parseFloat(va);
      const nb = parseFloat(vb);
      let cmp;
      if (!isNaN(na) && !isNaN(nb) && String(va).trim() !== '' && String(vb).trim() !== '') {
        cmp = na - nb;
      } else {
        cmp = String(va).localeCompare(String(vb), 'fa');
      }
      return direction === 'asc' ? cmp : -cmp;
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
      const displayRows = rows.map(row => {
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