import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { timeSource } from './timeSource.js';
import { tehranDayKey, daysUntil, examStatus, splitDuration } from './datetime.js';

/**
 * Media-query hook built on matchMedia instead of resize listeners: fires only when the
 * breakpoint is actually crossed, so resizing a window no longer re-renders the table
 * on every pixel.
 */
export function useMediaQuery(query) {
  // useSyncExternalStore is the React-approved way to read an external source like
  // matchMedia: no effect, no cascading render, and it stays correct if the query changes.
  const subscribe = useCallback((onChange) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True below the md breakpoint (<768px), i.e. the card layout. */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');

/** Debounce any changing value (used for the search box). */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Tracks whether an element is scrolled past a threshold, without spamming renders. */
export function useScrolledPast(ref, threshold, deps = []) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setPast(el.scrollTop > threshold);
      });
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, threshold, ...deps]);
  return past;
}

/** Locks body scroll (and reserves the scrollbar gap) while a sheet/modal is open. */
export function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingInlineEnd;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingInlineEnd = `${gap}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingInlineEnd = prevPadding;
    };
  }, [locked]);
}

/**
 * Dialog focus behaviour shared by every overlay (BUG-13): focus moves into
 * the dialog on open, Tab stays inside it while open, and focus returns to
 * the previously focused element on close. Give the dialog container
 * `tabIndex={-1}` so it can receive focus when it has no focusable children.
 */
export function useDialogFocus(containerRef) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const previous = document.activeElement;

    const focusables = () => [...container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((el) => el.getClientRects().length > 0 || el === document.activeElement);

    const initial = focusables()[0] || container;
    if (typeof initial.focus === 'function') initial.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !container.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !container.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener('keydown', onKey);
    return () => {
      container.removeEventListener('keydown', onKey);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [containerRef]);
}

/** True when the user asks for reduced motion, so decorative animation can be skipped. */
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

/** Small util: run a callback once on mount (used for the first-visit hint). */
export function useOnMount(fn) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── Shared wall-clock tickers ─────────────────────────────────────────────────
// ONE interval per cadence, shared by every subscriber (a per-card timer in the
// virtualized table would mean hundreds of timers and a re-render storm). The
// snapshot is updated inside the emit, before subscribers are notified, so
// useSyncExternalStore always reads a value that only changes on notification.

const tickers = new Map(); // intervalMs → { subs, timer, snap: { value }, compute }

const ensureTicker = (intervalMs, compute) => {
  let t = tickers.get(intervalMs);
  if (!t) {
    t = { subs: new Set(), timer: null, snap: { value: compute() }, compute };
    tickers.set(intervalMs, t);
  }
  return t;
};

const emitTicker = (t) => {
  t.snap.value = t.compute();
  for (const fn of t.subs) fn();
};

const subscribeTicker = (intervalMs, compute, onChange) => {
  const t = ensureTicker(intervalMs, compute);
  t.subs.add(onChange);
  if (t.timer === null) {
    t.timer = setInterval(() => emitTicker(t), intervalMs);
  }
  return () => {
    t.subs.delete(onChange);
    if (t.subs.size === 0) {
      clearInterval(t.timer);
      tickers.delete(intervalMs);
    }
  };
};

const NOW_COMPUTE = () => timeSource.now();
const TEHRAN_DAY_COMPUTE = () => tehranDayKey(timeSource.now());

if (typeof document !== 'undefined') {
  // Background tabs get their timers clamped (Chrome: down to 1/min), so on
  // return to the tab, emit immediately instead of showing a stale tick.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    for (const t of tickers.values()) emitTicker(t);
  });
}

/**
 * Corrected "now" epoch, re-read on a shared cadence. Per-second cadence is for
 * the single mounted detail modal only — never for list rows.
 */
export function useNow(intervalMs = 1000) {
  const subscribe = useCallback(
    (onChange) => subscribeTicker(intervalMs, NOW_COMPUTE, onChange),
    [intervalMs]
  );
  const getSnapshot = useCallback(() => ensureTicker(intervalMs, NOW_COMPUTE).snap.value, [intervalMs]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * The current Tehran calendar day as an integer. Subscribers re-render exactly
 * once per Tehran-midnight crossing (checked per minute), regardless of the
 * device's own timezone - this is what keeps the روزشمار badges honest for
 * users abroad.
 */
export function useTehranDay() {
  const subscribe = useCallback((onChange) => subscribeTicker(60000, TEHRAN_DAY_COMPUTE, onChange), []);
  const getSnapshot = useCallback(() => ensureTicker(60000, TEHRAN_DAY_COMPUTE).snap.value, []);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Live exam lifecycle against the corrected clock: 'upcoming' (ticking to the
 * از time), 'ongoing' (ticking to the تا time) or 'finished'. Returns null for
 * courses with no parsable exam cell.
 */
export function useExamCountdown(exam) {
  const nowMs = useNow(1000);
  if (!exam) return null;
  const status = examStatus(exam.startAt, exam.endAt, nowMs);
  const target = status === 'upcoming' ? exam.startAt : status === 'ongoing' ? exam.endAt : null;
  return {
    status,
    nowMs,
    remainingMs: target !== null ? Math.max(0, target - nowMs) : null,
    parts: target !== null ? splitDuration(target - nowMs) : null,
    daysLeft: daysUntil(exam.date, nowMs),
  };
}
