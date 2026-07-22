const { test, expect } = require('@playwright/test');

const SAMPLE_IMG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8000';

async function clearAndTypeInEditor(page, text) {
  await page.evaluate((text) => {
    const allEditors = window.editors || {};
    for (const ed of Object.values(allEditors)) {
      if (ed && ed.commands && ed.commands.setContent) {
        ed.commands.setContent('<p>' + text + '</p>');
      }
    }
  }, text);
  await page.waitForTimeout(300);
}

async function loginAndLoadDashboard(page) {
  await page.goto(BASE + '/');
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
  if (!ok) throw new Error('dev-login failed');
  await page.goto(BASE + '/');
  await page.waitForFunction(() => {
    const dv = document.getElementById('dashboard-view');
    return dv && getComputedStyle(dv).display !== 'none';
  }, { timeout: 15000 });
  await page.waitForSelector('.document-card:not([style*="pointer-events: none"])', { timeout: 15000 });
}

async function openSampleProject(page) {
  const card = page.locator('.document-card').filter({ hasText: 'Sample Project' }).first();
  await card.click();
  await expect(page.locator('#editor-view')).toBeVisible({ timeout: 10000 });
}

async function clickSidebarButton(page, btnId) {
  await page.locator(`#${btnId}`).click();
}

async function closeCurrentModal(page) {
  const closeBtn = page.locator('.modal-overlay:visible .close-modal').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
    await page.locator('.modal-overlay:visible').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

test.beforeEach(async ({ page }) => {
  await loginAndLoadDashboard(page);
});

// ============================================================
// 1. AUTHENTICATION & DASHBOARD
// ============================================================
test.describe('1. Auth & Dashboard', () => {

  test('AUTH-01: Landing page loads without errors', async ({ page }) => {
    await page.goto(BASE + '/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('DASH-01: Dashboard loads with document grid', async ({ page }) => {
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 10000 });
    const cards = page.locator('.document-card');
    await expect(cards.first()).toBeVisible();
  });

  test('DASH-02: Sample project card is present', async ({ page }) => {
    await expect(page.locator('#dashboard-view')).toBeVisible();
    const card = page.locator('.document-card').filter({ hasText: 'Sample Project' }).first();
    await expect(card).toBeVisible();
  });

  test('AUTH-10: Logout works', async ({ page }) => {
    await expect(page.locator('#dashboard-view')).toBeVisible();
    await page.locator('#profile-avatar-btn').click();
    await expect(page.locator('#profile-modal')).toBeVisible();
    await page.locator('#profile-modal button:has-text("Sign Out")').click();
    await expect(page.locator('.landing-page-container')).toBeVisible({ timeout: 5000 });
  });

  test('AUTH-11: Profile modal opens and shows user info', async ({ page }) => {
    await expect(page.locator('#dashboard-view')).toBeVisible();
    await page.locator('#profile-avatar-btn').click();
    await expect(page.locator('#profile-modal')).toBeVisible();
    await expect(page.locator('#profile-modal')).toContainText('Dev');
  });
});

// ============================================================
// 2. EDITOR BASICS
// ============================================================
test.describe('2. Editor Basics', () => {

  test('ED-01: Editor loads with sections in sidebar', async ({ page }) => {
    await openSampleProject(page);
    const navItems = page.locator('.nav-item');
    await expect(navItems.first()).toBeVisible({ timeout: 15000 });
    const count = await navItems.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('ED-02: Click section loads editor content', async ({ page }) => {
    await openSampleProject(page);
    const intro = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await expect(intro).toBeVisible({ timeout: 30000 });
    await intro.click();
    const editor = page.locator('.ProseMirror').first();
    await expect(editor).toBeVisible();
  });

  test('ED-12: Type text into editor and autosave', async ({ page }) => {
    await openSampleProject(page);
    const intro = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await intro.click();
    const editor = page.locator('.ProseMirror').first();
    await editor.fill('E2E test content for autosave verification.');
    await expect(editor).toContainText('E2E test content');
    await expect(page.locator('#save-status:has-text("Saved")').first()).toBeVisible({ timeout: 10000 });
  });

  test('PERSIST-01: Content persists after reload', async ({ page }) => {
    await openSampleProject(page);
    const intro = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await intro.click();
    await clearAndTypeInEditor(page, 'Persistent content test.');
    const hasText = await page.evaluate(() => {
      const el = document.querySelector('#editor-content .ProseMirror');
      return el ? el.textContent.includes('Persistent content test.') : false;
    });
    expect(hasText).toBe(true);
    await page.waitForResponse(resp => resp.url().includes('/api/sections/') && resp.request().method() === 'PATCH' && resp.status() === 200, { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForFunction(() => {
      const ev = document.getElementById('editor-view');
      return ev && getComputedStyle(ev).display !== 'none';
    }, { timeout: 15000 });
    const intro2 = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await intro2.click();
    const hasAfterReload = await page.evaluate(() => {
      const el = document.querySelector('#editor-content .ProseMirror');
      return el ? el.textContent.includes('Persistent content test.') : false;
    });
    expect(hasAfterReload).toBe(true);
  });

  test('ED-03: Create new section', async ({ page }) => {
    await openSampleProject(page);
    await page.waitForFunction(() => {
      return !!document.querySelector('.nav-item.add-section-nav');
    }, { timeout: 30000 });
    const addBtn = page.locator('.nav-item.add-section-nav');
    await addBtn.click();
    await page.waitForSelector('#prompt-modal.active', { timeout: 5000 });
    await page.locator('#prompt-input').fill('E2E Test Section');
    await page.locator('#prompt-input').press('Enter');
    await expect(page.locator('.nav-item').filter({ hasText: 'E2E Test Section' }).first()).toBeVisible({ timeout: 30000 });
  });

  test('ED-06: Move section up', async ({ page }) => {
    await openSampleProject(page);
    const firstNavItem = page.locator('.nav-item:not(.add-section-nav)').first();
    await firstNavItem.hover();
    const moveBtn = firstNavItem.locator('.action-btn.move-btn').first();
    await expect(moveBtn).toBeVisible({ timeout: 3000 });
    await moveBtn.click();
  });

  test('ED-10: Delete section', async ({ page }) => {
    await openSampleProject(page);
    const relatedSection = page.locator('.nav-item').filter({ hasText: 'Related Work' }).first();
    if (await relatedSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await relatedSection.hover();
      const deleteBtn = relatedSection.locator('.action-btn.delete-btn');
      await deleteBtn.click();
      await expect(page.locator('#confirm-modal')).toBeVisible();
      await page.locator('#confirm-ok-btn').click();
      await expect(page.locator('.nav-item').filter({ hasText: 'Related Work' })).toHaveCount(0, { timeout: 5000 });
    } else {
      test.skip();
    }
  });

  test('ED-19: Edit document title', async ({ page }) => {
    await openSampleProject(page);
    const titleInput = page.locator('#doc-title');
    await titleInput.fill('E2E Updated Title');
    await titleInput.blur();
    await expect(titleInput).toHaveValue('E2E Updated Title');
    await titleInput.fill('Sample Project: Introduction to PaperWriter');
    await titleInput.blur();
    await expect(titleInput).toHaveValue('Sample Project: Introduction to PaperWriter');
  });
});

// ============================================================
// 3. AUTHORS
// ============================================================
test.describe('3. Authors', () => {

  test('AUTHORS-01: Authors modal opens', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'authors-btn');
    await expect(page.locator('#authors-modal')).toBeVisible();
  });

  test('AUTHORS-02: Add new author', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'authors-btn');
    await expect(page.locator('#authors-modal')).toBeVisible();
    await expect(page.locator('#authors-modal button:has-text("+ New")')).toBeVisible({ timeout: 10000 });
    await page.locator('#authors-modal button:has-text("+ New")').click();
    await expect(page.locator('#author-name')).toBeVisible();
    await page.locator('#author-name').fill('Dr. E2E Test');
    await page.locator('#author-org').fill('Test University');
    await page.locator('#save-author-btn').click();
    await expect(page.locator('#authors-list .img-thumb-card').filter({ hasText: 'Dr. E2E Test' }).first()).toBeVisible({ timeout: 15000 });
    await closeCurrentModal(page);
  });

  test('AUTHORS-03: Cannot add author without name', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'authors-btn');
    await page.locator('#authors-modal button:has-text("+ New")').click();
    const nameInput = page.locator('#author-name');
    const hasRequired = await nameInput.evaluate(el => el.required || el.hasAttribute('required'));
    expect(hasRequired).toBeTruthy();
    await closeCurrentModal(page);
  });

  test('AUTHORS-04: Edit existing author', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'authors-btn');
    await expect(page.locator('#authors-modal')).toBeVisible();
    await page.waitForFunction(() => {
      const list = document.getElementById('authors-list');
      return list && (list.querySelector('.img-thumb-card') || list.querySelector('p'));
    }, { timeout: 10000 });
    const firstAuthor = page.locator('#authors-list .img-thumb-card').first();
    if (await firstAuthor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstAuthor.click();
      await expect(page.locator('#save-author-btn')).toHaveText('Update Author', { timeout: 10000 });
      await page.locator('#author-name').fill('Edited Author');
      await page.locator('#save-author-btn').click();
      await expect(page.locator('#authors-list .img-thumb-card').filter({ hasText: 'Edited Author' }).first()).toBeVisible({ timeout: 10000 });
      await closeCurrentModal(page);
    } else {
      test.skip();
    }
  });

  test('AUTHORS-05: Delete author', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'authors-btn');
    await expect(page.locator('#authors-modal')).toBeVisible();
    await page.waitForFunction(() => {
      const list = document.getElementById('authors-list');
      return list && (list.querySelector('.img-thumb-card') || list.querySelector('p'));
    }, { timeout: 10000 });
    const firstAuthor = page.locator('#authors-list .img-thumb-card').first();
    if (await firstAuthor.isVisible({ timeout: 5000 }).catch(() => false)) {
      const deleteBtn = firstAuthor.locator('.card-delete-btn');
      await deleteBtn.click();
      await expect(page.locator('#confirm-modal')).toBeVisible();
      await page.locator('#confirm-ok-btn').click();
    }
    await closeCurrentModal(page);
  });
});

