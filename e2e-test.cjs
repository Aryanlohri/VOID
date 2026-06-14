const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const browserLogs = [];
  page.on('console', msg => {
    browserLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    browserLogs.push(`[PAGE_ERROR] ${err.message}`);
  });

  console.log('1. Navigating...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('2. Clicking Run...');
  await page.click('#btnRun');

  console.log('3. Waiting for execution...');
  await page.waitForTimeout(6000);

  console.log('\n=== DEBUGGER CONSOLE PANEL ===');
  // Get all individual console line texts
  const lines = await page.$$eval('.console-line, .console-lines > div, [class*="console-line"]', els =>
    els.map(el => el.textContent.trim()).filter(Boolean)
  );
  if (lines.length > 0) {
    lines.forEach(l => console.log('  ', l));
  } else {
    // Fallback: get entire panel text
    const panelText = await page.$eval('.console-panel, [class*="console"]', el => el.textContent).catch(() => 'NOT FOUND');
    console.log(panelText);
  }

  console.log('\n=== BROWSER CONSOLE (worker errors show here) ===');
  browserLogs.forEach(l => console.log('  ', l));

  console.log('\n=== SCREENSHOT ===');
  await page.screenshot({ path: 'test-screenshot.png', fullPage: true });
  console.log('Saved to test-screenshot.png');

  await browser.close();
  console.log('\nDone.');
})();
