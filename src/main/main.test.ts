import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu } from 'electron';
import { loadConfig } from './config';

// Mock config
vi.mock('./config', () => {
  return {
    loadConfig: vi.fn(() => ({
      version: '1.0.0',
      application: {
        start_at_login: false,
        hide_on_blur: true,
        clipboard_purge_delay_seconds: 45,
        global_hotkey: 'CommandOrControl+Shift+P',
      },
      gopass_core: {
        executable_path: 'gopass',
        auto_sync_on_write: true,
        default_store: 'root',
      },
      theme: { mode: 'system' }
    })),
    saveConfig: vi.fn(),
  };
});

// Mock gopass CLI runner
vi.mock('./gopass', () => {
  return {
    listSecrets: vi.fn(),
    showSecret: vi.fn(),
    insertSecret: vi.fn(),
    deleteSecret: vi.fn(),
    syncSecrets: vi.fn(),
    setGopassPath: vi.fn(),
  };
});

// Mock electron modules
vi.mock('electron', () => {
  const mockWindow = {
    setContentProtection: vi.fn(),
    loadURL: vi.fn(),
    on: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    center: vi.fn(),
    webContents: {
      send: vi.fn(),
    },
  };

  const mockTray = {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
  };

  return {
    app: {
      whenReady: vi.fn().mockResolvedValue(true),
      isPackaged: false,
      isQuitting: false,
      quit: vi.fn(),
      on: vi.fn(),
    },
    BrowserWindow: vi.fn().mockImplementation(() => mockWindow),
    globalShortcut: {
      register: vi.fn(),
      unregisterAll: vi.fn(),
    },
    ipcMain: {
      handle: vi.fn(),
    },
    Tray: vi.fn().mockImplementation(() => mockTray),
    Menu: {
      buildFromTemplate: vi.fn().mockReturnValue({}),
    },
    nativeImage: {
      createFromDataURL: vi.fn().mockReturnValue({
        resize: vi.fn().mockReturnThis(),
      }),
    },
  };
});

describe('Main Process Entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should initialize app, load config, create windows, tray and shortcuts when app is ready', async () => {
    // Mock app.whenReady resolution
    let whenReadyCallback: (() => void) | null = null;
    vi.mocked(app.whenReady).mockImplementation(() => {
      return {
        then: (cb: () => void) => {
          whenReadyCallback = cb;
          return Promise.resolve();
        }
      } as any;
    });

    // Load main.ts
    await import('./main');

    // Trigger the whenReady hook
    expect(whenReadyCallback).toBeDefined();
    if (whenReadyCallback) {
      (whenReadyCallback as () => void)();
    }

    // Verify config is loaded
    expect(loadConfig).toHaveBeenCalled();

    // Verify Tray and Windows are created
    expect(Tray).toHaveBeenCalled();
    expect(BrowserWindow).toHaveBeenCalledTimes(2); // One for Quick Access, one for Dashboard
    expect(globalShortcut.register).toHaveBeenCalledWith('CommandOrControl+Shift+P', expect.any(Function));

    // Verify IPC handlers are registered
    expect(ipcMain.handle).toHaveBeenCalledWith('gopass:list', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('gopass:show', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('gopass:insert', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('gopass:delete', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('gopass:sync', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('config:load', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('config:save', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('win:hide-quick-access', expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith('win:open-dashboard', expect.any(Function));
  });
});
