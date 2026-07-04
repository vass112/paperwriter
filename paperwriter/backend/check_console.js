const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', msg => console.log(`[Browser Console ${msg.type()}] ${msg.text()}`));
    page.on('pageerror', error => console.log(`[Browser Error] ${error.message}`, error.stack));

    // Try navigating to the local server
    await page.goto('http://127.0.0.1:8000/accounts/login/');
    
    // Fill in some credentials if needed, or if it redirects to Google, we might be stuck.
    // Wait, the user already has a session, but Playwright won't have it.
    // We can just create a dummy user or use django shell to get a session cookie, 
    // or just see if the error happens before login? No, the error is inside the document view.
    
    console.log("Waiting for network idle...");
    await page.waitForLoadState('networkidle');
    await browser.close();
})();
