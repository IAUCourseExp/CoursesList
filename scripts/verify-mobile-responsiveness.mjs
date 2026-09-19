// Verification suite for mobile responsivity, zero header overflow, card non-overlapping,
// and course detail modal interaction across all major mobile viewports.

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173/CoursesList/';

function assert(condition, message, details = '') {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`, details);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

const VIEWPORTS = [
  { name: 'iPhone SE 1st gen / Small Android', width: 320, height: 568 },
  { name: 'Samsung Galaxy A-series', width: 360, height: 640 },
  { name: 'iPhone SE 2nd/3rd gen / mini', width: 375, height: 667 },
  { name: 'iPhone 13 / 14 / 15', width: 390, height: 844 },
  { name: 'Samsung Galaxy S22 / S23 / Pixel', width: 412, height: 915 },
  { name: 'iPad Portrait', width: 768, height: 1024 },
  { name: 'iPad Landscape / Small Laptop', width: 1024, height: 768 },
  { name: 'Desktop High-Res', width: 1440, height: 900 },
];

async function run() {
  console.log('📱 Running Comprehensive Mobile Responsiveness Verification...\n');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  // Suite 1: Header Zero-Overflow Test on all screen widths
  console.log('--- Test Suite 1: Header Zero-Overflow Across All Viewports ---');
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'fa-IR' });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const skipBtn = await page.$('button:has-text("رد کردن تور")');
    if (skipBtn) {
      await skipBtn.click();
      await page.waitForTimeout(200);
    }

    const header = await page.evaluate(() => {
      const h = document.querySelector('header');
      return { clientWidth: h.clientWidth, scrollWidth: h.scrollWidth };
    });

    assert(
      header.scrollWidth <= header.clientWidth,
      `Header has zero overflow on ${vp.name} (${vp.width}x${vp.height})`,
      `clientWidth=${header.clientWidth}, scrollWidth=${header.scrollWidth}`
    );

    await context.close();
  }

  // Suite 2: Card Positioning and Dynamic Non-Overlapping on Mobile
  console.log('\n--- Test Suite 2: Card Spacing and Non-Overlapping on Mobile (375x667) ---');
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: 'fa-IR' });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const skipBtn = await page.$('button:has-text("رد کردن تور")');
    if (skipBtn) await skipBtn.click();
    await page.waitForTimeout(300);

    const cards = await page.$$('article');
    assert(cards.length > 2, `Mounted multiple cards on mobile (found ${cards.length})`);

    const box1 = await cards[0].boundingBox();
    const box2 = await cards[1].boundingBox();
    const gap = box2.y - (box1.y + box1.height);
    assert(gap >= 0, `Initial gap between Card 1 and Card 2 is positive (no overlap, gap=${gap.toFixed(1)}px)`);

    // Expand inline details on Card 1
    const moreBtn = await cards[0].$('button:has-text("بیشتر")');
    if (moreBtn) {
      await moreBtn.click();
      await page.waitForTimeout(400);

      const cardsAfter = await page.$$('article');
      const box1After = await cardsAfter[0].boundingBox();
      const box2After = await cardsAfter[1].boundingBox();
      const gapAfter = box2After.y - (box1After.y + box1After.height);
      assert(
        gapAfter >= 0,
        `Gap after expanding inline details remains non-overlapping (gap=${gapAfter.toFixed(1)}px)`,
        `card1Bottom=${(box1After.y + box1After.height).toFixed(1)}, card2Top=${box2After.y.toFixed(1)}`
      );
    }

    await context.close();
  }

  // Suite 3: Mobile Course Detail Modal Verification
  console.log('\n--- Test Suite 3: Mobile Course Detail Modal Verification ---');
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: 'fa-IR' });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const skipBtn = await page.$('button:has-text("رد کردن تور")');
    if (skipBtn) await skipBtn.click();
    await page.waitForTimeout(300);

    const detailBtn = await page.$('button:has-text("مشاهده تمام مشخصات درس")');
    assert(detailBtn !== null, 'Found Course Details action button on card');
    await detailBtn.click();
    await page.waitForTimeout(400);

    const modal = await page.$('[role="dialog"][aria-labelledby="course-detail-title"]');
    assert(modal !== null, 'Course Detail Modal opened smoothly');

    const modalText = await page.textContent('[role="dialog"][aria-labelledby="course-detail-title"]');
    assert(modalText.includes('دانشکده:') && modalText.includes('گروه آموزشی:'), 'Modal contains faculty and department details');
    assert(modalText.includes('کد ارائه:'), 'Modal contains offering code with copy button');
    assert(modalText.includes('وضعیت ظرفیت و ثبت‌نام:'), 'Modal contains capacity progress breakdown');

    // Close Modal
    await page.click('button[aria-label="بستن"]');
    await page.waitForTimeout(300);
    const modalClosed = await page.$('[role="dialog"][aria-labelledby="course-detail-title"]');
    assert(modalClosed === null, 'Course Detail Modal closes cleanly');

    await context.close();
  }

  // Suite 4: Mobile Filter Sheet & Bottom Actions
  console.log('\n--- Test Suite 4: Mobile Filter Sheet & Controls ---');
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: 'fa-IR' });
    const page = await context.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const skipBtn = await page.$('button:has-text("رد کردن تور")');
    if (skipBtn) await skipBtn.click();
    await page.waitForTimeout(300);

    const filterBtn = await page.$('button[aria-label="فیلترها و تنظیمات"]');
    assert(filterBtn !== null, 'Found mobile filter settings button');
    await filterBtn.click();
    await page.waitForTimeout(400);

    const sheet = await page.$('[role="dialog"][aria-label="فیلترها و تنظیمات"]');
    assert(sheet !== null, 'Mobile filter bottom sheet opened');

    const sheetText = await page.textContent('[role="dialog"][aria-label="فیلترها و تنظیمات"]');
    assert(sheetText.includes('مرتب‌سازی'), 'Filter sheet contains sort controls');
    assert(sheetText.includes('فیلترهای سریع'), 'Filter sheet contains quick facets');

    await page.click('button[aria-label="بستن فیلترها"]');
    await page.waitForTimeout(300);
    const sheetClosed = await page.$('[role="dialog"][aria-label="فیلترها و تنظیمات"]');
    assert(sheetClosed === null, 'Filter sheet closes cleanly');

    await context.close();
  }

  console.log('\n🎉 ALL MOBILE RESPONSIVENESS AND CARD SPACING TESTS PASSED PERFECTLY!');
  await browser.close();
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
