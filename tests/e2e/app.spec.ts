import { _electron as electron, test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('gopass-desktop E2E', () => {
  let electronApp: any;

  test.beforeEach(async () => {
    // Launch the Electron app
    electronApp = await electron.launch({
      args: [path.resolve(__dirname, '../../dist-electron/main/main.js')],
      env: { ...process.env, E2E_TEST: 'true' },
    });
  });

  test.afterEach(async () => {
    // Close the app
    await electronApp.close();
  });

  test('should open dashboard on start and display mocked folders', async () => {
    const window = await electronApp.firstWindow();
    
    // Log page errors and logs
    window.on('console', (msg: any) => console.log(`[PAGE LOG] ${msg.text()}`));
    window.on('pageerror', (err: any) => console.error(`[PAGE ERROR] ${err.message}`));
    
    // Mock the gopass CLI IPC handlers directly in the Electron main process
    await electronApp.evaluate(({ ipcMain }: any) => {
      ipcMain.removeHandler('gopass:list');
      ipcMain.removeHandler('gopass:show');
      
      ipcMain.handle('gopass:list', () => [
        'e2etest/banking/chase-card',
        'e2etest/social/twitter',
      ]);
      ipcMain.handle('gopass:show', (_: any, secretPath: string) => ({
        password: 'secretpwd123',
        metadata: { username: 'e2euser', url: 'https://e2e.com' },
        rawBody: `notes for ${secretPath}`,
      }));
    });

    // Navigate to the dashboard page to trigger data fetch with our mock
    const localFilePath = `file://${path.resolve(__dirname, '../../dist/index.html')}#/dashboard`;
    await window.goto(localFilePath);

    // Verify Title
    expect(await window.title()).toBe('gopass-desktop Dashboard');

    // Wait for the folder list and check folder tree
    const folderItem = window.locator('.nav-tree-item >> text="e2etest"');
    await expect(folderItem).toBeVisible();

    // Click on the subfolder e2etest/banking (rendered as "banking")
    const bankingFolder = window.locator('.nav-tree-item >> text="banking"');
    await expect(bankingFolder).toBeVisible();
    await bankingFolder.click();

    // Verify the secret item chase-card appears
    const secretItem = window.locator('text="chase-card"');
    await expect(secretItem).toBeVisible();
    await secretItem.click();

    // Verify detailed editor pane shows username and notes
    const usernameInput = window.locator('input[value="e2euser"]');
    await expect(usernameInput).toBeVisible();

    const notesText = window.locator('textarea:has-text("notes for e2etest/banking/chase-card")');
    await expect(notesText).toBeVisible();
  });
});
