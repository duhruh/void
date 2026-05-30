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
  listMounts: (): Promise<any[]> => ipcRenderer.invoke('gopass:mounts:list'),
  addMount: (alias: string, path: string): Promise<void> => ipcRenderer.invoke('gopass:mounts:add', alias, path),
  removeMount: (alias: string): Promise<void> => ipcRenderer.invoke('gopass:mounts:remove', alias),
  readBinarySecret: (secretPath: string): Promise<string> => ipcRenderer.invoke('gopass:binary:read', secretPath),
  importBinarySecret: (secretPath: string, localPath: string): Promise<void> => ipcRenderer.invoke('gopass:binary:import', secretPath, localPath),
  exportBinarySecret: (secretPath: string, filename: string): Promise<void> => ipcRenderer.invoke('gopass:binary:export', secretPath, filename),
  getVersion: (): Promise<string> => ipcRenderer.invoke('gopass:version'),
  checkForUpdates: (): Promise<{ updateAvailable: boolean; version?: string; url?: string; error?: string }> => ipcRenderer.invoke('gopass:update:check'),
  installUpdate: (url: string): Promise<void> => ipcRenderer.invoke('gopass:update:install', url),
  onUpdateProgress: (callback: (progress: number) => void) => {
    const listener = (_event: any, data: { progress: number }) => callback(data.progress);
    ipcRenderer.on('gopass:update:progress', listener);
    return () => {
      ipcRenderer.removeListener('gopass:update:progress', listener);
    };
  }
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
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('win:select-directory'),
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

contextBridge.exposeInMainWorld('clipboard', {
  writeText: (text: string, isPassword?: boolean): Promise<void> => ipcRenderer.invoke('clipboard:write', text, isPassword),
});

contextBridge.exposeInMainWorld('gpg', {
  listKeys: (): Promise<Array<{ keyId: string; uid: string }>> => ipcRenderer.invoke('gpg:list-keys'),
  sign: (payload: string): Promise<string> => ipcRenderer.invoke('gpg:sign', payload),
  signDetached: (payloadBase64: string): Promise<string> => ipcRenderer.invoke('gpg:sign-detached', payloadBase64),
  encrypt: (payloadBase64: string, recipientKeyId: string): Promise<string> => ipcRenderer.invoke('gpg:encrypt', payloadBase64, recipientKeyId),
  readFileBase64: (filePath: string): Promise<string> => ipcRenderer.invoke('gpg:read-file-base64', filePath),
});
