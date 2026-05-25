import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AppConfig {
  $schema?: string;
  version: string;
  application: {
    start_at_login: boolean;
    hide_on_blur: boolean;
    clipboard_purge_delay_seconds: number;
    global_hotkey: string;
    show_dashboard_on_startup: boolean;
  };
  gopass_core: {
    executable_path: string;
    auto_sync_on_write: boolean;
    default_store: string;
  };
  theme: {
    mode: 'system' | 'light' | 'dark';
    profile: string;
    allow_dynamic_system_accent: boolean;
    custom_profile_seed: {
      light: {
        seed_color: string;
        tokens: Record<string, string>;
      };
      dark: {
        seed_color: string;
        tokens: Record<string, string>;
      };
    };
  };
}

const DEFAULT_CONFIG: AppConfig = {
  $schema: 'https://gopass.pw/schemas/desktop-config.v1.json',
  version: '1.0.0',
  application: {
    start_at_login: true,
    hide_on_blur: true,
    clipboard_purge_delay_seconds: 45,
    global_hotkey: 'CommandOrControl+Shift+P',
    show_dashboard_on_startup: true,
  },
  gopass_core: {
    executable_path: 'gopass',
    auto_sync_on_write: true,
    default_store: 'root',
  },
  theme: {
    mode: 'system',
    profile: 'custom',
    allow_dynamic_system_accent: true,
    custom_profile_seed: {
      light: {
        seed_color: '#6750A4',
        tokens: {
          'md.sys.color.primary': '#6750A4',
          'md.sys.color.on-primary': '#FFFFFF',
          'md.sys.color.primary-container': '#EADDFF',
          'md.sys.color.on-primary-container': '#21005D',
          'md.sys.color.surface': '#FEF7FF',
          'md.sys.color.on-surface': '#1D1B20',
          'md.sys.color.surface-variant': '#E7E0EC',
          'md.sys.color.on-surface-variant': '#49454F',
        },
      },
      dark: {
        seed_color: '#D0BCFF',
        tokens: {
          'md.sys.color.primary': '#D0BCFF',
          'md.sys.color.on-primary': '#381E72',
          'md.sys.color.primary-container': '#4F378B',
          'md.sys.color.on-primary-container': '#EADDFF',
          'md.sys.color.surface': '#141218',
          'md.sys.color.on-surface': '#E6E1E5',
          'md.sys.color.surface-variant': '#49454F',
          'md.sys.color.on-surface-variant': '#CAC4D0',
        },
      },
    },
  },
};

export function getConfigPath(): string {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Void', 'config.json');
  } else if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Void', 'config.json');
  } else {
    // Linux and fallback
    const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    return path.join(configHome, 'Void', 'config.json');
  }
}

/**
 * Load app configuration from disk
 */
export function loadConfig(configFilePath?: string): AppConfig {
  const filePath = configFilePath || getConfigPath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const loaded = JSON.parse(data);
      // Merge with defaults to ensure missing properties are filled
      return {
        ...DEFAULT_CONFIG,
        ...loaded,
        application: { ...DEFAULT_CONFIG.application, ...(loaded.application || {}) },
        gopass_core: { ...DEFAULT_CONFIG.gopass_core, ...(loaded.gopass_core || {}) },
        theme: {
          ...DEFAULT_CONFIG.theme,
          ...(loaded.theme || {}),
          custom_profile_seed: {
            light: { ...DEFAULT_CONFIG.theme.custom_profile_seed.light, ...(loaded.theme?.custom_profile_seed?.light || {}) },
            dark: { ...DEFAULT_CONFIG.theme.custom_profile_seed.dark, ...(loaded.theme?.custom_profile_seed?.dark || {}) },
          },
        },
      };
    }
  } catch (err) {
    console.error('Error loading config, using default:', err);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration atomically to disk
 */
export function saveConfig(config: AppConfig, configFilePath?: string): void {
  const filePath = configFilePath || getConfigPath();
  const dir = path.dirname(filePath);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempFile = `${filePath}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(config, null, 2), 'utf-8');
    fs.renameSync(tempFile, filePath);
  } catch (err) {
    console.error('Failed to save config atomically:', err);
    throw err;
  }
}
