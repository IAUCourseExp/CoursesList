// Pass-3 design/mobile audit driver. Runs the PRODUCTION build (vite preview)
// and produces hard measurements plus evidence screenshots. Read-only over
// project files. Usage:
//   node scripts/audit-pass3.mjs <evidenceDir> [baseUrl]
import fs from 'node:fs';
import { chromium } from 'playwright';

const EVIDENCE = process.argv[2] || 'audit-evidence';
const BASE = process.argv[3] || 'http://localhost:4173/CoursesList/';
fs.mkdirSync(EVIDENCE, { recursive: true });

const MOBILE = [[320, 568], [320, 640], [360, 640], [375, 667], [390, 844], [412, 915], [430, 932], [600, 800], [768, 1024], [820, 1024]];
const DESKTOP = [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
const LANDSCAPE = [[844, 390], [932, 430]];

const results = { pages: [], interactions: [], contrast: [] };

const dismissTour = async (p) => {
  for (let i = 0; i < 10; i++) {
    if (await p.locator('[aria-labelledby=tour-step-title]').count()) {
      await p.keyboard.press('Escape');
      await p.waitForTimeout(250);
      if (!(await p.locator('[aria-labelledby=tour-step-title]').count())) return;
    } else await p.waitForTimeout(250);
  }
};

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg, bg) {
  const a = luminance(fg);
  const c = luminance(bg);
  return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
}
const parseColor = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);

async function newPage(browser, [w, h]) {
  const p = await (await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true })).newPage();
  const errs = [];
  const failed = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 120)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
  p.on('requestfailed', (r) => {
    const u = r.url();
    if (!u.includes('jsdelivr') && !u.includes('worldtimeapi') && !u.includes('timeapi.io')) failed.push(u.slice(0, 90));
  });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await dismissTour(p);
  await p.waitForTimeout(350);
  return { p, errs, failed };
}

const layoutSnapshot = (p) => p.evaluate(() => {
  const doc = document.documentElement;
  const small = [];
  for (const el of document.querySelectorAll('button, a, input, select, [role=button]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (Math.min(r.width, r.height) < 32) {
      small.push({
        label: (el.getAttribute('aria-label') || el.title || el.textContent || '').trim().slice(0, 28),
        w: Math.round(r.width), h: Math.round(r.height),
      });
    }
  }
  return {
    overflowX: doc.scrollWidth > doc.clientWidth + 1,
    overflowPx: Math.max(0, doc.scrollWidth - doc.clientWidth),
    smallTargets: small.slice(0, 6),
    smallCount: small.length,
  };
});

// ── 1. Static sweep: every viewport ─────────────────────────────────────────
const browser = await chromium.launch();
for (const [w, h] of [...MOBILE, ...DESKTOP, ...LANDSCAPE]) {
  const kind = MOBILE.some(([mw]) => mw === w && h < 800) && w < 900 ? 'mobile' : (LANDSCAPE.some(([lw, lh]) => lw === w) ? 'landscape' : 'desktop');
  const { p, errs, failed } = await newPage(browser, [w, h]);
  const layout = await layoutSnapshot(p);
  const shot = path => `${EVIDENCE}/main-${w}x${h}.png`;
  await p.screenshot({ path: shot(w) });
  results.pages.push({
    viewport: `${w}x${h}`, kind,
    overflowX: layout.overflowX, overflowPx: layout.overflowPx,
    smallCount: layout.smallCount, smallTargets: layout.smallTargets,
    consoleErrors: errs, failedRequests: failed, screenshot: shot(w),
  });
  await p.close();
}

