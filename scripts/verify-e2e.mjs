import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';

function assert(condition, message, details = '') {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`, details);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function run() {
  console.log('🚀 Running comprehensive browser verification against live dev server...\n');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'fa-IR'
  });
  const page = await context.newPage();

  // Test 1: Load application and verify Header & Ambient background
  console.log('--- Test Suite 1: Header, Canvas, & Telegram Links ---');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  const title = await page.title();
  assert(title.includes('سامانه هوشمند برنامه‌ریزی') || title.includes('دانشگاه آزاد'), 'Page title is accurate and Persian', title);

  const telegramLinks = await page.$$eval('a[href*="t.me"]', els => els.map(e => ({ href: e.href, text: e.textContent.trim() })));
  assert(telegramLinks.length >= 2, 'Found both Telegram channel links', JSON.stringify(telegramLinks));
  assert(telegramLinks.some(l => l.href.includes('IAUCourseExp')), 'Official IAUCourseExp channel link is present');
  assert(telegramLinks.some(l => l.href.includes('jozveiau')), 'Jozveiau channel link is present');

  const canvas = await page.$('.gemini-ambient-canvas');
  assert(canvas !== null, 'Ambient canvas background is mounted');

  const binaryBackground = await page.$('.matrix-bg-rain');
  assert(binaryBackground !== null, 'Neon cyber glow binary background animation is mounted');

  // Test 2: Auto-open Tour Guide on first visit
  console.log('\n--- Test Suite 2: Smart Interactive Tour Guide ---');
  const tourModal = await page.waitForSelector('[role="dialog"][aria-labelledby="tour-step-title"]', { timeout: 4000 });
  assert(tourModal !== null, 'Tour Guide modal opens automatically on first visit');

  const step1Title = await page.textContent('#tour-step-title');
  assert(step1Title.includes('خوش آمدید'), 'Tour Step 1 introduces system', step1Title);

  // Click Next
  await page.click('button:has-text("مرحله بعدی")');
  await page.waitForTimeout(200);
  const step2Title = await page.textContent('#tour-step-title');
  assert(step2Title.includes('جستجوی هوشمند'), 'Tour Step 2 explains smart search', step2Title);

  // Click Next again to step 3
  await page.click('button:has-text("مرحله بعدی")');
  await page.waitForTimeout(200);
  const step3Title = await page.textContent('#tour-step-title');
  assert(step3Title.includes('سبد انتخاب واحد'), 'Tour Step 3 explains cart and units', step3Title);

  // Skip/Complete tour
  await page.click('button:has-text("رد کردن تور")');
  await page.waitForTimeout(300);
  const tourClosed = await page.$('[role="dialog"][aria-labelledby="tour-step-title"]');
  assert(tourClosed === null, 'Tour closes cleanly upon skip/complete');

  // Test 3: Help Panel Academic Regulations text check
  console.log('\n--- Test Suite 3: Help Panel & Academic Regulations ---');
  const helpBtn = await page.waitForSelector('button[data-help-btn]');
  await helpBtn.click();
  await page.waitForTimeout(200);

  const helpModal = await page.waitForSelector('[role="dialog"][aria-labelledby="help-title"]');
  assert(helpModal !== null, 'Help Guide modal opened via help button');

  const modalContent = await page.textContent('[role="dialog"][aria-labelledby="help-title"]');
  const expectedPhrase = 'مجاز فقط برای دانشجویان ممتاز با معدل بالای ۱۷ و درس نیوفتاده در ترم گذشته';
  assert(modalContent.includes(expectedPhrase), 'Exact academic regulation honor student text verified', expectedPhrase);

  // Close help modal
  await page.click('button:has-text("متوجه شدم و بستن")');
  await page.waitForTimeout(200);

  // Test 4: Virtual Table and Responsive Scaling
  console.log('\n--- Test Suite 4: Table Rendering and Proportional Scaling ---');
  await page.waitForSelector('div[aria-label="جدول دروس"]');
  const tableContainer = await page.$('div[aria-label="جدول دروس"]');
  const containerBox = await tableContainer.boundingBox();
  assert(containerBox.width > 1200, 'Table container takes full responsive width', `${containerBox.width}px`);

  // Verify search input
  const searchInput = await page.waitForSelector('#search-courses');
  await searchInput.fill('فیزیک');
  await page.waitForTimeout(500);

  const rowCount = await page.$$eval('[role="row"]', rows => rows.length);
  assert(rowCount > 1, `Search returned table rows (found ${rowCount} rows)`);

  // Test 5: Add Course to Cart and verify conflict/unit calculation
  console.log('\n--- Test Suite 5: Course Cart & Registration Plan Builder ---');
  const bookmarkButtons = await page.$$('button[data-bookmark-btn]');
  assert(bookmarkButtons.length >= 2, 'Found course bookmark action buttons in table');
  await bookmarkButtons[0].click();
  await page.waitForTimeout(200);
  await bookmarkButtons[1].click();
  await page.waitForTimeout(200);

  // Open Cart Drawer
  const cartToggleBtn = await page.waitForSelector('button[title="مشاهده سبد انتخاب واحد و محاسبات"]');
  await cartToggleBtn.click();
  await page.waitForTimeout(300);

  const cartDrawer = await page.waitForSelector('[role="dialog"][aria-label="سبد انتخاب واحد"]');
  assert(cartDrawer !== null, 'Cart Drawer opened successfully');

  const unitText = await page.textContent('[role="dialog"][aria-label="سبد انتخاب واحد"]');
  assert(unitText.includes('واحد استاندارد') || unitText.includes('جمع کل واحدها'), 'Unit calculation displayed in cart');
  assert(unitText.includes('خروجی تقویم (.ics)'), 'Direct calendar export button present in cart');

  // Close cart drawer
  const closeCartBtn = await page.waitForSelector('button[aria-label="بستن"]');
  await closeCartBtn.click();
  await page.waitForTimeout(200);

  // Test 6: Exam Schedule Matrix
  console.log('\n--- Test Suite 6: Visual Exam Timeline & Calendar Matrix ---');
  const examTabBtn = await page.waitForSelector('nav[aria-label="انتخاب نمای برنامه"] button:has-text("امتحانات")');
  await examTabBtn.click();
  await page.waitForTimeout(300);

  const examView = await page.waitForSelector('text=تعداد کل امتحانات:');
  assert(examView !== null, 'Exam timeline / calendar matrix view loaded');

  // Verify matrix view button
  const matrixBtn = await page.waitForSelector('button:has-text("ماتریس تقویم")');
  assert(matrixBtn !== null, 'Compact exam calendar matrix switcher is visible');

  // Test 7: Weekly Timetable Matrix
  console.log('\n--- Test Suite 7: Weekly Timetable Matrix View ---');
  const timetableTabBtn = await page.waitForSelector('nav[aria-label="انتخاب نمای برنامه"] button:has-text("برنامه هفتگی")');
  await timetableTabBtn.click();
  await page.waitForTimeout(300);

  const timetableHeader = await page.waitForSelector('text=دروس انتخابی:');
  assert(timetableHeader !== null, 'Weekly timetable matrix view loaded');

  const saturdayHeader = await page.waitForSelector('text=شنبه');
  assert(saturdayHeader !== null, 'Saturday column present in weekly grid');

  // Return to Table View
  await page.click('nav[aria-label="انتخاب نمای برنامه"] button:has-text("جدول دروس")');
  await page.waitForTimeout(200);

  console.log('\n🎉 ALL 7 TEST SUITES PASSED PERFECTLY IN REAL BROWSER!');
  await browser.close();
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
