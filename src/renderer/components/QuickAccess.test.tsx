import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuickAccess from './QuickAccess';

describe('QuickAccess Component', () => {
  const mockConfig = {
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
    theme: { mode: 'system' }
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();

    window.gopass = {
      listSecrets: vi.fn().mockResolvedValue([
        'personal/banking/chase',
        'personal/entertainment/netflix',
        'work/infra/aws-root',
      ]),
      showSecret: vi.fn().mockResolvedValue({
        password: 'mypassword123',
        metadata: { username: 'myusername' },
        rawBody: '',
      }),
      insertSecret: vi.fn(),
      deleteSecret: vi.fn(),
      syncSecrets: vi.fn(),
    };

    window.windowControl = {
      hideQuickAccess: vi.fn(),
      openDashboard: vi.fn(),
      onShowQuickAccess: vi.fn(() => vi.fn()),
    };

    // Mock clipboard writeText
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
    });
  });

  it('renders search input and loads secrets flat list', async () => {
    await act(async () => {
      render(<QuickAccess config={mockConfig} />);
    });

    expect(screen.getByPlaceholderText('Search secrets, paths, or commands...')).toBeInTheDocument();
    expect(window.gopass.listSecrets).toHaveBeenCalled();

    // Verify render list of secrets
    expect(screen.getByText('chase')).toBeInTheDocument();
    expect(screen.getByText('netflix')).toBeInTheDocument();
  });

  it('filters list based on fuzzy search input', async () => {
    await act(async () => {
      render(<QuickAccess config={mockConfig} />);
    });

    const input = screen.getByPlaceholderText('Search secrets, paths, or commands...');
    
    await act(async () => {
      fireEvent.change(input, { target: { value: 'chase' } });
    });

    expect(screen.getByText('chase')).toBeInTheDocument();
    expect(screen.queryByText('netflix')).not.toBeInTheDocument();
  });

  it('calls showSecret and copies password on Enter press', async () => {
    await act(async () => {
      render(<QuickAccess config={mockConfig} />);
    });

    const input = screen.getByPlaceholderText('Search secrets, paths, or commands...');

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(window.gopass.showSecret).toHaveBeenCalledWith('personal/banking/chase');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('mypassword123');
    expect(window.windowControl.hideQuickAccess).toHaveBeenCalled();
  });

  it('closes quick access window on Escape key press', async () => {
    await act(async () => {
      render(<QuickAccess config={mockConfig} />);
    });

    const input = screen.getByPlaceholderText('Search secrets, paths, or commands...');

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });
    });

    expect(window.windowControl.hideQuickAccess).toHaveBeenCalled();
  });
});
