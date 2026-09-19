// localStorage helpers. Every access is defensive: storage can throw (Safari private
// mode, quota exceeded on the ~1.1 MB CSV cache) and must never break the app.

export const CACHE_KEY = 'usc.cache.v1';
export const WIDTHS_KEY = 'usc.colwidths.v1';
export const BOOKMARKS_KEY = 'usc.bookmarks.v1';
export const DENSITY_KEY = 'usc.density.v1';
export const COLUMNS_KEY = 'usc.columns.v1';
export const HINT_KEY = 'usc.hint.v1';
export const TOUR_KEY = 'usc.tour.v3';

export function hasSeenTour() {
  try {
    return localStorage.getItem(TOUR_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function resetTourSeen() {
  try {
    localStorage.removeItem(TOUR_KEY);
    return true;
  } catch {
    return false;
  }
}

export function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Corrupt JSON or storage disabled - behave like "nothing stored".
    return null;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded / private mode - silently skip persisting.
    return false;
  }
}

export function readString(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
