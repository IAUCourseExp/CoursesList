// Single source of truth for Persian/Arabic text normalization (BUG-08).
//
// The worker (search, filters, sorting keys), the search highlighter and the
// display layer previously kept three divergent copies of this logic, which is
// how highlight positions drifted out of sync with search. Every transform
// here is LENGTH-PRESERVING: one input character maps to exactly one output
// character, so normalized indexes can be mapped back into the original
// string positionally. Nothing is removed and whitespace is not collapsed -
// that is deliberate: it keeps search, display and highlighting aligned.

export const toAsciiDigits = (s) =>
  String(s)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));

const unifyLetters = (s) =>
  s.replace(/\u064A/g, '\u06CC') // Arabic ي -> Persian ی
    .replace(/\u0643/g, '\u06A9'); // Arabic ك -> Persian ک

/** Search/query normalization: digits, letter variants, case, outer trim. */
export const normalizeFarsi = (text) => {
  if (text === null || text === undefined) return '';
  return unifyLetters(toAsciiDigits(String(text)))
    .toLowerCase()
    .trim();
};

/** Display normalization: same as search but case-preserving (Persian has no case). */
export const normalizeDisplay = (text) => {
  if (text === null || text === undefined) return '';
  return unifyLetters(toAsciiDigits(String(text))).trim();
};