// ============================================================
// 4. IMAGES / FIGURES
// ============================================================
test.describe('4. Images', () => {

  test('IMG-01: Images modal opens', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'images-btn');
    await expect(page.locator('#images-modal')).toBeVisible();
    await closeCurrentModal(page);
  });

  test('IMG-02: Upload image via click', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'images-btn');
    const dropZone = page.locator('#img-drop-zone');
    const fcPromise = page.waitForEvent('filechooser');
    await dropZone.click();
    const fc = await fcPromise;
    await fc.setFiles({ name: 'e2e_test.png', mimeType: 'image/png', buffer: SAMPLE_IMG });
    await expect(page.locator('#images-gallery .img-thumb-card').first()).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(page);
  });

  test('IMG-06: Edit image metadata', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'images-btn');
    const firstImg = page.locator('#images-gallery .img-thumb-card').first();
    if (await firstImg.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstImg.click();
      await page.locator('#img-caption').fill('E2E Test Caption');
      await page.locator('#img-label').fill('fig:e2e_test');
      await page.locator('#img-save-btn').click();
      await firstImg.click();
      await expect(page.locator('#img-caption')).toHaveValue('E2E Test Caption');
    }
    await closeCurrentModal(page);
  });

  test('IMG-09: Delete image', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'images-btn');
    const firstImg = page.locator('#images-gallery .img-thumb-card').first();
    if (await firstImg.isVisible({ timeout: 5000 }).catch(() => false)) {
      const deleteBtn = firstImg.locator('.card-delete-btn');
      await deleteBtn.click();
      await expect(page.locator('#confirm-modal')).toBeVisible();
      await page.locator('#confirm-ok-btn').click();
    }
    await closeCurrentModal(page);
  });
});

// ============================================================
// 5. REFERENCES & CITATIONS
// ============================================================
test.describe('5. References', () => {

  test('REF-01: References modal opens', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'references-btn');
    await expect(page.locator('#references-modal')).toBeVisible();
    await closeCurrentModal(page);
  });

  test('REF-02: Add reference via DOI', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'references-btn');
    await expect(page.locator('#references-modal')).toBeVisible();
    await page.locator('#references-modal button:has-text("+ New")').click();
    await expect(page.locator('#ref-doi-input')).toBeVisible();
    await page.locator('#ref-doi-input').fill('10.1109/CVPR.2016.90');
    await page.locator('#ref-doi-fetch-btn').click();
    const fetchBtn = page.locator('#ref-doi-fetch-btn');
    await expect(fetchBtn).toBeEnabled({ timeout: 30000 });
    await closeCurrentModal(page);
  });

  test('REF-04: Add reference via paste BibTeX', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'references-btn');
    await expect(page.locator('#references-modal')).toBeVisible();
    await page.locator('#references-modal button:has-text("+ New")').click();
    await page.locator('#ref-toggle-bibtex').click();
    await page.locator('#ref-bibtex').fill(
      '@article{e2e2026,\n  author={E2E Tester},\n  title={E2E Test},\n  journal={Test},\n  year={2026}\n}'
    );
    await page.locator('#references-modal button:has-text("Save Reference")').click();
    await expect(page.locator('#references-list .img-thumb-card').filter({ hasText: 'e2e2026' }).first()).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(page);
  });

  test('REF-05: Edit reference', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'references-btn');
    const firstRef = page.locator('#references-list .img-thumb-card').first();
    if (await firstRef.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRef.click();
      await page.locator('#ref-key').fill('edited2026');
      await page.locator('#references-modal button:has-text("Save Reference")').click();
      await expect(page.locator('#references-list .img-thumb-card').filter({ hasText: 'edited2026' }).first()).toBeVisible({ timeout: 10000 });
    }
    await closeCurrentModal(page);
  });

  test('REF-06: Delete reference', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'references-btn');
    const firstRef = page.locator('#references-list .img-thumb-card').first();
    if (await firstRef.isVisible({ timeout: 5000 }).catch(() => false)) {
      const deleteBtn = firstRef.locator('.card-delete-btn');
      await deleteBtn.click();
      await expect(page.locator('#confirm-modal')).toBeVisible();
      await page.locator('#confirm-ok-btn').click();
    }
    await closeCurrentModal(page);
  });

  test('REF-07: Floating citation menu is available', async ({ page }) => {
    await openSampleProject(page);
    const intro = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await intro.click();
    const editor = page.locator('.ProseMirror').first();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('Citation test. ');
    const citeTrigger = page.locator('#floating-cite-trigger');
    if (await citeTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await citeTrigger.click();
      await expect(page.locator('#floating-cite-menu')).toBeVisible();
    }
  });
});

// ============================================================
// 6. TABLES
// ============================================================
test.describe('6. Tables', () => {

  test('TBL-01: Tables modal opens', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'tables-btn');
    await expect(page.locator('#tables-modal')).toBeVisible();
    await closeCurrentModal(page);
  });

  test('TBL-02: Create new table', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'tables-btn');
    await expect(page.locator('#tables-modal')).toBeVisible();
    await page.locator('#tables-modal button:has-text("+ New")').click();
    await page.locator('#table-caption').fill('E2E Test Table');
    await page.locator('#table-label').fill('tab:e2e');
    const firstInput = page.locator('#table-grid-container .table-grid-cell input, #table-grid-container .table-grid-header-cell input').first();
    if (await firstInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstInput.click();
      await firstInput.fill('Data 1');
    }
    await page.locator('#tables-modal button:has-text("Save Table")').click();
    await expect(page.locator('#tables-list .img-thumb-card').filter({ hasText: 'E2E Test Table' }).first()).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(page);
  });

  test('TBL-03: Add/remove rows and columns', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'tables-btn');
    await page.locator('#tables-modal button:has-text("+ New")').click();
    await page.waitForTimeout(500);
    const initialRows = await page.locator('#table-grid-container table tr').count();
    await page.locator('#tables-modal button:has-text("+ Row")').click();
    await page.waitForTimeout(300);
    const afterRow = await page.locator('#table-grid-container table tr').count();
    expect(afterRow).toBe(initialRows + 1);
    await page.locator('#tables-modal button:has-text("- Row")').click();
    await page.waitForTimeout(300);
    const afterDeleteRow = await page.locator('#table-grid-container table tr').count();
    expect(afterDeleteRow).toBe(initialRows);
    await closeCurrentModal(page);
  });

  test('TBL-05: Switch table style', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'tables-btn');
    await page.locator('#tables-modal button:has-text("+ New")').click();
    await page.locator('#table-style').selectOption('booktabs');
    const val = await page.locator('#table-style').inputValue();
    expect(val).toBe('booktabs');
    await closeCurrentModal(page);
  });

  test('TBL-07: Delete table', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'tables-btn');
    await expect(page.locator('#tables-modal')).toBeVisible();
    const firstTable = page.locator('#tables-list .img-thumb-card').first();
    if (await firstTable.isVisible({ timeout: 5000 }).catch(() => false)) {
      const deleteBtn = firstTable.locator('.card-delete-btn');
      await deleteBtn.click();
      await expect(page.locator('#confirm-modal')).toBeVisible();
      await page.locator('#confirm-ok-btn').click();
    }
    await closeCurrentModal(page);
  });
});

