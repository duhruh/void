const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function capture() {
  const browser = await chromium.launch({
    args: ['--disable-web-security']
  });
  
  const docsAssetsDir = path.resolve(__dirname, '../docs/assets');
  if (!fs.existsSync(docsAssetsDir)) {
    fs.mkdirSync(docsAssetsDir, { recursive: true });
  }

  // Setup HTML path
  const indexPath = path.resolve(__dirname, '../dist/index.html');
  const fileUrl = `file://${indexPath}`;

  // Helper to mock APIs
  const mockApis = async (page) => {
    // Intercept and block Google Fonts requests to prevent hanging offline
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.addInitScript(() => {
      try {
        Object.defineProperty(document.fonts, 'status', {
          get: () => 'loaded',
          configurable: true
        });
        Object.defineProperty(document.fonts, 'ready', {
          get: () => Promise.resolve(),
          configurable: true
        });
      } catch (e) {
        console.error('Failed to mock document.fonts in initScript:', e);
      }

      window.gopass = {
        listSecrets: () => Promise.resolve([
          'personal/banking/chase',
          'personal/entertainment/netflix',
          'work/infra/aws-root',
        ]),
        showSecret: (path) => Promise.resolve({
          password: 'sUp3r-S3cr3t-P@ssw0rd-2026!',
          metadata: { username: 'void_user', url: 'https://github.com/duhruh/void', created: '2026-05-30' },
          rawBody: `## Secure Notes\nThis is a secure note for **${path}**.\n- You can use markdown here.\n- Custom HSL accent colors apply automatically.`,
        }),
        insertSecret: () => Promise.resolve(),
        deleteSecret: () => Promise.resolve(),
        syncSecrets: () => Promise.resolve(),
        pwgen: () => Promise.resolve('sUp3r-S3cr3t-P@ssw0rd-2026!'),
        listMounts: () => Promise.resolve([]),
        addMount: () => Promise.resolve(),
        removeMount: () => Promise.resolve(),
        readBinarySecret: () => Promise.resolve(''),
        importBinarySecret: () => Promise.resolve(),
        exportBinarySecret: () => Promise.resolve(),
        getVersion: () => Promise.resolve('1.0.3'),
        checkForUpdates: () => Promise.resolve({ updateAvailable: false }),
        installUpdate: () => Promise.resolve(),
        onUpdateProgress: (cb) => () => {},
      };
      window.windowControl = {
        hideQuickAccess: () => Promise.resolve(),
        openDashboard: () => Promise.resolve(),
        minimize: () => Promise.resolve(),
        maximize: () => Promise.resolve(),
        close: () => Promise.resolve(),
        hidePwgen: () => Promise.resolve(),
        selectDirectory: () => Promise.resolve('/mocked/directory'),
        onShowQuickAccess: (cb) => () => {},
        onShowPwgen: (cb) => () => {},
      };
      window.config = {
        loadConfig: () => Promise.resolve({
          version: '1.0.3',
          application: {
            start_at_login: false,
            hide_on_blur: true,
            clipboard_purge_delay_seconds: 45,
            global_hotkey: 'Ctrl+Shift+P',
            show_dashboard_on_startup: true,
            shortcut_copy_password: 'Control+C',
            shortcut_copy_username: 'Alt+U',
            shortcut_copy_totp: 'Alt+O',
            shortcut_edit_secret: 'Alt+E',
            global_pwgen_hotkey: 'CommandOrControl+Shift+G',
            pwgen_arguments: '20',
          },
          gopass_core: {
            executable_path: 'gopass',
            auto_sync_on_write: true,
            default_store: 'root',
          },
          theme: {
            mode: 'dark',
            profile: 'custom',
            allow_dynamic_system_accent: true,
            custom_profile_seed: {
              light: { seed_color: '#6750A4', tokens: {} },
              dark: { seed_color: '#D0BCFF', tokens: {} },
            },
          },
        }),
        saveConfig: () => Promise.resolve(),
        onConfigChanged: (cb) => () => {},
      };
      window.clipboard = {
        writeText: () => Promise.resolve(),
      };
    });
  };

  // 1. Dashboard View
  const page = await browser.newPage();
  page.on('console', msg => console.log('DASHBOARD PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('DASHBOARD PAGE ERROR:', err.message));

  await mockApis(page);
  await page.goto(`${fileUrl}#/dashboard`);
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.waitForTimeout(1000); // let animations settle
  // Expand tree elements
  try {
    const personalFolder = page.locator('.nav-tree-item >> text="personal"');
    await personalFolder.click();
    await page.waitForTimeout(300);
    
    const bankingFolder = page.locator('.nav-tree-item >> text="banking"');
    await bankingFolder.click();
    await page.waitForTimeout(300);
    
    const secretItem = page.locator('text="chase"');
    await secretItem.click();
    await page.waitForTimeout(500); // let secret load
  } catch (err) {
    console.error('Error selecting elements in tree:', err);
  }
  await page.screenshot({ path: path.join(docsAssetsDir, 'dashboard.png') });
  console.log('Captured dashboard.png');

  // 2. Quick Access View
  const pageQA = await browser.newPage();
  pageQA.on('console', msg => console.log('QA PAGE LOG:', msg.text()));
  pageQA.on('pageerror', err => console.log('QA PAGE ERROR:', err.message));

  await mockApis(pageQA);
  await pageQA.goto(`${fileUrl}#/quick-access`);
  await pageQA.setViewportSize({ width: 600, height: 450 });
  await pageQA.waitForTimeout(1000);
  // Type 'netflix' in search to show a filtered search
  try {
    await pageQA.fill('input[placeholder*="Search"]', 'netflix');
    await pageQA.waitForTimeout(500);
  } catch (err) {
    console.error('Error filling input in quick access:', err);
  }
  await pageQA.screenshot({ path: path.join(docsAssetsDir, 'quick-access.png'), omitBackground: true });
  console.log('Captured quick-access.png');

  // 3. Pwgen View
  const pagePw = await browser.newPage();
  pagePw.on('console', msg => console.log('PWGEN PAGE LOG:', msg.text()));
  pagePw.on('pageerror', err => console.log('PWGEN PAGE ERROR:', err.message));

  await mockApis(pagePw);
  await pagePw.goto(`${fileUrl}#/pwgen`);
  await pagePw.setViewportSize({ width: 400, height: 220 });
  await pagePw.waitForTimeout(1000);
  await pagePw.screenshot({ path: path.join(docsAssetsDir, 'pwgen.png'), omitBackground: true });
  console.log('Captured pwgen.png');

  await browser.close();
}

capture().catch(console.error);

