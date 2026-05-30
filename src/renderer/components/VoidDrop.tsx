import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  FormControlLabel,
  Switch,
  Paper,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFileOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import FilePresentIcon from '@mui/icons-material/FilePresentOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import SendIcon from '@mui/icons-material/SwapHorizOutlined';
import { AppConfig } from '../../main/config';

interface VoidDropProps {
  config: AppConfig;
  setConfig?: React.Dispatch<React.SetStateAction<AppConfig | null>>;
}

interface ActiveDrop {
  sessionId: string;
  name: string;
  isFile: boolean;
  size: number;
  created: number;
  expiresAt: number;
  url: string;
  status: 'pending' | 'connecting' | 'sending' | 'completed' | 'failed' | 'consumed';
  progress?: number;
  filePath?: string;
  text?: string;
  gpgSign?: boolean;
  gpgEncrypt?: boolean;
  recipientKeyId?: string;
  aesKeyHex?: string;
  signature?: string;
  maxAccess?: number;
  accessCount?: number;
}

export default function VoidDrop({ config, setConfig }: VoidDropProps) {
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [gpgSign, setGpgSign] = useState(false);
  const [gpgEncrypt, setGpgEncrypt] = useState(false);
  const [gpgKeys, setGpgKeys] = useState<Array<{ keyId: string; uid: string }>>([]);
  const [recipientKeyId, setRecipientKeyId] = useState('');
  const [activeDrops, setActiveDrops] = useState<ActiveDrop[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [lifetime, setLifetime] = useState(3600000); // Default: 1 hour in ms
  const [maxAccess, setMaxAccess] = useState(1); // Default is 1

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Store connections in a ref map to survive state re-renders
  const connectionsRef = useRef<Map<string, { pc?: RTCPeerConnection; es?: EventSource }>>(new Map());

  // Prevent infinite loops and timing issues for connected tunnels
  const connectedSessionsRef = useRef<Set<string>>(new Set());

  // Fetch GPG keys on mount
  useEffect(() => {
    if (window.gpg) {
      window.gpg.listKeys()
        .then(keys => {
          setGpgKeys(keys);
          if (keys.length > 0) {
            setRecipientKeyId(keys[0].keyId);
          }
        })
        .catch(err => console.error('Failed to list GPG keys:', err));
    }
  }, []);

  // Save drops helper
  const saveDropsToConfig = async (drops: ActiveDrop[]) => {
    const dropsToPersist = drops.map(d => ({
      sessionId: d.sessionId,
      name: d.name,
      isFile: d.isFile,
      size: d.size,
      created: d.created,
      expiresAt: d.expiresAt,
      url: d.url,
      status: d.status,
      filePath: d.filePath,
      text: d.text,
      gpgSign: d.gpgSign,
      gpgEncrypt: d.gpgEncrypt,
      recipientKeyId: d.recipientKeyId,
      aesKeyHex: d.aesKeyHex,
      signature: d.signature,
      maxAccess: d.maxAccess,
      accessCount: d.accessCount,
    }));
    const updatedConfig = {
      ...config,
      void_drops: dropsToPersist
    };
    try {
      await window.config.saveConfig(updatedConfig);
      if (setConfig) {
        setConfig(updatedConfig);
      }
    } catch (err) {
      console.error('Failed to save drops to config:', err);
    }
  };

  // Listen for externally added drops (e.g., generated directly from the Vault)
  useEffect(() => {
    const persisted = config.void_drops || [];
    let updated = false;

    persisted.forEach(d => {
      const isAlreadyTracked = connectedSessionsRef.current.has(d.sessionId) || activeDrops.some(x => x.sessionId === d.sessionId);
      if (!isAlreadyTracked) {
        updated = true;
        const isExpired = Date.now() > d.expiresAt;
        const status: ActiveDrop['status'] = isExpired && d.status !== 'consumed' ? 'failed' : d.status;

        const newDropItem: ActiveDrop = {
          ...d,
          status,
        };

        // Track and start connection
        connectedSessionsRef.current.add(d.sessionId);
        setActiveDrops(prev => {
          if (prev.some(x => x.sessionId === d.sessionId)) return prev;
          return [newDropItem, ...prev];
        });

        if (!isExpired && d.status !== 'consumed' && d.status !== 'failed') {
          startConnection(newDropItem);
        }
      }
    });
  }, [config.void_drops, activeDrops]);

  // Cryptography Helpers
  const encryptAesGcm = async (data: ArrayBuffer, rawKey: Uint8Array): Promise<ArrayBuffer> => {
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return combined.buffer;
  };

  const getPayloadForDrop = async (drop: ActiveDrop, initialFile?: File | null): Promise<{ finalPayload: string | ArrayBuffer; isPayloadEncrypted: boolean; detachedSignatureText: string }> => {
    let base64Payload = '';
    let clearText = '';
    let arrayBuffer: ArrayBuffer | null = null;

    if (drop.isFile) {
      if (initialFile) {
        arrayBuffer = await initialFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64Payload = btoa(binary);
      } else if (drop.text) {
        // Vault shared file: base64 content is already loaded into drop.text
        base64Payload = drop.text;
        const binaryString = atob(drop.text);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        arrayBuffer = bytes.buffer;
      } else {
        if (!drop.filePath) {
          throw new Error('File path is missing for persisted drop.');
        }
        const base64 = await window.gpg.readFileBase64(drop.filePath);
        base64Payload = base64;
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        arrayBuffer = bytes.buffer;
      }
    } else {
      clearText = drop.text || '';
      base64Payload = btoa(unescape(encodeURIComponent(clearText)));
    }

    const rawAesKey = new Uint8Array((drop.aesKeyHex || '').match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    let finalPayload: string | ArrayBuffer;
    let detachedSignatureText = '';
    let isPayloadEncrypted = false;

    if (drop.gpgSign || drop.gpgEncrypt) {
      if (!window.gpg) {
        throw new Error('GPG integration is not available.');
      }

      if (drop.gpgEncrypt) {
        finalPayload = await window.gpg.encrypt(base64Payload, drop.recipientKeyId || '');
        isPayloadEncrypted = true;
        if (drop.gpgSign) {
          detachedSignatureText = await window.gpg.signDetached(btoa(finalPayload as string));
        }
      } else {
        if (drop.isFile) {
          detachedSignatureText = await window.gpg.signDetached(base64Payload);
          finalPayload = arrayBuffer!;
        } else {
          finalPayload = await window.gpg.sign(clearText);
        }
      }
    } else {
      const buffer = drop.isFile ? arrayBuffer! : new TextEncoder().encode(clearText);
      finalPayload = await encryptAesGcm(buffer, rawAesKey);
    }

    return { finalPayload, isPayloadEncrypted, detachedSignatureText };
  };

  const startConnection = async (drop: ActiveDrop, initialFile?: File | null) => {
    const dbUrl = config.developer?.signaling_database_url || 'https://void-52b64-default-rtdb.firebaseio.com/';
    const host = new URL(dbUrl).host;
    const { sessionId, aesKeyHex } = drop;

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      const dc = pc.createDataChannel('sendChannel', { ordered: true });
      dc.binaryType = 'arraybuffer';

      connectionsRef.current.set(sessionId, { pc });

      dc.onopen = async () => {
        console.log('WebRTC Data Channel Opened for session', sessionId);
        setActiveDrops(prev => {
          const updated = prev.map(d => d.sessionId === sessionId ? { ...d, status: 'sending' as const, progress: 0 } : d);
          saveDropsToConfig(updated);
          return updated;
        });

        try {
          const { finalPayload, isPayloadEncrypted, detachedSignatureText } = await getPayloadForDrop(drop, initialFile);

          dc.send(JSON.stringify({
            type: 'header',
            name: drop.name,
            size: drop.size,
            isFile: drop.isFile,
            isGpgSigned: drop.gpgSign,
            isGpgEncrypted: drop.gpgEncrypt,
            signature: detachedSignatureText || drop.signature,
            isAesEncrypted: !isPayloadEncrypted,
          }));

          const bytesToSend = typeof finalPayload === 'string' 
            ? new TextEncoder().encode(finalPayload) 
            : new Uint8Array(finalPayload);
          
          const chunkSize = 16384;
          let offset = 0;

          while (offset < bytesToSend.byteLength) {
            const chunk = bytesToSend.slice(offset, offset + chunkSize);
            dc.send(chunk);
            offset += chunkSize;

            const progress = Math.min(100, Math.round((offset / bytesToSend.byteLength) * 100));
            setActiveDrops(prev => prev.map(d => d.sessionId === sessionId ? { ...d, progress } : d));

            if (dc.bufferedAmount > 1024 * 1024) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }

          dc.send(JSON.stringify({ type: 'eof' }));
          
          setActiveDrops(prev => {
            const currentDrop = prev.find(d => d.sessionId === sessionId);
            if (!currentDrop) return prev;

            const nextAccessCount = (currentDrop.accessCount || 0) + 1;
            const isFullyConsumed = nextAccessCount >= (currentDrop.maxAccess || 1);

            const updated = prev.map(d => {
              if (d.sessionId === sessionId) {
                return {
                  ...d,
                  accessCount: nextAccessCount,
                  status: isFullyConsumed ? ('consumed' as const) : ('pending' as const),
                  progress: 100,
                };
              }
              return d;
            });
            saveDropsToConfig(updated);

            // Clean up connection after a brief delay
            setTimeout(() => {
              pc.close();
              const conn = connectionsRef.current.get(sessionId);
              if (conn) {
                conn.es?.close();
                connectionsRef.current.delete(sessionId);
              }

              if (isFullyConsumed) {
                // Delete session from Firebase (single-response / fully consumed)
                fetch(`https://${host}/sessions/${sessionId}.json`, { method: 'DELETE' })
                  .catch(err => console.error('Failed to delete session:', err));
              } else {
                // Prepare for next connection: clear answer and receiver candidates
                fetch(`https://${host}/sessions/${sessionId}/answer.json`, { method: 'DELETE' })
                  .catch(err => console.error('Failed to clear answer:', err));
                fetch(`https://${host}/sessions/${sessionId}/candidates/receiver.json`, { method: 'DELETE' })
                  .catch(err => console.error('Failed to clear candidates:', err));

                // Re-start connection engine for the next peer
                const updatedDrop = updated.find(d => d.sessionId === sessionId);
                if (updatedDrop) {
                  setTimeout(() => {
                    startConnection(updatedDrop, initialFile);
                  }, 1000);
                }
              }
            }, 3000);

            return updated;
          });

        } catch (err) {
          console.error('Data channel streaming error:', err);
          setActiveDrops(prev => {
            const updated = prev.map(d => d.sessionId === sessionId ? { ...d, status: 'failed' as const } : d);
            saveDropsToConfig(updated);
            return updated;
          });
        }
      };

      dc.onclose = () => {
        console.log('Data channel closed for session', sessionId);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          fetch(`https://${host}/sessions/${sessionId}/candidates/sender.json`, {
            method: 'POST',
            body: JSON.stringify(event.candidate)
          }).catch(err => console.error('Failed to post ICE candidate to Firebase:', err));
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await fetch(`https://${host}/sessions/${sessionId}.json`, {
        method: 'PATCH',
        body: JSON.stringify({
          offer: { sdp: offer.sdp, type: offer.type },
          metadata: { createdAt: Date.now(), expiresAt: drop.expiresAt, maxAccess: drop.maxAccess || 1 }
        })
      });

      const eventSource = new EventSource(`https://${host}/sessions/${sessionId}.json`);
      const currentConn = connectionsRef.current.get(sessionId);
      if (currentConn) {
        currentConn.es = eventSource;
      }

      const handleAnswer = async (answer: any) => {
        if (!answer) return;
        try {
          setActiveDrops(prev => {
            const updated = prev.map(d => d.sessionId === sessionId ? { ...d, status: 'connecting' as const } : d);
            saveDropsToConfig(updated);
            return updated;
          });
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Failed to set remote description on sender:', err);
        }
      };

      const handleReceiverCandidates = async (candidatesData: any) => {
        if (!candidatesData) return;
        const list = (typeof candidatesData === 'object' && candidatesData.candidate)
          ? [candidatesData]
          : Object.values(candidatesData);

        for (const cand of list) {
          if (cand && (cand as any).candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand as any));
            } catch (err) {
              console.error('Error adding receiver ICE candidate:', err);
            }
          }
        }
      };

      eventSource.addEventListener('put', async (e: any) => {
        const payload = JSON.parse(e.data);
        if (!payload) return;
        const path = payload.path;
        const data = payload.data;

        if (path === '/') {
          if (data) {
            if (data.answer) {
              await handleAnswer(data.answer);
            }
            if (data.candidates && data.candidates.receiver) {
              await handleReceiverCandidates(data.candidates.receiver);
            }
          }
        } else if (path === '/answer' && data) {
          await handleAnswer(data);
        } else if (path.startsWith('/candidates/receiver') && data) {
          await handleReceiverCandidates(data);
        }
      });

      eventSource.addEventListener('patch', async (e: any) => {
        const payload = JSON.parse(e.data);
        if (!payload) return;
        const data = payload.data;

        if (data) {
          if (data.answer) {
            await handleAnswer(data.answer);
          }
          if (data.candidates && data.candidates.receiver) {
            await handleReceiverCandidates(data.candidates.receiver);
          }
        }
      });

    } catch (err) {
      console.error('Connection setup failed:', err);
      setActiveDrops(prev => {
        const updated = prev.map(d => d.sessionId === sessionId ? { ...d, status: 'failed' as const } : d);
        saveDropsToConfig(updated);
        return updated;
      });
    }
  };

  // Mount Effect: Restore drops from config and re-initialize connections if active & non-expired
  useEffect(() => {
    const persisted = config.void_drops || [];
    const restored: ActiveDrop[] = [];

    persisted.forEach(d => {
      const isExpired = Date.now() > d.expiresAt;
      const status: ActiveDrop['status'] = isExpired && d.status !== 'consumed' ? 'failed' : d.status;

      const restoredDrop: ActiveDrop = {
        ...d,
        status,
      };

      restored.push(restoredDrop);

      if (!isExpired && d.status !== 'consumed' && d.status !== 'failed') {
        connectedSessionsRef.current.add(d.sessionId);
        startConnection(restoredDrop);
      }
    });

    setActiveDrops(restored);
  }, []);

  // Tick effect: Updates countdown timer every second and terminates newly expired drops
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
      
      setActiveDrops(prev => {
        let changed = false;
        const updated = prev.map(d => {
          if (d.status !== 'consumed' && d.status !== 'failed' && Date.now() > d.expiresAt) {
            changed = true;
            const conn = connectionsRef.current.get(d.sessionId);
            if (conn) {
              conn.pc?.close();
              conn.es?.close();
              connectionsRef.current.delete(d.sessionId);
            }
            return { ...d, status: 'failed' as const };
          }
          return d;
        });
        if (changed) {
          saveDropsToConfig(updated);
        }
        return updated;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Cleanup active connections on unmount
  useEffect(() => {
    return () => {
      connectionsRef.current.forEach(conn => {
        conn.pc?.close();
        conn.es?.close();
      });
      connectionsRef.current.clear();
    };
  }, []);

  // Drag and Drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  // Helper to force expire / dismiss a drop link
  const forceExpire = async (sessionId: string) => {
    const drop = activeDrops.find(d => d.sessionId === sessionId);
    if (drop) {
      const conn = connectionsRef.current.get(sessionId);
      if (conn) {
        conn.pc?.close();
        conn.es?.close();
        connectionsRef.current.delete(sessionId);
      }
      
      const dbUrl = config.developer?.signaling_database_url || 'https://void-52b64-default-rtdb.firebaseio.com/';
      const host = new URL(dbUrl).host;
      try {
        await fetch(`https://${host}/sessions/${sessionId}.json`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to clean up session in Firebase:', err);
      }
    }
    setActiveDrops(prev => {
      const updated = prev.filter(d => d.sessionId !== sessionId);
      saveDropsToConfig(updated);
      return updated;
    });
  };

  // Generate drop link
  const generateDrop = async () => {
    if (mode === 'text' && !text.trim()) return;
    if (mode === 'file' && !file) return;

    setIsGenerating(true);
    const dbUrl = config.developer?.signaling_database_url || 'https://void-52b64-default-rtdb.firebaseio.com/';
    const host = new URL(dbUrl).host;
    const sessionId = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const isFile = mode === 'file';
    const payloadName = isFile ? file!.name : 'Note';
    const payloadSize = isFile ? file!.size : text.length;
    const expiresAt = Date.now() + lifetime;

    try {
      const rawAesKey = window.crypto.getRandomValues(new Uint8Array(32));
      const aesKeyHex = Array.from(rawAesKey).map(b => b.toString(16).padStart(2, '0')).join('');

      const newDrop: ActiveDrop = {
        sessionId,
        name: payloadName,
        isFile,
        size: payloadSize,
        created: Date.now(),
        expiresAt,
        url: `https://duhruh.me/void/drop.html#${host}.${sessionId}.${aesKeyHex}`,
        status: 'pending',
        filePath: isFile ? file!.path : undefined,
        text: isFile ? undefined : text,
        gpgSign,
        gpgEncrypt,
        recipientKeyId: gpgEncrypt ? recipientKeyId : undefined,
        aesKeyHex,
        maxAccess,
        accessCount: 0,
      };

      // Set signature block to save GPG signature calculation time if reconnected
      if (gpgSign || gpgEncrypt) {
        if (!window.gpg) throw new Error('GPG integration is not available.');
        let base64Payload = '';
        if (isFile) {
          const arrayBuffer = await file!.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          base64Payload = btoa(binary);
        } else {
          base64Payload = btoa(unescape(encodeURIComponent(text)));
        }

        if (gpgEncrypt) {
          const enc = await window.gpg.encrypt(base64Payload, recipientKeyId);
          if (gpgSign) {
            newDrop.signature = await window.gpg.signDetached(btoa(enc));
          }
        } else {
          if (isFile) {
            newDrop.signature = await window.gpg.signDetached(base64Payload);
          }
        }
      }

      setActiveDrops(prev => {
        const updated = [newDrop, ...prev];
        saveDropsToConfig(updated);
        return updated;
      });

      await startConnection(newDrop, file);

      await window.clipboard.writeText(newDrop.url);
      setText('');
      setFile(null);
    } catch (err: any) {
      console.error('Failed to generate drop link:', err);
      alert(err.message || 'Failed to initialize drop connection.');
    } finally {
      setIsGenerating(false);
    }
  };

  const getRemainingTimeText = (expiresAt: number) => {
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s left`;
    }
    return `${seconds}s left`;
  };

  const getDropSubtitle = (drop: ActiveDrop) => {
    const sizeStr = formatSize(drop.size);
    if (drop.status === 'consumed') {
      return `${sizeStr} • Spent`;
    }
    if (Date.now() > drop.expiresAt) {
      return `${sizeStr} • Expired`;
    }
    return `${sizeStr} • ${getRemainingTimeText(drop.expiresAt)}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%' }}>
      {/* LEFT PANE: Active Drops Monitor */}
      <Box
        sx={{
          width: '320px',
          borderRight: '1px solid var(--color-surface-variant)',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgba(103, 80, 164, 0.04)',
          height: '100%',
        }}
      >
        <Box sx={{ padding: '16px', borderBottom: '1px solid var(--color-surface-variant)' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--color-on-surface)' }}>
            Active Drops
          </Typography>
          <Typography variant="caption" sx={{ color: 'var(--color-on-surface-variant)' }}>
            Links currently hosted in volatile memory
          </Typography>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {activeDrops.length === 0 ? (
            <Box sx={{ py: 6, px: 2, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'var(--color-on-surface-variant)' }}>
                No active drop tunnels open.
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {activeDrops.map((drop) => (
                <ListItem
                  key={drop.sessionId}
                  sx={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    p: 2,
                    gap: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-all', color: 'var(--color-on-surface)' }}>
                        {drop.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>
                        {getDropSubtitle(drop)}
                      </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => forceExpire(drop.sessionId)} sx={{ color: '#ba1a1a', ml: 1 }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    {drop.status === 'pending' && (
                      <Typography variant="caption" sx={{ color: 'var(--color-on-surface-variant)' }}>
                        Waiting for recipient...
                      </Typography>
                    )}
                    {drop.status === 'connecting' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={10} thickness={6} />
                        <Typography variant="caption" sx={{ color: 'var(--color-primary)' }}>
                          Connecting tunnel...
                        </Typography>
                      </Box>
                    )}
                    {drop.status === 'sending' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                        <CircularProgress variant="determinate" value={drop.progress} size={10} thickness={6} />
                        <Typography variant="caption" sx={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                          Streaming: {drop.progress}%
                        </Typography>
                      </Box>
                    )}
                    {drop.status === 'completed' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CheckCircleIcon size={12} sx={{ color: '#4caf50', fontSize: '14px' }} />
                        <Typography variant="caption" sx={{ color: '#4caf50', fontWeight: 600 }}>
                          Delivered! Cleaned up.
                        </Typography>
                      </Box>
                    )}
                    {drop.status === 'consumed' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CheckCircleIcon size={12} sx={{ color: '#4caf50', fontSize: '14px' }} />
                        <Typography variant="caption" sx={{ color: '#4caf50', fontWeight: 600 }}>
                          Spent (Delivered)
                        </Typography>
                      </Box>
                    )}
                    {drop.status === 'failed' && (
                      <Typography variant="caption" sx={{ color: '#ba1a1a', fontWeight: 600 }}>
                        {Date.now() > drop.expiresAt ? 'Expired' : 'Connection lost'}
                      </Typography>
                    )}
                  </Box>

                  <Button
                    variant="text"
                    size="small"
                    startIcon={<ContentCopyIcon sx={{ fontSize: '12px !important' }} />}
                    onClick={async () => {
                      await window.clipboard.writeText(drop.url);
                    }}
                    sx={{
                      alignSelf: 'flex-start',
                      fontSize: '11px',
                      height: '24px',
                      p: 0,
                      mt: 0.5,
                      textTransform: 'none',
                      color: 'var(--color-primary)',
                    }}
                  >
                    Copy Link
                  </Button>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Box>

      {/* RIGHT PANE: Drop Creation Canvas */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--color-surface)',
          padding: '24px',
          height: '100%',
          overflowY: 'auto',
        }}
      >
        <Typography variant="h5" sx={{ fontFamily: 'var(--font-heading)', fontWeight: 600, mb: 0.5 }}>
          Create Void Drop
        </Typography>
        <Typography variant="body2" sx={{ color: 'var(--color-outline)', mb: 3 }}>
          Stream encrypted messages or files directly from your RAM. Nothing is stored on any server.
        </Typography>

        <Paper
          className="glass-panel"
          elevation={0}
          sx={{
            p: 3,
            border: '1px solid var(--glass-border)',
            borderRadius: '24px',
            backgroundColor: 'rgba(255,255,255,0.01)',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            maxWidth: '700px',
            boxSizing: 'border-box',
          }}
        >
          {/* Mode Selector */}
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant={mode === 'text' ? 'contained' : 'outlined'}
              onClick={() => setMode('text')}
              sx={{ px: 3, height: '36px' }}
            >
              Text Note
            </Button>
            <Button
              variant={mode === 'file' ? 'contained' : 'outlined'}
              onClick={() => setMode('file')}
              sx={{ px: 3, height: '36px' }}
            >
              File Stream
            </Button>
          </Box>

          {/* Payload Ingest Input */}
          {mode === 'text' ? (
            <TextField
              multiline
              rows={6}
              fullWidth
              variant="outlined"
              placeholder="Paste raw text or note contents here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '16px',
                  fontFamily: '"JetBrains Mono", "IBM Plex Mono", monospace',
                  fontSize: '13px',
                  backgroundColor: 'var(--color-surface-variant)',
                }
              }}
            />
          ) : (
            <Box
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: `2px dashed ${dragActive ? 'var(--color-primary)' : 'var(--color-outline)'}`,
                borderRadius: '24px',
                p: 5,
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: dragActive ? 'rgba(103, 80, 164, 0.04)' : 'rgba(0, 0, 0, 0.08)',
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: 'rgba(103, 80, 164, 0.02)',
                  borderColor: 'var(--color-primary)',
                }
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
              />
              {file ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <FilePresentIcon sx={{ fontSize: '48px', color: 'var(--color-primary)' }} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {file.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'var(--color-outline)' }}>
                    {formatSize(file.size)}
                  </Typography>
                  <Button
                    variant="text"
                    color="error"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    sx={{ mt: 1, textTransform: 'none' }}
                  >
                    Remove File
                  </Button>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <AttachFileIcon sx={{ fontSize: '48px', color: 'var(--color-outline)' }} />
                  <Typography variant="body2">
                    Drag and drop file here, or <strong>browse files</strong>
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'var(--color-outline)' }}>
                    Supports files up to 500MB
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          <Divider sx={{ borderColor: 'var(--glass-border)' }} />

          {/* Cryptographic Controls */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'var(--color-outline)' }}>
              Security Options
            </Typography>

            <FormControl fullWidth size="small" sx={{ mb: 1, mt: 0.5 }}>
              <InputLabel id="drop-lifetime-label">Link Lifetime</InputLabel>
              <Select
                labelId="drop-lifetime-label"
                value={lifetime}
                label="Link Lifetime"
                onChange={(e) => setLifetime(Number(e.target.value))}
                sx={{ borderRadius: '12px' }}
              >
                <MenuItem value={1800000}>30 Minutes</MenuItem>
                <MenuItem value={3600000}>1 Hour (Default)</MenuItem>
                <MenuItem value={7200000}>2 Hours</MenuItem>
                <MenuItem value={18000000}>5 Hours</MenuItem>
                <MenuItem value={43200000}>12 Hours</MenuItem>
                <MenuItem value={86400000}>24 Hours</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
              <InputLabel id="drop-access-label">Access Limit</InputLabel>
              <Select
                labelId="drop-access-label"
                value={maxAccess}
                label="Access Limit"
                onChange={(e) => setMaxAccess(Number(e.target.value))}
                sx={{ borderRadius: '12px' }}
              >
                <MenuItem value={1}>1 download/view (Default)</MenuItem>
                <MenuItem value={2}>2 downloads/views</MenuItem>
                <MenuItem value={3}>3 downloads/views</MenuItem>
                <MenuItem value={5}>5 downloads/views</MenuItem>
                <MenuItem value={10}>10 downloads/views</MenuItem>
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={gpgSign}
                  onChange={(e) => setGpgSign(e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>Sign payload with GPG key</Typography>
                  <Typography variant="caption" sx={{ color: 'var(--color-outline)', display: 'block' }}>
                    Proves authorship with GnuPG signature block
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={gpgEncrypt}
                  onChange={(e) => setGpgEncrypt(e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>Encrypt with recipient's public key</Typography>
                  <Typography variant="caption" sx={{ color: 'var(--color-outline)', display: 'block' }}>
                    Requires GPG key decryption at recipient side
                  </Typography>
                </Box>
              }
            />

            {gpgEncrypt && (
              <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                <InputLabel id="gpg-recipient-label">Recipient Public Key</InputLabel>
                <Select
                  labelId="gpg-recipient-label"
                  value={recipientKeyId}
                  label="Recipient Public Key"
                  onChange={(e) => setRecipientKeyId(e.target.value)}
                  sx={{ borderRadius: '12px' }}
                >
                  {gpgKeys.length === 0 ? (
                    <MenuItem value="" disabled>No public keys found in GPG</MenuItem>
                  ) : (
                    gpgKeys.map(key => (
                      <MenuItem key={key.keyId} value={key.keyId}>
                        {key.uid} ({key.keyId.substring(8)})
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            )}
          </Box>

          <Divider sx={{ borderColor: 'var(--glass-border)' }} />

          {/* Footer Actions */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            <Button
              variant="contained"
              disabled={isGenerating || (mode === 'text' ? !text.trim() : !file)}
              onClick={generateDrop}
              startIcon={isGenerating ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              sx={{ px: 4, height: '40px' }}
            >
              {isGenerating ? 'Initializing...' : 'Generate & Copy Link'}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
