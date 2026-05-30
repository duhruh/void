import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray, nativeImage, net, nativeTheme, clipboard, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { loadConfig, saveConfig, AppConfig } from './config';
import {
  listSecrets,
  showSecret,
  insertSecret,
  deleteSecret,
  syncSecrets,
  setGopassPath,
  generatePassword,
  executeGopassBinary,
  listMounts,
  addMount,
  removeMount
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

function updateContentProtection() {
  const isE2E = process.env.E2E_TEST === 'true';
  const protect = isE2E ? false : !(currentConfig?.developer?.enabled && currentConfig?.developer?.enable_screenshots);
  if (quickAccessWindow && !quickAccessWindow.isDestroyed()) {
    quickAccessWindow.setContentProtection(protect);
  }
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.setContentProtection(protect);
  }
  if (pwgenWindow && !pwgenWindow.isDestroyed()) {
    pwgenWindow.setContentProtection(protect);
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
  updateContentProtection();

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
  updateContentProtection();

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

  updateContentProtection();

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
let clipboardPurgeTimer: NodeJS.Timeout | null = null;

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
    updateContentProtection();
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

  ipcMain.handle('gopass:mounts:list', async () => {
    return listMounts();
  });

  ipcMain.handle('gopass:mounts:add', async (_, alias: string, storePath: string) => {
    await addMount(alias, storePath);
  });

  ipcMain.handle('gopass:mounts:remove', async (_, alias: string) => {
    await removeMount(alias);
  });

  ipcMain.handle('gopass:binary:read', async (_, secretPath: string) => {
    const tempDir = app.getPath('temp');
    const tempFilePath = path.join(tempDir, `void_temp_${Date.now()}_${path.basename(secretPath)}`);
    try {
      await executeGopassBinary(['fscopy', secretPath, tempFilePath]);
      if (fs.existsSync(tempFilePath)) {
        const buffer = fs.readFileSync(tempFilePath);
        const base64Data = buffer.toString('base64');
        fs.unlinkSync(tempFilePath);
        return base64Data;
      }
      throw new Error('Temp file was not written');
    } catch (err) {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      console.error('Binary read failed:', err);
      throw err;
    }
  });

  ipcMain.handle('gopass:binary:import', async (_, secretPath: string, localPath: string) => {
    await executeGopassBinary(['fscopy', localPath, secretPath]);
  });

  ipcMain.handle('gopass:binary:export', async (event, secretPath: string, filename: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    const result = await dialog.showSaveDialog(window, {
      defaultPath: filename,
      title: 'Save Attachment',
    });
    if (result.canceled || !result.filePath) return;
    await executeGopassBinary(['fscopy', secretPath, result.filePath]);
  });

  ipcMain.handle('win:select-directory', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('clipboard:write', async (_, text: string, isPassword?: boolean) => {
    clipboard.writeText(text);
    if (clipboardPurgeTimer) {
      clearTimeout(clipboardPurgeTimer);
      clipboardPurgeTimer = null;
    }
    if (isPassword) {
      const delay = (currentConfig.application.clipboard_purge_delay_seconds || 30) * 1000;
      clipboardPurgeTimer = setTimeout(() => {
        if (clipboard.readText() === text) {
          clipboard.clear();
        }
      }, delay);
    }
  });

  ipcMain.handle('gopass:version', async () => {
    return app.getVersion();
  });

  ipcMain.handle('gopass:update:check', async () => {
    if (process.env.VOID_DEBUG_UPDATE === 'true' || (currentConfig.developer?.enabled && currentConfig.developer?.simulate_updates)) {
      return {
        updateAvailable: true,
        version: '9.9.9-debug',
        url: 'mock://updater-simulation-url'
      };
    }
    try {
      const response = await net.fetch('https://duhruh.me/void/update.json');
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      const data = await response.json();
      
      const currentVersion = app.getVersion();
      const remoteVersion = data.version;
      
      const cleanV1 = currentVersion.replace(/^v/, '');
      const cleanV2 = remoteVersion.replace(/^v/, '');
      const parts1 = cleanV1.split('.').map(Number);
      const parts2 = cleanV2.split('.').map(Number);
      
      let isNewer = false;
      for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p2 > p1) {
          isNewer = true;
          break;
        }
        if (p1 > p2) {
          break;
        }
      }
      
      if (isNewer) {
        const platformKey = `${process.platform}-${process.arch}`;
        const url = data.platforms[platformKey] || data.platforms[`${process.platform}-x64`] || '';
        return {
          updateAvailable: !!url,
          version: remoteVersion,
          url
        };
      }
      
      return { updateAvailable: false };
    } catch (err: any) {
      console.error('Update check failed:', err);
      return { updateAvailable: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('gopass:update:install', async (_, url: string) => {
    if (process.env.VOID_DEBUG_UPDATE === 'true' || (currentConfig.developer?.enabled && currentConfig.developer?.simulate_updates)) {
      return new Promise<void>((resolve) => {
        let progress = 0;
        const timer = setInterval(() => {
          progress += 5;
          if (dashboardWindow && !dashboardWindow.isDestroyed()) {
            dashboardWindow.webContents.send('gopass:update:progress', { progress });
          }
          if (progress >= 100) {
            clearInterval(timer);
            setTimeout(() => {
              console.log('Update simulation finished successfully. Relaunching...');
              resolve();
              app.relaunch();
              app.exit(0);
            }, 1500);
          }
        }, 150);
      });
    }
    return new Promise<void>((resolve, reject) => {
      const tempDir = app.getPath('temp');
      const ext = path.extname(url) || (process.platform === 'win32' ? '.exe' : '');
      const installerPath = path.join(tempDir, `void_installer_${Date.now()}${ext}`);
      
      console.log(`Starting update download from: ${url} to: ${installerPath}`);
      
      const request = net.request(url);
      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download installer: HTTP ${response.statusCode}`));
          return;
        }
        
        const totalBytes = parseInt(response.headers['content-length'] as string || '0', 10);
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(installerPath);
        
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          fileStream.write(chunk);
          
          if (totalBytes > 0) {
            const percent = Math.round((downloadedBytes / totalBytes) * 100);
            if (dashboardWindow && !dashboardWindow.isDestroyed()) {
              dashboardWindow.webContents.send('gopass:update:progress', { progress: percent });
            }
          }
        });
        
        response.on('end', () => {
          fileStream.end();
        });
        
        fileStream.on('finish', () => {
          console.log(`Download finished. Executing installer: ${installerPath}`);
          try {
            if (process.platform === 'win32') {
              const updaterVbsPath = path.join(tempDir, 'void_updater.vbs');
              const appPath = process.execPath;
              const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WScript.Sleep 2000
WshShell.Run """${installerPath.replace(/"/g, '""')}"" /S", 0, True
WshShell.Run """${appPath.replace(/"/g, '""')}"" --post-update"
Set fso = CreateObject("Scripting.FileSystemObject")
fso.DeleteFile WScript.ScriptFullName
`;
              fs.writeFileSync(updaterVbsPath, vbsContent, 'utf-8');
              
              const { spawn } = require('child_process');
              const child = spawn('wscript.exe', [updaterVbsPath], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
              });
              child.unref();
              
              resolve();
              (app as any).isQuitting = true;
              app.quit();
            } else {
              const { shell } = require('electron');
              shell.openPath(installerPath).then((errStr: string) => {
                if (errStr) {
                  reject(new Error(errStr));
                } else {
                  resolve();
                  (app as any).isQuitting = true;
                  app.quit();
                }
              }).catch(reject);
            }
          } catch (err) {
            reject(err);
          }
        });
        
        fileStream.on('error', (err) => {
          reject(err);
        });
      });
      
      request.on('error', (err) => {
        reject(err);
      });
      
      request.end();
    });
  });

  ipcMain.handle('gpg:list-keys', async () => {
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      exec('gpg --list-keys --with-colons', (err: any, stdout: string, stderr: string) => {
        if (err) {
          console.error('Failed to run gpg --list-keys:', err, stderr);
          resolve([]);
          return;
        }

        const keys: Array<{ keyId: string; uid: string }> = [];
        const seenKeys = new Set<string>();
        let currentKeyId = '';

        const lines = stdout.split('\n');
        for (const line of lines) {
          const parts = line.split(':');
          const type = parts[0];
          if (type === 'pub') {
            currentKeyId = parts[4] || '';
          } else if (type === 'uid' && currentKeyId) {
            const uid = parts[9] || '';
            if (uid && !seenKeys.has(currentKeyId)) {
              seenKeys.add(currentKeyId);
              keys.push({ keyId: currentKeyId, uid });
            }
          }
        }
        resolve(keys);
      });
    });
  });

  ipcMain.handle('gpg:sign', async (_, payload: string) => {
    return new Promise<string>((resolve, reject) => {
      const { spawn } = require('child_process');
      const child = spawn('gpg', ['--clearsign', '--batch', '--no-tty', '--yes']);
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data: any) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data: any) => {
        stderr += data.toString();
      });
      
      child.on('close', (code: number) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`GPG signing failed (exit code ${code}): ${stderr}`));
        }
      });
      
      child.stdin.write(payload);
      child.stdin.end();
    });
  });

  ipcMain.handle('gpg:sign-detached', async (_, payloadBase64: string) => {
    return new Promise<string>((resolve, reject) => {
      const { spawn } = require('child_process');
      const child = spawn('gpg', ['--detach-sign', '--armor', '--batch', '--no-tty', '--yes']);
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data: any) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data: any) => {
        stderr += data.toString();
      });
      
      child.on('close', (code: number) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`GPG detached signing failed (exit code ${code}): ${stderr}`));
        }
      });
      
      child.stdin.write(Buffer.from(payloadBase64, 'base64'));
      child.stdin.end();
    });
  });

  ipcMain.handle('gpg:encrypt', async (_, payloadBase64: string, recipientKeyId: string) => {
    return new Promise<string>((resolve, reject) => {
      const { spawn } = require('child_process');
      const child = spawn('gpg', [
        '--encrypt',
        '--armor',
        '--recipient', recipientKeyId,
        '--trust-model', 'always',
        '--batch',
        '--no-tty',
        '--yes'
      ]);
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data: any) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data: any) => {
        stderr += data.toString();
      });
      
      child.on('close', (code: number) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`GPG encryption failed (exit code ${code}): ${stderr}`));
        }
      });
      
      child.stdin.write(Buffer.from(payloadBase64, 'base64'));
      child.stdin.end();
    });
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

  // If enabled in configurations or just updated, show dashboard on startup (defaults to true)
  const isPostUpdate = process.argv.includes('--post-update');
  if (currentConfig.application.show_dashboard_on_startup || isPostUpdate) {
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
