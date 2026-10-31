// Trusted-clock engine: estimates the true wall-clock time by sampling several
// independent sources and keeping the median of their offsets from the device
// clock, so a wrong/manipulated device clock can no longer skew the exam
// countdown.
//
// Sources, best first:
//   1. HTTP `Date` header of the data.csv fetch (same origin the data comes from).
//   2. HTTP `Date` header of a HEAD request to the jsDelivr CDN (already
//      preconnected in index.html, reachable from Iran).
//   3. worldtimeapi.org / timeapi.io JSON APIs for Asia/Tehran (best-effort,
//      may be slow or blocked for some users - every failure is silent).
//   4. The device clock itself - treated as just another sample, never as truth.
//   5. The owner's manual pin (public/time-override.json) when enabled, which
//      freezes "now" for demos/testing.
//
// The pure engine (TimeEngine) has no DOM/network dependencies, so the verify
// scripts can unit-test the consensus in Node. The browser-only collectors live
// in makeBrowserTimeSource() and only run when a window actually exists.

const MAX_SANE_RTT_MS = 8000;        // slower samples are too imprecise to keep
const OUTLIER_TOLERANCE_MS = 120000; // >2min away from the median = lying source
const DEVICE_DRIFT_WARN_MS = 300000; // 5min drift → warn (was 90s, too sensitive)
const FREEZE_BAND_MS = 5000;         // <this correction while stable = ignore (no tick jitter)
const MAX_SAMPLES = 20;
const PERSIST_FRESH_MS = 14 * 24 * 3600 * 1000; // a persisted offset older than this is discarded

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2, pin: 3 };

const median = (nums) => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export class TimeEngine {
  constructor({
    maxRttMs = MAX_SANE_RTT_MS,
    outlierToleranceMs = OUTLIER_TOLERANCE_MS,
    driftWarnMs = DEVICE_DRIFT_WARN_MS,
    freezeBandMs = FREEZE_BAND_MS,
    persist = null, // { read(): object|null, write(state): void }
  } = {}) {
    this.opts = { maxRttMs, outlierToleranceMs, driftWarnMs, freezeBandMs, persist };
    this.samples = [];
    this.pinEpochMs = null;
    this.listeners = new Set();
    this.state = {
      offsetMs: 0,
      confidence: 'low',
      clockDrift: false,
      pin: false,
      sourceIds: [],
      sourceType: 'device',
    };
  }

  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  /** The corrected current instant. Everything in the app reads time through this. */
  now = () => (this.state.pin && this.pinEpochMs !== null
    ? this.pinEpochMs
    : Date.now() + this.state.offsetMs);

  /** Sample from an HTTP `Date` header (second precision → midpoint of the second). */
  addHeaderSample(sourceId, dateHeader, t0, t1) {
    if (!dateHeader) return false;
    const server = Date.parse(dateHeader);
    if (!Number.isFinite(server)) return false;
    return this.addSample({ sourceId, serverEpochMs: server + 500, t0, t1 });
  }

  /**
   * Record one observation of a remote clock. offset = server − device midpoint,
   * the standard NTP-style estimate that cancels symmetric network delay.
   */
  addSample({ sourceId, serverEpochMs, t0, t1 }) {
    if (!Number.isFinite(serverEpochMs)) return false;
    const rtt = Math.max(0, (t1 ?? t0) - (t0 ?? t1));
    if (rtt > this.opts.maxRttMs) return false;
    this.samples = [
      ...this.samples.filter((s) => s.sourceId !== sourceId),
      { sourceId, offsetMs: serverEpochMs - (t0 + t1) / 2, rtt },
    ].slice(-MAX_SAMPLES);
    this.recompute();
    return true;
  }

  /** Restore a previously persisted estimate (immediate corrected clock on revisit). */
  loadPersisted() {
    const saved = this.opts.persist?.read?.();
    if (!saved || !Number.isFinite(saved.offsetMs)) return;
    if (!Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt > PERSIST_FRESH_MS) return;
    // Only useful as a starting prior; any live sample supersedes it (recompute
    // always prefers real samples when present).
    if (this.state.confidence === 'low') {
      this.apply_({ offsetMs: saved.offsetMs, confidence: 'low', clockDrift: Math.abs(saved.offsetMs) > this.opts.driftWarnMs, sourceType: 'persisted' });
    }
  }

  /** Owner's manual override: freeze "now" at a fixed instant (demo/testing). */
  setPin(epochMs) {
    this.pinEpochMs = Number.isFinite(epochMs) ? epochMs : null;
    this.recompute();
  }

  recompute() {
    if (this.pinEpochMs !== null) {
      this.apply_({ offsetMs: this.state.offsetMs, confidence: 'pin', clockDrift: false, pin: true, sourceType: 'pin' });
      return;
    }

    const good = this.samples.filter((s) => s.rtt <= this.opts.maxRttMs);
    if (good.length === 0) {
      if (this.state.pin) {
        this.apply_({ offsetMs: this.state.offsetMs, confidence: 'low', clockDrift: false, pin: false, sourceType: 'device' });
      }
      return;
    }

    let offsets = good.map((s) => s.offsetMs);
    if (good.length >= 3) {
      const med = median(offsets);
      offsets = good.filter((s) => Math.abs(s.offsetMs - med) <= this.opts.outlierToleranceMs)
        .map((s) => s.offsetMs);
      if (offsets.length === 0) offsets = good.map((s) => s.offsetMs);
    }
    const offset = median(offsets);

    // With exactly 2 sources that wildly disagree, there is no majority.
    // Do NOT pick the faster RTT. Instead, keep previous offset, set confidence=low,
    // and let the UI warn the user. The previous offset (from prior consensus or persisted)
    // is more reliable than guessing between two disagreeing sources.
    let confidence = offsets.length >= 2 ? 'high' : 'medium';
    let sourceType = 'network';
    if (good.length === 2 && Math.abs(good[0].offsetMs - good[1].offsetMs) > this.opts.outlierToleranceMs) {
      confidence = 'low';
      sourceType = 'disagreeing';
      // Keep the previous offset (more stable than picking one liar)
      this.apply_({ 
        offsetMs: this.state.offsetMs, 
        confidence, 
        clockDrift: Math.abs(this.state.offsetMs) > this.opts.driftWarnMs, 
        pin: false,
        sourceType 
      });
      return;
    }

    this.apply_({ offsetMs: offset, confidence, clockDrift: Math.abs(offset) > this.opts.driftWarnMs, pin: false, sourceType });
  }

  apply_({ offsetMs, confidence, clockDrift, pin = this.state.pin, sourceType = 'network' }) {
    const prev = this.state;
    // Jitter guard: while a stable estimate exists, ignore sub-band corrections.
    if (CONFIDENCE_RANK[confidence] <= CONFIDENCE_RANK[prev.confidence]
      && Math.abs(offsetMs - prev.offsetMs) < this.opts.freezeBandMs
      && confidence !== 'low') {
      return;
    }
    this.state = {
      offsetMs,
      confidence,
      clockDrift,
      pin,
      sourceIds: this.samples.map((s) => s.sourceId),
      sourceType,
      updatedAt: Date.now(),
    };
    this.opts.persist?.write?.({
      offsetMs,
      confidence,
      savedAt: Date.now(),
    });
    for (const fn of this.listeners) fn(this.state);
  }
}

