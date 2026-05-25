import React, { useEffect, useRef, useState } from 'react';
import { Box, InputBase, List, ListItem, ListItemIcon, ListItemText, Typography, Paper } from '@mui/material';
import FolderIcon from '@mui/icons-material/FolderOpenOutlined';
import KeyIcon from '@mui/icons-material/VpnKeyOutlined';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import Fuse from 'fuse.js';
import { AppConfig } from '../../main/config';

interface QuickAccessProps {
  config: AppConfig;
}

export default function QuickAccess({ config }: QuickAccessProps) {
  const [query, setQuery] = useState('');
  const [secrets, setSecrets] = useState<string[]>([]);
  const [filtered, setFiltered] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Load secret paths on startup
  const fetchSecrets = async () => {
    if (window.gopass) {
      try {
        const paths = await window.gopass.listSecrets();
        setSecrets(paths);
        setFiltered(paths.slice(0, 50)); // default list top 50
      } catch (err) {
        console.error('Failed to load secrets in QuickAccess:', err);
      }
    }
  };

  useEffect(() => {
    fetchSecrets();

    // Listen to focus / show events from main process
    if (window.windowControl) {
      const unsub = window.windowControl.onShowQuickAccess(() => {
        setQuery('');
        setSelectedIndex(0);
        fetchSecrets();
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      });
      return unsub;
    }
  }, []);

  // Update fuzzy filtering on query change
  useEffect(() => {
    if (!query) {
      setFiltered(secrets.slice(0, 50));
      setSelectedIndex(0);
      return;
    }

    // Ultra-low latency fuzzy search using Fuse.js
    const start = performance.now();
    const fuse = new Fuse(secrets, {
      threshold: 0.4,
      distance: 100,
    });
    const results = fuse.search(query).map(r => r.item);
    const end = performance.now();
    
    // Ensure we meet the <30ms requirement
    const latency = end - start;
    if (latency > 30) {
      console.warn(`Fuzzy search latency exceeded 30ms: ${latency.toFixed(2)}ms`);
    }

    setFiltered(results);
    setSelectedIndex(0);
  }, [query, secrets]);

  const copyToClipboardAndClose = async (path: string, type: 'password' | 'username' | 'totp' = 'password') => {
    if (!window.gopass || !window.windowControl) return;
    try {
      const data = await window.gopass.showSecret(path);
      let textToCopy = '';

      if (type === 'password') {
        textToCopy = data.password;
      } else if (type === 'username') {
        textToCopy = data.metadata.username || data.metadata.login || data.metadata.user || '';
      } else if (type === 'totp') {
        textToCopy = data.metadata.totp || data.metadata.otp || '';
      }

      if (textToCopy) {
        await navigator.clipboard.writeText(textToCopy);
      }
      
      // Auto-close
      await window.windowControl.hideQuickAccess();
    } catch (err) {
      console.error(`Failed to retrieve secret to copy ${type}:`, err);
    }
  };

  // Keyboard Navigation
  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (window.windowControl) {
        await window.windowControl.hideQuickAccess();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      
      // Support Command insertion: if user types /new, trigger Dashboard creation view
      if (query.trim().toLowerCase() === '/new') {
        if (window.windowControl) {
          await window.windowControl.openDashboard();
          await window.windowControl.hideQuickAccess();
        }
        return;
      }

      if (filtered[selectedIndex]) {
        await copyToClipboardAndClose(filtered[selectedIndex], 'password');
      }
    } else if (e.ctrlKey || e.metaKey) {
      const activePath = filtered[selectedIndex];
      if (!activePath) return;

      if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        await copyToClipboardAndClose(activePath, 'password');
      } else if (e.key.toLowerCase() === 'u') {
        e.preventDefault();
        await copyToClipboardAndClose(activePath, 'username');
      } else if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        await copyToClipboardAndClose(activePath, 'totp');
      } else if (e.key.toLowerCase() === 'e') {
        e.preventDefault();
        // Expand/open details in dashboard
        if (window.windowControl) {
          // Put path in state or localstorage so dashboard knows which secret to focus
          localStorage.setItem('focused-secret-path', activePath);
          await window.windowControl.openDashboard();
          await window.windowControl.hideQuickAccess();
        }
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'transparent',
      }}
    >
      <Paper
        className="glass-panel animate-fade-in"
        elevation={3}
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--elevation-3)',
        }}
      >
        {/* Search Input Area */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-surface-variant)',
            gap: 1.5,
          }}
        >
          <SearchIcon sx={{ color: 'var(--color-outline)' }} />
          <InputBase
            inputRef={inputRef}
            fullWidth
            autoFocus
            placeholder="Search secrets, paths, or commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            sx={{
              fontSize: '16px',
              fontFamily: 'var(--font-body)',
              color: 'var(--color-on-surface)',
            }}
          />
        </Box>

        {/* Results list */}
        <Box sx={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <Box sx={{ padding: '32px', textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'var(--color-outline)' }}>
                No secrets found matching "{query}"
              </Typography>
            </Box>
          ) : (
            <List ref={listRef} disablePadding>
              {filtered.map((item, index) => {
                const parts = item.split('/');
                const name = parts[parts.length - 1];
                const folder = parts.slice(0, -1).join(' / ');
                const isSelected = index === selectedIndex;

                return (
                  <ListItem
                    key={item}
                    disablePadding
                    onClick={() => copyToClipboardAndClose(item, 'password')}
                    sx={{
                      padding: '8px 16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'var(--color-primary-container)' : 'transparent',
                      color: isSelected ? 'var(--color-on-primary-container)' : 'var(--color-on-surface)',
                      transition: 'background-color 100ms var(--easing-standard)',
                      '&:hover': {
                        backgroundColor: isSelected ? 'var(--color-primary-container)' : 'rgba(103, 80, 164, 0.08)',
                      },
                      marginBottom: '4px',
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40, color: isSelected ? 'var(--color-primary)' : 'var(--color-outline)' }}>
                      {parts.length > 1 ? <FolderIcon size={20} /> : <KeyIcon size={20} />}
                    </ListItemIcon>
                    <ListItemText
                      primary={name}
                      secondary={folder || 'root'}
                      primaryTypographyProps={{
                        fontWeight: isSelected ? 500 : 400,
                        fontSize: '14px',
                      }}
                      secondaryTypographyProps={{
                        fontSize: '11px',
                        color: isSelected ? 'var(--color-primary)' : 'var(--color-outline)',
                      }}
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>

        {/* Footer shortcuts */}
        <Box
          sx={{
            padding: '12px 20px',
            backgroundColor: 'var(--color-surface-variant)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid var(--color-surface-variant)',
          }}
        >
          <Typography variant="caption" sx={{ color: 'var(--color-on-surface-variant)', display: 'flex', gap: 2 }}>
            <span>Type <strong>/new</strong> to create</span>
            <span>•</span>
            <span><strong>⏎</strong> Copy Pass</span>
            <span>•</span>
            <span><strong>⌥U</strong> Username</span>
            <span>•</span>
            <span><strong>⌥O</strong> TOTP</span>
            <span>•</span>
            <span><strong>⌥E</strong> Edit</span>
          </Typography>
          <Typography variant="caption" sx={{ color: 'var(--color-outline)', fontWeight: 500 }}>
            Void (Q)
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
