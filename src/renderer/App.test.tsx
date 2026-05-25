import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

// Mock child components to keep unit test isolated
vi.mock('./components/QuickAccess', () => {
  return {
    default: () => <div data-testid="quick-access-mock">Quick Access Mock</div>,
  };
});

vi.mock('./components/Dashboard', () => {
  return {
    default: () => <div data-testid="dashboard-mock">Dashboard Mock</div>,
  };
});

describe('App component router', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock window global properties
    window.config = {
      loadConfig: vi.fn().mockResolvedValue({
        version: '1.0.0',
        application: {
          start_at_login: false,
          hide_on_blur: true,
          clipboard_purge_delay_seconds: 45,
          global_hotkey: 'Ctrl+Shift+P',
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
            light: { seed_color: '#6750A4', tokens: {} },
            dark: { seed_color: '#D0BCFF', tokens: {} },
          },
        },
      }),
      saveConfig: vi.fn(),
    };

    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it('renders loading state initially', async () => {
    let resolveConfig: any;
    const promise = new Promise((resolve) => {
      resolveConfig = resolve;
    });
    window.config.loadConfig = vi.fn().mockReturnValue(promise);

    render(<App />);
    expect(screen.getByText('Loading Void...')).toBeInTheDocument();

    await act(async () => {
      resolveConfig({
        version: '1.0.0',
        application: {
          start_at_login: false,
          hide_on_blur: true,
          clipboard_purge_delay_seconds: 45,
          global_hotkey: 'Ctrl+Shift+P',
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
            light: { seed_color: '#6750A4', tokens: {} },
            dark: { seed_color: '#D0BCFF', tokens: {} },
          },
        },
      });
    });
  });

  it('renders Dashboard component by default after config loads', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.queryByText('Loading Void...')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-mock')).toBeInTheDocument();
  });

  it('renders QuickAccess component when URL hash is quick-access', async () => {
    window.location.hash = '#/quick-access';
    
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByTestId('quick-access-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-mock')).not.toBeInTheDocument();
    
    // Cleanup hash
    window.location.hash = '';
  });
});