// ── Browser singleton ─────────────────────────────────────────────────────────
const SAFE_STORAGE_KEYS = /^[A-Za-z0-9._]+$/;

export function makeBrowserTimeSource({ storageKey = 'usc.time.v1', pinUrl } = {}) {
  const persist = {
    read() {
      try {
        if (!SAFE_STORAGE_KEYS.test(storageKey)) return null;
        const raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    write(state) {
      try {
        if (!SAFE_STORAGE_KEYS.test(storageKey)) return;
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        // Private mode / quota - a missing cache just means a fresh estimate.
      }
    },
  };

  const engine = new TimeEngine({ persist });
  let started = false;
  let lastCollectAt = 0;

  const withTimeout = async (run, timeoutMs = 6000) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await run(ctrl.signal);
    } catch {
      return null; // blocked / slow / offline - the source simply doesn't count
    } finally {
      clearTimeout(timer);
    }
  };

  /** HEAD a URL and use its `Date` header as a sample. */
  const collectHttpDate = (sourceId, url) =>
    withTimeout(async (signal) => {
      const t0 = Date.now();
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store', signal });
      const t1 = Date.now();
      engine.addHeaderSample(sourceId, res.headers.get('date'), t0, t1);
    });

  const collectWorldTimeApi = () =>
    withTimeout(async (signal) => {
      const t0 = Date.now();
      const res = await fetch('https://worldtimeapi.org/api/timezone/Asia/Tehran', { signal, cache: 'no-store' });
      const json = await res.json();
      const t1 = Date.now();
      const epoch = Number(json?.unixtime) * 1000;
      if (Number.isFinite(epoch) && epoch > 0) {
        engine.addSample({ sourceId: 'worldtimeapi', serverEpochMs: epoch, t0, t1 });
      }
    });

  const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/;
  const collectTimeApiIo = () =>
    withTimeout(async (signal) => {
      const t0 = Date.now();
      const res = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=Asia/Tehran', { signal, cache: 'no-store' });
      const json = await res.json();
      const t1 = Date.now();
      const iso = String(json?.dateTime ?? '');
      const m = ISO_RE.exec(iso.trim());
      if (!m) return;
      const [, y, mo, d, h, mi, se, frac, tz] = m;
      const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
      const base = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se, ms);
      let epoch;
      if (!tz) epoch = base - 210 * 60000; // zoneless answer = Tehran wall time (what we asked for)
      else if (tz === 'Z') epoch = base;
      else {
        const sign = tz[0] === '-' ? -1 : 1;
        const digits = tz.slice(1).replace(':', '');
        epoch = base - sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || '0')) * 60000;
      }
      engine.addSample({ sourceId: 'timeapi.io', serverEpochMs: epoch, t0, t1 });
    });

  const collectPin = async () => {
    if (!pinUrl) return;
    try {
      const res = await fetch(pinUrl, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.enabled) {
        const pinned = Date.parse(json.fixedNow);
        if (!Number.isFinite(pinned)) {
          console.warn('[TimeSource] Invalid fixedNow in time-override.json (not a valid ISO date):', json.fixedNow);
          return;
        }
        engine.setPin(pinned);
      }
    } catch (err) {
      console.warn('[TimeSource] Failed to load/parse time-override.json:', err);
      // No pin file / 404 / malformed - perfectly fine, manual mode stays off.
    }
  };

  const collectAll = async () => {
    lastCollectAt = Date.now();
    await Promise.allSettled([
      collectHttpDate('cdn.jsdelivr.net', 'https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css'),
      collectWorldTimeApi(),
      collectTimeApiIo(),
    ]);
  };

  engine.ensureStarted = () => {
    if (started) return;
    started = true;
    engine.loadPersisted();
    collectPin();
    // Start collecting after first paint so we never compete with the CSV load.
    setTimeout(() => { collectAll(); }, 1200);
    // Drift correction while the tab stays open + resync when returning to a
    // throttled background tab (background intervals can be clamped to 1/min).
    setInterval(() => {
      if (document.visibilityState === 'visible') collectAll();
    }, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      engine.now(); // refresh subscribers immediately on return
      if (Date.now() - lastCollectAt > 2 * 60 * 1000) collectAll();
    });
  };

  return engine;
}