// ── 2. Interactive workflows at 375×667 (mobile) and 1440×900 (desktop) ────
for (const [w, h, tag] of [[375, 667, 'mobile'], [1440, 900, 'desktop']]) {
  const { p, errs } = await newPage(browser, [w, h]);
  const check = (name, ok, extra = '') => results.interactions.push({ viewport: tag, name, ok, extra });

  // search + empty state
  await p.getByLabel('جستجوی دروس').fill('zzzzهیچ');
  await p.waitForTimeout(700);
  const emptyVisible = await p.evaluate(() => document.body.innerText.includes('هیچ درسی با این مشخصات'));
  check('empty search state visible', emptyVisible);
  await p.screenshot({ path: `${EVIDENCE}/empty-state-${tag}.png` });
  await p.getByLabel('جستجوی دروس').fill('ورزش');
  await p.waitForTimeout(700);
  const rows = await p.evaluate(() => document.querySelectorAll('[data-index]').length);
  check('search results render', rows > 0, `${rows} rows`);

  // bookmark + cart drawer open/scroll/close
  await p.locator('[aria-label="افزودن به سبد انتخاب واحد"]:visible').first().click();
  await p.waitForTimeout(350);
  await p.locator('button[title*="مشاهده سبد انتخاب واحد"]:visible').first().click();
  await p.waitForTimeout(550);
  const cartScroll = await p.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="سبد انتخاب واحد"]');
    if (!d) return { open: false };
    const r = d.getBoundingClientRect();
    const sc = d.querySelector('.overflow-y-auto');
    return { open: true, fits: r.top >= -1 && r.bottom <= window.innerHeight + 1, scroller: !!sc };
  });
  check('cart drawer opens and fits', cartScroll.open && cartScroll.fits);
  await p.screenshot({ path: `${EVIDENCE}/cart-${tag}.png` });
  await p.getByRole('button', { name: /خروجی تقویم/ }).first().click();
  await p.waitForTimeout(450);
  const semFits = await p.evaluate(() => {
    const d = document.querySelector('[aria-labelledby=semester-confirm-title]');
    if (!d) return false;
    const r = d.getBoundingClientRect();
    return r.top >= -1 && r.bottom <= window.innerHeight + 1;
  });
  check('semester dialog fits', semFits);
  await p.screenshot({ path: `${EVIDENCE}/semester-dialog-${tag}.png` });
  await p.getByRole('button', { name: 'انصراف' }).click();
  await p.waitForTimeout(250);
  await p.keyboard.press('Escape'); // close cart
  await p.waitForTimeout(300);

  // help panel open/tab/close
  await p.locator('[data-help-btn]:visible').first().click();
  await p.waitForTimeout(500);
  const helpOk = await p.evaluate(() => !!document.querySelector('[aria-labelledby=help-title]'));
  check('help panel opens', helpOk);
  await p.screenshot({ path: `${EVIDENCE}/help-${tag}.png` });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  check('help closes via Escape', (await p.evaluate(() => !document.querySelector('[aria-labelledby=help-title]'))));

  // detail modal via card/table
  await p.locator('[aria-label="افزودن به سبد انتخاب واحد"]:visible').first().click();
  await p.waitForTimeout(300);
  // open detail: double-click the first row / tap the card title area
  if (tag === 'desktop') {
    await p.locator('[data-index] [role=cell]').nth(2).dblclick();
  } else {
    await p.locator('article button:has-text("مشاهده تمام مشخصات درس")').first().click().catch(() => {});
  }
  await p.waitForTimeout(500);
  const detailOpen = await p.evaluate(() => !!document.querySelector('#course-detail-title'));
  check('course detail opens', detailOpen);
  if (detailOpen) await p.screenshot({ path: `${EVIDENCE}/detail-${tag}.png` });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);

  // weekly timetable + exam views render
  await p.getByRole('button', { name: 'برنامه هفتگی' }).first().click();
  await p.waitForTimeout(600);
  const weeklyOk = await p.evaluate(() => document.body.innerText.includes('شنبه') || document.body.innerText.includes('برنامه هفتگی'));
  check('weekly timetable view renders', weeklyOk);
  await p.screenshot({ path: `${EVIDENCE}/weekly-${tag}.png` });
  await p.getByRole('button', { name: /امتحانات/ }).first().click();
  await p.waitForTimeout(600);
  const examOk = await p.evaluate(() => document.body.innerText.includes('امتحان'));
  check('exam view renders', examOk);
  await p.screenshot({ path: `${EVIDENCE}/exams-${tag}.png` });
  await p.getByRole('button', { name: 'جدول دروس' }).first().click();
  await p.waitForTimeout(400);

  results.interactions.push({ viewport: tag, name: 'page errors during interactions', ok: errs.length === 0, extra: errs.slice(0, 3).join(' | ') });
  await p.close();
}

// ── 3. Contrast probes ──────────────────────────────────────────────────────
{
  const { p } = await newPage(browser, [375, 667]);
  const probes = await p.evaluate(() => {
    const collect = [];
    for (const el of document.querySelectorAll('.text-slate-400, .text-slate-500, .text-slate-600, .text-amber-800, .text-rose-700')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      collect.push({
        cls: (el.getAttribute('class') || '').split(' ').filter((c) => c.startsWith('text-')).slice(0, 2).join(' '),
        fg: cs.color,
        bg: cs.backgroundColor,
        size: cs.fontSize,
        text: el.textContent.trim().slice(0, 20),
      });
      if (collect.length >= 12) break;
    }
    return collect;
  });
  for (const pr of probes) {
    const fg = parseColor(pr.fg);
    const bg = pr.bg === 'rgba(0, 0, 0, 0)' || pr.bg === 'transparent' ? [255, 255, 255] : parseColor(pr.bg);
    results.contrast.push({ viewport: '375x667', cls: pr.cls, text: pr.text, ratio: +contrast(fg, bg).toFixed(2), size: pr.size });
  }
  await p.close();
}

fs.writeFileSync(`${EVIDENCE}/audit-results.json`, JSON.stringify(results, null, 2));
const overflow = results.pages.filter((r) => r.overflowX);
const small = results.pages.filter((r) => r.smallCount > 0);
const failedInteractions = results.interactions.filter((r) => !r.ok);
console.log('PAGES:', results.pages.length, '| overflowX:', overflow.map((r) => r.viewport).join(',') || 'none');
console.log('SMALL TARGETS:', small.map((r) => `${r.viewport}:${r.smallCount}`).join(' ') || 'none');
for (const s of small) console.log('  ', s.viewport, JSON.stringify(s.smallTargets));
console.log('INTERACTIONS FAILED:', failedInteractions.length);
for (const f of failedInteractions) console.log('  ', f.viewport, f.name, f.extra);
console.log('LOW CONTRAST (<4.5):', results.contrast.filter((c) => c.ratio < 4.5).map((c) => `${c.cls}=${c.ratio}`).join(' ') || 'none');
console.log('FULL JSON:', `${EVIDENCE}/audit-results.json`);