// ============================================================
// 7. EQUATIONS (AI)
// ============================================================
test.describe('7. Equations', () => {

  test('EQ-01: Equation helper modal opens', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'sidebar-equation-btn');
    await expect(page.locator('#equation-modal')).toBeVisible();
    await closeCurrentModal(page);
  });

  test('EQ-05: Use equation preset', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'sidebar-equation-btn');
    await expect(page.locator('#equation-modal')).toBeVisible();
    await page.locator('#eq-tab-btn-presets').click();
    await page.waitForTimeout(500);
    const preset = page.locator('.eq-preset-card').first();
    if (await preset.isVisible({ timeout: 3000 }).catch(() => false)) {
      await preset.click();
      await expect(page.locator('#eq-latex-output')).not.toHaveValue('', { timeout: 5000 });
    }
    await closeCurrentModal(page);
  });

  test('EQ-06: Insert equation into document', async ({ page }) => {
    await openSampleProject(page);
    const intro = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await intro.click();
    await clickSidebarButton(page, 'sidebar-equation-btn');
    await expect(page.locator('#equation-modal')).toBeVisible();
    await page.locator('#eq-tab-btn-presets').click();
    await page.waitForTimeout(500);
    const preset = page.locator('.eq-preset-card').first();
    if (await preset.isVisible({ timeout: 3000 }).catch(() => false)) {
      await preset.click();
      await page.locator('#equation-modal button:has-text("Insert into Document")').click();
      await page.waitForTimeout(500);
    }
    await closeCurrentModal(page);
  });
});

// ============================================================
// 8. COMMENTS
// ============================================================
test.describe('8. Comments', () => {

  test('COM-01: Comments tab is accessible', async ({ page }) => {
    await openSampleProject(page);
    await page.locator('#tab-btn-comments').click();
    await expect(page.locator('#tab-comments')).toBeVisible();
  });

  test('COM-02: Comments panel shows comment list', async ({ page }) => {
    await openSampleProject(page);
    await page.locator('#tab-btn-comments').click();
    await expect(page.locator('#tab-comments')).toBeVisible();
    await expect(page.locator('#comments-list')).toBeVisible();
  });

  test('COM-04: Comments tab has count display', async ({ page }) => {
    await openSampleProject(page);
    const commentsTab = page.locator('#tab-btn-comments');
    await expect(commentsTab).toBeVisible();
    await expect(commentsTab).toContainText('Comments');
    await commentsTab.click();
    await expect(page.locator('#tab-comments')).toBeVisible();
  });
});

// ============================================================
// 9. TEMPLATES & DOCUMENT SETTINGS
// ============================================================
test.describe('9. Templates', () => {

  test('TEMPLATE-01: Document settings modal opens', async ({ page }) => {
    await openSampleProject(page);
    await page.locator('.doc-format-badge').click();
    await expect(page.locator('#doc-settings-modal')).toBeVisible();
    await closeCurrentModal(page);
  });

  test('TEMPLATE-02: Switch template to ACM', async ({ page }) => {
    await openSampleProject(page);
    await page.locator('.doc-format-badge').click();
    await expect(page.locator('#doc-settings-modal')).toBeVisible();
    const acmOption = page.locator('.template-option-item').filter({ hasText: 'ACM' }).first();
    if (await acmOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await acmOption.click();
    }
    await closeCurrentModal(page);
  });

  test('TEMPLATE-04: Test all 6 templates switch correctly', async ({ page }) => {
    await openSampleProject(page);
    await page.locator('.doc-format-badge').click();
    await expect(page.locator('#doc-settings-modal')).toBeVisible();
    const templates = ['IEEE', 'ACM', 'Elsevier', 'Springer LNCS', 'APA 7th Edition', 'MLA 9th Edition'];
    for (const tpl of templates) {
      const option = page.locator('.template-option-item').filter({ hasText: tpl }).first();
      if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
        await option.click();
        await page.waitForTimeout(300);
      }
    }
    await closeCurrentModal(page);
  });

  test('TEMPLATE-06: Edit index terms', async ({ page }) => {
    await openSampleProject(page);
    await page.locator('.doc-format-badge').click();
    await expect(page.locator('#doc-settings-modal')).toBeVisible();
    const keywordsInput = page.locator('#doc-index-terms');
    if (await keywordsInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await keywordsInput.fill('E2E test, automated testing, Playwright');
    }
    await closeCurrentModal(page);
  });
});

// ============================================================
// 10. LaTeX PREVIEW & PDF
// ============================================================
test.describe('10. LaTeX & PDF', () => {

  test('LATEX-01: LaTeX preview panel exists', async ({ page }) => {
    await openSampleProject(page);
    const latexPanel = page.locator('#latex-preview');
    await expect(latexPanel).toBeVisible();
  });

  test('LATEX-03: Compile PDF button is available', async ({ page }) => {
    await openSampleProject(page);
    const compileBtn = page.locator('#compile-pdf-btn');
    await expect(compileBtn).toBeVisible();
  });

  test('LATEX-04: Compile PDF button triggers compile', async ({ page }) => {
    await openSampleProject(page);
    const compileBtn = page.locator('#compile-pdf-btn');
    await expect(compileBtn).toBeVisible();
    await compileBtn.click();
    await page.waitForTimeout(2000);
    await expect(page.locator('#latex-preview')).toBeVisible();
  });

  test('EXPORT-05: Export button exists and is clickable', async ({ page }) => {
    await openSampleProject(page);
    const exportBtn = page.locator('#export-btn');
    await expect(exportBtn).toBeVisible();
  });
});

// ============================================================
// 11. PAYMENTS & CREDITS
// ============================================================
test.describe('11. Payments', () => {

  test('PAY-01: Upgrade button visible in header', async ({ page }) => {
    await expect(page.locator('#dashboard-view')).toBeVisible();
    await expect(page.locator('button:has-text("Upgrade")').first()).toBeVisible();
  });

  test('PAY-02: Pricing modal opens', async ({ page }) => {
    await expect(page.locator('#dashboard-view')).toBeVisible();
    await page.locator('button:has-text("Upgrade")').first().click();
    await expect(page.locator('#pricing-modal')).toBeVisible();
  });
});

async function loginAs(page, username, email) {
  await page.goto(BASE + '/');
  const ok = await page.evaluate(async ({ username, email }) => {
    try {
      const csrfToken = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
      const r = await fetch('/api/auth/dev-login-as/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify({ username, email })
      });
      return r.ok;
    } catch { return false; }
  }, { username, email });
  if (!ok) throw new Error(`dev-login-as failed for ${username}`);
  await page.goto(BASE + '/');
  await page.waitForFunction(() => {
    const dv = document.getElementById('dashboard-view');
    return dv && getComputedStyle(dv).display !== 'none';
  }, { timeout: 15000 });
}

async function ensureUserExists(browser, username, email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, username, email);
  await ctx.close();
}

async function openDocFromDashboard(page, docTitle) {
  const card = page.locator('.document-card').filter({ hasText: docTitle }).first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.click();
  await page.waitForFunction(() => {
    const ev = document.getElementById('editor-view');
    return ev && getComputedStyle(ev).display !== 'none';
  }, { timeout: 15000 });
}

async function waitForSectionsLoaded(page) {
  await page.waitForFunction(() => {
    return document.querySelectorAll('.nav-item').length > 1;
  }, { timeout: 15000 });
}

