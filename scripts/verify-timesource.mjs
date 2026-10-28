// Consensus-logic verification for the trusted-clock engine (lib/timeSource.js).
// Runs the pure TimeEngine in Node with synthetic samples - no network, no DOM.
import { TimeEngine } from '../src/lib/timeSource.js';

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

console.log('\n── 5. exactly 2 wildly-disagreeing samples → faster RTT wins');
{
  const e = fresh();
  const t = 1_000_000;
  e.addSample({ sourceId: 'fast-liar', serverEpochMs: t + 3600_000, t0: t, t1: t + 50 });
  e.addSample({ sourceId: 'slow-honest', serverEpochMs: t + 1000, t0: t, t1: t + 4000 });
  ok('picks the low-RTT source (even if it is the liar)', Math.abs(e.getState().offsetMs - 3600_000) <= 50,
    `${e.getState().offsetMs}ms`);
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

console.log(`\n──────────────────────────────\nRESULT: ${fail === 0 ? 'ALL TIME-SOURCE CHECKS PASSED' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail ? 1 : 0);
