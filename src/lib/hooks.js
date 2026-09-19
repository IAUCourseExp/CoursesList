import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

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
