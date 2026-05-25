import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray, nativeImage, net, nativeTheme } from 'electron';
import * as path from 'path';
import { loadConfig, saveConfig, AppConfig } from './config';
import {
  listSecrets,
  showSecret,
  insertSecret,
  deleteSecret,
  syncSecrets,
  setGopassPath,
  generatePassword
} from './gopass';

let quickAccessWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null;
let pwgenWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentConfig: AppConfig;

function getAppIconPath(mode: string, type: 'tray' | 'window'): string {
  const isDark = mode === 'dark' || (mode === 'system' && nativeTheme.shouldUseDarkColors);
  const sizeSuffix = type === 'tray' ? '_16.png' : '_256.png';
  const iconName = `${isDark ? 'dark' : 'light'}${sizeSuffix}`;
  
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', iconName);
  } else {
    return path.resolve(__dirname, '../../src/assets', iconName);
  }
}

function updateAppIcons() {
  const trayIconPath = getAppIconPath(currentConfig.theme.mode, 'tray');
  const winIconPath = getAppIconPath(currentConfig.theme.mode, 'window');

  if (tray) {
    tray.setImage(nativeImage.createFromPath(trayIconPath));
  }
  if (dashboardWindow) {
    dashboardWindow.setIcon(nativeImage.createFromPath(winIconPath));
  }
  if (quickAccessWindow) {
    quickAccessWindow.setIcon(nativeImage.createFromPath(winIconPath));
  }
  if (pwgenWindow) {
    pwgenWindow.setIcon(nativeImage.createFromPath(winIconPath));
  }
}

function checkDevServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const request = net.request({
      method: 'GET',
      protocol: 'http:',
      hostname: 'localhost',
      port: 5173,
      path: '/'
    });
    
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        request.abort();
        resolve(false);
      }
    }, 200);

    request.on('response', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(true);
      }
    });
    
    request.on('error', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(false);
      }
    });
    
    request.end();
  });
}

// A simple base64-encoded 16x16 PNG key icon for the tray
const TRAY_ICON_BASE64 = 
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVR42mNkoBAwUqifAWwgZGBg+M9AIWAcNYCBYdQABoZRABgGIIXRgEUBowEwDAwGwCgwGACjwGAAjAJCBgYAH98ED3gLqioAAAAASUVORK5CYII=';

function createTray() {
  const iconPath = getAppIconPath(currentConfig.theme.mode, 'tray');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Quick Access', click: () => toggleQuickAccess() },
    { label: 'Dashboard', click: () => showDashboard() },
    { type: 'separator' },
    { label: 'Quit', click: () => quitApp() }
  ]);

  tray.setToolTip('Void');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    showDashboard();
  });
}