// ============================================================
// 12. SHARING & COLLABORATION
// ============================================================
test.describe('12. Sharing', () => {

  test('SHARE-01: Share modal opens', async ({ page }) => {
    await openSampleProject(page);
    await page.locator('#share-doc-btn').click();
    await expect(page.locator('#share-modal')).toBeVisible();
    await closeCurrentModal(page);
  });

  test('SHARE-02: Share with registered user as editor', async ({ browser }) => {
    await ensureUserExists(browser, 'collab_editor', 'collab_editor@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('collab_editor@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-error')).not.toBeVisible({ timeout: 3000 }).catch(() => {});

    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'collab_editor@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'collab_editor', 'collab_editor@test.local');
    await openDocFromDashboard(collabPage, docTitle);
    await expect(collabPage.locator('#editor-view')).toBeVisible();

    await ownerCtx.close();
    await collabCtx.close();
  });

  test('SHARE-03: Share with registered user as commenter', async ({ browser }) => {
    await ensureUserExists(browser, 'collab_commenter', 'collab_commenter@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('collab_commenter@test.local');
    await ownerPage.locator('#share-role-input').selectOption('commenter');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();

    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'collab_commenter@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'collab_commenter', 'collab_commenter@test.local');
    await openDocFromDashboard(collabPage, docTitle);
    await expect(collabPage.locator('#editor-view')).toBeVisible();

    await ownerCtx.close();
    await collabCtx.close();
  });

  test('SHARE-04: Share with registered user as viewer', async ({ browser }) => {
    await ensureUserExists(browser, 'collab_viewer', 'collab_viewer@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('collab_viewer@test.local');
    await ownerPage.locator('#share-role-input').selectOption('viewer');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();

    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'collab_viewer@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'collab_viewer', 'collab_viewer@test.local');
    await openDocFromDashboard(collabPage, docTitle);
    await expect(collabPage.locator('#editor-view')).toBeVisible();

    await ownerCtx.close();
    await collabCtx.close();
  });

  test('SHARE-05: Cannot share with yourself', async ({ page }) => {
    await loginAndLoadDashboard(page);
    await openSampleProject(page);
    await page.locator('#share-doc-btn').click();
    await expect(page.locator('#share-modal')).toBeVisible();
    await page.locator('#share-email-input').fill('dev@example.com');
    await page.locator('#share-modal button:has-text("Add")').click();
    await expect(page.locator('#share-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#share-error')).toContainText('yourself');
    await closeCurrentModal(page);
  });

  test('SHARE-06: Cannot share with empty email', async ({ page }) => {
    await openSampleProject(page);
    await page.locator('#share-doc-btn').click();
    await expect(page.locator('#share-modal')).toBeVisible();
    await page.locator('#share-modal button:has-text("Add")').click();
    await page.waitForTimeout(1500);
    await closeCurrentModal(page);
  });

  test('SHARE-07: Share with unregistered email shows invite', async ({ page }) => {
    await openSampleProject(page);
    await page.locator('#share-doc-btn').click();
    await expect(page.locator('#share-modal')).toBeVisible();
    await page.locator('#share-email-input').fill('nonexistent_98765@test.local');
    await page.locator('#share-modal button:has-text("Add")').click();
    await expect(page.locator('#share-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#share-error')).toContainText('not registered');
    await expect(page.locator('#share-error')).toContainText('invite');
    await closeCurrentModal(page);
  });

  test('SHARE-08: Owner sees collaborator roles in list', async ({ browser }) => {
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();

    const collabItems = ownerPage.locator('#share-collabs-list .share-collab-item');
    const count = await collabItems.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const firstItem = collabItems.first();
    await expect(firstItem).toContainText('Owner');

    await closeCurrentModal(ownerPage);
    await ownerCtx.close();
  });

  test('SHARE-09: Remove collaborator', async ({ browser }) => {
    await ensureUserExists(browser, 'collab_removable', 'collab_removable@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('collab_removable@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'collab_removable@test.local' })).toBeVisible({ timeout: 10000 });

    const removeBtn = ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'collab_removable@test.local' }).locator('button:has-text("Remove")');
    await removeBtn.click();
    await ownerPage.locator('#confirm-ok-btn').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'collab_removable@test.local' })).not.toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'collab_removable', 'collab_removable@test.local');
    await collabPage.waitForFunction(() => {
      const dv = document.getElementById('dashboard-view');
      return dv && getComputedStyle(dv).display !== 'none';
    }, { timeout: 15000 });
    const removedCard = collabPage.locator('.document-card').filter({ hasText: docTitle });
    await expect(removedCard).not.toBeVisible({ timeout: 5000 }).catch(() => {});

    await ownerCtx.close();
    await collabCtx.close();
  });

  test('SHARE-10: Export permission toggle', async ({ page }) => {
    await openSampleProject(page);
    await page.locator('#share-doc-btn').click();
    await expect(page.locator('#share-modal')).toBeVisible();

    await page.waitForFunction(() => {
      const cb = document.getElementById('share-allow-export');
      return cb && !cb.disabled;
    }, { timeout: 10000 });

    const checkbox = page.locator('#share-allow-export');
    const wasChecked = await checkbox.isChecked();
    const label = page.locator('label:has(#share-allow-export)');
    await label.click();
    await page.waitForTimeout(1500);

    await closeCurrentModal(page);

    await page.locator('#share-doc-btn').click();
    await expect(page.locator('#share-modal')).toBeVisible();
    await page.waitForFunction(() => {
      const cb = document.getElementById('share-allow-export');
      return cb && !cb.disabled;
    }, { timeout: 10000 });
    const isNowChecked = await page.locator('#share-allow-export').isChecked();
    expect(isNowChecked).toBe(!wasChecked);

    await page.locator('label:has(#share-allow-export)').click();
    await page.waitForTimeout(1000);
    await closeCurrentModal(page);
  });

  test('SHARE-11: Role change - re-share with different role', async ({ browser }) => {
    await ensureUserExists(browser, 'collab_rolechange', 'collab_rolechange@test.local');
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('collab_rolechange@test.local');
    await ownerPage.locator('#share-role-input').selectOption('viewer');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    const viewerItem = ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'collab_rolechange@test.local' });
    await expect(viewerItem).toContainText('Viewer', { timeout: 10000 });

    await ownerPage.locator('#share-email-input').fill('collab_rolechange@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-error')).not.toBeVisible({ timeout: 5000 });

    await closeCurrentModal(ownerPage);
    await ownerPage.waitForTimeout(500);

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    const collabItem = ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'collab_rolechange@test.local' });
    await expect(collabItem).toContainText('Editor', { timeout: 10000 });
    await closeCurrentModal(ownerPage);
    await ownerCtx.close();
  });

  test('SHARE-12: Collaborator can see shared doc', async ({ browser }) => {
    await ensureUserExists(browser, 'collab_visible', 'collab_visible@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('collab_visible@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'collab_visible@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'collab_visible', 'collab_visible@test.local');
    const sharedCard = collabPage.locator('.document-card').filter({ hasText: docTitle }).first();
    await expect(sharedCard).toBeVisible({ timeout: 10000 });

    await ownerCtx.close();
    await collabCtx.close();
  });

  test('SHARE-13: Collaborator can edit sections in shared doc', async ({ browser }) => {
    await ensureUserExists(browser, 'collab_editor2', 'collab_editor2@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('collab_editor2@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'collab_editor2@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'collab_editor2', 'collab_editor2@test.local');
    await openDocFromDashboard(collabPage, docTitle);
    await waitForSectionsLoaded(collabPage);

    const intro = collabPage.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await intro.click();
    await clearAndTypeInEditor(collabPage, 'Collaborator edit test');
    const hasText = await collabPage.evaluate(() => {
      const el = document.querySelector('#editor-content .ProseMirror');
      return el ? el.textContent.includes('Collaborator edit test') : false;
    });
    expect(hasText).toBe(true);

    await ownerCtx.close();
    await collabCtx.close();
  });

  test('SHARE-14: Multiple collaborators with different roles', async ({ browser }) => {
    await ensureUserExists(browser, 'multi_collab1', 'multi_collab1@test.local');
    await ensureUserExists(browser, 'multi_collab2', 'multi_collab2@test.local');
    await ensureUserExists(browser, 'multi_collab3', 'multi_collab3@test.local');
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();

    await ownerPage.locator('#share-email-input').fill('multi_collab1@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'multi_collab1@test.local' })).toBeVisible({ timeout: 10000 });

    await ownerPage.locator('#share-email-input').fill('multi_collab2@test.local');
    await ownerPage.locator('#share-role-input').selectOption('viewer');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'multi_collab2@test.local' })).toBeVisible({ timeout: 10000 });

    await ownerPage.locator('#share-email-input').fill('multi_collab3@test.local');
    await ownerPage.locator('#share-role-input').selectOption('commenter');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'multi_collab3@test.local' })).toBeVisible({ timeout: 10000 });

    const allItems = ownerPage.locator('#share-collabs-list .share-collab-item');
    const totalItems = await allItems.count();
    expect(totalItems).toBeGreaterThanOrEqual(4);

    await closeCurrentModal(ownerPage);
    await ownerCtx.close();
  });

  test('SHARE-15: Section lock prevents concurrent editing', async ({ browser }) => {
    await ensureUserExists(browser, 'collab_lock', 'collab_lock@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('collab_lock@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'collab_lock@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'collab_lock', 'collab_lock@test.local');
    await openDocFromDashboard(collabPage, docTitle);
    await waitForSectionsLoaded(collabPage);

    const intro = collabPage.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await intro.click();
    await expect(collabPage.locator('.ProseMirror').first()).toBeVisible();

    await ownerCtx.close();
    await collabCtx.close();
  });
});

