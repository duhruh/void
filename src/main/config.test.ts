import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getConfigPath, loadConfig, saveConfig, AppConfig } from './config';

vi.mock('fs', () => {
  return {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock('os', () => {
  return {
    homedir: vi.fn(() => '/mock/home'),
  };
});

describe('Config Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConfigPath', () => {
    const originalPlatform = process.platform;
    const originalEnv = { ...process.env };

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      process.env = originalEnv;
    });

    it('should generate macOS path', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const configPath = getConfigPath();
      expect(configPath).toBe(path.join('/mock/home', 'Library', 'Application Support', 'Void', 'config.json'));
    });

    it('should generate Windows path using APPDATA env', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.APPDATA = 'C:\\mock\\AppData';
      const configPath = getConfigPath();
      expect(configPath).toBe(path.join('C:\\mock\\AppData', 'Void', 'config.json'));
    });

    it('should generate Linux path using XDG_CONFIG_HOME', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.XDG_CONFIG_HOME = '/mock/xdg/config';
      const configPath = getConfigPath();
      expect(configPath).toBe(path.join('/mock/xdg/config', 'Void', 'config.json'));
    });
  });

  describe('loadConfig', () => {
    it('should return default config if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const config = loadConfig('/some/path');
      expect(config.version).toBe('1.0.0');
      expect(config.application.clipboard_purge_delay_seconds).toBe(45);
      expect(config.gopass_core.executable_path).toBe('gopass');
    });

    it('should merge loaded config with default config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const mockFileContent = JSON.stringify({
        application: {
          clipboard_purge_delay_seconds: 90
        },
        gopass_core: {
          executable_path: '/usr/bin/gopass'
        }
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

      const config = loadConfig('/some/path');
      expect(config.application.clipboard_purge_delay_seconds).toBe(90); // overridden
      expect(config.application.start_at_login).toBe(true); // default preserved
      expect(config.gopass_core.executable_path).toBe('/usr/bin/gopass'); // overridden
    });
  });

  describe('saveConfig', () => {
    it('should create directory and save atomically', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false); // directory doesn't exist

      const testConfig: AppConfig = {
        version: '1.0.0',
        application: {
          start_at_login: false,
          hide_on_blur: false,
          clipboard_purge_delay_seconds: 30,
          global_hotkey: 'Ctrl+Shift+P'
        },
        gopass_core: {
          executable_path: 'gopass',
          auto_sync_on_write: false,
          default_store: 'my-store'
        },
        theme: {
          mode: 'light',
          profile: 'default',
          allow_dynamic_system_accent: false,
          custom_profile_seed: {
            light: { seed_color: '#000000', tokens: {} },
            dark: { seed_color: '#ffffff', tokens: {} }
          }
        }
      };

      saveConfig(testConfig, '/mock/dir/config.json');

      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/dir', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith('/mock/dir/config.json.tmp', expect.any(String), 'utf-8');
      expect(fs.renameSync).toHaveBeenCalledWith('/mock/dir/config.json.tmp', '/mock/dir/config.json');
    });
  });
});