function createQuickAccessWindow(useDevServer: boolean) {
  const iconPath = getAppIconPath(currentConfig.theme.mode, 'window');
  quickAccessWindow = new BrowserWindow({
    width: 600,
    height: 450,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    transparent: true,
    title: 'Void',
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Enable Screen Capture Block (Window Occlusion)
  quickAccessWindow.setContentProtection(true);

  const devServerUrl = 'http://localhost:5173/#/quick-access';
  const localFilePath = `file://${path.resolve(__dirname, '../../dist/index.html')}#/quick-access`;

  if (useDevServer && !app.isPackaged) {
    quickAccessWindow.loadURL(devServerUrl);
  } else {
    quickAccessWindow.loadURL(localFilePath);
  }

  quickAccessWindow.on('blur', () => {
    if (currentConfig.application.hide_on_blur) {
      quickAccessWindow?.hide();
    }
  });
}

function createDashboardWindow(useDevServer: boolean) {
  const iconPath = getAppIconPath(currentConfig.theme.mode, 'window');
  dashboardWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    title: 'Void',
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Enable Screen Capture Block (Window Occlusion)
  dashboardWindow.setContentProtection(true);

  const devServerUrl = 'http://localhost:5173/#/dashboard';
  const localFilePath = `file://${path.resolve(__dirname, '../../dist/index.html')}#/dashboard`;

  if (useDevServer && !app.isPackaged) {
    dashboardWindow.loadURL(devServerUrl);
  } else {
    dashboardWindow.loadURL(localFilePath);
  }

  // Prevent app from quitting on dashboard close, just hide it (except in E2E tests)
  dashboardWindow.on('close', (e) => {
    if (!(app as any).isQuitting && process.env.E2E_TEST !== 'true') {
      e.preventDefault();
      dashboardWindow?.hide();
    }
    return false;
  });
}

function createPwgenWindow(useDevServer: boolean) {
  const iconPath = getAppIconPath(currentConfig.theme.mode, 'window');
  pwgenWindow = new BrowserWindow({
    width: 400,
    height: 220,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    transparent: true,
    title: 'Void',
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  pwgenWindow.setContentProtection(true);

  const devServerUrl = 'http://localhost:5173/#/pwgen';
  const localFilePath = `file://${path.resolve(__dirname, '../../dist/index.html')}#/pwgen`;

  if (useDevServer && !app.isPackaged) {
    pwgenWindow.loadURL(devServerUrl);
  } else {
    pwgenWindow.loadURL(localFilePath);
  }

  pwgenWindow.on('blur', () => {
    pwgenWindow?.hide();
  });
}

function togglePwgen() {
  if (!pwgenWindow) return;

  if (pwgenWindow.isVisible()) {
    pwgenWindow.hide();
  } else {
    pwgenWindow.center();
    pwgenWindow.show();
    pwgenWindow.focus();
    pwgenWindow.webContents.send('pwgen:show');
  }
}

function toggleQuickAccess() {
  if (!quickAccessWindow) return;

  if (quickAccessWindow.isVisible()) {
    quickAccessWindow.hide();
  } else {
    quickAccessWindow.center();
    quickAccessWindow.show();
    quickAccessWindow.focus();
    quickAccessWindow.webContents.send('quick-access:show');
  }
}

function showDashboard() {
  if (!dashboardWindow) return;
  dashboardWindow.show();
  dashboardWindow.focus();
}

function registerGlobalShortcut() {
  globalShortcut.unregisterAll();
  const shortcut = currentConfig.application.global_hotkey;
  try {
    globalShortcut.register(shortcut, () => {
      toggleQuickAccess();
    });
  } catch (err) {
    console.error(`Failed to register global shortcut: ${shortcut}`, err);
  }

  const pwgenShortcut = currentConfig.application.global_pwgen_hotkey;
  try {
    if (pwgenShortcut) {
      globalShortcut.register(pwgenShortcut, () => {
        togglePwgen();
      });
    }
  } catch (err) {
    console.error(`Failed to register global pwgen shortcut: ${pwgenShortcut}`, err);
  }
}

function quitApp() {
  (app as any).isQuitting = true;
  globalShortcut.unregisterAll();
  app.quit();
}

function applyLoginSettings(config: AppConfig) {
  try {
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: config.application.start_at_login,
        path: app.getPath('exe'),
      });
    }
  } catch (err) {
    console.error('Failed to set login item settings:', err);
  }
}

// Binds IPC signals
function setupIpcHandlers() {
  ipcMain.handle('gopass:list', async () => {
    return listSecrets();
  });

  ipcMain.handle('gopass:show', async (_, secretPath: string) => {
    return showSecret(secretPath);
  });

  ipcMain.handle('gopass:insert', async (_, secretPath: string, password: string, metadata: Record<string, string>, rawBody: string) => {
    await insertSecret(secretPath, password, metadata, rawBody);
    // If auto_sync is enabled, trigger background sync
    if (currentConfig.gopass_core.auto_sync_on_write) {
      syncSecrets().catch(err => console.error('Sync failed:', err));
    }
  });

  ipcMain.handle('gopass:delete', async (_, secretPath: string) => {
    await deleteSecret(secretPath);
    if (currentConfig.gopass_core.auto_sync_on_write) {
      syncSecrets().catch(err => console.error('Sync failed:', err));
    }
  });

  ipcMain.handle('gopass:sync', async () => {
    return syncSecrets();
  });

  ipcMain.handle('config:load', async () => {
    return currentConfig;
  });

  ipcMain.handle('config:save', async (_, config: AppConfig) => {
    currentConfig = config;
    if (config.gopass_core.executable_path) {
      setGopassPath(config.gopass_core.executable_path);
    }
    saveConfig(config);
    registerGlobalShortcut();
    updateAppIcons();
    applyLoginSettings(config);

    // Broadcast config change to all windows
    quickAccessWindow?.webContents.send('config:changed', config);
    pwgenWindow?.webContents.send('config:changed', config);
    dashboardWindow?.webContents.send('config:changed', config);
  });

  ipcMain.handle('win:hide-quick-access', async () => {
    quickAccessWindow?.hide();
  });

  ipcMain.handle('win:open-dashboard', async () => {
    showDashboard();
  });

  ipcMain.handle('win:minimize', async () => {
    dashboardWindow?.minimize();
  });

  ipcMain.handle('win:maximize', async () => {
    if (dashboardWindow) {
      if (dashboardWindow.isMaximized()) {
        dashboardWindow.unmaximize();
      } else {
        dashboardWindow.maximize();
      }
    }
  });

  ipcMain.handle('win:close', async () => {
    dashboardWindow?.close();
  });

  ipcMain.handle('gopass:pwgen', async (_, argsStr: string) => {
    const args = argsStr.split(/\s+/).filter(Boolean);
    return generatePassword(args);
  });

  ipcMain.handle('win:hide-pwgen', async () => {
    pwgenWindow?.hide();
  });
}

// App lifecycle
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  currentConfig = loadConfig();
  if (currentConfig.gopass_core.executable_path) {
    setGopassPath(currentConfig.gopass_core.executable_path);
  }
  applyLoginSettings(currentConfig);

  const useDevServer = await checkDevServer();

  createTray();
  createQuickAccessWindow(useDevServer);
  createDashboardWindow(useDevServer);
  createPwgenWindow(useDevServer);
  registerGlobalShortcut();
  setupIpcHandlers();

  // Handle OS theme changes dynamically
  nativeTheme.on('updated', () => {
    if (currentConfig.theme.mode === 'system') {
      updateAppIcons();
    }
  });

  // If enabled in configurations, show dashboard on startup (defaults to true)
  if (currentConfig.application.show_dashboard_on_startup) {
    showDashboard();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Overridden to keep running in tray
  if (process.platform !== 'darwin') {
    // Keep alive for tray persistence
  }
});

// Clean exit handler
