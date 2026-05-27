import { SecretData } from '../main/gopass';
import { AppConfig } from '../main/config';

declare global {
  interface Window {
    gopass: {
      listSecrets(): Promise<string[]>;
      showSecret(path: string): Promise<SecretData>;
      insertSecret(
        path: string,
        password: string,
        metadata: Record<string, string>,
        rawBody: string
      ): Promise<void>;
      deleteSecret(path: string): Promise<void>;
      syncSecrets(): Promise<void>;
      pwgen(argsStr: string): Promise<string>;
      listMounts(): Promise<Array<{ alias: string; path: string; isRoot: boolean }>>;
      addMount(alias: string, path: string): Promise<void>;
      removeMount(alias: string): Promise<void>;
      readBinarySecret(secretPath: string): Promise<string>;
      importBinarySecret(secretPath: string, localPath: string): Promise<void>;
      exportBinarySecret(secretPath: string, filename: string): Promise<void>;
      getVersion(): Promise<string>;
      checkForUpdates(): Promise<{ updateAvailable: boolean; version?: string; url?: string; error?: string }>;
      installUpdate(url: string): Promise<void>;
      onUpdateProgress(callback: (progress: number) => void): () => void;
    };
    config: {
      loadConfig(): Promise<AppConfig>;
      saveConfig(config: AppConfig): Promise<void>;
      onConfigChanged(callback: (config: AppConfig) => void): () => void;
    };
    windowControl: {
      hideQuickAccess(): Promise<void>;
      openDashboard(): Promise<void>;
      minimize(): Promise<void>;
      maximize(): Promise<void>;
      close(): Promise<void>;
      hidePwgen(): Promise<void>;
      selectDirectory(): Promise<string | null>;
      onShowQuickAccess(callback: () => void): () => void;
      onShowPwgen(callback: () => void): () => void;
    };
    clipboard: {
      writeText(text: string, isPassword?: boolean): Promise<void>;
    };
  }
}
export {};
