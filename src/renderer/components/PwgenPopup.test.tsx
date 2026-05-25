import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import PwgenPopup from './PwgenPopup';

describe('PwgenPopup Component', () => {
  const mockConfig = {
    version: '1.0.0',
    application: {
      pwgen_arguments: '20 -n',
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock window contextBridge APIs
    window.gopass = {
      pwgen: vi.fn().mockResolvedValue('randompwd12345'),
    } as any;

    window.windowControl = {
      hidePwgen: vi.fn().mockResolvedValue(undefined),
      onShowPwgen: vi.fn(() => vi.fn()),
    } as any;

    // Mock clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  it('renders title and generates password on mount', async () => {
    await act(async () => {
      render(<PwgenPopup config={mockConfig} />);
    });

    expect(screen.getByText(/One-Time Password/i)).toBeInTheDocument();
    expect(window.gopass.pwgen).toHaveBeenCalledWith('20 -n');
    expect(await screen.findByText('randompwd12345')).toBeInTheDocument();
  });

  it('copies generated password to clipboard on Copy click', async () => {
    await act(async () => {
      render(<PwgenPopup config={mockConfig} />);
    });

    const copyBtn = screen.getByRole('button', { name: /Copy/ });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('randompwd12345');
  });

  it('regenerates password on Re-roll click', async () => {
    vi.mocked(window.gopass.pwgen)
      .mockResolvedValueOnce('firstpwd')
      .mockResolvedValueOnce('secondpwd');

    await act(async () => {
      render(<PwgenPopup config={mockConfig} />);
    });

    expect(await screen.findByText('firstpwd')).toBeInTheDocument();

    const rerollBtn = screen.getByRole('button', { name: /Re-roll/ });
    await act(async () => {
      fireEvent.click(rerollBtn);
    });

    expect(await screen.findByText('secondpwd')).toBeInTheDocument();
    expect(window.gopass.pwgen).toHaveBeenCalledTimes(2);
  });
});