const isBrowser = typeof window !== 'undefined' && typeof fetch === 'function';
export const timeSource = isBrowser
  ? makeBrowserTimeSource({ pinUrl: `${import.meta.env?.BASE_URL ?? '/'}time-override.json` })
  : null;

/**
 * Truthful badge metadata for the countdown's time-source note (ISSUE 4).
 * Source type and confidence are kept logically separate: network
 * synchronization is NEVER labeled as an official time, because no official
 * authority backs these endpoints. Pure function - unit-tested in
 * scripts/verify-timesource.mjs across every UI state.
 *
 * @param {string} sourceType - 'network' | 'device' | 'persisted' | 'disagreeing' | 'pin'
 * @param {string} confidence - 'low' | 'medium' | 'high' | 'pin'
 * @returns {{ label: string, dot: string, title: string }}
 */
export const timeBadgeMeta = (sourceType, confidence) => {
  if (sourceType === 'pin') {
    return { label: 'زمان دستی', dot: 'bg-violet-500', title: 'مدیر سایت زمان مرجع را دستی تنظیم کرده است' };
  }
  if (sourceType === 'disagreeing') {
    return { label: 'منابع در تضاد', dot: 'bg-rose-500', title: 'منابع شبکه‌ای با هم هم‌خوانی ندارند؛ از آخرین تقدير معتبر استفاده شده' };
  }
  if (sourceType === 'persisted') {
    return { label: 'زمان ذخیره‌شده', dot: 'bg-slate-400', title: 'بر اساس زمان ذخیره‌شده از جلسه قبل' };
  }
  if (sourceType === 'network') {
    if (confidence === 'high') {
      return {
        label: 'زمان شبکه (هم‌خوان)',
        dot: 'bg-emerald-500',
        title: 'چند منبع شبکه‌ای مستقل با هم هم‌خوان‌اند؛ هیچ مرجع رسمی‌ای پشت این زمان نیست',
      };
    }
    return {
      label: 'زمان شبکه (تک‌منبع)',
      dot: 'bg-amber-500',
      title: 'بر اساس یک منبع شبکه‌ای؛ بهتر از ساعت دستگاه اما تک‌منبع و غیررسمی',
    };
  }
  return { label: 'ساعت دستگاه', dot: 'bg-slate-400', title: 'منبع شبکه‌ای در دسترس نبود؛ بر اساس ساعت همین دستگاه' };
};
