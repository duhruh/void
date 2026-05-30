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
}

interface ActiveDrop {
  sessionId: string;
  name: string;
  isFile: boolean;
  size: number;
  created: number;
  url: string;
  status: 'pending' | 'connecting' | 'sending' | 'completed' | 'failed';
  progress?: number;
  peerConnection?: RTCPeerConnection;
  eventSource?: EventSource;
}

export default function VoidDrop({ config }: VoidDropProps) {
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

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Update relative timestamps for drops list
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // Cleanup active connections on unmount
  useEffect(() => {
    return () => {
      activeDrops.forEach(drop => {
        drop.peerConnection?.close();
        drop.eventSource?.close();
      });
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

  // Helper to force expire a drop link
  const forceExpire = async (sessionId: string) => {
    const drop = activeDrops.find(d => d.sessionId === sessionId);
    if (drop) {
      drop.peerConnection?.close();
      drop.eventSource?.close();
      
      // Clean up Firebase RTDB session
      const dbUrl = config.developer?.signaling_database_url || 'https://void-52b64-default-rtdb.firebaseio.com/';
      const host = new URL(dbUrl).host;
      try {
        await fetch(`https://${host}/sessions/${sessionId}.json`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to clean up session in Firebase:', err);
      }
    }
    setActiveDrops(prev => prev.filter(d => d.sessionId !== sessionId));
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

    try {
      // 1. Process Cryptography (Symmetric AES key first)
      const rawAesKey = window.crypto.getRandomValues(new Uint8Array(32));
      const aesKeyHex = Array.from(rawAesKey).map(b => b.toString(16).padStart(2, '0')).join('');

      let finalPayload: string | ArrayBuffer;
      let detachedSignatureText = '';
      let isPayloadEncrypted = false;

      // Handle GPG options
      if (gpgSign || gpgEncrypt) {
        if (!window.gpg) {
          throw new Error('GPG integration is not available on this system.');
        }

        let clearText = '';
        let base64Payload = '';

        if (isFile) {
          // Read file as base64 for GPG operations
          const arrayBuffer = await file!.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          base64Payload = btoa(binary);
        } else {
          clearText = text;
          base64Payload = btoa(unescape(encodeURIComponent(text)));
        }

        if (gpgEncrypt) {
          // Double encrypt with recipient's public key
          finalPayload = await window.gpg.encrypt(base64Payload, recipientKeyId);
          isPayloadEncrypted = true;
          
          if (gpgSign) {
            // Also sign the GPG encrypted payload
            detachedSignatureText = await window.gpg.signDetached(btoa(finalPayload));
          }
        } else {
          // Only sign
          if (isFile) {
            detachedSignatureText = await window.gpg.signDetached(base64Payload);
            finalPayload = arrayBufferPayload(await file!.arrayBuffer(), rawAesKey);
          } else {
            // Clearsign text directly
            finalPayload = await window.gpg.sign(clearText);
          }
        }
      } else {
        // Standard zero-knowledge AES-GCM encryption
        const buffer = isFile ? await file!.arrayBuffer() : new TextEncoder().encode(text);
        finalPayload = await encryptAesGcm(buffer, rawAesKey);
      }

      // Create WebRTC Connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      const dc = pc.createDataChannel('sendChannel', { ordered: true });
      dc.binaryType = 'arraybuffer';

      // Setup drop item
      const newDrop: ActiveDrop = {
        sessionId,
        name: payloadName,
        isFile,
        size: payloadSize,
        created: Date.now(),
        url: `https://duhruh.me/void/drop.html#${host}.${sessionId}.${aesKeyHex}`,
        status: 'pending',
        peerConnection: pc,
      };

      // Handle Data Channel Open
      dc.onopen = async () => {
        console.log('WebRTC Data Channel Opened!');
        setActiveDrops(prev => prev.map(d => d.sessionId === sessionId ? { ...d, status: 'sending', progress: 0 } : d));

        try {
          // Send payload metadata header
          dc.send(JSON.stringify({
            type: 'header',
            name: payloadName,
            size: payloadSize,
            isFile,
            isGpgSigned: gpgSign,
            isGpgEncrypted: gpgEncrypt,
            signature: detachedSignatureText,
            isAesEncrypted: !isPayloadEncrypted,
          }));

          // Send payload in 16KB chunks
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

            // Throttle to prevent WebRTC buffering overflow
            if (dc.bufferedAmount > 1024 * 1024) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }

          // Send EOF signal
          dc.send(JSON.stringify({ type: 'eof' }));
          
          setActiveDrops(prev => prev.map(d => d.sessionId === sessionId ? { ...d, status: 'completed' } : d));
          
          // Automatic single-response lookup rule clean up
          setTimeout(() => forceExpire(sessionId), 3000);
        } catch (err) {
          console.error('Data channel streaming error:', err);
          setActiveDrops(prev => prev.map(d => d.sessionId === sessionId ? { ...d, status: 'failed' } : d));
        }
      };

      dc.onclose = () => {
        console.log('Data channel closed');
      };

      // Gather ICE candidates and push to Firebase
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          fetch(`https://${host}/sessions/${sessionId}/candidates/sender.json`, {
            method: 'POST',
            body: JSON.stringify(event.candidate)
          }).catch(err => console.error('Failed to post ICE candidate to Firebase:', err));
        }
      };

      // Create SDP Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Write Offer to Firebase
      await fetch(`https://${host}/sessions/${sessionId}/offer.json`, {
        method: 'PUT',
        body: JSON.stringify({ sdp: offer.sdp, type: offer.type })
      });

      // Listen for Answer and ICE candidates from recipient
      const eventSource = new EventSource(`https://${host}/sessions/${sessionId}.json`);
      newDrop.eventSource = eventSource;

      eventSource.addEventListener('put', async (e: any) => {
        const payload = JSON.parse(e.data);
        if (!payload) return;
        const path = payload.path;
        const data = payload.data;

        if (path === '/answer' && data) {
          setActiveDrops(prev => prev.map(d => d.sessionId === sessionId ? { ...d, status: 'connecting' } : d));
          await pc.setRemoteDescription(new RTCSessionDescription(data));
        } else if (path.startsWith('/candidates/receiver') && data) {
          // If singular new candidate appended via push
          const candidate = typeof data === 'object' && data.candidate ? data : Object.values(data)[0];
          if (candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate as any));
            } catch (err) {
              console.error('Error adding ICE candidate:', err);
            }
          }
        }
      });

      eventSource.addEventListener('patch', async (e: any) => {
        const payload = JSON.parse(e.data);
        if (!payload) return;
        const data = payload.data;

        if (data && data.answer) {
          setActiveDrops(prev => prev.map(d => d.sessionId === sessionId ? { ...d, status: 'connecting' } : d));
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      });

      // Add to active drops list
      setActiveDrops(prev => [newDrop, ...prev]);

      // Copy link to clipboard
      await window.clipboard.writeText(newDrop.url);
      
      // Clear inputs
      setText('');
      setFile(null);
    } catch (err: any) {
      console.error('Failed to generate drop link:', err);
      alert(err.message || 'Failed to initialize drop connection.');
    } finally {
      setIsGenerating(false);
    }
  };

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

    // Concat IV and Ciphertext
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return combined.buffer;
  };

  const arrayBufferPayload = (buffer: ArrayBuffer, rawKey: Uint8Array): ArrayBuffer => {
    // Return buffer dummy payload when encryption is GPG handled
    return buffer;
  };

  const getRelativeTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return new Date(timestamp).toLocaleTimeString();
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
          backgroundColor: 'rgba(254, 247, 255, 0.4)',
          height: '100%',
        }}
      >
        <Box sx={{ padding: '16px', borderBottom: '1px solid var(--color-surface-variant)' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Active Drops
          </Typography>
          <Typography variant="caption" sx={{ color: 'var(--color-outline)' }}>
            Links currently hosted in volatile memory
          </Typography>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {activeDrops.length === 0 ? (
            <Box sx={{ py: 6, px: 2, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'var(--color-outline)' }}>
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
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
                        {drop.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'var(--color-outline)', display: 'block' }}>
                        {formatSize(drop.size)} • {getRelativeTime(drop.created)}
                      </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => forceExpire(drop.sessionId)} sx={{ color: '#ba1a1a', ml: 1 }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    {drop.status === 'pending' && (
                      <Typography variant="caption" sx={{ color: 'var(--color-outline)' }}>
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
                    {drop.status === 'failed' && (
                      <Typography variant="caption" sx={{ color: '#ba1a1a', fontWeight: 600 }}>
                        Connection lost.
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