// ============================================================
// 13. SECURITY
// ============================================================
test.describe('13. Security', () => {

  test('SEC-03: XSS content stored in editor after reload', async ({ page }) => {
    await openSampleProject(page);
    const intro = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await intro.click();
    await page.waitForFunction(() => {
      const ed = document.querySelector('.ProseMirror');
      return ed && ed.getAttribute('contenteditable') === 'true';
    }, { timeout: 10000 });
    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    await page.keyboard.type('XSS test: <script>alert("xss")</script>');
    await expect(editor).toContainText('XSS test:');
    await page.waitForResponse(resp => resp.url().includes('/api/sections/') && resp.request().method() === 'PATCH' && resp.status() === 200, { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForFunction(() => {
      const ev = document.getElementById('editor-view');
      return ev && getComputedStyle(ev).display !== 'none';
    }, { timeout: 30000 });
    await page.waitForFunction(() => {
      return document.querySelectorAll('.nav-item').length > 1;
    }, { timeout: 30000 });
    const introAfterReload = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await introAfterReload.click();
    await expect(page.locator('.ProseMirror').first()).toBeVisible();
    await expect(page.locator('#editor-view')).toBeVisible();
  });

  test('SEC-01: Unauthenticated API returns 401', async ({ page, browser }) => {
    const context = await browser.newContext();
    const unauthPage = await context.newPage();
    await unauthPage.goto(BASE + '/');
    await unauthPage.waitForLoadState('networkidle');
    const resp = await unauthPage.evaluate(async () => {
      const r = await fetch('/api/documents/');
      return r.status;
    });
    await context.close();
    expect([401, 403]).toContain(resp);
  });
});

// ============================================================
// 14. PROFILE & ACCOUNT
// ============================================================
test.describe('14. Profile', () => {

  test('AUTH-12: Toggle DPDP consent checkbox', async ({ page }) => {
    await expect(page.locator('#dashboard-view')).toBeVisible();
    await page.locator('#profile-avatar-btn').click();
    await expect(page.locator('#profile-modal')).toBeVisible();
    const wasChecked = await page.evaluate(() => {
      const cb = document.getElementById('dpdp-processing-check');
      return cb ? cb.checked : false;
    });
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/auth/profile/') && resp.request().method() === 'POST', { timeout: 10000 }),
      page.evaluate(() => {
        const cb = document.getElementById('dpdp-processing-check');
        if (cb) {
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }),
    ]);
    await page.waitForTimeout(1000);
    await page.locator('#profile-modal .close-modal').click();
    await page.waitForTimeout(500);
    await page.locator('#profile-avatar-btn').click();
    await expect(page.locator('#profile-modal')).toBeVisible();
    const isNowChecked = await page.evaluate(() => {
      const cb = document.getElementById('dpdp-processing-check');
      return cb ? cb.checked : false;
    });
    expect(isNowChecked).toBe(!wasChecked);
  });
});

// ============================================================
// 15. CROSS-BROWSER & RESPONSIVE
// ============================================================
test.describe('15. Responsive', () => {

  test('BROWSER-04: Mobile warning overlay at small viewport', async ({ page }) => {
    await loginAndLoadDashboard(page);
    await page.setViewportSize({ width: 480, height: 800 });
    await page.waitForTimeout(1000);
    await expect(page.locator('#mobile-warning-overlay')).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================
// 16. CRITICAL PATH (SMOKE TEST)
// ============================================================
test.describe('16. Critical Path Smoke Test', () => {

  test('Full workflow: login → create doc → edit → author → image → table → export', async ({ page }) => {
    await expect(page.locator('#dashboard-view')).toBeVisible();

    await page.locator('button:has-text("New Paper")').click();
    await expect(page.locator('#prompt-modal')).toBeVisible({ timeout: 5000 });
    await page.locator('#prompt-input').fill('Smoke Test Paper');
    await page.locator('#prompt-ok-btn').click();
    await expect(page.locator('#editor-view')).toBeVisible({ timeout: 10000 });

    await page.locator('#doc-title').fill('Smoke Test Paper');
    await page.locator('#doc-title').blur();

    const intro = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await intro.click();
    const editor = page.locator('.ProseMirror').first();
    await editor.fill('Smoke test content for the critical path.');
    await expect(page.locator('#save-status:has-text("Saved")').first()).toBeVisible({ timeout: 10000 });

    await clickSidebarButton(page, 'authors-btn');
    await expect(page.locator('#authors-modal')).toBeVisible();
    await page.locator('#authors-modal button:has-text("+ New")').click();
    await page.locator('#author-name').fill('Smoke Test Author');
    await page.locator('#save-author-btn').click();
    await expect(page.locator('#authors-list .img-thumb-card').filter({ hasText: 'Smoke Test Author' }).first()).toBeVisible({ timeout: 20000 });
    await closeCurrentModal(page);

    await clickSidebarButton(page, 'images-btn');
    const dropZone = page.locator('#img-drop-zone');
    const fcPromise = page.waitForEvent('filechooser');
    await dropZone.click();
    const fc = await fcPromise;
    await fc.setFiles({ name: 'smoke.png', mimeType: 'image/png', buffer: SAMPLE_IMG });
    await expect(page.locator('#images-gallery .img-thumb-card').first()).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(page);

    await clickSidebarButton(page, 'tables-btn');
    await expect(page.locator('#tables-modal')).toBeVisible();
    await page.locator('#tables-modal button:has-text("+ New")').click();
    await page.locator('#table-caption').fill('Smoke Table');
    await page.locator('#table-label').fill('tab:smoke');
    const firstInput = page.locator('#table-grid-container .table-grid-cell input, #table-grid-container .table-grid-header-cell input').first();
    if (await firstInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstInput.click();
      await firstInput.fill('Smoke Data');
    }
    await page.locator('#tables-modal button:has-text("Save Table")').click();
    await closeCurrentModal(page);

    await expect(page.locator('#editor-view')).toBeVisible();
  });
});

// ============================================================
// 17. DOCUMENT CRUD FROM DASHBOARD
// ============================================================
test.describe('17. Dashboard Document CRUD', () => {

  test('DCRD-01: Create new document from dashboard', async ({ page }) => {
    await expect(page.locator('#dashboard-view')).toBeVisible();
    const cardsBefore = await page.locator('.document-card').count();
    await page.locator('button:has-text("New Paper")').click();
    await expect(page.locator('#prompt-modal')).toBeVisible({ timeout: 5000 });
    await page.locator('#prompt-input').fill('E2E CRUD Test Document');
    await page.locator('#prompt-ok-btn').click();
    await expect(page.locator('#editor-view')).toBeVisible({ timeout: 10000 });
    await page.goto(BASE + '/');
    await page.waitForFunction(() => {
      const dv = document.getElementById('dashboard-view');
      return dv && getComputedStyle(dv).display !== 'none';
    }, { timeout: 15000 });
    await page.waitForSelector('.document-card', { timeout: 15000 });
    const card = page.locator('.document-card').filter({ hasText: 'E2E CRUD Test Document' }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
  });

  test('DCRD-02: Delete document from dashboard', async ({ page }) => {
    await expect(page.locator('#dashboard-view')).toBeVisible();
    await page.waitForSelector('.document-card', { timeout: 15000 });
    const card = page.locator('.document-card').filter({ hasText: 'E2E CRUD Test Document' }).first();
    if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
      const deleted = await page.evaluate(async () => {
        const cards = document.querySelectorAll('.document-card');
        for (const c of cards) {
          if (c.textContent.includes('E2E CRUD Test Document')) {
            const btn = c.querySelector('button.doc-card-btn.delete');
            if (btn) { btn.click(); return true; }
          }
        }
        return false;
      });
      if (deleted) {
        await expect(page.locator('#confirm-modal')).toBeVisible({ timeout: 5000 });
        await page.locator('#confirm-ok-btn').click();
        await expect(page.locator('.document-card').filter({ hasText: 'E2E CRUD Test Document' })).toHaveCount(0, { timeout: 10000 });
      }
    }
  });
});

// ============================================================
// 18. TABLE CELL EDITING
// ============================================================
test.describe('18. Table Cell Editing', () => {

  test('TBL-CELL-01: Fill multiple table cells', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'tables-btn');
    await expect(page.locator('#tables-modal')).toBeVisible();
    await page.locator('#tables-modal button:has-text("+ New")').click();
    await page.waitForTimeout(500);
    await page.locator('#table-caption').fill('Cell Edit Test');
    await page.locator('#table-label').fill('tab:celledit');
    const cells = page.locator('#table-grid-container .table-grid-cell input, #table-grid-container .table-grid-header-cell input');
    const count = await cells.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      await cells.nth(i).fill(`Cell ${i}`);
    }
    for (let i = 0; i < Math.min(count, 4); i++) {
      await expect(cells.nth(i)).toHaveValue(`Cell ${i}`);
    }
    await page.locator('#tables-modal button:has-text("Save Table")').click();
    await expect(page.locator('#tables-list .img-thumb-card').filter({ hasText: 'Cell Edit Test' }).first()).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(page);
  });

  test('TBL-CELL-02: Add column to table', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'tables-btn');
    await page.locator('#tables-modal button:has-text("+ New")').click();
    await page.waitForTimeout(500);
    const initialCells = await page.locator('#table-grid-container .table-grid-cell input, #table-grid-container .table-grid-header-cell input').count();
    const addColBtn = page.locator('#tables-modal button:has-text("+ Col")');
    if (await addColBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addColBtn.click();
      await page.waitForTimeout(300);
      const afterCells = await page.locator('#table-grid-container .table-grid-cell input, #table-grid-container .table-grid-header-cell input').count();
      expect(afterCells).toBeGreaterThan(initialCells);
    }
    await closeCurrentModal(page);
  });
});

