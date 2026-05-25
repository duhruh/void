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
});

contextBridge.exposeInMainWorld('config', {
  loadConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:load'),
  saveConfig: (config: AppConfig): Promise<void> => ipcRenderer.invoke('config:save', config),
});

contextBridge.exposeInMainWorld('windowControl', {
  hideQuickAccess: (): Promise<void> => ipcRenderer.invoke('win:hide-quick-access'),
  openDashboard: (): Promise<void> => ipcRenderer.invoke('win:open-dashboard'),
  onShowQuickAccess: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('quick-access:show', listener);
    return () => {
      ipcRenderer.removeListener('quick-access:show', listener);
    };
  },
});
