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
  CircularProgress,
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
import { marked } from 'marked';
import { Document, Page, pdfjs } from 'react-pdf';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRightOutlined';
import RemoveIcon from '@mui/icons-material/RemoveOutlined';

// Configure react-pdf worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface DashboardProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig | null>>;
}

export default function Dashboard({ config, setConfig }: DashboardProps) {
  const theme = useTheme();
  const [secrets, setSecrets] = useState<string[]>([]);
  const [folderQuery, setFolderQuery] = useState('');
  const [secretQuery, setSecretQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Mounts/Stores State
  const [mounts, setMounts] = useState<Array<{ alias: string; path: string; isRoot: boolean }>>([]);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [manageMountsOpen, setManageMountsOpen] = useState(false);
  const [newMountAlias, setNewMountAlias] = useState('');
  const [newMountPath, setNewMountPath] = useState('');

  // Binary/File State
  const [binaryBase64, setBinaryBase64] = useState<string | null>(null);
  const [binaryLoading, setBinaryLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<{ path: string; name: string; size: number; type: string } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const notesRef = React.useRef<HTMLTextAreaElement | null>(null);
  
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

  // Load mounts list
  const loadMountsList = async () => {
    if (window.gopass) {
      try {
        const list = await window.gopass.listMounts();
        setMounts(list);
      } catch (err) {
        console.error('Failed to load mounts:', err);
      }
    }
  };

  useEffect(() => {
    loadSecretsList();
    loadMountsList();
    
    // Check if Quick Access focused a secret
    const focused = localStorage.getItem('focused-secret-path');
    if (focused) {
      localStorage.removeItem('focused-secret-path');
      selectSecret(focused);
    }
  }, []);

  // Detect binary file secrets
  const isFileSecret = useMemo(() => {
    if (!activeSecret) return false;
    return (
      activeSecret.password === '[Void Secure File]' ||
      activeSecret.metadata['Content-Disposition'] !== undefined ||
      activeSecret.metadata['Content-Transfer-Encoding'] !== undefined ||
      (selectedSecretPath && (
        selectedSecretPath.toLowerCase().endsWith('.png') ||
        selectedSecretPath.toLowerCase().endsWith('.jpg') ||
        selectedSecretPath.toLowerCase().endsWith('.jpeg') ||
        selectedSecretPath.toLowerCase().endsWith('.gif') ||
        selectedSecretPath.toLowerCase().endsWith('.pdf')
      ))
    );
  }, [activeSecret, selectedSecretPath]);

  const fileDetails = useMemo(() => {
    if (!isFileSecret || !selectedSecretPath) return null;
    
    let filename = selectedSecretPath.split('/').pop() || 'file';
    if (activeSecret.metadata['filename']) {
      filename = activeSecret.metadata['filename'];
    } else if (activeSecret.metadata['Content-Disposition']) {
      const match = activeSecret.metadata['Content-Disposition'].match(/filename="([^"]+)"/);
      if (match) filename = match[1];
    }

    let mimeType = 'application/octet-stream';
    if (activeSecret.metadata['mimeType']) {
      mimeType = activeSecret.metadata['mimeType'];
    } else {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'gif') mimeType = 'image/gif';
      else if (ext === 'pdf') mimeType = 'application/pdf';
    }

    return { filename, mimeType };
  }, [isFileSecret, activeSecret, selectedSecretPath]);

  const getByteSize = (b64: string) => {
    let len = b64.length;
    if (b64.endsWith('==')) len -= 2;
    else if (b64.endsWith('=')) len -= 1;
    return Math.floor((len * 3) / 4);
  };

  const displayFileSize = useMemo(() => {
    if (activeSecret.metadata['size']) {
      const bytes = parseInt(activeSecret.metadata['size']);
      if (!isNaN(bytes)) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      }
    }
    if (binaryBase64) {
      const bytes = getByteSize(binaryBase64);
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return 'Unknown Size';
  }, [activeSecret.metadata, binaryBase64]);

  // Fetch binary contents when a file secret is loaded
  useEffect(() => {
    if (selectedSecretPath && isFileSecret) {
      setBinaryLoading(true);
      setBinaryBase64(null);
      window.gopass.readBinarySecret(selectedSecretPath)
        .then((b64) => {
          setBinaryBase64(b64);
          setBinaryLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load binary secret content:', err);
          setBinaryLoading(false);
        });
    } else {
      setBinaryBase64(null);
    }
  }, [selectedSecretPath, isFileSecret]);

  // Filter secrets by active store
  const secretsInStore = useMemo(() => {
    const subAliases = mounts.filter(m => !m.isRoot).map(m => m.alias);
    return secrets.filter((s) => {
      if (selectedStore === 'all') return true;
      const parts = s.split('/');
      const firstPart = parts[0];
      const hasSubMount = subAliases.includes(firstPart);
      
      if (selectedStore === 'root') {
        return !hasSubMount;
      } else {
        return firstPart === selectedStore;
      }
    });
  }, [secrets, selectedStore, mounts]);

  // Compute folder tree structure
  const folders = useMemo(() => {
    const set = new Set<string>();
    secretsInStore.forEach((pathStr) => {
      let prefix = '';
      if (selectedStore !== 'all' && selectedStore !== 'root') {
        prefix = selectedStore + '/';
      }
      
      let relativePath = pathStr;
      if (prefix && pathStr.startsWith(prefix)) {
        relativePath = pathStr.substring(prefix.length);
      }
      
      const relParts = relativePath.split('/');
      for (let i = 1; i < relParts.length; i++) {
        const folderPart = relParts.slice(0, i).join('/');
        if (folderPart) {
          set.add(folderPart);
        }
      }
    });

    const list = Array.from(set);
    if (!folderQuery) return list.sort();

    return list
      .filter((f) => f.toLowerCase().includes(folderQuery.toLowerCase()))
      .sort();
  }, [secretsInStore, selectedStore, folderQuery]);

  // Compute secrets inside chosen folder
  const secretsInFolder = useMemo(() => {
    return secretsInStore.filter((s) => {
      let prefix = '';
      if (selectedStore !== 'all' && selectedStore !== 'root') {
        prefix = selectedStore + '/';
      }
      
      let relativePath = s;
      if (prefix && s.startsWith(prefix)) {
        relativePath = s.substring(prefix.length);
      }
      
      const parts = relativePath.split('/');
      const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'root';
      
      const matchesFolder = 
        selectedFolder === null ? true : 
        selectedFolder === 'root' ? folder === 'root' : 
        folder === selectedFolder;
        
      const matchesSearch = s.toLowerCase().includes(secretQuery.toLowerCase());
      return matchesFolder && matchesSearch;
    });
  }, [secretsInStore, selectedStore, selectedFolder, secretQuery]);

  // Select Secret details
  const selectSecret = async (pathStr: string) => {
    if (window.gopass) {
      try {
        setIsCreatingNew(false);
        setIsEditing(false);
        setPendingImportFile(null);
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
    setPendingImportFile(null);
    
    let defaultPrefix = '';
    if (selectedStore !== 'all' && selectedStore !== 'root') {
      defaultPrefix = `${selectedStore}/`;
    }
    if (selectedFolder && selectedFolder !== 'root') {
      defaultPrefix += `${selectedFolder}/`;
    }
    setNewSecretPath(defaultPrefix);
    
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
        if (pendingImportFile) {
          await window.gopass.importBinarySecret(finalPath, pendingImportFile.path);
          setPendingImportFile(null);
        } else {
          await window.gopass.insertSecret(
            finalPath,
            activeSecret.password,
            activeSecret.metadata,
            activeSecret.rawBody
          );
        }
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isEditing) {
      setDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!isEditing) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const filePath = (file as any).path;
      if (filePath) {
        setPendingImportFile({
          path: filePath,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream'
        });
        if (isCreatingNew && !newSecretPath) {
          let prefix = '';
          if (selectedStore !== 'all' && selectedStore !== 'root') {
            prefix = `${selectedStore}/`;
          }
          if (selectedFolder && selectedFolder !== 'root') {
            prefix += `${selectedFolder}/`;
          }
          setNewSecretPath(prefix + file.name);
        }
      }
    }
  };

  const handleInsertMarkdown = (syntax: 'bold' | 'italic' | 'h1' | 'h2' | 'link' | 'code' | 'list') => {
    const textarea = notesRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    let replacement = '';
    switch (syntax) {
      case 'bold':
        replacement = `**${selectedText || 'bold text'}**`;
        break;
      case 'italic':
        replacement = `*${selectedText || 'italic text'}*`;
        break;
      case 'h1':
        replacement = `# ${selectedText || 'Header 1'}`;
        break;
      case 'h2':
        replacement = `## ${selectedText || 'Header 2'}`;
        break;
      case 'link':
        replacement = `[${selectedText || 'Link Text'}](https://example.com)`;
        break;
      case 'code':
        replacement = `\`\`\`\n${selectedText || 'code block'}\n\`\`\``;
        break;
      case 'list':
        replacement = `- ${selectedText || 'list item'}`;
        break;
    }

    const newValue = text.substring(0, start) + replacement + text.substring(end);
    setActiveSecret(prev => ({ ...prev, rawBody: newValue }));

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + replacement.length, start + replacement.length);
    }, 50);
  };

  const isDarkMode = theme.palette.mode === 'dark';
  const appIcon = isDarkMode ? darkIcon : lightIcon;

  // Helper to format center status bar text and action mode
  const getStatusInfo = () => {
    if (isCreatingNew) {
      return { status: 'Creating', pathText: newSecretPath || 'New Secret' };
    }
    if (!selectedSecretPath) {
      return { status: 'Ready', pathText: 'Vault Locked' };
    }
    
    const status = isEditing ? 'Editing' : 'Viewing';
    if (selectedSecretPath.length > 35) {
      const parts = selectedSecretPath.split('/');
      if (parts.length > 2) {
        return { status, pathText: `${parts[0]}/.../${parts[parts.length - 1]}` };
      }
    }
    return { status, pathText: selectedSecretPath };
  };

  const statusInfo = getStatusInfo();
  console.log('Void TitleBar Status:', statusInfo);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      {/* Window custom title bar */}
      <Box
        className="window-titlebar"
        sx={{
          position: 'relative',
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

        {/* Center Section: Active Secret Status */}
        {statusInfo && (
          <Box
            className="window-titlebar-center"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              userSelect: 'none',
              zIndex: 5,
              whiteSpace: 'nowrap'
            }}
          >
            <Box
              sx={{
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                px: 1,
                py: 0.25,
                borderRadius: '4px',
                backgroundColor: statusInfo.status === 'Viewing'
                  ? 'rgba(103, 80, 164, 0.08)'
                  : statusInfo.status === 'Editing'
                    ? 'rgba(235, 143, 111, 0.15)'
                    : statusInfo.status === 'Creating'
                      ? 'rgba(56, 238, 154, 0.15)'
                      : 'rgba(103, 80, 164, 0.08)',
                color: statusInfo.status === 'Viewing'
                  ? 'var(--color-primary)'
                  : statusInfo.status === 'Editing'
                    ? '#eb8f6f'
                    : statusInfo.status === 'Creating'
                      ? '#38ee9a'
                      : 'var(--color-primary)',
                border: '1px solid currentColor',
                lineHeight: 1
              }}
            >
              {statusInfo.status}
            </Box>
            <Typography
              sx={{
                fontFamily: 'var(--font-heading)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-on-surface)',
                letterSpacing: '-0.01em'
              }}
            >
              {statusInfo.pathText}
            </Typography>
          </Box>
        )}
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
        <Box sx={{ padding: '16px 16px 8px 16px', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>
            gopass
          </Typography>
          <IconButton size="small" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Store Selector */}
        <Box sx={{ display: 'flex', gap: 1, px: 2, pb: 1.5, alignItems: 'center' }}>
          <TextField
            select
            fullWidth
            size="small"
            label="Store / Mount"
            value={selectedStore}
            onChange={(e) => {
              setSelectedStore(e.target.value);
              setSelectedFolder(null);
            }}
            SelectProps={{
              native: true,
            }}
            sx={{
              '& .MuiInputBase-input': { fontSize: '13px', py: '6px' },
              '& .MuiInputLabel-root': { fontSize: '13px' }
            }}
          >
            <option value="all">All Stores</option>
            {mounts.map((m) => (
              <option key={m.alias} value={m.alias}>
                {m.alias === 'root' ? 'Root Store' : m.alias}
              </option>
            ))}
          </TextField>
          <IconButton 
            size="small" 
            onClick={() => setManageMountsOpen(true)}
            sx={{ border: '1px solid var(--color-surface-variant)', borderRadius: '8px', p: '6px' }}
          >
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
          {/* Static Navigation Items */}
          <ListItem
            className={`nav-tree-item ${selectedFolder === null ? 'selected' : ''}`}
            onClick={() => setSelectedFolder(null)}
            sx={{
              pl: '12px',
              backgroundColor: selectedFolder === null ? 'var(--color-primary-container)' : 'transparent',
              color: selectedFolder === null ? 'var(--color-on-primary-container)' : 'inherit',
              borderRadius: '100px',
              mb: '2px',
              cursor: 'pointer',
              '&:hover': {
                backgroundColor: selectedFolder === null ? 'var(--color-primary-container)' : 'rgba(103, 80, 164, 0.08)',
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: '32px', color: selectedFolder === null ? 'var(--color-primary)' : 'var(--color-outline)' }}>
              <KeyIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="All Secrets"
              primaryTypographyProps={{ fontSize: '13px', fontWeight: selectedFolder === null ? 500 : 400 }}
            />
          </ListItem>

          <ListItem
            className={`nav-tree-item ${selectedFolder === 'root' ? 'selected' : ''}`}
            onClick={() => setSelectedFolder('root')}
            sx={{
              pl: '12px',
              backgroundColor: selectedFolder === 'root' ? 'var(--color-primary-container)' : 'transparent',
              color: selectedFolder === 'root' ? 'var(--color-on-primary-container)' : 'inherit',
              borderRadius: '100px',
              mb: '2px',
              cursor: 'pointer',
              '&:hover': {
                backgroundColor: selectedFolder === 'root' ? 'var(--color-primary-container)' : 'rgba(103, 80, 164, 0.08)',
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: '32px', color: selectedFolder === 'root' ? 'var(--color-primary)' : 'var(--color-outline)' }}>
              <FolderIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Uncategorized (Root)"
              primaryTypographyProps={{ fontSize: '13px', fontWeight: selectedFolder === 'root' ? 500 : 400 }}
            />
          </ListItem>

          <Divider sx={{ my: 1 }} />

          {/* Computed Folder Tree */}
          {folders.map((folder) => {
            const isSelected = selectedFolder === folder;
            const displayName = folder.split('/').pop();
            const indent = folder.split('/').length * 8;

            return (
              <ListItem
                key={folder}
                className={`nav-tree-item ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedFolder(isSelected ? null : folder)}
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
        <Box sx={{ px: 2, pt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Breadcrumbs Row */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, minHeight: '20px' }}>
            <Typography 
              variant="caption" 
              onClick={() => setSelectedFolder(null)}
              sx={{ 
                cursor: 'pointer', 
                color: 'var(--color-primary)', 
                fontWeight: 600,
                fontSize: '11px',
                '&:hover': { textDecoration: 'underline' } 
              }}
            >
              {selectedStore === 'all' ? 'All Stores' : selectedStore === 'root' ? 'Root Store' : selectedStore}
            </Typography>
            {selectedFolder && selectedFolder !== 'root' && selectedFolder.split('/').map((part, index, arr) => {
              const folderPath = arr.slice(0, index + 1).join('/');
              return (
                <React.Fragment key={folderPath}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>/</Typography>
                  <Typography 
                    variant="caption" 
                    onClick={() => setSelectedFolder(folderPath)}
                    sx={{ 
                      cursor: 'pointer', 
                      color: 'var(--color-primary)',
                      fontWeight: 500,
                      fontSize: '11px',
                      '&:hover': { textDecoration: 'underline' } 
                    }}
                  >
                    {part}
                  </Typography>
                </React.Fragment>
              );
            })}
            {selectedFolder === 'root' && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>/</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '11px' }}>Root</Typography>
              </>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, pb: 1 }}>
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
                  onClick={() => {
                    if (selectedSecretPath === s) {
                      setSelectedSecretPath(null);
                      setActiveSecret({ password: '', metadata: {}, rawBody: '' });
                    } else {
                      selectSecret(s);
                    }
                  }}
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

        {(selectedSecretPath || isCreatingNew) ? (
          <Box
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            sx={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              border: dragOver ? '2px dashed var(--color-primary)' : 'none',
              backgroundColor: dragOver ? 'rgba(103, 80, 164, 0.04)' : 'transparent',
            }}
          >
            
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

            {isFileSecret && !isEditing ? (
              <Box sx={{ border: '1px solid var(--color-surface-variant)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: 2, backgroundColor: 'rgba(103, 80, 164, 0.02)', flex: 1, minHeight: 0 }}>
                {/* File Metadata Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', borderBottom: '1px solid var(--color-surface-variant)', pb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <AttachFileIcon sx={{ fontSize: '28px', color: 'var(--color-primary)' }} />
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
                        {fileDetails?.filename}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Size: <strong>{displayFileSize}</strong> | Type: <strong>{fileDetails?.mimeType}</strong>
                      </Typography>
                    </Box>
                  </Box>
                  <Button 
                    variant="contained" 
                    color="primary" 
                    onClick={() => {
                      if (selectedSecretPath && fileDetails) {
                        window.gopass.exportBinarySecret(selectedSecretPath, fileDetails.filename);
                      }
                    }}
                    startIcon={<AttachFileIcon sx={{ transform: 'rotate(180deg)' }} />}
                    sx={{ borderRadius: '8px', textTransform: 'none' }}
                  >
                    Download File
                  </Button>
                </Box>
                
                {/* Preview Panel */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%' }}>
                  {binaryLoading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, py: 6, width: '100%' }}>
                      <CircularProgress size={32} sx={{ color: 'var(--color-primary)' }} />
                      <Typography variant="caption" color="text.secondary">Loading preview...</Typography>
                    </Box>
                  ) : (
                    binaryBase64 && (
                      <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, mt: 1 }}>
                        {fileDetails?.mimeType.startsWith('image/') ? (
                          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderRadius: '12px', border: '1px solid var(--color-surface-variant)', p: 2, backgroundColor: 'rgba(0, 0, 0, 0.02)', minHeight: '300px' }}>
                            <img 
                              src={`data:${fileDetails.mimeType};base64,${binaryBase64}`} 
                              style={{ maxWidth: '100%', maxHeight: '450px', objectFit: 'contain', borderRadius: '8px', boxShadow: 'var(--elevation-1)' }} 
                              alt="preview"
                            />
                          </Box>
                        ) : fileDetails?.mimeType === 'application/pdf' ? (
                          <PdfViewer base64Data={binaryBase64} />
                        ) : isTextFile(binaryBase64) ? (
                          <FlatTextViewer base64Data={binaryBase64} />
                        ) : (
                          // Fallback for generic binary files
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 6, width: '100%' }}>
                            <AttachFileIcon sx={{ fontSize: '64px', color: 'var(--color-outline)' }} />
                            <Typography variant="body2" color="text.secondary">
                              No preview available for this file type.
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    )
                  )}
                </Box>
              </Box>
            ) : (
              <>
                {/* File Attachment Status in Edit Mode */}
                {isEditing && pendingImportFile && (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--color-primary)', borderRadius: '12px', padding: '12px 16px', backgroundColor: 'var(--color-primary-container)', color: 'var(--color-on-primary-container)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AttachFileIcon />
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{pendingImportFile.name}</Typography>
                        <Typography variant="caption">{(pendingImportFile.size / 1024).toFixed(1)} KB</Typography>
                      </Box>
                    </Box>
                    <IconButton size="small" onClick={() => setPendingImportFile(null)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
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
                              onClick={() => {
                                if (window.clipboard) {
                                  window.clipboard.writeText(activeSecret.password, true);
                                } else {
                                  navigator.clipboard.writeText(activeSecret.password);
                                }
                              }}
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
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 1.5 }}>
                        <FormControlLabel
                          control={<Switch size="small" checked={includeSymbols} onChange={(e) => setIncludeSymbols(e.target.checked)} />}
                          label={<Typography variant="caption">Symbols</Typography>}
                        />
                        <FormControlLabel
                          control={<Switch size="small" checked={includeDigits} onChange={(e) => setIncludeDigits(e.target.checked)} />}
                          label={<Typography variant="caption">Digits</Typography>}
                        />
                        <FormControlLabel
                          control={<Switch size="small" checked={passphraseGenerator} onChange={(e) => setPassphraseGenerator(e.target.checked)} />}
                          label={<Typography variant="caption">Passphrase</Typography>}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="caption" sx={{ minWidth: '40px' }}>Length: {pwdLength}</Typography>
                        <Slider
                          size="small"
                          value={pwdLength}
                          onChange={(_, val) => setPwdLength(val as number)}
                          min={8}
                          max={64}
                          sx={{ flex: 1 }}
                        />
                      </Box>
                    </Box>
                  )}
                </Box>

                {/* Metadata Fields */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                      Metadata Fields
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
              </>
            )}

            {/* Notes Block */}
            {isEditing ? (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1, color: 'var(--color-outline)' }}>
                  Notes
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, mb: 1, border: '1px solid var(--color-surface-variant)', borderRadius: '8px 8px 0 0', p: 0.5, backgroundColor: 'rgba(103, 80, 164, 0.04)', flexWrap: 'wrap' }}>
                  <Button size="small" variant="text" sx={{ minWidth: 'auto', px: 1, textTransform: 'none', fontWeight: 'bold' }} onClick={() => handleInsertMarkdown('bold')}>Bold</Button>
                  <Button size="small" variant="text" sx={{ minWidth: 'auto', px: 1, textTransform: 'none', fontStyle: 'italic' }} onClick={() => handleInsertMarkdown('italic')}>Italic</Button>
                  <Button size="small" variant="text" sx={{ minWidth: 'auto', px: 1, textTransform: 'none' }} onClick={() => handleInsertMarkdown('h1')}>H1</Button>
                  <Button size="small" variant="text" sx={{ minWidth: 'auto', px: 1, textTransform: 'none' }} onClick={() => handleInsertMarkdown('h2')}>H2</Button>
                  <Button size="small" variant="text" sx={{ minWidth: 'auto', px: 1, textTransform: 'none' }} onClick={() => handleInsertMarkdown('link')}>Link</Button>
                  <Button size="small" variant="text" sx={{ minWidth: 'auto', px: 1, textTransform: 'none' }} onClick={() => handleInsertMarkdown('code')}>Code</Button>
                  <Button size="small" variant="text" sx={{ minWidth: 'auto', px: 1, textTransform: 'none' }} onClick={() => handleInsertMarkdown('list')}>List</Button>
                </Box>
                <TextField
                  fullWidth
                  multiline
                  inputRef={notesRef}
                  rows={8}
                  placeholder="Write arbitrary Secure Notes / GPG formatted bodies here..."
                  value={activeSecret.rawBody}
                  onChange={(e) => setActiveSecret(prev => ({ ...prev, rawBody: e.target.value }))}
                  InputProps={{
                    sx: { borderRadius: '0 0 8px 8px' }
                  }}
                />
              </Box>
            ) : (
              activeSecret.rawBody && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 1, color: 'var(--color-outline)' }}>
                    Notes (Markdown Rendered)
                  </Typography>
                  <Box
                    className="markdown-body"
                    sx={{
                      border: '1px solid var(--color-surface-variant)',
                      borderRadius: '12px',
                      padding: '16px',
                      backgroundColor: 'rgba(103, 80, 164, 0.02)',
                      minHeight: '100px',
                      fontSize: '14px',
                      lineHeight: '1.6'
                    }}
                    dangerouslySetInnerHTML={{
                      __html: marked.parse(activeSecret.rawBody || '') as string
                    }}
                  />
                </Box>
              )
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

      {/* MANAGE MOUNTS DIALOG */}
      <Dialog open={manageMountsOpen} onClose={() => setManageMountsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontFamily: 'var(--font-heading)', fontWeight: 600 }}>Manage Mounts / Stores</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Active Mounts</Typography>
            <List sx={{ border: '1px solid var(--color-surface-variant)', borderRadius: '12px', p: 0 }}>
              {mounts.map((m) => (
                <ListItem
                  key={m.alias}
                  secondaryAction={
                    !m.isRoot && (
                      <IconButton 
                        edge="end" 
                        color="error" 
                        onClick={async () => {
                          if (confirm(`Are you sure you want to remove mount "${m.alias}"?`)) {
                            try {
                              await window.gopass.removeMount(m.alias);
                              await loadMountsList();
                              await loadSecretsList();
                            } catch (err: any) {
                              alert(`Failed to remove mount: ${err.message}`);
                            }
                          }
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    )
                  }
                  sx={{
                    borderBottom: '1px solid var(--color-surface-variant)',
                    '&:last-child': { borderBottom: 'none' }
                  }}
                >
                  <ListItemText
                    primary={<strong>{m.alias === 'root' ? 'Root Store (root)' : m.alias}</strong>}
                    secondary={m.path}
                    secondaryTypographyProps={{ style: { wordBreak: 'break-all' } }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>

          <Divider />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Add New Mount</Typography>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                size="small"
                label="Alias"
                placeholder="e.g. personal"
                value={newMountAlias}
                onChange={(e) => setNewMountAlias(e.target.value)}
                sx={{ width: '35%' }}
              />
              <TextField
                size="small"
                label="Directory Path"
                placeholder="Absolute path"
                value={newMountPath}
                onChange={(e) => setNewMountPath(e.target.value)}
                sx={{ flex: 1 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button
                        size="small"
                        onClick={async () => {
                          const dir = await window.windowControl.selectDirectory();
                          if (dir) {
                            setNewMountPath(dir);
                          }
                        }}
                        sx={{ minWidth: 'auto', px: 1, textTransform: 'none' }}
                      >
                        Browse...
                      </Button>
                    </InputAdornment>
                  )
                }}
              />
            </Box>
            <Button
              variant="contained"
              onClick={async () => {
                if (!newMountAlias.trim() || !newMountPath.trim()) {
                  alert('Please provide both an alias and directory path');
                  return;
                }
                try {
                  await window.gopass.addMount(newMountAlias.trim(), newMountPath.trim());
                  setNewMountAlias('');
                  setNewMountPath('');
                  await loadMountsList();
                  await loadSecretsList();
                } catch (err: any) {
                  alert(`Failed to add mount: ${err.message}`);
                }
              }}
              sx={{ alignSelf: 'flex-end', borderRadius: '8px' }}
            >
              Add Mount
            </Button>
          </Box>
        </DialogContent>
        <DialogActions sx={{ padding: '16px 24px' }}>
          <Button onClick={() => setManageMountsOpen(false)} variant="outlined">Close</Button>
        </DialogActions>
      </Dialog>

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
  const [recordingField, setRecordingField] = useState<string | null>(null);

  useEffect(() => {
    setLocalConfig({ ...config });
    setRecordingField(null);
  }, [config, open]);

  useEffect(() => {
    if (!recordingField) return;

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
          setRecordingField(null);
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
          application: {
            ...prev.application,
            [recordingField]: combined
          },
        }));
        setRecordingField(null);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [recordingField]);

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

  const handleResetToDefaults = () => {
    setLocalConfig((prev) => ({
      ...prev,
      application: {
        ...prev.application,
        global_hotkey: 'CommandOrControl+Shift+P',
        shortcut_copy_password: 'Control+C',
        shortcut_copy_username: 'Alt+U',
        shortcut_copy_totp: 'Alt+O',
        shortcut_edit_secret: 'Alt+E',
        global_pwgen_hotkey: 'CommandOrControl+Shift+G',
        pwgen_arguments: '20',
      }
    }));
  };

  const renderShortcutField = (label: string, field: string) => {
    const isRecordingThis = recordingField === field;
    const value = (localConfig.application as any)[field] || '';
    
    return (
      <Box key={field} sx={{ mb: 2 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'var(--color-outline)', display: 'block', mb: 0.5 }}>
          {label}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            fullWidth
            size="small"
            value={isRecordingThis ? 'Press key combination (or Esc to cancel)...' : value}
            InputProps={{
              readOnly: true,
            }}
            error={isRecordingThis}
            helperText={isRecordingThis ? 'Listening...' : ''}
          />
          <Button
            variant={isRecordingThis ? 'contained' : 'outlined'}
            color={isRecordingThis ? 'error' : 'primary'}
            onClick={() => setRecordingField(isRecordingThis ? null : field)}
            sx={{ height: '40px', minWidth: '100px', borderRadius: '8px', textTransform: 'none' }}
          >
            {isRecordingThis ? 'Stop' : 'Record'}
          </Button>
        </Box>
      </Box>
    );
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
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={localConfig.application.start_at_login}
                  onChange={(e) =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      application: { ...prev.application, start_at_login: e.target.checked },
                    }))
                  }
                />
              }
              label={<Typography variant="body2">Start Void on system startup (Login)</Typography>}
            />
          </Box>
        </Box>

        {/* Keyboard Shortcuts */}
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Keyboard Shortcuts</Typography>
            <Button size="small" onClick={handleResetToDefaults} sx={{ textTransform: 'none' }}>
              Reset to Defaults
            </Button>
          </Box>
          {renderShortcutField('Toggle Quick Access (Global)', 'global_hotkey')}
          {renderShortcutField('Toggle Password Generator (Global)', 'global_pwgen_hotkey')}
          {renderShortcutField('Copy Password (Inside Quick Access)', 'shortcut_copy_password')}
          {renderShortcutField('Copy Username (Inside Quick Access)', 'shortcut_copy_username')}
          {renderShortcutField('Copy TOTP (Inside Quick Access)', 'shortcut_copy_totp')}
          {renderShortcutField('Edit Secret (Inside Quick Access)', 'shortcut_edit_secret')}
        </Box>

        {/* Password Generator Settings */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Password Generator</Typography>
          <TextField
            fullWidth
            size="small"
            label="gopass pwgen Arguments"
            value={localConfig.application.pwgen_arguments}
            onChange={(e) =>
              setLocalConfig((prev) => ({
                ...prev,
                application: { ...prev.application, pwgen_arguments: e.target.value },
              }))
            }
          />
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

// Check if a base64 string decodes to a valid printable text/log file content
function isTextFile(b64: string): boolean {
  try {
    const decoded = atob(b64);
    let nonPrintableCount = 0;
    for (let i = 0; i < Math.min(decoded.length, 1000); i++) {
      const code = decoded.charCodeAt(i);
      if (code === 0) return false; // Contains null bytes (binary)
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        nonPrintableCount++;
      }
    }
    return (nonPrintableCount / Math.min(decoded.length, 1000)) <= 0.3;
  } catch (e) {
    return false;
  }
}

// Component to render plain text / log files
function FlatTextViewer({ base64Data }: { base64Data: string }) {
  const textContent = useMemo(() => {
    try {
      return atob(base64Data);
    } catch (e) {
      return null;
    }
  }, [base64Data]);

  if (textContent === null) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Failed to display file content.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', border: '1px solid var(--color-surface-variant)', borderRadius: '12px', overflow: 'hidden', minHeight: '350px' }}>
      <Box sx={{ p: 1, backgroundColor: 'rgba(103, 80, 164, 0.05)', borderBottom: '1px solid var(--color-surface-variant)' }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'var(--color-outline)' }}>
          File Contents (Plain Text)
        </Typography>
      </Box>
      <Box 
        component="pre" 
        sx={{ 
          flex: 1, 
          m: 0, 
          p: 2, 
          overflow: 'auto', 
          fontFamily: 'var(--font-mono)', 
          fontSize: '13px', 
          lineHeight: '1.5', 
          backgroundColor: 'rgba(103, 80, 164, 0.01)', 
          userSelect: 'text', 
          whiteSpace: 'pre-wrap', 
          wordBreak: 'break-all' 
        }}
      >
        {textContent}
      </Box>
    </Box>
  );
}

// Custom page-flipping and scrolling PDF Viewer
interface PdfViewerProps {
  base64Data: string;
}

function PdfViewer({ base64Data }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [viewMode, setViewMode] = useState<'single' | 'scroll'>('single');

  const pdfData = useMemo(() => {
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return { data: bytes };
    } catch (e) {
      console.error('Failed to decode PDF base64:', e);
      return null;
    }
  }, [base64Data]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  if (!pdfData) {
    return <Typography color="error">Failed to load PDF data</Typography>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', border: '1px solid var(--color-surface-variant)', borderRadius: '12px', overflow: 'hidden', backgroundColor: 'var(--color-surface-container-lowest)', minHeight: '450px' }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, backgroundColor: 'rgba(103, 80, 164, 0.05)', borderBottom: '1px solid var(--color-surface-variant)', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton 
            size="small" 
            disabled={pageNumber <= 1 || viewMode === 'scroll'} 
            onClick={() => setPageNumber(p => Math.max(p - 1, 1))}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="body2">
            {viewMode === 'scroll' 
              ? `Total Pages: ${numPages || '...'}`
              : `Page ${pageNumber} of ${numPages || '...'}`
            }
          </Typography>
          <IconButton 
            size="small" 
            disabled={!numPages || pageNumber >= numPages || viewMode === 'scroll'} 
            onClick={() => setPageNumber(p => Math.min(p + 1, numPages))}
          >
            <ChevronRightIcon />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button 
            size="small" 
            variant="outlined" 
            onClick={() => setViewMode(m => m === 'single' ? 'scroll' : 'single')}
            sx={{ textTransform: 'none', height: '30px', fontSize: '12px' }}
          >
            {viewMode === 'single' ? 'Scroll View' : 'Single Page'}
          </Button>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton size="small" onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}>
              <RemoveIcon fontSize="small" />
            </IconButton>
            <Typography variant="caption" sx={{ minWidth: '40px', textAlign: 'center' }}>
              {Math.round(scale * 100)}%
            </Typography>
            <IconButton size="small" onClick={() => setScale(s => Math.min(s + 0.25, 2.5))}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Pages Container */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#525659', minHeight: '380px' }}>
        <Document 
          file={pdfData} 
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<CircularProgress size={24} sx={{ color: 'var(--color-primary)' }} />}
          error={<Typography color="error">Error loading PDF document.</Typography>}
        >
          {viewMode === 'single' ? (
            <Box sx={{ boxShadow: 'var(--elevation-2)', backgroundColor: '#fff', borderRadius: '4px', overflow: 'hidden' }}>
              <Page 
                pageNumber={pageNumber} 
                scale={scale} 
                renderTextLayer={false} 
                renderAnnotationLayer={false} 
              />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {Array.from(new Array(numPages || 0), (_, index) => (
                <Box key={index} sx={{ boxShadow: 'var(--elevation-2)', backgroundColor: '#fff', borderRadius: '4px', overflow: 'hidden' }}>
                  <Page 
                    pageNumber={index + 1} 
                    scale={scale} 
                    renderTextLayer={false} 
                    renderAnnotationLayer={false} 
                  />
                </Box>
              ))}
            </Box>
          )}
        </Document>
      </Box>
    </Box>
  );
}
