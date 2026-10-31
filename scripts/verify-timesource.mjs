// Consensus-logic verification for the trusted-clock engine (lib/timeSource.js).
// Runs the pure TimeEngine in Node with synthetic samples - no network, no DOM.
import { TimeEngine, timeBadgeMeta } from '../src/lib/timeSource.js';

let fail = 0;
const ok = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' - ' + extra : ''}`);
  if (!cond) fail++;
};

const fresh = (opts = {}) => new TimeEngine({ ...opts });

console.log('── 1. no samples → device clock, low confidence');
{
  const e = fresh();
  const before = Date.now();
  ok('offset 0, confidence low', e.getState().offsetMs === 0 && e.getState().confidence === 'low');
  ok('now() ≈ Date.now()', Math.abs(e.now() - before) < 50);
  ok('no drift warning', e.getState().clockDrift === false);
}

console.log('\n── 2. one good sample → medium confidence, corrected clock');
{
  const e = fresh();
  const t0 = 1_000_000;
  const t1 = t0 + 100; // 100ms RTT
  // Device is 90 days SLOW: server says 90d later than device.
  const deviceNow = t1;
  const server = deviceNow + 90 * 86400000;
  e.addSample({ sourceId: 'api', serverEpochMs: server, t0, t1 });
  ok('confidence medium', e.getState().confidence === 'medium', e.getState().confidence);
  ok('offset ≈ +90d (RTT-halved)', Math.abs(e.getState().offsetMs - 90 * 86400000) <= 100,
    `${Math.round(e.getState().offsetMs / 86400000)}d`);
  ok('now() ≈ true server time', Math.abs(e.now() - (Date.now() + 90 * 86400000)) <= 150);
  ok('drift warning raised (>90s)', e.getState().clockDrift === true);
}

console.log('\n── 3. slow samples are rejected');
{
  const e = fresh();
  const t = 1_000_000;
  e.addSample({ sourceId: 'slow', serverEpochMs: t + 500 * 86400000, t0: t, t1: t + 9000 });
  ok('9s RTT sample ignored', e.getState().confidence === 'low' && e.getState().offsetMs === 0);
}

console.log('\n── 4. outlier rejection: 3 agreeing + 1 liar');
{
  const e = fresh();
  const t = 1_000_000;
  const mk = (id, off) => e.addSample({ sourceId: id, serverEpochMs: t + off, t0: t, t1: t + 100 });
  mk('a', 1000); mk('b', 1500); mk('c', 2000); mk('lie', 3600_000); // liar: +1h
  ok('consensus ignores the liar', Math.abs(e.getState().offsetMs - 1500) <= 500,
    `${Math.round(e.getState().offsetMs)}ms`);
  ok('confidence high with ≥2 agreeing sources', e.getState().confidence === 'high');
}

console.log('\n── 5. exactly 2 wildly-disagreeing samples → keep previous offset (no side-picking)');
{
  const t = 1_000_000;
  // The engine never guesses between two conflicting sources: it keeps the
  // previously agreed offset, drops confidence to low and flags 'disagreeing'
  // (this test previously asserted "faster RTT wins", which only passed
  // because the liar happened to be added first - BUG-30).
  {
    const e = fresh();
    e.addSample({ sourceId: 'seed', serverEpochMs: t + 2000, t0: t, t1: t + 100 });
    e.addSample({ sourceId: 'liar', serverEpochMs: t + 3600_000, t0: t, t1: t + 50 });
    ok('keeps the previous consensus offset', Math.abs(e.getState().offsetMs - 2000) <= 50,
      `${Math.round(e.getState().offsetMs)}ms`);
    ok('confidence drops to low and the state is flagged disagreeing',
      e.getState().confidence === 'low' && e.getState().sourceType === 'disagreeing');
  }
  {
    const e = fresh();
    // First sample stands alone and forms the (medium) consensus; the second
    // one disagrees, so the engine keeps that pre-disagreement offset.
    e.addSample({ sourceId: 'liar', serverEpochMs: t + 3600_000, t0: t, t1: t + 50 });
    e.addSample({ sourceId: 'other', serverEpochMs: t + 1200_000, t0: t, t1: t + 50 });
    ok('cold-start disagreement keeps the pre-disagreement offset',
      Math.abs(e.getState().offsetMs - 3600_000) <= 50, `${Math.round(e.getState().offsetMs)}ms`);
    ok('cold-start disagreement still flags low confidence',
      e.getState().confidence === 'low' && e.getState().sourceType === 'disagreeing');
  }
}

console.log('\n── 6. 2 agreeing samples → high confidence median');
{
  const e = fresh();
  const t = 1_000_000;
  e.addSample({ sourceId: 'a', serverEpochMs: t + 10_000, t0: t, t1: t + 100 });
  e.addSample({ sourceId: 'b', serverEpochMs: t + 10_400, t0: t, t1: t + 100 });
  ok('median of agreeing pair', Math.abs(e.getState().offsetMs - 10_200) <= 50,
    `${e.getState().offsetMs}ms`);
  ok('confidence high', e.getState().confidence === 'high');
}

console.log('\n── 7. jitter guard: sub-5s corrections are ignored once stable');
{
  const e = fresh();
  const t = 1_000_000;
  e.addSample({ sourceId: 'a', serverEpochMs: t + 60_000, t0: t, t1: t + 100 });
  e.addSample({ sourceId: 'b', serverEpochMs: t + 60_000, t0: t, t1: t + 100 });
  const stable = e.getState().offsetMs; // 60000
  e.addSample({ sourceId: 'c', serverEpochMs: t + 62_000, t0: t, t1: t + 100 });
  ok('2s correction not applied (median 61000 is within 5s band)', e.getState().offsetMs === stable,
    `${stable} → ${e.getState().offsetMs}`);
  e.addSample({ sourceId: 'd', serverEpochMs: t + 90_000, t0: t, t1: t + 100 });
  // 4 samples: [60000, 60000, 62000, 90000] → median = 61000 (1s from 60000)
  e.addSample({ sourceId: 'e', serverEpochMs: t + 90_000, t0: t, t1: t + 100 });
  // 5 samples: median = 62000 (2s from 60000, still in band)
  e.addSample({ sourceId: 'f', serverEpochMs: t + 90_000, t0: t, t1: t + 100 });
  // 6 samples: [60000, 60000, 62000, 90000, 90000, 90000] → median = 76000 (16s from 60000)
  ok('30s correction IS applied once median moves beyond the freeze band',
    Math.abs(e.getState().offsetMs - stable) > 5000,
    `${stable} → ${Math.round(e.getState().offsetMs)}`);
}

console.log('\n── 8. persisted prior: fresh restores instantly, stale discarded');
{
  const store = {};
  const e = fresh({
    persist: { read: () => store.v || null, write: (s) => { store.v = s; } },
  });
  e.loadPersisted();
  ok('empty storage → no-op', e.getState().confidence === 'low');
  store.v = { offsetMs: 42_000, confidence: 'high', savedAt: Date.now() };
  e.loadPersisted();
  ok('fresh prior applied with low confidence', e.getState().offsetMs === 42_000 && e.getState().confidence === 'low');
  ok('prior persisted back out on apply', store.v.offsetMs === 42_000);

  const e2 = fresh({ persist: { read: () => ({ offsetMs: 42_000, savedAt: Date.now() - 20 * 86400000 }) } });
  e2.loadPersisted();
  ok('prior older than 14 days discarded', e2.getState().offsetMs === 0);

  const e3 = fresh({ persist: { read: () => ({ offsetMs: 42_000, savedAt: Date.now() }) } });
  const t = 1_000_000;
  e3.addSample({ sourceId: 'live', serverEpochMs: t + 1000, t0: t, t1: t + 100 });
  e3.loadPersisted();
  ok('a live sample always beats the prior', e3.getState().offsetMs !== 42_000,
    `offset ${e3.getState().offsetMs}`);
}

console.log('\n── 9. HTTP Date header parsing');
{
  const e = fresh();
  const server = Date.parse('Wed, 28 Oct 2026 08:00:00 GMT');
  const t0 = server;      // device clock agreeing with the header...
  const t1 = t0 + 100;    // ...100ms RTT → expected offset = +500 − 50 = 450ms
  const applied = e.addHeaderSample('cdn', 'Wed, 28 Oct 2026 08:00:00 GMT', t0, t1);
  ok('valid header accepted (+500ms second-midpoint)', applied && Math.abs(e.getState().offsetMs - 450) <= 1,
    `${e.getState().offsetMs}ms`);
  ok('garbage header rejected', e.addHeaderSample('cdn', 'not a date', t0, t1) === false);
  ok('missing header rejected', e.addHeaderSample('cdn', null, t0, t1) === false);
}

console.log('\n── 10. manual pin freezes "now"');
{
  const e = fresh();
  const pin = Date.parse('2027-01-07T07:00:00+03:30');
  e.setPin(pin);
  ok('confidence pin', e.getState().confidence === 'pin' && e.getState().pin === true);
  ok('now() is exactly the pinned instant (twice)', e.now() === pin && e.now() === pin);
  ok('no drift warning in pin mode', e.getState().clockDrift === false);
  e.setPin(null);
  const t = 1_000_000;
  e.addSample({ sourceId: 'a', serverEpochMs: t + 1000, t0: t, t1: t + 100 });
  ok('unpinning returns to sampled mode', e.getState().confidence === 'medium' && !e.getState().pin);
}

console.log('\n── 11. subscribers are notified exactly on applied changes');
{
  const e = fresh();
  let calls = 0;
  const unsub = e.subscribe(() => { calls++; });
  const t = 1_000_000;
  e.addSample({ sourceId: 'a', serverEpochMs: t + 1000, t0: t, t1: t + 100 }); // applied
  e.addSample({ sourceId: 'a', serverEpochMs: t + 1001, t0: t, t1: t + 100 }); // same source, ~same → maybe not applied
  const afterFirstSource = calls;
  ok('applied sample notified', calls >= 1);
  e.addSample({ sourceId: 'b', serverEpochMs: t + 10_000, t0: t, t1: t + 100 }); // real change → applied
  ok('confidence change notified', calls > afterFirstSource);
  unsub();
  e.addSample({ sourceId: 'c', serverEpochMs: t + 60_000, t0: t, t1: t + 100 });
  ok('no notification after unsubscribe', calls === afterFirstSource + 1);
}

console.log('\n── 12. badge metadata: truthful labels for every UI state (ISSUE 4)');
{
  const cases = [
    ['network + high', 'network', 'high', 'زمان شبکه (هم‌خوان)', 'bg-emerald-500'],
    ['network + medium', 'network', 'medium', 'زمان شبکه (تک‌منبع)', 'bg-amber-500'],
    ['network + missing confidence falls back to single-source', 'network', undefined, 'زمان شبکه (تک‌منبع)', 'bg-amber-500'],
    ['device fallback', 'device', 'low', 'ساعت دستگاه', 'bg-slate-400'],
    ['persisted', 'persisted', 'low', 'زمان ذخیره‌شده', 'bg-slate-400'],
    ['disagreeing', 'disagreeing', 'low', 'منابع در تضاد', 'bg-rose-500'],
    ['manual pin', 'pin', 'pin', 'زمان دستی', 'bg-violet-500'],
    ['network failure (undefined source)', undefined, undefined, 'ساعت دستگاه', 'bg-slate-400'],
  ];
  for (const [name, st, cf, wantLabel, wantDot] of cases) {
    const meta = timeBadgeMeta(st, cf);
    ok(`${name} → "${wantLabel}"`, meta.label === wantLabel, `got "${meta.label}"`);
    ok(`${name} dot class`, meta.dot === wantDot, `got "${meta.dot}"`);
    ok(`${name} title exists and is explanatory`,
      typeof meta.title === 'string' && meta.title.length >= 20);
  }
  // The critical wording rule: no state may label network time as official.
  for (const [st, cf] of [['network', 'high'], ['network', 'medium'], ['device', 'low'], ['persisted', 'low'], ['disagreeing', 'low']]) {
    const meta = timeBadgeMeta(st, cf);
    ok(`no official-time claim for ${st}/${cf}`,
      !meta.label.includes('رسمی') && !(meta.title.includes('زمان رسمی')),
      `"${meta.label}"`);
  }
  // Pin keeps its descriptive title; only the owner-controlled state may mention it.
  ok('pin title mentions manual override', timeBadgeMeta('pin', 'pin').title.includes('دستی'));
}

console.log(`\n──────────────────────────────\nRESULT: ${fail === 0 ? 'ALL TIME-SOURCE CHECKS PASSED' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail ? 1 : 0);
