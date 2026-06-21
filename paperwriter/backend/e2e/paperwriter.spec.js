const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  // Use page.evaluate to ensure the cookie is set on the browser context
  await page.goto('/');
  await page.evaluate(async () => {
    await fetch('/api/auth/dev-login/', { method: 'POST' });
  });
  // Reload the page now that the cookie is set
  await page.reload();
});

test.describe('PaperWriter E2E', () => {

  test('should load the dashboard and show the sample project', async ({ page }) => {
    // Wait for dashboard to be visible
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 10000 });
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'debug-dashboard.png' });
    await page.screenshot({ path: 'screenshot.png' });

    // There should be a "Sample Project" card
    const projectCard = page.locator('.document-card').filter({ hasText: 'Sample Project' }).first();
    await expect(projectCard).toBeVisible();
  });

  test('should load document editor and type in Tiptap', async ({ page }) => {
    const projectCard = page.locator('.document-card').filter({ hasText: 'Sample Project' }).first();
    await projectCard.click();
    
    // Wait for the app view
    await expect(page.locator('#editor-view')).toBeVisible();
    
    // Abstract section should be present
    const abstractNav = page.locator('.nav-item:has-text("Abstract")').first();
    await expect(abstractNav).toBeVisible();
    await abstractNav.click();
    
    // Wait for the Tiptap editor
    const editor = page.locator('.ProseMirror').first();
    await expect(editor).toBeVisible();
    
    // Type text
    await editor.fill('This is an E2E Playwright test.');
    
    // Verify content
    await expect(editor).toContainText('This is an E2E Playwright test.');
  });

  test('should interact with the image dropzone and upload an image', async ({ page }) => {
    const projectCard = page.locator('.document-card').filter({ hasText: 'Sample Project' }).first();
    await projectCard.click();
    await expect(page.locator('#editor-view')).toBeVisible();
    
    // Open Images Modal
    await page.locator('#images-btn').click();
    
    // The dropzone
    const dropZone = page.locator('#img-drop-zone');
    await expect(dropZone).toBeVisible();
    
    // Set up file chooser intercept
    const fileChooserPromise = page.waitForEvent('filechooser');
    await dropZone.click();
    const fileChooser = await fileChooserPromise;
    
    // Upload a small 1x1 png base64 encoded into a buffer
    const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    await fileChooser.setFiles({
        name: 'test_image.png',
        mimeType: 'image/png',
        buffer: buffer
    });
    
    // The gallery should eventually contain the image.
    // The sample doc comes with 1 image, so after upload there should be 2.
    const galleryItems = page.locator('#images-gallery .img-thumb-card');
    await expect(galleryItems).toHaveCount(2, { timeout: 10000 });
  });

  test('should open PDF preview logic', async ({ page }) => {
    const projectCard = page.locator('.document-card').filter({ hasText: 'Sample Project' }).first();
    await projectCard.click();
    await expect(page.locator('#editor-view')).toBeVisible();
    
    // Click the Export button
    const exportBtn = page.locator('#export-btn');
    await expect(exportBtn).toBeVisible();
    
    await exportBtn.click();
    // Verify button state changes to compiling
    await expect(exportBtn).toContainText('Exporting...');
    
    // Wait for the button state to reset back to "Export Document" (indicates completion or error fallback)
    await expect(exportBtn).toHaveText('Export Document', { timeout: 15000 });
  });

});
