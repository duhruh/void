import React, { useEffect, useState } from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import QuickAccess from './components/QuickAccess';
import Dashboard from './components/Dashboard';
import PwgenPopup from './components/PwgenPopup';
import { AppConfig } from '../main/config';

export default function App() {
  const [route, setRoute] = useState<string>('dashboard');
  const [config, setConfig] = useState<AppConfig | null>(null);

  // Hash-based router
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash || '';
      if (hash.includes('quick-access')) {
        setRoute('quick-access');
      } else if (hash.includes('pwgen')) {
        setRoute('pwgen');
      } else {
        setRoute('dashboard');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Trigger initial parse

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // Load config on mount
  useEffect(() => {
    if (window.config) {
      window.config.loadConfig().then((loadedConfig) => {
        setConfig(loadedConfig);
      });

      const unsub = window.config.onConfigChanged((newConfig) => {
        setConfig(newConfig);
      });
      return unsub;
    }
  }, []);

  // Determine theme mode (light, dark, system)
  const [isDarkMode, setIsDarkMode] = useState(false);
  useEffect(() => {
    if (!config) return;

    const mode = config.theme.mode;
    if (mode === 'dark') {
      setIsDarkMode(true);
    } else if (mode === 'light') {
      setIsDarkMode(false);
    } else {
      // System
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setIsDarkMode(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => {
        setIsDarkMode(e.matches);
      };
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [config]);

  // Update HTML body theme class for native variables
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.remove('theme-light');
      root.classList.add('theme-dark');
    } else {
      root.classList.remove('theme-dark');
      root.classList.add('theme-light');
    }
  }, [isDarkMode]);

  // Dynamically set background transparency for quick access and pwgen views
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    if (route === 'quick-access' || route === 'pwgen') {
      body.style.backgroundColor = 'transparent';
      html.style.backgroundColor = 'transparent';
    } else {
      body.style.backgroundColor = '';
      html.style.backgroundColor = '';
    }
  }, [route]);

  // Generate MUI Theme according to config tokens
  const muiTheme = React.useMemo(() => {
    const seed = config?.theme?.custom_profile_seed?.[isDarkMode ? 'dark' : 'light'];
    const primaryColor = seed?.tokens?.['md.sys.color.primary'] || (isDarkMode ? '#D0BCFF' : '#6750A4');
    const surfaceColor = seed?.tokens?.['md.sys.color.surface'] || (isDarkMode ? '#141218' : '#FEF7FF');
    const onSurfaceColor = seed?.tokens?.['md.sys.color.on-surface'] || (isDarkMode ? '#E6E1E5' : '#1D1B20');

    return createTheme({
      palette: {
        mode: isDarkMode ? 'dark' : 'light',
        primary: {
          main: primaryColor,
        },
        background: {
          default: surfaceColor,
          paper: isDarkMode ? '#1E1B24' : '#F7F2FA',
        },
        text: {
          primary: onSurfaceColor,
        },
      },
      typography: {
        fontFamily: '"Plus Jakarta Sans", "Inter", "Outfit", sans-serif',
        h1: { fontFamily: '"Outfit", sans-serif' },
        h2: { fontFamily: '"Outfit", sans-serif' },
        h3: { fontFamily: '"Outfit", sans-serif' },
        h4: { fontFamily: '"Outfit", sans-serif' },
        h5: { fontFamily: '"Outfit", sans-serif' },
        h6: { fontFamily: '"Outfit", sans-serif' },
      },
      shape: {
        borderRadius: 16,
      },
      components: {
        MuiButton: {
          styleOverrides: {
            root: {
              textTransform: 'none',
              borderRadius: 100,
              padding: '10px 24px',
              fontFamily: '"Outfit", sans-serif',
              fontWeight: 500,
            },
          },
        },
        MuiTextField: {
          styleOverrides: {
            root: {
              '& .MuiOutlinedInput-root': {
                borderRadius: 12,
              },
            },
          },
        },
      },
    });
  }, [config, isDarkMode]);

  if (!config) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading Void...</div>;
  }

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {route === 'quick-access' ? (
        <QuickAccess config={config} />
      ) : route === 'pwgen' ? (
        <PwgenPopup config={config} />
      ) : (
        <Dashboard config={config} setConfig={setConfig} />
      )}
    </ThemeProvider>
  );
}
