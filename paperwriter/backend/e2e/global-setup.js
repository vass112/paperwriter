const { chromium } = require('@playwright/test');

async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8000';
  await page.goto(base + '/');
  const ok = await page.evaluate(async () => {
    try {
      const csrfToken = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
      const r = await fetch('/api/auth/dev-login/', {
        method: 'POST',
        headers: { 'X-CSRFToken': csrfToken }
      });
      return r.ok;
    } catch { return false; }
  });

  if (!ok) throw new Error('dev-login failed in global setup');

  await page.goto(base + '/');
  await page.waitForFunction(() => {
    const dv = document.getElementById('dashboard-view');
    return dv && getComputedStyle(dv).display !== 'none';
  }, { timeout: 30000 });
  await page.waitForSelector('.document-card', { timeout: 30000 });

  await context.storageState({ path: 'e2e/.auth.json' });
  await browser.close();
}

module.exports = globalSetup;