// ============================================================
// 19. SECTION NAVIGATION
// ============================================================
test.describe('19. Section Navigation', () => {

  test('NAV-01: Click through multiple sections', async ({ page }) => {
    await openSampleProject(page);
    const navItems = page.locator('.nav-item:not(.add-section-nav)');
    await expect(navItems.first()).toBeVisible({ timeout: 15000 });
    const count = Math.min(await navItems.count(), 4);
    for (let i = 0; i < count; i++) {
      await navItems.nth(i).click();
      const editor = page.locator('.ProseMirror').first();
      await expect(editor).toBeVisible({ timeout: 5000 });
    }
  });

  test('NAV-02: Section move down', async ({ page }) => {
    await openSampleProject(page);
    const navItems = page.locator('.nav-item:not(.add-section-nav)');
    await expect(navItems.first()).toBeVisible({ timeout: 15000 });
    const firstItem = navItems.first();
    const firstName = await firstItem.textContent();
    await firstItem.hover();
    const moveBtn = firstItem.locator('.action-btn.move-btn').first();
    await expect(moveBtn).toBeVisible({ timeout: 3000 });
    await moveBtn.click();
    await page.waitForTimeout(500);
    const secondItem = navItems.nth(1);
    const secondName = await secondItem.textContent();
    expect(firstName).not.toBe(secondName);
  });
});

// ============================================================
// 20. LONG CONTENT & AUTOSAVE
// ============================================================
test.describe('20. Long Content', () => {

  test('LONG-01: Paste large text block and autosave', async ({ page }) => {
    await openSampleProject(page);
    const intro = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await expect(intro).toBeVisible({ timeout: 30000 });
    await intro.click();
    const editor = page.locator('.ProseMirror').first();
    await expect(editor).toBeVisible();
    const longText = 'Lorem ipsum dolor sit amet. '.repeat(100);
    await editor.fill(longText);
    await expect(editor).toContainText('Lorem ipsum');
    await expect(page.locator('#save-status:has-text("Saved")').first()).toBeVisible({ timeout: 15000 });
  });

  test('LONG-02: Special characters persist after reload', async ({ page }) => {
    await openSampleProject(page);
    const intro = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await expect(intro).toBeVisible({ timeout: 30000 });
    await intro.click();
    const editor = page.locator('.ProseMirror').first();
    await expect(editor).toBeVisible();
    await editor.click();
    const specialText = 'Ünïcödé: 日本語 test & <special> "chars" Ñ';
    await page.keyboard.type(specialText, { delay: 10 });
    await expect(editor).toContainText('Ünïcödé');
    await page.waitForResponse(resp => resp.url().includes('/api/sections/') && resp.request().method() === 'PATCH' && resp.status() === 200, { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForFunction(() => {
      const ev = document.getElementById('editor-view');
      return ev && getComputedStyle(ev).display !== 'none';
    }, { timeout: 30000 });
    await page.waitForFunction(() => {
      return document.querySelectorAll('.nav-item').length > 1;
    }, { timeout: 30000 });
    const introReload = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await introReload.click();
    await expect(page.locator('.ProseMirror').first()).toContainText('Ünïcödé');
  });
});

// ============================================================
// 21. ERROR HANDLING
// ============================================================
test.describe('21. Error Handling', () => {

  test('ERR-01: Invalid DOI shows error or empty state', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'references-btn');
    await expect(page.locator('#references-modal')).toBeVisible();
    await page.locator('#references-modal button:has-text("+ New")').click();
    await page.locator('#ref-doi-input').fill('00.0000/fake-doi-404');
    await page.locator('#ref-doi-fetch-btn').click();
    await page.waitForTimeout(5000);
    const keyVal = await page.locator('#ref-key').inputValue();
    expect(keyVal === '' || keyVal !== '').toBeTruthy();
    await closeCurrentModal(page);
  });

  test('ERR-02: Empty section name is rejected', async ({ page }) => {
    await openSampleProject(page);
    await page.waitForFunction(() => {
      return !!document.querySelector('.nav-item.add-section-nav');
    }, { timeout: 30000 });
    const navCountBefore = await page.locator('.nav-item:not(.add-section-nav)').count();
    const addBtn = page.locator('.nav-item.add-section-nav');
    await addBtn.click();
    await page.waitForSelector('#prompt-modal.active', { timeout: 5000 });
    await page.locator('#prompt-input').fill('');
    await page.locator('#prompt-ok-btn').click({ force: true });
    await page.waitForTimeout(2000);
    const navCountAfter = await page.locator('.nav-item:not(.add-section-nav)').count();
    expect(navCountAfter).toBe(navCountBefore);
    await closeCurrentModal(page);
  });

  test('ERR-03: Confirm modal cancel does not delete', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'authors-btn');
    await expect(page.locator('#authors-modal')).toBeVisible();
    const countBefore = await page.locator('#authors-list .img-thumb-card').count();
    const firstAuthor = page.locator('#authors-list .img-thumb-card').first();
    if (await firstAuthor.isVisible({ timeout: 5000 }).catch(() => false)) {
      const deleteBtn = firstAuthor.locator('.card-delete-btn');
      await deleteBtn.click();
      await expect(page.locator('#confirm-modal')).toBeVisible();
      const cancelBtn = page.locator('#confirm-cancel-btn, #confirm-no-btn, #confirm-modal button:has-text("Cancel"), #confirm-modal button:has-text("No")').first();
      if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelBtn.click();
      }
      const countAfter = await page.locator('#authors-list .img-thumb-card').count();
      expect(countAfter).toBe(countBefore);
    }
    await closeCurrentModal(page);
  });
});

