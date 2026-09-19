// Single source of truth for column presentation.
//
// The raw CSV header is the *data key* (the worker, filters, sort and URL all speak it),
// while everything the user reads is re-typed with correct Persian ی/ک.
//
// Matching between the two is done through `canonical()`, which unifies ی/ي, ک/ك, ZWNJ and
// repeated spaces. That way the hand-written lists below can never silently stop matching
// the real file if its spelling ever changes.

/** Unify the spelling variants used across the dataset. */
export const canonical = (s) =>
  String(s ?? '')
    .replace(/\u064A/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .replace(/[\u200c\u200e\u200f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const canonSet = (list) => new Set(list.map(canonical));
const byCanon = (map) => {
  const out = new Map();
  for (const [k, v] of Object.entries(map)) out.set(canonical(k), v);
  return out;
};

/** The empty-named 23rd column created by the trailing comma in data.csv - never shown. */
export const PHANTOM_COLUMN = '';
export const isPhantom = (col) => !col || col === PHANTOM_COLUMN;

/** Short Persian labels, retyped with proper ی/ک (the raw headers use Arabic forms). */
const SHORT_LABELS = {
  'كد درس': 'کد درس',
  'نام درس': 'نام درس',
  'نوع درس': 'نوع درس',
  'تعداد واحد نظري': 'واحد نظری',
  'تعداد واحد عملي': 'واحد عملی',
  'كد ارائه كلاس درس': 'کد ارائه',
  'نام كلاس درس': 'نام کلاس',
  'زمانبندي تشكيل كلاس': 'زمان کلاس',
  'استاد': 'استاد',
  'ساير اساتيد': 'اساتید دیگر',
  'حداكثر ظرفيت': 'ظرفیت',
  'تعداد ثبت نامي تاكنون': 'ثبت‌نامی',
  'زمان امتحان': 'زمان امتحان',
  'مكان برگزاري': 'مکان',
  'مقطع ارائه درس': 'مقطع',
  'نوع ارائه': 'نوع ارائه',
  'سطح ارائه': 'سطح ارائه',
  'دانشجويان مجاز به اخذ كلاس': 'مجاز به اخذ',
  'گروه آموزشي': 'گروه آموزشی',
  'دانشكده': 'دانشکده',
  'واحد': 'واحد دانشگاهی',
  'استان': 'استان',
};

/** Long form, used for tooltips, aria labels and the help panel. */
const FULL_LABELS = {
  ...SHORT_LABELS,
  'نوع درس': 'نوع درس (نظری، عملی، کارگاهی…)',
  'كد ارائه كلاس درس': 'کد ارائه کلاس درس: شناسه یکتای هر گروه درسی',
  'تعداد واحد نظري': 'تعداد واحد نظری',
  'تعداد واحد عملي': 'تعداد واحد عملی',
  'زمانبندي تشكيل كلاس': 'زمان‌بندی تشکیل کلاس',
  'ساير اساتيد': 'سایر اساتید',
  'حداكثر ظرفيت': 'حداکثر ظرفیت',
  'تعداد ثبت نامي تاكنون': 'تعداد ثبت‌نامی تاکنون',
  'دانشجويان مجاز به اخذ كلاس': 'دانشجویان مجاز به اخذ کلاس',
  'واحد': 'واحد دانشگاهی (شهر/شعبه)',
};

/** Default column width in px. */
export const DEFAULT_WIDTHS = {
  'نام درس': 200,
  'زمانبندي تشكيل كلاس': 190,
  'زمان امتحان': 195,
  'استاد': 150,
  'مكان برگزاري': 210,
  'دانشجويان مجاز به اخذ كلاس': 150,
  'گروه آموزشي': 220,
  'كد درس': 115,
  'كد ارائه كلاس درس': 172,
  'نام كلاس درس': 130,
  'نوع درس': 110,
  'تعداد واحد نظري': 110,
  'تعداد واحد عملي': 110,
  'حداكثر ظرفيت': 95,
  'تعداد ثبت نامي تاكنون': 120,
  'ساير اساتيد': 160,
  'مقطع ارائه درس': 140,
  'نوع ارائه': 130,
  'سطح ارائه': 160,
  'دانشكده': 150,
  'واحد': 150,
  'استان': 90,
};

export const DEFAULT_COL_WIDTH = 150;

/**
 * Identifier columns: 10–20 digit codes people copy into the registration system.
 * They must render left-to-right with tabular digits and never be shortened in a way
 * that hides which faculty/group they belong to.
 */
export const CODE_COLUMNS = ['كد ارائه كلاس درس', 'كد درس'];

// Normalised lookup tables (never index these with user data: use the helpers below).
const SHORT_NORM = byCanon(SHORT_LABELS);
const FULL_NORM = byCanon(FULL_LABELS);
const WIDTH_NORM = byCanon(DEFAULT_WIDTHS);

export const labelOf = (col) => SHORT_NORM.get(canonical(col)) || col;
export const fullLabelOf = (col) => FULL_NORM.get(canonical(col)) || labelOf(col);
export const defaultWidthOf = (col) => WIDTH_NORM.get(canonical(col)) ?? DEFAULT_COL_WIDTH;

/** Columns shown before the user customises anything: the smallest set that answers
 *  "what is this course, who teaches it, when is it, and can I still get in". */
export const CORE_COLUMNS = [
  'نام درس',
  'استاد',
  'زمانبندي تشكيل كلاس',
  'زمان امتحان',
  'كد ارائه كلاس درس',
  'نوع درس',
  'تعداد واحد نظري',
  'تعداد واحد عملي',
  'حداكثر ظرفيت',
];

const EMPHASIS = canonSet(['نام درس']);
const SECONDARY = canonSet(['استاد', 'زمانبندي تشكيل كلاس', 'زمان امتحان']);
export const isEmphasisColumn = (col) => EMPHASIS.has(canonical(col));
export const isSecondaryColumn = (col) => SECONDARY.has(canonical(col));

/** Mobile card: headline chips + the always-visible fact grid + the collapsed extras. */
export const CARD_FACT_COLUMNS = [
  'كد ارائه كلاس درس',
  'كد درس',
  'حداكثر ظرفيت',
  'تعداد ثبت نامي تاكنون',
  'مكان برگزاري',
  'مقطع ارائه درس',
];

export const CARD_EXTRA_COLUMNS = [
  'نام كلاس درس',
  'نوع ارائه',
  'سطح ارائه',
  'دانشجويان مجاز به اخذ كلاس',
  'گروه آموزشي',
  'دانشكده',
  'واحد',
  'استان',
  'ساير اساتيد',
];

/** Facets preloaded so the quick-filter row works the instant the sheet opens. */
export const QUICK_FILTER_COLUMNS = [
  'نوع درس',
  'مقطع ارائه درس',
  'نوع ارائه',
  'سطح ارائه',
  'واحد',
];

/**
 * Sorts offered as one-tap chips: only columns that actually sort meaningfully.
 * (تعداد ثبت‌نامی is deliberately absent: it is blank in all 2565 rows of data.csv.)
 */
export const QUICK_SORT_OPTIONS = [
  { column: 'نام درس', direction: 'asc', label: 'نام درس (الف→ی)' },
  { column: 'استاد', direction: 'asc', label: 'استاد (الف→ی)' },
  { column: 'زمانبندي تشكيل كلاس', direction: 'asc', label: 'روز کلاس (شنبه→جمعه)' },
  { column: 'زمان امتحان', direction: 'asc', label: 'زمان امتحان (زودترین)' },
  { column: 'حداكثر ظرفيت', direction: 'desc', label: 'ظرفیت (بیشترین)' },
  { column: 'كد درس', direction: 'asc', label: 'کد درس' },
];

/** Grouped labels for the column picker. */
export const COLUMN_GROUPS = [
  { title: 'شناسنامهٔ درس', columns: ['نام درس', 'كد درس', 'كد ارائه كلاس درس', 'نام كلاس درس', 'نوع درس', 'مقطع ارائه درس'] },
  { title: 'زمان و مکان', columns: ['زمانبندي تشكيل كلاس', 'زمان امتحان', 'مكان برگزاري'] },
  { title: 'استاد و ظرفیت', columns: ['استاد', 'ساير اساتيد', 'حداكثر ظرفيت', 'تعداد ثبت نامي تاكنون'] },
  { title: 'ارائه و مقررات', columns: ['نوع ارائه', 'سطح ارائه', 'دانشجويان مجاز به اخذ كلاس'] },
  { title: 'سازمان', columns: ['گروه آموزشي', 'دانشكده', 'واحد', 'استان'] },
];

/**
 * Pick the RAW column names out of `allColumns` that correspond to a friendly list.
 * Always use this before using a list as filter keys / sort columns.
 */
export const pickColumns = (allColumns, list) => {
  const set = canonSet(list);
  return allColumns.filter((c) => !isPhantom(c) && set.has(canonical(c)));
};

/**
 * Resolve which columns to render.
 * @param {string[]} allColumns raw headers from the worker
 * @param {string[]|null} selected user selection (raw or friendly spelling); null → CORE
 */
export const resolveVisibleColumns = (allColumns, selected) => {
  const real = allColumns.filter((c) => !isPhantom(c));
  if (!selected || selected.length === 0) return pickColumns(real, CORE_COLUMNS);
  const set = canonSet(selected);
  return real.filter((c) => set.has(canonical(c)));
};
