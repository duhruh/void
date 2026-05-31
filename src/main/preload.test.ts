import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contextBridge, ipcRenderer } from 'electron';

// Mock electron
vi.mock('electron', () => {
  return {
    contextBridge: {
      exposeInMainWorld: vi.fn(),
    },
    ipcRenderer: {
      invoke: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    },
  };
});

describe('Preload Bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should expose API to main world', async () => {
    // Import preload to trigger the code execution
    await import('./preload');

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('gopass', expect.any(Object));
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('config', expect.any(Object));
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('windowControl', expect.any(Object));
  });

  it('should route gopass methods to ipcRenderer.invoke', async () => {
    await import('./preload');
    
    // Retrieve the exposed gopass object from mock calls
    const mockCalls = vi.mocked(contextBridge.exposeInMainWorld).mock.calls;
    const gopassExposed = mockCalls.find(call => call[0] === 'gopass')?.[1] as any;

    expect(gopassExposed).toBeDefined();

    // Test listSecrets
    vi.mocked(ipcRenderer.invoke).mockResolvedValueOnce(['pwd1']);
    const list = await gopassExposed.listSecrets();
    expect(list).toEqual(['pwd1']);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('gopass:list');

    // Test showSecret
    vi.mocked(ipcRenderer.invoke).mockResolvedValueOnce({ password: '123' });
    const secret = await gopassExposed.showSecret('my/path');
    expect(secret).toEqual({ password: '123' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('gopass:show', 'my/path');

    // Test insertSecret
    await gopassExposed.insertSecret('my/path', 'pwd', { u: 'admin' }, 'body');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('gopass:insert', 'my/path', 'pwd', { u: 'admin' }, 'body');

    // Test deleteSecret
    await gopassExposed.deleteSecret('my/path');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('gopass:delete', 'my/path');

    // Test syncSecrets
    await gopassExposed.syncSecrets();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('gopass:sync');
  });

  it('should route config methods to ipcRenderer.invoke', async () => {
    await import('./preload');
    
    const mockCalls = vi.mocked(contextBridge.exposeInMainWorld).mock.calls;
    const configExposed = mockCalls.find(call => call[0] === 'config')?.[1] as any;

    expect(configExposed).toBeDefined();

    vi.mocked(ipcRenderer.invoke).mockResolvedValueOnce({ version: '1.0' });
    const loaded = await configExposed.loadConfig();
    expect(loaded).toEqual({ version: '1.0' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('config:load');

    const testConfig = { version: '1.0' } as any;
    await configExposed.saveConfig(testConfig);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('config:save', testConfig);
  });

  it('should route windowControl methods to ipcRenderer.invoke', async () => {
    await import('./preload');
    
    const mockCalls = vi.mocked(contextBridge.exposeInMainWorld).mock.calls;
    const windowExposed = mockCalls.find(call => call[0] === 'windowControl')?.[1] as any;

    expect(windowExposed).toBeDefined();

    await windowExposed.hideQuickAccess();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('win:hide-quick-access');

    await windowExposed.openDashboard();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('win:open-dashboard');

    await windowExposed.minimize();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('win:minimize');

    await windowExposed.maximize();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('win:maximize');

    await windowExposed.close();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('win:close', undefined);

    await windowExposed.close(true);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('win:close', true);

    await windowExposed.hidePwgen();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('win:hide-pwgen');

    // Test gopass.pwgen
    const gopassExposed = mockCalls.find(call => call[0] === 'gopass')?.[1] as any;
    vi.mocked(ipcRenderer.invoke).mockResolvedValueOnce('gen_pwd');
    const pwd = await gopassExposed.pwgen('20 -n');
    expect(pwd).toBe('gen_pwd');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('gopass:pwgen', '20 -n');
  });
});
