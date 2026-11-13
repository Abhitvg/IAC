import React, { useState } from 'react';
import {
  Mail,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  X,
  Lock,
  Globe,
  RefreshCw,
  HelpCircle,
  Check,
} from 'lucide-react';
import { useControlsStore } from '../../store/useControlsStore';
import { useCareerOpsOnboardingStore } from '../../store/useCareerOpsOnboardingStore';

interface GmailConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (email: string) => void;
}

export const GmailConnectModal: React.FC<GmailConnectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { connectors, connectGmailAccount, disconnectConnector } = useControlsStore();
  const { updatePreferences } = useCareerOpsOnboardingStore();

  const gmailConnector = connectors.find((c) => c.id === 'gmail');
  const isConnected = gmailConnector?.status === 'connected';
  const currentEmail = gmailConnector?.accountEmail || '';

  const [activeTab, setActiveTab] = useState<'app_password' | 'oauth' | 'sandbox'>('app_password');
  const [emailInput, setEmailInput] = useState(currentEmail && currentEmail !== 'candidate@domain.com' ? currentEmail : '');
  const [appPasswordInput, setAppPasswordInput] = useState('');
  const [oauthTokenInput, setOauthTokenInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  if (!isOpen) return null;

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  const handleConnectAppPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const trimmedEmail = emailInput.trim();
    if (!validateEmail(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address (e.g. name@gmail.com).');
      return;
    }

    const cleanedPassword = appPasswordInput.replace(/\s+/g, '');
    if (!cleanedPassword || cleanedPassword.length < 8) {
      setErrorMessage(
        'Please enter your 16-character Google App Password generated from myaccount.google.com/apppasswords.'
      );
      return;
    }

    setIsVerifying(true);
    setStatusMessage('Verifying credentials against Google SMTP/IMAP servers...');

    const res = await connectGmailAccount(trimmedEmail, 'app_password', cleanedPassword);
    setIsVerifying(false);

    if (res.success) {
      setStatusMessage(`✓ Successfully connected as ${trimmedEmail}!`);
      updatePreferences({ email: trimmedEmail });
      if (onSuccess) onSuccess(trimmedEmail);
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setErrorMessage(res.error || 'Failed to authenticate with Google servers. Please verify the App Password.');
      setStatusMessage(null);
    }
  };

  const handleConnectOAuth = async () => {
    setErrorMessage(null);
    setStatusMessage(null);

    const trimmedEmail = emailInput.trim();
    if (!validateEmail(trimmedEmail)) {
      setErrorMessage('Please enter your Google email address before launching OAuth.');
      return;
    }

    setIsVerifying(true);
    setStatusMessage('Initiating Google OAuth 2.0 Web Flow...');

    // If an OAuth access token was manually supplied or browser flow selected
    const res = await connectGmailAccount(trimmedEmail, 'oauth', oauthTokenInput.trim() || undefined);
    setIsVerifying(false);

    if (res.success) {
      setStatusMessage(`✓ Successfully authorized Google OAuth for ${trimmedEmail}!`);
      updatePreferences({ email: trimmedEmail });
      if (onSuccess) onSuccess(trimmedEmail);
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setErrorMessage(res.error || 'Google OAuth authorization did not complete.');
      setStatusMessage(null);
    }
  };

  const handleConnectSandbox = async () => {
    setErrorMessage(null);
    setStatusMessage(null);

    const trimmedEmail = emailInput.trim() || 'candidate.demo@gmail.com';
    if (!validateEmail(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setIsVerifying(true);
    setStatusMessage('Connecting in local simulated sandbox mode...');

    const res = await connectGmailAccount(trimmedEmail, 'sandbox');
    setIsVerifying(false);

    if (res.success) {
      setStatusMessage(`✓ Connected in local sandbox mode for ${trimmedEmail}!`);
      updatePreferences({ email: trimmedEmail });
      if (onSuccess) onSuccess(trimmedEmail);
      setTimeout(() => {
        onClose();
      }, 900);
    } else {
      setErrorMessage('Failed to activate sandbox connection.');
    }
  };

  const handleDisconnect = async () => {
    setIsVerifying(true);
    await disconnectConnector('gmail');
    setIsVerifying(false);
    setStatusMessage('Gmail account has been disconnected.');
    setEmailInput('');
    setAppPasswordInput('');
    setOauthTokenInput('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gmail-connect-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(2, 6, 23, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
          color: '#f8fafc',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            background: 'rgba(30, 41, 59, 0.6)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Mail size={20} color="#38bdf8" />
            </div>
            <div>
              <h2 id="gmail-connect-title" style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                Connect Gmail / Google Workspace
              </h2>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                Monitor recruiter replies, sync interview booking links, and send verified outreach.
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Current Connection Status Ribbon */}
        {isConnected && currentEmail && currentEmail !== 'candidate@domain.com' ? (
          <div
            style={{
              padding: '12px 24px',
              background: 'rgba(16, 185, 129, 0.12)',
              borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#86efac' }}>
              <CheckCircle2 size={16} color="#10b981" />
              <span>
                Currently connected as <strong>{currentEmail}</strong>
              </span>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={isVerifying}
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#fca5a5',
                cursor: 'pointer',
              }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: '10px 24px',
              background: 'rgba(245, 158, 11, 0.08)',
              borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: '#fbbf24',
            }}
          >
            <AlertCircle size={14} color="#f59e0b" />
            <span>Gmail is not yet connected. Choose an authentication method below to connect your account.</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            padding: '12px 24px 0 24px',
            gap: '8px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {[
            {
              id: 'app_password',
              label: '🔑 Google App Password (Recommended)',
              desc: 'Instant, reliable connection via Google 16-char code',
            },
            {
              id: 'oauth',
              label: '🌐 Google OAuth 2.0',
              desc: 'Sign in with Google OAuth consent screen',
            },
            {
              id: 'sandbox',
              label: '🧪 Local Sandbox / Demo',
              desc: 'Test email workflows offline with mock sync',
            },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setErrorMessage(null);
                  setStatusMessage(null);
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px 8px 0 0',
                  background: isActive ? 'rgba(30, 41, 59, 0.7)' : 'transparent',
                  borderTop: isActive ? '2px solid #6366f1' : '2px solid transparent',
                  borderLeft: isActive ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                  borderRight: isActive ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                  borderBottom: 'none',
                  color: isActive ? '#f8fafc' : '#94a3b8',
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {/* TAB 1: GOOGLE APP PASSWORD */}
          {activeTab === 'app_password' && (
            <form onSubmit={handleConnectAppPassword} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                    How to get your 16-character Google App Password:
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHelp(!showHelp)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#818cf8',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <HelpCircle size={12} /> {showHelp ? 'Hide guide' : 'Show step-by-step'}
                  </button>
                </div>

                <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.6 }}>
                  1. Visit{' '}
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#38bdf8', textDecoration: 'underline' }}
                  >
                    myaccount.google.com/apppasswords <ExternalLink size={10} style={{ display: 'inline' }} />
                  </a>{' '}
                  (make sure 2-Step Verification is enabled).
                  <br />
                  2. Type an App name such as <strong>CareerOps</strong> and click <strong>Create</strong>.
                  <br />
                  3. Google will show a 16-letter code (e.g. <code>abcd efgh ijkl mnop</code>). Paste it below:
                </div>
              </div>

              <div>
                <label
                  htmlFor="gmail-email-input"
                  style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}
                >
                  Your Gmail or Google Workspace Address
                </label>
                <input
                  id="gmail-email-input"
                  type="email"
                  placeholder="alex.mercer@gmail.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label htmlFor="gmail-password-input" style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
                    16-Character Google App Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}
                  >
                    {showPassword ? 'Hide code' : 'Show code'}
                  </button>
                </div>
                <input
                  id="gmail-password-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="xxxx xxxx xxxx xxxx"
                  value={appPasswordInput}
                  onChange={(e) => setAppPasswordInput(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    letterSpacing: '1px',
                  }}
                />
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                  Protected by safe encryption. Stored locally on your machine with zero external leaks.
                </div>
              </div>

              {/* Status and Error Banners */}
              {statusMessage && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#86efac',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Check size={14} /> {statusMessage}
                </div>
              )}

              {errorMessage && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#fca5a5',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertCircle size={14} /> {errorMessage}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  style={{
                    padding: '8px 20px',
                    background: '#6366f1',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#ffffff',
                    cursor: isVerifying ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {isVerifying ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
                  {isVerifying ? 'Verifying...' : 'Verify & Connect Gmail'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: GOOGLE OAUTH 2.0 */}
          {activeTab === 'oauth' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>
                  Google OAuth 2.0 Authentication
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                  Authorizes CareerOps to access your Gmail inbox via Google OAuth tokens.
                  Requires permissions: <code>gmail.send</code> and <code>gmail.readonly</code>.
                </div>
              </div>

              <div>
                <label
                  htmlFor="oauth-email-input"
                  style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}
                >
                  Google Account Email
                </label>
                <input
                  id="oauth-email-input"
                  type="email"
                  placeholder="your.email@gmail.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="oauth-token-input"
                  style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}
                >
                  OAuth Access Token or Client Secret (Optional / Advanced)
                </label>
                <input
                  id="oauth-token-input"
                  type="text"
                  placeholder="ya29.a0AfH6SM... or leave blank for browser flow"
                  value={oauthTokenInput}
                  onChange={(e) => setOauthTokenInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              {/* Status and Error Banners */}
              {statusMessage && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#86efac',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Check size={14} /> {statusMessage}
                </div>
              )}

              {errorMessage && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#fca5a5',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertCircle size={14} /> {errorMessage}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConnectOAuth}
                  disabled={isVerifying}
                  style={{
                    padding: '8px 20px',
                    background: '#0ea5e9',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#ffffff',
                    cursor: isVerifying ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {isVerifying ? <RefreshCw size={14} className="animate-spin" /> : <Globe size={14} />}
                  {isVerifying ? 'Authorizing...' : 'Authorize Google OAuth'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: SANDBOX / DEMO */}
          {activeTab === 'sandbox' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>
                  Local Sandbox / Offline Mode
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                  Connect your preferred email address in local sandbox mode. This enables full simulation of recruiter
                  replies, interview detection, and draft composition without requiring external Google server access.
                </div>
              </div>

              <div>
                <label
                  htmlFor="sandbox-email-input"
                  style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}
                >
                  Candidate Email Address
                </label>
                <input
                  id="sandbox-email-input"
                  type="email"
                  placeholder="your.name@gmail.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '13px',
                  }}
                />
              </div>

              {statusMessage && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#86efac',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Check size={14} /> {statusMessage}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConnectSandbox}
                  disabled={isVerifying}
                  style={{
                    padding: '8px 20px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.5)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#c7d2fe',
                    cursor: isVerifying ? 'wait' : 'pointer',
                  }}
                >
                  {isVerifying ? 'Connecting...' : 'Connect in Sandbox Mode'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
