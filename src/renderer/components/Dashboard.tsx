import React, { useEffect, useState, useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Paper,
  InputAdornment,
  Slider,
  FormControlLabel,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  RadioGroup,
  Radio,
  Tooltip,
  Menu,
  MenuItem,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/FolderOutlined';
import OpenFolderIcon from '@mui/icons-material/FolderOpenOutlined';
import KeyIcon from '@mui/icons-material/VpnKeyOutlined';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import CopyIcon from '@mui/icons-material/ContentCopyOutlined';
import EyeIcon from '@mui/icons-material/VisibilityOutlined';
import EyeOffIcon from '@mui/icons-material/VisibilityOffOutlined';
import SyncIcon from '@mui/icons-material/SyncOutlined';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';
import ShieldIcon from '@mui/icons-material/ShieldOutlined';
import PeopleIcon from '@mui/icons-material/PeopleOutlineOutlined';
import AttachFileIcon from '@mui/icons-material/AttachFileOutlined';
import GenerateIcon from '@mui/icons-material/AutorenewOutlined';

import { AppConfig } from '../../main/config';
import { SecretData } from '../../main/gopass';
import lightIcon from '../../assets/light.svg';
import darkIcon from '../../assets/dark.svg';

interface DashboardProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig | null>>;
}

