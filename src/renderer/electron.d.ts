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
    };
    config: {
      loadConfig(): Promise<AppConfig>;
      saveConfig(config: AppConfig): Promise<void>;
    };
    windowControl: {
      hideQuickAccess(): Promise<void>;
      openDashboard(): Promise<void>;
      minimize(): Promise<void>;
      maximize(): Promise<void>;
      close(): Promise<void>;
      onShowQuickAccess(callback: () => void): () => void;
    };
  }
}
export {};
