vi.mock('react-pdf', () => {
  return {
    Document: ({ children }: any) => <div data-testid="mock-pdf-document">{children}</div>,
    Page: ({ pageNumber }: any) => <div data-testid="mock-pdf-page">Page {pageNumber}</div>,
    pdfjs: {
      GlobalWorkerOptions: {
        workerSrc: '',
      },
    },
  };
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from './Dashboard';

describe('Dashboard Component', () => {
  const mockConfig = {
    version: '1.0.0',
    application: {
      start_at_login: false,
      hide_on_blur: true,
      clipboard_purge_delay_seconds: 45,
      global_hotkey: 'Ctrl+Shift+P',
      show_dashboard_on_startup: true,
      shortcut_copy_password: 'Control+C',
      shortcut_copy_username: 'Alt+U',
      shortcut_copy_totp: 'Alt+O',
      shortcut_edit_secret: 'Alt+E',
      global_pwgen_hotkey: 'CommandOrControl+Shift+G',
      pwgen_arguments: '20',
    },
    gopass_core: {
      executable_path: 'gopass',
      auto_sync_on_write: true,
      default_store: 'root',
    },
    theme: { mode: 'system' }
  } as any;

  const mockSetConfig = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock localStorage
    const store: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => { store[key] = value.toString(); }),
      removeItem: vi.fn((key) => { delete store[key]; }),
      clear: vi.fn(() => { for (const k in store) delete store[k]; }),
      length: 0,
      key: vi.fn((idx) => Object.keys(store)[idx] || null),
    };
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });

    window.gopass = {
      listSecrets: vi.fn().mockResolvedValue([
        'personal/banking/chase',
        'personal/entertainment/netflix',
        'work/infra/aws-root',
      ]),
      showSecret: vi.fn().mockResolvedValue({
        password: 'mypassword123',
        metadata: { username: 'testuser', url: 'https://test.com' },
        rawBody: 'secure notes content',
      }),
      insertSecret: vi.fn().mockResolvedValue(undefined),
      deleteSecret: vi.fn().mockResolvedValue(undefined),
      syncSecrets: vi.fn().mockResolvedValue(undefined),
      listMounts: vi.fn().mockResolvedValue([
        { alias: 'root', path: '/mock/root', isRoot: true }
      ]),
      addMount: vi.fn().mockResolvedValue(undefined),
      removeMount: vi.fn().mockResolvedValue(undefined),
      readBinarySecret: vi.fn().mockResolvedValue(''),
      importBinarySecret: vi.fn().mockResolvedValue(undefined),
      exportBinarySecret: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('renders navigation folders tree and secret list in pane 2', async () => {
    await act(async () => {
      render(<Dashboard config={mockConfig} setConfig={mockSetConfig} />);
    });

    // Verify folder hierarchy
    expect(screen.getByText('personal')).toBeInTheDocument();
    expect(screen.getByText('work')).toBeInTheDocument();

    // Select personal/banking folder (rendered as "banking")
    await act(async () => {
      fireEvent.click(screen.getByText('banking'));
    });

    // Secrets in folder should display in Pane 2 (but not work folder secrets)
    expect(screen.queryByText('chase')).toBeInTheDocument();
    expect(screen.queryByText('aws-root')).not.toBeInTheDocument();
  });

  it('loads and displays details when a secret is clicked', async () => {
    await act(async () => {
      render(<Dashboard config={mockConfig} setConfig={mockSetConfig} />);
    });

    // Select banking folder
    await act(async () => {
      fireEvent.click(screen.getByText('banking'));
    });

    // Click secret
    await act(async () => {
      fireEvent.click(screen.getByText('chase'));
    });

    expect(window.gopass.showSecret).toHaveBeenCalledWith('personal/banking/chase');

    // Pane 3 should display secret path and detail editor fields
    expect(screen.getAllByText('personal/banking/chase')[0]).toBeInTheDocument();
    expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
    expect(screen.getByText('secure notes content')).toBeInTheDocument();
  });

  it('triggers git sync when Sync button is clicked', async () => {
    await act(async () => {
      render(<Dashboard config={mockConfig} setConfig={mockSetConfig} />);
    });

    const syncButton = screen.getByText('Sync Now');
    await act(async () => {
      fireEvent.click(syncButton);
    });

    expect(window.gopass.syncSecrets).toHaveBeenCalled();
  });

  it('renders custom menu bar and opens help menu options', async () => {
    await act(async () => {
      render(<Dashboard config={mockConfig} setConfig={mockSetConfig} />);
    });

    // Check menu buttons exist in custom title bar
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();

    // Click Help to open menu dropdown
    const helpButton = screen.getByText('Help');
    await act(async () => {
      fireEvent.click(helpButton);
    });

    // About item should show up in menu
    expect(screen.getByText('About')).toBeInTheDocument();
  });

  it('renders image previews correctly for image file secrets', async () => {
    window.gopass.showSecret = vi.fn().mockResolvedValue({
      password: '[Void Secure File]',
      metadata: {
        'Content-Disposition': 'attachment; filename="screenshot.png"',
        'Content-Transfer-Encoding': 'Base64',
        'mimeType': 'image/png',
        'size': '1024',
      },
      rawBody: '',
    });
    window.gopass.readBinarySecret = vi.fn().mockResolvedValue('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');

    await act(async () => {
      render(<Dashboard config={mockConfig} setConfig={mockSetConfig} />);
    });

    await act(async () => {
      fireEvent.click(screen.getAllByText('banking')[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getAllByText('chase')[0]);
    });

    expect(await screen.findByText('screenshot.png')).toBeInTheDocument();
    expect(screen.getByText('Download File')).toBeInTheDocument();
    
    const img = await screen.findByRole('img', { name: /preview/i });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', expect.stringContaining('data:image/png;base64,'));
  });

  it('renders pdf document preview correctly for PDF secrets', async () => {
    window.gopass.showSecret = vi.fn().mockResolvedValue({
      password: '[Void Secure File]',
      metadata: {
        'Content-Disposition': 'attachment; filename="document.pdf"',
        'mimeType': 'application/pdf',
      },
      rawBody: '',
    });
    window.gopass.readBinarySecret = vi.fn().mockResolvedValue('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');

    await act(async () => {
      render(<Dashboard config={mockConfig} setConfig={mockSetConfig} />);
    });

    await act(async () => {
      fireEvent.click(screen.getAllByText('banking')[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getAllByText('chase')[0]);
    });

    expect(await screen.findByText('document.pdf')).toBeInTheDocument();
    expect(screen.getByText('Download File')).toBeInTheDocument();
    expect(await screen.findByTestId('mock-pdf-document')).toBeInTheDocument();
  });

  it('renders flat text file contents correctly for plain text secrets', async () => {
    window.gopass.showSecret = vi.fn().mockResolvedValue({
      password: '[Void Secure File]',
      metadata: {
        'Content-Disposition': 'attachment; filename="system.log"',
        'mimeType': 'text/plain',
      },
      rawBody: '',
    });
    window.gopass.readBinarySecret = vi.fn().mockResolvedValue('U3lzdGVtIHN0YXJ0ZWQgc3VjY2Vzc2Z1bGx5');

    await act(async () => {
      render(<Dashboard config={mockConfig} setConfig={mockSetConfig} />);
    });

    await act(async () => {
      fireEvent.click(screen.getAllByText('banking')[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getAllByText('chase')[0]);
    });

    expect(await screen.findByText('system.log')).toBeInTheDocument();
    expect(screen.getByText('Download File')).toBeInTheDocument();
    expect(await screen.findByText('File Contents (Plain Text)')).toBeInTheDocument();
    expect(screen.getByText('System started successfully')).toBeInTheDocument();
  });
});
