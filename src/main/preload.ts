import { contextBridge, ipcRenderer } from 'electron';
import { SecretData } from './gopass';
import { AppConfig } from './config';

contextBridge.exposeInMainWorld('gopass', {
  listSecrets: (): Promise<string[]> => ipcRenderer.invoke('gopass:list'),
  showSecret: (path: string): Promise<SecretData> => ipcRenderer.invoke('gopass:show', path),
  insertSecret: (
    path: string,
    password: string,
    metadata: Record<string, string>,
    rawBody: string
  ): Promise<void> => ipcRenderer.invoke('gopass:insert', path, password, metadata, rawBody),
  deleteSecret: (path: string): Promise<void> => ipcRenderer.invoke('gopass:delete', path),
  syncSecrets: (): Promise<void> => ipcRenderer.invoke('gopass:sync'),
  pwgen: (argsStr: string): Promise<string> => ipcRenderer.invoke('gopass:pwgen', argsStr),
});

contextBridge.exposeInMainWorld('config', {
  loadConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:load'),
  saveConfig: (config: AppConfig): Promise<void> => ipcRenderer.invoke('config:save', config),
  onConfigChanged: (callback: (config: AppConfig) => void) => {
    const listener = (_event: any, newConfig: AppConfig) => callback(newConfig);
    ipcRenderer.on('config:changed', listener);
    return () => {
      ipcRenderer.removeListener('config:changed', listener);
    };
  }
});

contextBridge.exposeInMainWorld('windowControl', {
  hideQuickAccess: (): Promise<void> => ipcRenderer.invoke('win:hide-quick-access'),
  openDashboard: (): Promise<void> => ipcRenderer.invoke('win:open-dashboard'),
  minimize: (): Promise<void> => ipcRenderer.invoke('win:minimize'),
  maximize: (): Promise<void> => ipcRenderer.invoke('win:maximize'),
  close: (): Promise<void> => ipcRenderer.invoke('win:close'),
  hidePwgen: (): Promise<void> => ipcRenderer.invoke('win:hide-pwgen'),
  onShowQuickAccess: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('quick-access:show', listener);
    return () => {
      ipcRenderer.removeListener('quick-access:show', listener);
    };
  },
  onShowPwgen: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('pwgen:show', listener);
    return () => {
      ipcRenderer.removeListener('pwgen:show', listener);
    };
  },
});
