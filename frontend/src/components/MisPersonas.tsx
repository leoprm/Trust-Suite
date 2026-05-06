import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, UserPlus, QrCode, Link as LinkIcon, Copy, Check,
  Shield, Hash, ChevronDown, X, Loader2, Camera, ArrowRight,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';
import { useTreeStore } from '../store/treeStore';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Contact {
  id: string;
  username: string;
  globalLevel: number;
  strongestSkill: string | null;
  strongestSkillTier: string;
  memberships: { treeId: string; treeName: string; treeIcon: string; role: string }[];
}

interface MisPersonasProps {
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function MisPersonas({ onClose: _onClose }: MisPersonasProps) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-flow state
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<'qr' | 'link'>('qr');
  const [tokenData, setTokenData] = useState<{ token: string; expiresAt: string } | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [copied, setCopied] = useState(false);

  // Invite-to-tree state
  const [inviteTarget, setInviteTarget] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const trees = useTreeStore(s => s.trees);

  // Receive/scan state
  const [codeInput, setCodeInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  // ── Load contacts ────────────────────────────────────────────────────────────
  const fetchContacts = useCallback(() => {
    setLoading(true);
    api.get('/contacts')
      .then(({ data }) => { setContacts(data); setError(null); })
      .catch((e) => setError(e?.response?.data?.error || t('m.people.error_loading')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // ── Generate connection token ────────────────────────────────────────────────
  const generateToken = async () => {
    setGeneratingToken(true);
    setError(null);
    try {
      const { data } = await api.post('/contacts/token');
      setTokenData(data);
    } catch (e: any) {
      console.error('[MisPersonas] token error:', e?.response?.status, e?.response?.data || e.message);
      setError(e?.response?.data?.error || t('m.people.token_error'));
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleShowAdd = () => {
    setShowAdd(true);
    generateToken();
  };

  // ── Copy link ────────────────────────────────────────────────────────────────
  const copyLink = () => {
    if (!tokenData) return;
    const url = `${window.location.origin}/add/${tokenData.token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Connect via token/link ────────────────────────────────────────────────────
  const extractToken = (input: string): string => {
    const trimmed = input.trim();
    // If it's a URL like .../add/TOKEN, extract the token
    const match = trimmed.match(/\/add\/([a-f0-9-]+)/i);
    if (match) return match[1];
    // Otherwise treat the whole input as a token
    return trimmed;
  };

  const connectWithCode = async () => {
    const token = extractToken(codeInput);
    if (!token) return;
    setConnecting(true);
    setError(null);
    setConnectSuccess(null);
    try {
      const { data } = await api.post('/contacts/connect', { token });
      setConnectSuccess(data.connectedWith || t('m.people.connected'));
      setCodeInput('');
      fetchContacts();
      setTimeout(() => setConnectSuccess(null), 3000);
    } catch (e: any) {
      setError(e?.response?.data?.error || t('m.people.connect_error'));
    } finally {
      setConnecting(false);
    }
  };

  // ── QR Scanner ──────────────────────────────────────────────────────────────
  const stopScanner = useCallback(() => {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setScanning(false);
  }, []);

  const startScanner = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setScanning(true);
      // Wait for the video element to mount
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          // Use BarcodeDetector if available
          if ('BarcodeDetector' in window) {
            const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
            scanIntervalRef.current = window.setInterval(async () => {
              if (!videoRef.current || videoRef.current.readyState < 2) return;
              try {
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes.length > 0) {
                  const value = barcodes[0].rawValue;
                  stopScanner();
                  setCodeInput(value);
                  // Auto-connect
                  const token = extractToken(value);
                  if (token) {
                    setConnecting(true);
                    try {
                      const { data } = await api.post('/contacts/connect', { token });
                      setConnectSuccess(data.connectedWith || t('m.people.connected'));
                      fetchContacts();
                      setTimeout(() => setConnectSuccess(null), 3000);
                    } catch (e: any) {
                      setError(e?.response?.data?.error || t('m.people.connect_error'));
                    } finally {
                      setConnecting(false);
                    }
                  }
                }
              } catch { /* ignore detection errors */ }
            }, 500);
          } else {
            // No BarcodeDetector: show camera for manual positioning, user can type code
            setError(t('m.people.no_qr_support'));
            stopScanner();
          }
        }
      }, 100);
    } catch {
      setError(t('m.people.camera_error'));
    }
  };

  // Cleanup scanner on unmount
  useEffect(() => { return () => stopScanner(); }, [stopScanner]);

  // ── Invite contact to tree ───────────────────────────────────────────────────
  const inviteToTree = async (contactId: string, treeId: string) => {
    setInviting(true);
    try {
      await api.post(`/trees/${treeId}/invite`, { userId: contactId });
      setInviteTarget(null);
    } catch (e: any) {
      setError(e?.response?.data?.error || t('m.people.invite_error'));
    } finally {
      setInviting(false);
    }
  };

  const connectionUrl = tokenData ? `${window.location.origin}/add/${tokenData.token}` : '';

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>

      {/* Pretext */}
      <div style={{
        padding: '0.65rem 0.8rem', borderRadius: 12,
        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)',
        fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5,
      }}>
        <Users size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4, color: '#22c55e' }} />
        {t('m.people.pretext')}
      </div>

      {/* Add Button */}
      <button
        onClick={handleShowAdd}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          padding: '0.7rem', borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.08))',
          border: '1px solid rgba(34,197,94,0.3)',
          cursor: 'pointer', color: '#22c55e', fontSize: '0.78rem', fontWeight: 600,
          transition: 'all 0.15s',
        }}
      >
        <UserPlus size={18} />
        {t('m.people.new_handshake')}
      </button>

      {/* ── Add Flow Modal ──────────────────────────────────────────────────── */}
      {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div style={{
              padding: '0.8rem', borderRadius: 14,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', flexDirection: 'column', gap: '0.6rem',
            }}>
              {/* Close */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>{t('m.people.share_link')}</span>
                <button onClick={() => { setShowAdd(false); setTokenData(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
                  <X size={16} />
                </button>
              </div>

              {/* Pretext instruction */}
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                {t('m.people.share_instruction')}
              </div>

              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {(['qr', 'link'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setAddMode(mode)}
                    style={{
                      flex: 1, padding: '0.45rem', borderRadius: 10,
                      background: addMode === mode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${addMode === mode ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.06)'}`,
                      cursor: 'pointer', color: addMode === mode ? '#22c55e' : 'rgba(255,255,255,0.5)',
                      fontSize: '0.7rem', fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                    }}
                  >
                    {mode === 'qr' ? <QrCode size={14} /> : <LinkIcon size={14} />}
                    {mode === 'qr' ? t('m.people.qr_code') : t('m.people.link')}
                  </button>
                ))}
              </div>

              {/* Content */}
              {generatingToken ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
                  <Loader2 size={24} className="animate-spin" style={{ color: 'rgba(255,255,255,0.3)', animation: 'spin 1s linear infinite' }} />
                </div>
              ) : tokenData ? (
                addMode === 'qr' ? (
                  <div style={{
                    display: 'flex', justifyContent: 'center', padding: '1rem',
                    background: '#fff', borderRadius: 12,
                  }}>
                    <QRCode value={connectionUrl} size={180} />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{
                      padding: '0.6rem 0.75rem', borderRadius: 10,
                      background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                      fontSize: '0.62rem', color: 'rgba(255,255,255,0.6)',
                      wordBreak: 'break-all', fontFamily: 'monospace',
                    }}>
                      {connectionUrl}
                    </div>
                    <button
                      onClick={copyLink}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                        padding: '0.55rem', borderRadius: 10,
                        background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        cursor: 'pointer', color: copied ? '#22c55e' : '#fff',
                        fontSize: '0.72rem', fontWeight: 600,
                      }}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? t('m.people.copied') : t('m.people.copy_link')}
                    </button>
                  </div>
                )
              ) : null}
            </div>
          </motion.div>
        )}

      {/* ── Receive / Scan Section ──────────────────────────────────────────── */}
      <div style={{
        padding: '0.7rem', borderRadius: 14,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', gap: '0.5rem',
      }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
          {t('m.people.receive_connection')}
        </span>

        {/* Camera scanner */}
        {scanning && (
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
            <video
              ref={videoRef}
              style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 12 }}
              playsInline
              muted
            />
            <button
              onClick={stopScanner}
              style={{
                position: 'absolute', top: 8, right: 8,
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(0,0,0,0.6)', border: 'none',
                cursor: 'pointer', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>
            <div style={{
              position: 'absolute', bottom: 8, left: 0, right: 0,
              textAlign: 'center', fontSize: '0.6rem', color: 'rgba(255,255,255,0.7)',
            }}>
              {t('m.people.point_qr')}
            </div>
          </div>
        )}

        {/* Input + buttons row */}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            onClick={startScanner}
            disabled={scanning}
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
              cursor: scanning ? 'not-allowed' : 'pointer', color: '#22c55e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: scanning ? 0.5 : 1,
            }}
            title={t('m.people.scan_qr')}
          >
            <Camera size={18} />
          </button>
          <input
            type="text"
            value={codeInput}
            onChange={e => setCodeInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') connectWithCode(); }}
            placeholder={t('m.people.paste_placeholder')}
            style={{
              flex: 1, padding: '0 0.65rem', borderRadius: 10, height: 38,
              background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#fff', fontSize: '0.68rem', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={connectWithCode}
            disabled={!codeInput.trim() || connecting}
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: codeInput.trim() ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${codeInput.trim() ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
              cursor: !codeInput.trim() || connecting ? 'not-allowed' : 'pointer',
              color: codeInput.trim() ? '#22c55e' : 'rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: connecting ? 0.5 : 1,
            }}
            title={t('m.people.connect_btn')}
          >
            {connecting ? (
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <ArrowRight size={16} />
            )}
          </button>
        </div>

        {/* Success feedback */}
        {connectSuccess && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.45rem 0.65rem', borderRadius: 10,
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
            fontSize: '0.68rem', color: '#22c55e',
          }}>
            <Check size={14} />
            {t('m.people.connection_success')} <strong>{connectSuccess}</strong>
          </div>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          padding: '0.5rem 0.7rem', borderRadius: 10,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          fontSize: '0.68rem', color: '#ef4444',
        }}>
          {error}
        </div>
      )}

      {/* ── Contact List ────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
          {t('m.people.loading')}
        </div>
      ) : contacts.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '2rem', gap: '0.5rem', opacity: 0.5,
        }}>
          <Users size={32} color="rgba(255,255,255,0.3)" />
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{t('m.people.no_people')}</span>
          <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)' }}>{t('m.people.no_people_hint')}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {contacts.map(contact => (
            <div
              key={contact.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.65rem',
                padding: '0.65rem 0.75rem', borderRadius: 14,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(59,130,246,0.2))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.85rem', fontWeight: 700, color: '#fff',
                flexShrink: 0,
              }}>
                {contact.username.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>
                    {contact.username}
                  </span>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 2,
                    fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)',
                  }}>
                    <Shield size={10} />
                    {t('m.people.level_label', { level: contact.globalLevel })}
                  </div>
                </div>
                {contact.strongestSkill && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    fontSize: '0.62rem',
                    color: contact.strongestSkillTier === 'ELITE_DORADO' ? '#fbbf24' : '#22c55e',
                    marginTop: 2,
                    ...(contact.strongestSkillTier === 'ELITE_DORADO' ? { textShadow: '0 0 6px rgba(251,191,36,0.4)' } : {}),
                  }}>
                    {contact.strongestSkillTier === 'ELITE_DORADO' ? '✦' : <Hash size={10} />}
                    {contact.strongestSkillTier === 'ELITE_DORADO' ? ` @${contact.strongestSkill.replace('#', '')}` : contact.strongestSkill.replace('#', '')}
                  </div>
                )}
              </div>

              {/* Invite button */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => setInviteTarget(inviteTarget === contact.id ? null : contact.id)}
                  style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
                    cursor: 'pointer', color: '#22c55e',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title={t('m.people.invite_tree')}
                >
                  <UserPlus size={14} />
                </button>

                {/* Tree dropdown */}
                <AnimatePresence>
                  {inviteTarget === contact.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -4 }}
                      style={{
                        position: 'absolute', top: '100%', right: 0, marginTop: 4,
                        background: 'rgba(20,20,35,0.95)', backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
                        padding: '0.3rem', minWidth: 160, zIndex: 100,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      }}
                    >
                      {trees.length === 0 ? (
                        <div style={{ padding: '0.5rem', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                          {t('m.people.no_trees')}
                        </div>
                      ) : trees.map((tree: any) => (
                        <button
                          key={tree.id}
                          onClick={() => inviteToTree(contact.id, tree.id)}
                          disabled={inviting}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            width: '100%', padding: '0.45rem 0.6rem', borderRadius: 8,
                            background: 'transparent', border: 'none',
                            cursor: inviting ? 'not-allowed' : 'pointer', color: '#fff',
                            fontSize: '0.7rem', textAlign: 'left',
                            opacity: inviting ? 0.5 : 1,
                          }}
                          onPointerDown={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                          onPointerUp={e => (e.currentTarget.style.background = 'transparent')}
                          onPointerLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span>{tree.icono || '🌳'}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tree.name}
                          </span>
                          <ChevronDown size={12} style={{ transform: 'rotate(-90deg)', opacity: 0.4 }} />
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Spin keyframe (inline for QR loading) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