export default function Dashboard({ config, setConfig }: DashboardProps) {
  const theme = useTheme();
  const [secrets, setSecrets] = useState<string[]>([]);
  const [folderQuery, setFolderQuery] = useState('');
  const [secretQuery, setSecretQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('root');
  
  // Active Secret State
  const [selectedSecretPath, setSelectedSecretPath] = useState<string | null>(null);
  const [activeSecret, setActiveSecret] = useState<SecretData>({
    password: '',
    metadata: {},
    rawBody: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newSecretPath, setNewSecretPath] = useState('');

  // Sync / App state
  const [syncStatus, setSyncStatus] = useState<'clean' | 'syncing' | 'error'>('clean');
  const [syncError, setSyncError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Custom Menu Bar States
  const [fileMenuAnchor, setFileMenuAnchor] = useState<null | HTMLElement>(null);
  const [editMenuAnchor, setEditMenuAnchor] = useState<null | HTMLElement>(null);
  const [helpMenuAnchor, setHelpMenuAnchor] = useState<null | HTMLElement>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Entropy Generator state
  const [pwdLength, setPwdLength] = useState(16);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [includeDigits, setIncludeDigits] = useState(true);
  const [passphraseGenerator, setPassphraseGenerator] = useState(false);

  // Recipient list
  const [recipients, setRecipients] = useState<string[]>([]);

  // Load secret paths
  const loadSecretsList = async () => {
    if (window.gopass) {
      try {
        const paths = await window.gopass.listSecrets();
        setSecrets(paths);
      } catch (err) {
        console.error('Failed to load secrets:', err);
      }
    }
  };

  useEffect(() => {
    loadSecretsList();
    
    // Check if Quick Access focused a secret
    const focused = localStorage.getItem('focused-secret-path');
    if (focused) {
      localStorage.removeItem('focused-secret-path');
      selectSecret(focused);
    }
  }, []);

  // Compute folder tree structure
  const folders = useMemo(() => {
    const set = new Set<string>();
    set.add('root');
    secrets.forEach((pathStr) => {
      const parts = pathStr.split('/');
      // Accumulate directory levels
      for (let i = 1; i < parts.length; i++) {
        set.add(parts.slice(0, i).join('/'));
      }
    });

    const list = Array.from(set);
    if (!folderQuery) return list.sort();

    return list
      .filter((f) => f.toLowerCase().includes(folderQuery.toLowerCase()))
      .sort();
  }, [secrets, folderQuery]);

  // Compute secrets inside chosen folder
  const secretsInFolder = useMemo(() => {
    return secrets.filter((s) => {
      const parts = s.split('/');
      const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'root';
      const matchesFolder = selectedFolder === 'root' ? parts.length === 1 : folder === selectedFolder;
      const matchesSearch = s.toLowerCase().includes(secretQuery.toLowerCase());
      return matchesFolder && matchesSearch;
    });
  }, [secrets, selectedFolder, secretQuery]);

  // Select Secret details
  const selectSecret = async (pathStr: string) => {
    if (window.gopass) {
      try {
        setIsCreatingNew(false);
        setIsEditing(false);
        setSelectedSecretPath(pathStr);
        const details = await window.gopass.showSecret(pathStr);
        setActiveSecret(details);
        setShowPassword(false);
      } catch (err) {
        console.error('Failed to load secret details:', err);
      }
    }
  };

  // Setup empty editor for creating new secret
  const handleAddNewSecret = () => {
    setIsCreatingNew(true);
    setIsEditing(true);
    setSelectedSecretPath(null);
    setNewSecretPath(selectedFolder === 'root' ? '' : `${selectedFolder}/`);
    setActiveSecret({
      password: '',
      metadata: { username: '' },
      rawBody: '',
    });
    setShowPassword(true);
  };

  // Add/Remove Metadata fields
  const handleAddMetaRow = () => {
    setActiveSecret((prev) => ({
      ...prev,
      metadata: { ...prev.metadata, '': '' },
    }));
  };

  const handleUpdateMetaKey = (oldKey: string, newKey: string) => {
    setActiveSecret((prev) => {
      const copy = { ...prev.metadata };
      const val = copy[oldKey];
      delete copy[oldKey];
      copy[newKey] = val;
      return { ...prev, metadata: copy };
    });
  };

  const handleUpdateMetaValue = (key: string, value: string) => {
    setActiveSecret((prev) => ({
      ...prev,
      metadata: { ...prev.metadata, [key]: value },
    }));
  };

  const handleDeleteMetaKey = (key: string) => {
    setActiveSecret((prev) => {
      const copy = { ...prev.metadata };
      delete copy[key];
      return { ...prev, metadata: copy };
    });
  };

  // Save Secret
  const handleSaveSecret = async () => {
    const finalPath = isCreatingNew ? newSecretPath : selectedSecretPath;
    if (!finalPath) return;

    if (window.gopass) {
      try {
        setSyncStatus('syncing');
        await window.gopass.insertSecret(
          finalPath,
          activeSecret.password,
          activeSecret.metadata,
          activeSecret.rawBody
        );
        setIsEditing(false);
        setIsCreatingNew(false);
        setSelectedSecretPath(finalPath);
        await loadSecretsList();
        setSyncStatus('clean');
      } catch (err: any) {
        console.error('Failed to save secret:', err);
        setSyncStatus('error');
        setSyncError(err.message || 'Failed to save secret');
      }
    }
  };

  // Delete Secret
  const handleDeleteSecret = async () => {
    if (!selectedSecretPath) return;
    if (confirm(`Are you sure you want to delete secret ${selectedSecretPath}?`)) {
      if (window.gopass) {
        try {
          setSyncStatus('syncing');
          await window.gopass.deleteSecret(selectedSecretPath);
          setSelectedSecretPath(null);
          setActiveSecret({ password: '', metadata: {}, rawBody: '' });
          await loadSecretsList();
          setSyncStatus('clean');
        } catch (err: any) {
          console.error('Failed to delete secret:', err);
          setSyncStatus('error');
          setSyncError(err.message || 'Failed to delete secret');
        }
      }
    }
  };

  // Sync Secrets
  const handleSyncSecrets = async () => {
    if (window.gopass) {
      try {
        setSyncStatus('syncing');
        await window.gopass.syncSecrets();
        await loadSecretsList();
        setSyncStatus('clean');
      } catch (err: any) {
        console.error('Sync failed:', err);
        setSyncStatus('error');
        setSyncError(err.message || 'Git sync failed');
      }
    }
  };

  // Password Generator Logic
  const handleGeneratePassword = () => {
    let result = '';
    if (passphraseGenerator) {
      // Generate phonetic passphrase
      const words = [
        'apple', 'banana', 'cherry', 'grape', 'orange', 'melon', 'berry',
        'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf',
        'happy', 'bright', 'sunset', 'forest', 'canyon', 'valley', 'river'
      ];
      const count = Math.max(3, Math.min(6, Math.floor(pwdLength / 4)));
      const chosen = [];
      for (let i = 0; i < count; i++) {
        chosen.push(words[Math.floor(Math.random() * words.length)]);
      }
      result = chosen.join('-');
    } else {
      let chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (includeDigits) chars += '0123456789';
      if (includeSymbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
      
      for (let i = 0; i < pwdLength; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    
    setActiveSecret((prev) => ({ ...prev, password: result }));
  };

  // Calculate local strength metrics (Entropy)
  const passwordStrength = useMemo(() => {
    const pwd = activeSecret.password;
    if (!pwd) return { label: 'Empty', color: '#999', entropy: 0 };
    
    let poolSize = 0;
    if (/[a-z]/.test(pwd)) poolSize += 26;
    if (/[A-Z]/.test(pwd)) poolSize += 26;
    if (/[0-9]/.test(pwd)) poolSize += 10;
    if (/[^a-zA-Z0-9]/.test(pwd)) poolSize += 32;

    const entropy = Math.round(pwd.length * Math.log2(poolSize || 1));
    
    if (entropy < 40) return { label: 'Weak', color: '#f44336', entropy };
    if (entropy < 65) return { label: 'Medium', color: '#ff9800', entropy };
    return { label: 'Strong', color: '#4caf50', entropy };
  }, [activeSecret.password]);

  // Recipient matrix loading
  const loadRecipients = async () => {
    // Mock or extract GPG recipients using gopass CLI config if necessary
    setRecipients(['GPG ID: David Rivera <d@duhruh.me> (Key: 60F4A2597C4CA693)']);
  };

  // Settings modification
  const handleSaveSettings = async (newConfig: AppConfig) => {
    if (window.config) {
      await window.config.saveConfig(newConfig);
      setConfig(newConfig);
      setSettingsOpen(false);
    }
  };

  const isDarkMode = theme.palette.mode === 'dark';
  const appIcon = isDarkMode ? darkIcon : lightIcon;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      {/* Window custom title bar */}
      <Box
        className="window-titlebar"
        sx={{
          WebkitAppRegion: (fileMenuAnchor || editMenuAnchor || helpMenuAnchor) ? 'no-drag' : 'drag'
        }}
      >
        <Box className="window-titlebar-left">
          <img src={appIcon} alt="Logo" style={{ width: 18, height: 18 }} />
          <Typography className="window-titlebar-title" sx={{ mr: 2 }}>Void</Typography>
          
          {/* Custom Menu Bar Options */}
          <Box className="window-titlebar-menu" sx={{ display: 'flex', gap: 0.5, WebkitAppRegion: 'no-drag' }}>
            <Button
              size="small"
              onClick={(e) => setFileMenuAnchor(e.currentTarget)}
              sx={{
                px: 1.5,
                py: 0.25,
                minWidth: 'auto',
                fontSize: '12px',
                color: 'var(--color-on-surface-variant)',
                borderRadius: '6px',
                height: '26px',
                fontWeight: 500,
                textTransform: 'none',
                backgroundColor: 'transparent',
                '&:hover': {
                  backgroundColor: 'rgba(103, 80, 164, 0.08)',
                  color: 'var(--color-on-surface)',
                }
              }}
            >
              File
            </Button>
            <Button
              size="small"
              onClick={(e) => setEditMenuAnchor(e.currentTarget)}
              sx={{
                px: 1.5,
                py: 0.25,
                minWidth: 'auto',
                fontSize: '12px',
                color: 'var(--color-on-surface-variant)',
                borderRadius: '6px',
                height: '26px',
                fontWeight: 500,
                textTransform: 'none',
                backgroundColor: 'transparent',
                '&:hover': {
                  backgroundColor: 'rgba(103, 80, 164, 0.08)',
                  color: 'var(--color-on-surface)',
                }
              }}
            >
              Edit
            </Button>
            <Button
              size="small"
              onClick={(e) => setHelpMenuAnchor(e.currentTarget)}
              sx={{
                px: 1.5,
                py: 0.25,
                minWidth: 'auto',
                fontSize: '12px',
                color: 'var(--color-on-surface-variant)',
                borderRadius: '6px',
                height: '26px',
                fontWeight: 500,
                textTransform: 'none',
                backgroundColor: 'transparent',
                '&:hover': {
                  backgroundColor: 'rgba(103, 80, 164, 0.08)',
                  color: 'var(--color-on-surface)',
                }
              }}
            >
              Help
            </Button>
          </Box>
        </Box>
        <Box className="window-titlebar-controls">
          <Box className="window-titlebar-btn" onClick={() => window.windowControl.minimize()}>
            <svg width="10" height="1" viewBox="0 0 10 1"><line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" strokeWidth="1.5"/></svg>
          </Box>
          <Box className="window-titlebar-btn" onClick={() => window.windowControl.maximize()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
          </Box>
          <Box className="window-titlebar-btn close" onClick={() => window.windowControl.close()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M 1,1 L 9,9 M 9,1 L 1,9" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
          </Box>
        </Box>
      </Box>

      {/* Rest of the Dashboard layout */}
      <Box className="window-content" sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      
      {/* PANE 1: Navigation Tree (Left Pane) */}
      <Box
        sx={{
          width: '260px',
          borderRight: '1px solid var(--color-surface-variant)',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgba(254, 247, 255, 0.4)',
        }}
      >
        <Box sx={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>
            gopass
          </Typography>
          <IconButton size="small" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ padding: '0 16px 12px 16px' }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Filter folders..."
            value={folderQuery}
            onChange={(e) => setFolderQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'var(--color-outline)' }} />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        <Divider />

        <List sx={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {folders.map((folder) => {
            const isSelected = selectedFolder === folder;
            const displayName = folder === 'root' ? 'root' : folder.split('/').pop();
            const indent = folder === 'root' ? 0 : folder.split('/').length * 8;

            return (
              <ListItem
                key={folder}
                className={`nav-tree-item ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedFolder(folder)}
                sx={{
                  pl: `${indent + 12}px`,
                  backgroundColor: isSelected ? 'var(--color-primary-container)' : 'transparent',
                  color: isSelected ? 'var(--color-on-primary-container)' : 'inherit',
                  borderRadius: '100px',
                  mb: '2px',
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: isSelected ? 'var(--color-primary-container)' : 'rgba(103, 80, 164, 0.08)',
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: '32px', color: isSelected ? 'var(--color-primary)' : 'var(--color-outline)' }}>
                  {isSelected ? <OpenFolderIcon fontSize="small" /> : <FolderIcon fontSize="small" />}
                </ListItemIcon>
                <ListItemText
                  primary={displayName}
                  primaryTypographyProps={{ fontSize: '13px', fontWeight: isSelected ? 500 : 400 }}
                />
              </ListItem>
            );
          })}
        </List>
      </Box>

      {/* PANE 2: Secrets List View (Middle Pane) */}
      <Box
        sx={{
          width: '280px',
          borderRight: '1px solid var(--color-surface-variant)',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgba(254, 247, 255, 0.2)',
        }}
      >
        <Box sx={{ padding: '16px', display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search secrets..."
            value={secretQuery}
            onChange={(e) => setSecretQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'var(--color-outline)' }} />
                </InputAdornment>
              ),
            }}
          />
          <IconButton color="primary" onClick={handleAddNewSecret}>
            <AddIcon />
          </IconButton>
        </Box>

        <Divider />

        <List sx={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {secretsInFolder.length === 0 ? (
            <Box sx={{ padding: '24px', textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'var(--color-outline)' }}>
                No secrets here
              </Typography>
            </Box>
          ) : (
            secretsInFolder.map((s) => {
              const isSelected = selectedSecretPath === s;
              const displayName = s.split('/').pop() || s;

              return (
                <ListItem
                  key={s}
                  onClick={() => selectSecret(s)}
                  sx={{
                    borderRadius: '12px',
                    mb: '4px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--color-primary-container)' : 'transparent',
                    color: isSelected ? 'var(--color-on-primary-container)' : 'inherit',
                    '&:hover': {
                      backgroundColor: isSelected ? 'var(--color-primary-container)' : 'rgba(103, 80, 164, 0.08)',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: '32px', color: isSelected ? 'var(--color-primary)' : 'var(--color-outline)' }}>
                    <KeyIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={displayName}
                    primaryTypographyProps={{ fontSize: '13px', fontWeight: isSelected ? 500 : 400 }}
                  />
                </ListItem>
              );
            })
          )}
        </List>
      </Box>

      {/* PANE 3: Detailed Editor (Right Pane) */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-surface)' }}>
        
        {/* Editor Header */}
        <Box sx={{ padding: '16px 24px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-surface-variant)' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
            {isCreatingNew ? 'Create New Secret' : selectedSecretPath || 'Select a secret to view'}
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            {!isEditing && selectedSecretPath && (
              <>
                <Button variant="outlined" size="small" onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
                <IconButton color="error" size="small" onClick={handleDeleteSecret}>
                  <DeleteIcon />
                </IconButton>
              </>
            )}
            {isEditing && (
              <>
                <Button size="small" onClick={() => { setIsEditing(false); setIsCreatingNew(false); if (selectedSecretPath) selectSecret(selectedSecretPath); }}>
                  Cancel
                </Button>
                <Button variant="contained" size="small" color="primary" onClick={handleSaveSecret}>
                  Save
                </Button>
              </>
            )}
          </Box>
        </Box>

        {/* Editor Body */}
        {(selectedSecretPath || isCreatingNew) ? (
          <Box sx={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            
            {/* Secret Path input (Only when creating new) */}
            {isCreatingNew && (
              <TextField
                fullWidth
                label="Secret Path (e.g. personal/social/twitter)"
                value={newSecretPath}
                onChange={(e) => setNewSecretPath(e.target.value)}
                disabled={!isEditing}
              />
            )}

            {/* Password Block */}
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 1, color: 'var(--color-outline)' }}>
                Password
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  type={showPassword ? 'text' : 'password'}
                  value={activeSecret.password}
                  onChange={(e) => setActiveSecret(prev => ({ ...prev, password: e.target.value }))}
                  disabled={!isEditing}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                        </IconButton>
                        <IconButton
                          onClick={() => navigator.clipboard.writeText(activeSecret.password)}
                          edge="end"
                          sx={{ ml: 1 }}
                        >
                          <CopyIcon />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              {/* Password strength and generator panel */}
              {isEditing && (
                <Box sx={{ mt: 2, padding: '16px', borderRadius: '16px', border: '1px dashed var(--color-outline)' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      Strength: <span style={{ color: passwordStrength.color }}>{passwordStrength.label} ({passwordStrength.entropy} bits entropy)</span>
                    </Typography>
                    <Button variant="text" size="small" startIcon={<GenerateIcon />} onClick={handleGeneratePassword}>
                      Generate
                    </Button>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Typography variant="caption" sx={{ minWidth: 60 }}>Length ({pwdLength})</Typography>
                      <Slider
                        size="small"
                        value={pwdLength}
                        min={8}
                        max={64}
                        onChange={(_, val) => setPwdLength(val as number)}
                        sx={{ flex: 1 }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <FormControlLabel
                        control={<Switch size="small" checked={includeDigits} onChange={(e) => setIncludeDigits(e.target.checked)} />}
                        label={<Typography variant="caption">Digits</Typography>}
                      />
                      <FormControlLabel
                        control={<Switch size="small" checked={includeSymbols} onChange={(e) => setIncludeSymbols(e.target.checked)} />}
                        label={<Typography variant="caption">Symbols</Typography>}
                      />
                      <FormControlLabel
                        control={<Switch size="small" checked={passphraseGenerator} onChange={(e) => setPassphraseGenerator(e.target.checked)} />}
                        label={<Typography variant="caption">Passphrase</Typography>}
                      />
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>

            {/* Metadata Block */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, color: 'var(--color-outline)' }}>
                  Metadata (YAML Key-Values)
                </Typography>
                {isEditing && (
                  <Button variant="text" size="small" onClick={handleAddMetaRow}>
                    + Add Field
                  </Button>
                )}
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {Object.entries(activeSecret.metadata).map(([key, value]) => (
                  <Box key={key} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField
                      size="small"
                      placeholder="Key"
                      value={key}
                      disabled={!isEditing}
                      onChange={(e) => handleUpdateMetaKey(key, e.target.value)}
                      sx={{ width: '40%' }}
                    />
                    <TextField
                      size="small"
                      placeholder="Value"
                      value={value}
                      disabled={!isEditing}
                      onChange={(e) => handleUpdateMetaValue(key, e.target.value)}
                      sx={{ flex: 1 }}
                    />
                    {isEditing && (
                      <IconButton size="small" color="error" onClick={() => handleDeleteMetaKey(key)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Notes Body Block */}
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 1, color: 'var(--color-outline)' }}>
                Secure Notes (Raw Text)
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={6}
                value={activeSecret.rawBody}
                onChange={(e) => setActiveSecret(prev => ({ ...prev, rawBody: e.target.value }))}
                disabled={!isEditing}
                placeholder="Write arbitrary Secure Notes / GPG formatted bodies here..."
              />
            </Box>

            {/* Security Audit quick view */}
            {!isEditing && (
              <Box sx={{ border: '1px solid var(--color-surface-variant)', borderRadius: '16px', padding: '16px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <ShieldIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Security Compliance</Typography>
                </Box>
                <Typography variant="caption" color={activeSecret.password.length >= 12 ? 'success.main' : 'error.main'} sx={{ display: 'block' }}>
                  • {activeSecret.password.length >= 12 ? 'Password meets standard length (12+ characters)' : 'Password is too short (< 12 characters)'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  • Securely encrypted using public GPG identities.
                </Typography>
              </Box>
            )}

            {/* GPG Recipients matrix (auditing) */}
            {!isEditing && (
              <Box sx={{ border: '1px solid var(--color-surface-variant)', borderRadius: '16px', padding: '16px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PeopleIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Decrypt Access Matrix</Typography>
                  </Box>
                  <Button variant="text" size="small" onClick={loadRecipients}>
                    View
                  </Button>
                </Box>
                {recipients.map((rec) => (
                  <Typography key={rec} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    • {rec}
                  </Typography>
                ))}
              </Box>
            )}

            {/* Binary Drag Drop Integration */}
            {isEditing && (
              <Box sx={{ border: '1px dashed var(--color-outline)', borderRadius: '16px', padding: '24px', textAlign: 'center' }}>
                <AttachFileIcon sx={{ color: 'var(--color-outline)', mb: 1 }} />
                <Typography variant="body2">Drag and drop binary assets to inject</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  (SSL certificates, Secure SSH Identity Keys)
                </Typography>
              </Box>
            )}

          </Box>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '32px' }}>
            <Typography variant="body1" sx={{ color: 'var(--color-outline)', mb: 2 }}>
              Choose a secret from the list to display details or create a new one.
            </Typography>
            <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={handleAddNewSecret}>
              Create New Secret
            </Button>
          </Box>
        )}

        {/* Sync Status Footer Bar */}
        <Box
          sx={{
            padding: '12px 24px',
            borderTop: '1px solid var(--color-surface-variant)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--color-surface-variant)',
          }}
        >
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SyncIcon fontSize="small" sx={{ animation: syncStatus === 'syncing' ? 'spin 2s linear infinite' : 'none' }} />
            <span>Sync Status: <strong>{syncStatus === 'clean' ? 'Clean (Synced)' : syncStatus === 'syncing' ? 'Syncing...' : 'Sync Error'}</strong></span>
          </Typography>
          {syncStatus === 'error' && (
            <Tooltip title={syncError}>
              <Typography variant="caption" color="error" sx={{ cursor: 'pointer' }}>
                Details
              </Typography>
            </Tooltip>
          )}
          <Button variant="text" size="small" onClick={handleSyncSecrets} disabled={syncStatus === 'syncing'}>
            Sync Now
          </Button>
        </Box>
      </Box>

      {/* SETTINGS DIALOG */}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        onSave={handleSaveSettings}
      />

      {/* File Menu */}
      <Menu
        anchorEl={fileMenuAnchor}
        open={Boolean(fileMenuAnchor)}
        onClose={() => setFileMenuAnchor(null)}
        sx={{
          '& .MuiPaper-root': {
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--elevation-2)',
            borderRadius: '8px',
            mt: 0.5,
          }
        }}
      >
        <MenuItem
          onClick={() => { setFileMenuAnchor(null); handleAddNewSecret(); }}
          sx={{ fontSize: '13px', py: 1, px: 2 }}
        >
          New Secret
        </MenuItem>
        <MenuItem
          onClick={() => { setFileMenuAnchor(null); handleSyncSecrets(); }}
          sx={{ fontSize: '13px', py: 1, px: 2 }}
        >
          Git Sync
        </MenuItem>
        <MenuItem
          onClick={() => { setFileMenuAnchor(null); setSettingsOpen(true); }}
          sx={{ fontSize: '13px', py: 1, px: 2 }}
        >
          Settings
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={() => { setFileMenuAnchor(null); window.windowControl.close(); }}
          sx={{ fontSize: '13px', py: 1, px: 2 }}
        >
          Exit
        </MenuItem>
      </Menu>

      {/* Edit Menu */}
      <Menu
        anchorEl={editMenuAnchor}
        open={Boolean(editMenuAnchor)}
        onClose={() => setEditMenuAnchor(null)}
        sx={{
          '& .MuiPaper-root': {
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--elevation-2)',
            borderRadius: '8px',
            mt: 0.5,
          }
        }}
      >
        <MenuItem
          disabled={!activeSecret.password}
          onClick={() => {
            setEditMenuAnchor(null);
            if (activeSecret.password) {
              navigator.clipboard.writeText(activeSecret.password);
            }
          }}
          sx={{ fontSize: '13px', py: 1, px: 2 }}
        >
          Copy Password
        </MenuItem>
        <MenuItem
          disabled={!selectedSecretPath}
          onClick={() => { setEditMenuAnchor(null); handleDeleteSecret(); }}
          sx={{ fontSize: '13px', py: 1, px: 2 }}
        >
          Delete Secret
        </MenuItem>
      </Menu>

      {/* Help Menu */}
      <Menu
        anchorEl={helpMenuAnchor}
        open={Boolean(helpMenuAnchor)}
        onClose={() => setHelpMenuAnchor(null)}
        sx={{
          '& .MuiPaper-root': {
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--elevation-2)',
            borderRadius: '8px',
            mt: 0.5,
          }
        }}
      >
        <MenuItem
          onClick={() => {
            setHelpMenuAnchor(null);
            alert(`Quick Access Global Hotkey: ${config.application.global_hotkey}`);
          }}
          sx={{ fontSize: '13px', py: 1, px: 2 }}
        >
          Quick Access Info
        </MenuItem>
        <MenuItem
          onClick={() => { setHelpMenuAnchor(null); setAboutOpen(true); }}
          sx={{ fontSize: '13px', py: 1, px: 2 }}
        >
          About
        </MenuItem>
      </Menu>

      {/* About Dialog */}
      <Dialog open={aboutOpen} onClose={() => setAboutOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: 'var(--font-heading)', fontWeight: 600 }}>About Void</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pt: 1 }}>
          <img src={appIcon} alt="Logo" style={{ width: 64, height: 64 }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Void</Typography>
          <Typography variant="body2" sx={{ color: 'var(--color-outline)' }}>Version {config.version}</Typography>
          <Typography variant="body2" align="center">
            A beautiful, secure, Material Design 3 cross-platform GUI wrapper for the gopass CLI.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ padding: '16px' }}>
          <Button onClick={() => setAboutOpen(false)} variant="contained">Close</Button>
        </DialogActions>
      </Dialog>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      </Box>
    </Box>
  );
}

// Subcomponent: Settings Dialog for customization
interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  config: AppConfig;
  onSave: (config: AppConfig) => void;
}

function SettingsDialog({ open, onClose, config, onSave }: SettingsDialogProps) {
  const [localConfig, setLocalConfig] = useState<AppConfig>({ ...config });
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    setLocalConfig({ ...config });
    setIsRecording(false);
  }, [config, open]);

  useEffect(() => {
    if (!isRecording) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const keys: string[] = [];
      if (e.ctrlKey) keys.push('Control');
      if (e.altKey) keys.push('Alt');
      if (e.shiftKey) keys.push('Shift');
      if (e.metaKey) keys.push('Command');

      const key = e.key;
      const isModifierOnly = ['Control', 'Alt', 'Shift', 'Meta', 'CapsLock'].includes(key);

      if (!isModifierOnly) {
        let electronKey = key;
        if (key === ' ') {
          electronKey = 'Space';
        } else if (key === 'Escape') {
          setIsRecording(false);
          return;
        } else if (key.length === 1) {
          electronKey = key.toUpperCase();
        } else {
          electronKey = key.charAt(0).toUpperCase() + key.slice(1);
        }

        keys.push(electronKey);
        const combined = keys.join('+');

        setLocalConfig((prev) => ({
          ...prev,
          application: { ...prev.application, global_hotkey: combined },
        }));
        setIsRecording(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [isRecording]);

  const handleModeChange = (mode: 'system' | 'light' | 'dark') => {
    setLocalConfig((prev) => ({
      ...prev,
      theme: { ...prev.theme, mode },
    }));
  };

  const handleToggleSync = (val: boolean) => {
    setLocalConfig((prev) => ({
      ...prev,
      gopass_core: { ...prev.gopass_core, auto_sync_on_write: val },
    }));
  };

  const handleToggleStartupDashboard = (val: boolean) => {
    setLocalConfig((prev) => ({
      ...prev,
      application: { ...prev.application, show_dashboard_on_startup: val },
    }));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontFamily: 'var(--font-heading)' }}>Settings</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
        
        {/* Theme Settings */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Theme Mode</Typography>
          <RadioGroup
            row
            value={localConfig.theme.mode}
            onChange={(e) => handleModeChange(e.target.value as any)}
          >
            <FormControlLabel value="system" control={<Radio size="small" />} label="System Default" />
            <FormControlLabel value="light" control={<Radio size="small" />} label="Light Mode" />
            <FormControlLabel value="dark" control={<Radio size="small" />} label="Dark Mode" />
          </RadioGroup>
        </Box>

        {/* Sync Settings */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Synchronization</Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={localConfig.gopass_core.auto_sync_on_write}
                onChange={(e) => handleToggleSync(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Auto Git Sync on changes (write/delete)</Typography>}
          />
        </Box>

        {/* Onboarding Settings */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Startup Behavior</Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={localConfig.application.show_dashboard_on_startup}
                onChange={(e) => handleToggleStartupDashboard(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Show Dashboard on application startup</Typography>}
          />
        </Box>

        {/* Global Shortcut settings */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Global Shortcut</Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              fullWidth
              size="small"
              label="Toggle Quick Access Keybinding"
              value={isRecording ? 'Press key combination (or Esc to cancel)...' : localConfig.application.global_hotkey}
              InputProps={{
                readOnly: true,
              }}
              error={isRecording}
              helperText={isRecording ? 'Listening for key combinations...' : 'Click "Record" and press your shortcut.'}
            />
            <Button
              variant={isRecording ? 'contained' : 'outlined'}
              color={isRecording ? 'error' : 'primary'}
              onClick={() => setIsRecording(!isRecording)}
              sx={{ height: '40px', minWidth: '100px', borderRadius: '8px', textTransform: 'none' }}
            >
              {isRecording ? 'Stop' : 'Record'}
            </Button>
          </Box>
        </Box>

        {/* Binary path settings */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>gopass Core</Typography>
          <TextField
            fullWidth
            size="small"
            label="Executable Path"
            value={localConfig.gopass_core.executable_path}
            onChange={(e) =>
              setLocalConfig((prev) => ({
                ...prev,
                gopass_core: { ...prev.gopass_core, executable_path: e.target.value },
              }))
            }
          />
        </Box>

        {/* Clipboard Timeout Settings */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Clipboard</Typography>
          <TextField
            fullWidth
            size="small"
            type="number"
            label="Purge Clipboard delay (seconds)"
            value={localConfig.application.clipboard_purge_delay_seconds}
            onChange={(e) =>
              setLocalConfig((prev) => ({
                ...prev,
                application: {
                  ...prev.application,
                  clipboard_purge_delay_seconds: parseInt(e.target.value) || 45,
                },
              }))
            }
          />
        </Box>

      </DialogContent>
      <DialogActions sx={{ padding: '16px 24px' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onSave(localConfig)}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
