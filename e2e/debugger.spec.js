import { test, expect } from '@playwright/test';

test.describe('VOID Debugger E2E', () => {
  test('App loads and executes code', async ({ page }) => {
    // Navigate to local dev server (assuming it runs on default Vite port 5173)
    await page.goto('http://localhost:5173/');
    
    // Expect the app and core UI components to be visible
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('.toolbar')).toBeVisible();
    
    // Click the RUN button
    const runBtn = page.locator('button.btn-run');
    await expect(runBtn).toBeVisible();
    await runBtn.click();
    
    // Check if console has execution complete message
    const consoleOutput = page.locator('.console-lines');
    await expect(consoleOutput).toContainText('Execution complete');
  });

  test('Can evaluate objects in console safely', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    
    const input = page.locator('.console-input-field');
    await input.fill('{ test: 123 }');
    await input.press('Enter');
    
    const consoleOutput = page.locator('.console-lines');
    await expect(consoleOutput).toContainText('test: 123');
  });
});
