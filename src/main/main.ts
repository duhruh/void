import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray, nativeImage } from 'electron';
import * as path from 'path';
import { loadConfig, saveConfig, AppConfig } from './config';
import {
  listSecrets,
  showSecret,
  insertSecret,
  deleteSecret,
  syncSecrets,
  setGopassPath
} from './gopass';

let quickAccessWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentConfig: AppConfig;

// A simple base64-encoded 16x16 PNG key icon for the tray
const TRAY_ICON_BASE64 = 
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAP0lEQVR42mNkoBAwUqifAWwgZGBg+M9AIWAcNYCBYdQABoZRABgGIIXRgEUBowEwDAwGwCgwGACjwGAAjAJCBgYAH98ED3gLqioAAAAASUVORK5CYII=';

function createTray() {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_BASE64);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Quick Access', click: () => toggleQuickAccess() },
    { label: 'Dashboard', click: () => showDashboard() },
    { type: 'separator' },
    { label: 'Quit', click: () => quitApp() }
  ]);

  tray.setToolTip('gopass-desktop');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    toggleQuickAccess();
  });
}

function createQuickAccessWindow() {
  quickAccessWindow = new BrowserWindow({
    width: 600,
    height: 450,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Enable Screen Capture Block (Window Occlusion)
  quickAccessWindow.setContentProtection(true);

  const devServerUrl = 'http://localhost:5173/#/quick-access';
  const localFilePath = `file://${path.join(__dirname, '../dist/index.html')}#/quick-access`;

  if (app.isPackaged) {
    quickAccessWindow.loadURL(localFilePath);
  } else {
    quickAccessWindow.loadURL(devServerUrl);
  }

  quickAccessWindow.on('blur', () => {
    if (currentConfig.application.hide_on_blur) {
      quickAccessWindow?.hide();
    }
  });
}

function createDashboardWindow() {
  dashboardWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'gopass-desktop Dashboard',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Enable Screen Capture Block (Window Occlusion)
  dashboardWindow.setContentProtection(true);

  const devServerUrl = 'http://localhost:5173/#/dashboard';
  const localFilePath = `file://${path.join(__dirname, '../dist/index.html')}#/dashboard`;

  if (app.isPackaged) {
    dashboardWindow.loadURL(localFilePath);
  } else {
    dashboardWindow.loadURL(devServerUrl);
  }

  // Prevent app from quitting on dashboard close, just hide it
  dashboardWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      dashboardWindow?.hide();
    }
    return false;
  });
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
}

function quitApp() {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  app.quit();
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
  });

  ipcMain.handle('win:hide-quick-access', async () => {
    quickAccessWindow?.hide();
  });

  ipcMain.handle('win:open-dashboard', async () => {
    showDashboard();
  });
}

// App lifecycle
app.whenReady().then(() => {
  currentConfig = loadConfig();
  if (currentConfig.gopass_core.executable_path) {
    setGopassPath(currentConfig.gopass_core.executable_path);
  }

  createTray();
  createQuickAccessWindow();
  createDashboardWindow();
  registerGlobalShortcut();
  setupIpcHandlers();

  // If not starting minimized/hidden, open quick access or dashboard
  if (!currentConfig.application.start_at_login) {
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

// Declare custom property on app to track quitting state
declare module 'electron' {
  interface App {
    isQuitting?: boolean;
  }
}