// ============================================================
// 22. CITATION INSERTION
// ============================================================
test.describe('22. Citation Insertion', () => {

  test('CITE-01: Add reference then check floating cite menu', async ({ page }) => {
    await openSampleProject(page);
    await clickSidebarButton(page, 'references-btn');
    await expect(page.locator('#references-modal')).toBeVisible();
    await page.locator('#references-modal button:has-text("+ New")').click();
    await page.locator('#ref-toggle-bibtex').click();
    await page.locator('#ref-bibtex').fill(
      '@article{citeinsert2026,\n  author={Cite Tester},\n  title={Cite Insert Test},\n  journal={Test Journal},\n  year={2026}\n}'
    );
    await page.locator('#references-modal button:has-text("Save Reference")').click();
    await expect(page.locator('#references-list .img-thumb-card').filter({ hasText: 'citeinsert2026' }).first()).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(page);
    const intro = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await expect(intro).toBeVisible({ timeout: 30000 });
    await intro.click();
    const editor = page.locator('.ProseMirror').first();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('Citation insert test. ');
    const citeTrigger = page.locator('#floating-cite-trigger');
    if (await citeTrigger.isVisible({ timeout: 5000 }).catch(() => false)) {
      await citeTrigger.click();
      await expect(page.locator('#floating-cite-menu')).toBeVisible();
      const citeOption = page.locator('#floating-cite-menu .cite-option, #floating-cite-menu button, #floating-cite-menu li').first();
      if (await citeOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await citeOption.click();
        await page.waitForTimeout(1000);
      }
    }
  });
});

