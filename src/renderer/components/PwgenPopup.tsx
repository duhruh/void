import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import CopyIcon from '@mui/icons-material/ContentCopyOutlined';
import ReRollIcon from '@mui/icons-material/AutorenewOutlined';
import { AppConfig } from '../../main/config';

interface PwgenPopupProps {
  config: AppConfig;
}

export default function PwgenPopup({ config }: PwgenPopupProps) {
  const [password, setPassword] = useState('Generating...');
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (window.gopass) {
      try {
        const argsStr = config.application.pwgen_arguments || '20';
        const result = await window.gopass.pwgen(argsStr);
        setPassword(result);
        setCopied(false);
      } catch (err) {
        console.error('Failed to generate password:', err);
        setPassword('Error generating password');
      }
    }
  };

  const copyAndClose = async () => {
    if (password && password !== 'Generating...' && password !== 'Error generating password') {
      try {
        await navigator.clipboard.writeText(password);
        setCopied(true);
        // Delay slightly for visual feedback before closing window
        setTimeout(async () => {
          if (window.windowControl) {
            await window.windowControl.hidePwgen();
          }
        }, 300);
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
      }
    }
  };

  useEffect(() => {
    generate();

    // Listen to show event to regenerate
    if (window.windowControl) {
      const unsub = window.windowControl.onShowPwgen(() => {
        setPassword('Generating...');
        generate();
      });
      return unsub;
    }
  }, [config.application.pwgen_arguments]);

  // Keybindings
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await copyAndClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        setPassword('Generating...');
        await generate();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (window.windowControl) {
          await window.windowControl.hidePwgen();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [password]);

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'transparent',
        boxSizing: 'border-box',
      }}
    >
      <Paper
        className="glass-panel animate-fade-in"
        elevation={3}
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '16px',
          boxShadow: 'var(--elevation-3)',
          border: '1px solid var(--glass-border)',
          boxSizing: 'border-box',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: 'var(--color-outline)',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            mb: 1,
          }}
        >
          One-Time Password
        </Typography>

        <Typography
          variant="h5"
          sx={{
            fontFamily: 'var(--font-mono)',
            fontSize: '1.25rem',
            fontWeight: 500,
            letterSpacing: '0.05em',
            color: password === 'Generating...' ? 'var(--color-outline)' : 'var(--color-primary)',
            backgroundColor: 'var(--color-surface-variant)',
            py: 1,
            px: 2,
            borderRadius: '8px',
            width: '100%',
            textAlign: 'center',
            wordBreak: 'break-all',
            mb: 1.5,
            userSelect: 'text',
          }}
        >
          {password}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
          <Button
            variant="contained"
            fullWidth
            onClick={copyAndClose}
            startIcon={<CopyIcon />}
            sx={{
              height: '36px',
              backgroundColor: copied ? '#4caf50' : 'var(--color-primary)',
              color: copied ? '#ffffff' : 'var(--color-on-primary)',
              '&:hover': {
                backgroundColor: copied ? '#45a049' : 'rgba(103, 80, 164, 0.9)',
              },
            }}
          >
            {copied ? 'Copied!' : 'Copy (⏎)'}
          </Button>

          <Button
            variant="outlined"
            onClick={generate}
            startIcon={<ReRollIcon />}
            sx={{
              height: '36px',
              borderColor: 'var(--color-outline)',
              color: 'var(--color-on-surface)',
              px: 2,
            }}
          >
            Re-roll (Space)
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