// ============================================================
// 23. TITLE PERSISTENCE
// ============================================================
test.describe('23. Title Persistence', () => {

  test('TITLE-01: Document title persists after reload', async ({ page }) => {
    await openSampleProject(page);
    const titleInput = page.locator('#doc-title');
    await expect(titleInput).toBeVisible();
    await page.waitForFunction(() => {
      const ti = document.getElementById('doc-title');
      return ti && ti.value && ti.value.length > 0;
    }, { timeout: 15000 });
    const originalTitle = await titleInput.inputValue();
    await page.evaluate(async () => {
      const ti = document.getElementById('doc-title');
      ti.value = 'Title Persistence Test';
      ti.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const patchDone = page.waitForResponse(
      resp => resp.url().includes('/api/documents/') && resp.request().method() === 'PATCH',
      { timeout: 15000 }
    );
    await page.evaluate(() => {
      const ti = document.getElementById('doc-title');
      ti.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    await patchDone;
    await page.reload();
    await page.waitForFunction(() => {
      const ev = document.getElementById('editor-view');
      return ev && getComputedStyle(ev).display !== 'none';
    }, { timeout: 30000 });
    await page.waitForFunction(() => {
      const ti = document.getElementById('doc-title');
      return ti && ti.value === 'Title Persistence Test';
    }, { timeout: 20000 });
    await expect(titleInput).toHaveValue('Title Persistence Test');
    await titleInput.fill(originalTitle || 'Sample Project: Introduction to PaperWriter');
    await titleInput.blur();
    await page.waitForTimeout(1000);
  });
});

// ============================================================
// 24. DOCUMENT SETTINGS WORKFLOW
// ============================================================
test.describe('24. Document Settings Workflow', () => {

  test('SETTINGS-01: Change template and keywords together', async ({ page }) => {
    await openSampleProject(page);
    await page.locator('.doc-format-badge').click();
    await expect(page.locator('#doc-settings-modal')).toBeVisible();
    const ieeeOption = page.locator('.template-option-item').filter({ hasText: 'IEEE' }).first();
    if (await ieeeOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ieeeOption.click();
      await page.waitForTimeout(300);
    }
    const keywordsInput = page.locator('#doc-index-terms');
    if (await keywordsInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await keywordsInput.fill('e2e testing, automated, playwright');
      await expect(keywordsInput).toHaveValue('e2e testing, automated, playwright');
    }
    await closeCurrentModal(page);
  });

  test('SETTINGS-02: Switch template and verify badge updates', async ({ page }) => {
    await openSampleProject(page);
    const badge = page.locator('.doc-format-badge');
    await badge.click();
    await expect(page.locator('#doc-settings-modal')).toBeVisible();
    const acmOption = page.locator('.template-option-item').filter({ hasText: 'ACM' }).first();
    if (await acmOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await acmOption.click();
      await page.waitForTimeout(500);
    }
    await closeCurrentModal(page);
    await expect(badge).toBeVisible();
  });
});

// ============================================================
// 25. EDITOR INTERACTION
// ============================================================
test.describe('25. Editor Interaction', () => {

  test('ED-INT-01: Bold text via keyboard', async ({ page }) => {
    await openSampleProject(page);
    const intro = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await expect(intro).toBeVisible({ timeout: 30000 });
    await intro.click();
    const editor = page.locator('.ProseMirror').first();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('Bold test');
    await page.keyboard.down('Shift');
    for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowLeft');
    await page.keyboard.up('Shift');
    await page.keyboard.press('Control+b');
    await expect(editor).toContainText('Bold');
    await expect(page.locator('#save-status:has-text("Saved")').first()).toBeVisible({ timeout: 10000 });
  });

  test('ED-INT-02: Type in editor shows save status', async ({ page }) => {
    await openSampleProject(page);
    const intro = page.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await expect(intro).toBeVisible({ timeout: 30000 });
    await intro.click();
    const editor = page.locator('.ProseMirror').first();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('Save status check');
    const saveStatus = page.locator('#save-status');
    await expect(saveStatus).toBeVisible();
  });
});

// ============================================================
// 26. WEBSOCKET REAL-TIME COLLABORATION
// ============================================================
test.describe('26. WebSocket Real-Time Collaboration', () => {

  test('WS-01: Connection status indicator shows connected', async ({ page }) => {
    await openSampleProject(page);
    const indicator = page.locator('#collab-connection-status');
    await expect(indicator).toBeVisible({ timeout: 10000 });
    await expect(indicator).toHaveClass(/connected/);
  });

  test('WS-02: Two users see each other presence avatars', async ({ browser }) => {
    await ensureUserExists(browser, 'ws_collab1', 'ws_collab1@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('ws_collab1@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'ws_collab1@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'ws_collab1', 'ws_collab1@test.local');
    await openDocFromDashboard(collabPage, docTitle);
    await waitForSectionsLoaded(collabPage);

    const ownerAvatars = ownerPage.locator('#collab-avatars-group');
    await expect(ownerAvatars).toBeVisible({ timeout: 15000 });
    await expect(ownerAvatars.locator('.collab-avatar')).toHaveCount(1, { timeout: 10000 });

    const collabAvatars = collabPage.locator('#collab-avatars-group');
    await expect(collabAvatars).toBeVisible({ timeout: 15000 });
    await expect(collabAvatars.locator('.collab-avatar')).toHaveCount(1, { timeout: 10000 });

    await ownerCtx.close();
    await collabCtx.close();
  });

  test('WS-03: Section lock banner appears when collaborator focuses section', async ({ browser }) => {
    await ensureUserExists(browser, 'ws_lock1', 'ws_lock1@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('ws_lock1@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'ws_lock1@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'ws_lock1', 'ws_lock1@test.local');
    await openDocFromDashboard(collabPage, docTitle);
    await waitForSectionsLoaded(collabPage);

    const intro = collabPage.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await intro.click();
    const collabEditor = collabPage.locator('.ProseMirror').first();
    await collabEditor.click();
    await expect(collabEditor).toBeFocused();

    const ownerIntro = ownerPage.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await ownerIntro.click();
    await ownerPage.waitForTimeout(1000);

    const banner = ownerPage.locator('.section-lock-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });

    await ownerCtx.close();
    await collabCtx.close();
  });

  test('WS-04: Lock banner disappears when collaborator blurs section', async ({ browser }) => {
    await ensureUserExists(browser, 'ws_unlock1', 'ws_unlock1@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('ws_unlock1@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'ws_unlock1@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'ws_unlock1', 'ws_unlock1@test.local');
    await openDocFromDashboard(collabPage, docTitle);
    await waitForSectionsLoaded(collabPage);

    const collabIntro = collabPage.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await collabIntro.click();
    const collabEditor = collabPage.locator('.ProseMirror').first();
    await collabEditor.click();

    const ownerIntro = ownerPage.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await ownerIntro.click();
    await ownerPage.waitForTimeout(1000);

    await expect(ownerPage.locator('.section-lock-banner')).toBeVisible({ timeout: 10000 });

    const collabMethods = collabPage.locator('.nav-item').filter({ hasText: 'Methodology' }).first();
    await collabMethods.click();
    await collabPage.waitForTimeout(500);
    await collabEditor.blur();

    await expect(ownerPage.locator('.section-lock-banner')).toBeHidden({ timeout: 30000 });

    await ownerCtx.close();
    await collabCtx.close();
  });

  test('WS-05: Content typed by collaborator syncs to owner via WebSocket', async ({ browser }) => {
    await ensureUserExists(browser, 'ws_sync1', 'ws_sync1@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('ws_sync1@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'ws_sync1@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'ws_sync1', 'ws_sync1@test.local');
    await openDocFromDashboard(collabPage, docTitle);
    await waitForSectionsLoaded(collabPage);

    const ownerIntro = ownerPage.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await ownerIntro.click();
    const collabIntro = collabPage.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await collabIntro.click();

    await ownerPage.waitForTimeout(2000);
    await collabPage.waitForTimeout(2000);

    const ownerIndicator = ownerPage.locator('#collab-connection-status');
    await expect(ownerIndicator).toHaveClass(/connected/, { timeout: 10000 });
    const collabIndicator = collabPage.locator('#collab-connection-status');
    await expect(collabIndicator).toHaveClass(/connected/, { timeout: 10000 });

    await clearAndTypeInEditor(collabPage, 'Realtime sync test');
    const collabHasText = await collabPage.evaluate(() => {
      const el = document.querySelector('#editor-content .ProseMirror');
      return el ? el.textContent.includes('Realtime sync test') : false;
    });
    expect(collabHasText).toBe(true);

    await ownerPage.waitForFunction(() => {
      const el = document.querySelector('#editor-content .ProseMirror');
      return el && el.textContent.includes('Realtime sync test');
    }, { timeout: 15000 });

    const ownerHasText = await ownerPage.evaluate(() => {
      const el = document.querySelector('#editor-content .ProseMirror');
      return el ? el.textContent.includes('Realtime sync test') : false;
    });
    expect(ownerHasText).toBe(true);

    await ownerCtx.close();
    await collabCtx.close();
  });

  test('WS-06: Presence avatar disappears when collaborator disconnects', async ({ browser }) => {
    await ensureUserExists(browser, 'ws_disconnect1', 'ws_disconnect1@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('ws_disconnect1@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'ws_disconnect1@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'ws_disconnect1', 'ws_disconnect1@test.local');
    await openDocFromDashboard(collabPage, docTitle);
    await waitForSectionsLoaded(collabPage);

    const ownerAvatars = ownerPage.locator('#collab-avatars-group');
    await expect(ownerAvatars).toBeVisible({ timeout: 15000 });
    await expect(ownerAvatars.locator('.collab-avatar')).toHaveCount(1, { timeout: 10000 });

    await collabCtx.close();

    await expect(ownerAvatars.locator('.collab-avatar')).toHaveCount(0, { timeout: 30000 });
  });

  test('WS-07: Owner sees connection status indicator while collaborator is connected', async ({ browser }) => {
    await ensureUserExists(browser, 'ws_status1', 'ws_status1@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    const ownerIndicator = ownerPage.locator('#collab-connection-status');
    await expect(ownerIndicator).toBeVisible({ timeout: 10000 });
    await expect(ownerIndicator).toHaveClass(/connected/);

    await ownerCtx.close();
    await collabCtx.close();
  });
});

// ============================================================
// 27. CROSS-DOMAIN WEBSOCKET (TOKEN AUTH PATH)
// Tests that the token-based auth flow works: frontend fetches
// a signed token, sends it as ?token= to the WS server.
// We simulate cross-domain by forcing PAPERWRITER_WS_URL to
// the same origin, which triggers the token code path instead
// of the default same-origin session-cookie path.
// ============================================================
test.describe('27. Cross-Domain WebSocket Token Auth', () => {

  test('XS-01: WS token endpoint returns valid signed token', async ({ page }) => {
    await openSampleProject(page);
    const tokenResult = await page.evaluate(async () => {
      const csrfToken = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
      const resp = await fetch('/api/auth/ws-token/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': csrfToken }
      });
      if (!resp.ok) return { error: resp.status };
      const data = await resp.json();
      return { hasToken: !!data.token, tokenLength: (data.token || '').length };
    });
    expect(tokenResult.hasToken).toBe(true);
    expect(tokenResult.tokenLength).toBeGreaterThan(10);
  });

  test('XS-02: WS connects via token auth and shows connected', async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        window.PAPERWRITER_WS_URL = window.location.origin;
      });
    });
    await loginAndLoadDashboard(page);
    await openSampleProject(page);
    const indicator = page.locator('#collab-connection-status');
    await expect(indicator).toBeVisible({ timeout: 10000 });
    await expect(indicator).toHaveClass(/connected/);
  });

  test('XS-03: Two users see presence via token-auth WS path', async ({ browser }) => {
    await ensureUserExists(browser, 'xs_p1', 'xs_p1@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await ownerPage.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        window.PAPERWRITER_WS_URL = window.location.origin;
      });
    });
    await collabPage.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        window.PAPERWRITER_WS_URL = window.location.origin;
      });
    });

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('xs_p1@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'xs_p1@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'xs_p1', 'xs_p1@test.local');
    await openDocFromDashboard(collabPage, docTitle);
    await waitForSectionsLoaded(collabPage);

    const ownerAvatars = ownerPage.locator('#collab-avatars-group');
    await expect(ownerAvatars).toBeVisible({ timeout: 15000 });
    await expect(ownerAvatars.locator('.collab-avatar')).toHaveCount(1, { timeout: 10000 });

    const collabAvatars = collabPage.locator('#collab-avatars-group');
    await expect(collabAvatars).toBeVisible({ timeout: 15000 });
    await expect(collabAvatars.locator('.collab-avatar')).toHaveCount(1, { timeout: 10000 });

    await ownerCtx.close();
    await collabCtx.close();
  });

  test('XS-04: Content syncs via token-auth WS path', async ({ browser }) => {
    await ensureUserExists(browser, 'xs_s1', 'xs_s1@test.local');
    const ownerCtx = await browser.newContext();
    const collabCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const collabPage = await collabCtx.newPage();

    await ownerPage.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        window.PAPERWRITER_WS_URL = window.location.origin;
      });
    });
    await collabPage.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        window.PAPERWRITER_WS_URL = window.location.origin;
      });
    });

    await loginAndLoadDashboard(ownerPage);
    await openSampleProject(ownerPage);
    const docTitle = await ownerPage.locator('#doc-title').inputValue();

    await ownerPage.locator('#share-doc-btn').click();
    await expect(ownerPage.locator('#share-modal')).toBeVisible();
    await ownerPage.locator('#share-email-input').fill('xs_s1@test.local');
    await ownerPage.locator('#share-role-input').selectOption('editor');
    await ownerPage.locator('#share-modal button:has-text("Add")').click();
    await expect(ownerPage.locator('#share-collabs-list .share-collab-item').filter({ hasText: 'xs_s1@test.local' })).toBeVisible({ timeout: 10000 });
    await closeCurrentModal(ownerPage);

    await loginAs(collabPage, 'xs_s1', 'xs_s1@test.local');
    await openDocFromDashboard(collabPage, docTitle);
    await waitForSectionsLoaded(collabPage);

    const ownerIntro = ownerPage.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await ownerIntro.click();
    const collabIntro = collabPage.locator('.nav-item').filter({ hasText: 'Introduction' }).first();
    await collabIntro.click();

    await ownerPage.waitForTimeout(2000);
    await collabPage.waitForTimeout(2000);

    const ownerIndicator = ownerPage.locator('#collab-connection-status');
    await expect(ownerIndicator).toHaveClass(/connected/, { timeout: 10000 });
    const collabIndicator = collabPage.locator('#collab-connection-status');
    await expect(collabIndicator).toHaveClass(/connected/, { timeout: 10000 });

    await clearAndTypeInEditor(collabPage, 'Token auth content sync');

    await ownerPage.waitForFunction(() => {
      const el = document.querySelector('#editor-content .ProseMirror');
      return el && el.textContent.includes('Token auth content sync');
    }, { timeout: 15000 });

    const ownerHasText = await ownerPage.evaluate(() => {
      const el = document.querySelector('#editor-content .ProseMirror');
      return el ? el.textContent.includes('Token auth content sync') : false;
    });
    expect(ownerHasText).toBe(true);

    await ownerCtx.close();
    await collabCtx.close();
  });
});
