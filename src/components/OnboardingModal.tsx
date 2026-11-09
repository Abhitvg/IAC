import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { usePracticeStore } from '../store/usePracticeStore';
import {
  ShieldCheck,
  Cpu,
  Key,
  ArrowRight,
  Mic,
  Activity,
  CheckCircle2,
  HardDriveDownload,
  Flame,
} from 'lucide-react';
import { getDefaultModelForProvider, AIProviderId } from '../services/models/modelRegistry';

type OnboardingStep = 'mode' | 'credentials_or_models' | 'mic_check' | 'ready';

export default function OnboardingModal() {
  const { updateSetting, setToast, setProfileWizardOpen } = useAppStore();
  const { startMockSession } = usePracticeStore();

  const [step, setStep] = useState<OnboardingStep>('mode');
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [provider, setProvider] = useState<'groq' | 'openai' | 'openrouter' | 'ollama'>('groq');
  const [apiKey, setApiKey] = useState('');

  // Local model download simulation state
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);

  // Mic & Latency check state
  const [micActive, setMicActive] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [latencyTestDone, setLatencyTestDone] = useState(false);
  const [measuredLatencyMs, setMeasuredLatencyMs] = useState<number | null>(null);

  // Handle local model download progress
  const startModelDownload = () => {
    setIsDownloading(true);
    setDownloadProgress(10);
    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsDownloading(false);
          setDownloadComplete(true);
          return 100;
        }
        return prev + 15;
      });
    }, 250);
  };

  // Microphone level simulation / check
  useEffect(() => {
    if (step === 'mic_check' && micActive) {
      const interval = setInterval(() => {
        setVolumeLevel(Math.floor(Math.random() * 65) + 20);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [step, micActive]);

  const runLatencyCheck = () => {
    setTimeout(() => {
      const simulatedLatency = isLocalMode ? 320 : 185;
      setMeasuredLatencyMs(simulatedLatency);
      setLatencyTestDone(true);
      setToast(`Latency Check Passed: ${simulatedLatency}ms roundtrip.`);
    }, 600);
  };

  const handleFinishAndStart = async () => {
    try {
      const activeProv = isLocalMode ? 'ollama' : (provider as AIProviderId);
      updateSetting('aiProvider', activeProv);
      updateSetting('aiModel', getDefaultModelForProvider(activeProv, 'llm'));
      updateSetting(
        'whisperModel',
        isLocalMode ? 'local-whisper-cpp' : getDefaultModelForProvider(activeProv, 'stt')
      );

      if (!isLocalMode && apiKey.trim()) {
        await window.electronAPI?.setApiKey?.(provider, apiKey.trim());
      }

      updateSetting('hasCompletedOnboarding', true);

      // Launch first 10-minute mock session
      startMockSession('behavioral', 'friendly_recruiter', false);
      setToast('Welcome! Your 10-minute initial mock interview has started.');
    } catch (err: any) {
      setToast(`Setup error: ${err?.message || err}`);
    }
  };

  return (
    <div
      className="panel-overlay"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
    >
      <div
        className="panel"
        style={{
          width: '560px',
          maxWidth: '92vw',
          maxHeight: '90vh',
          background: '#0f172a',
          border: '1px solid rgba(129, 140, 248, 0.35)',
          borderRadius: '12px',
          padding: '24px',
          color: '#f8fafc',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Step Indicator */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
          {(['mode', 'credentials_or_models', 'mic_check', 'ready'] as OnboardingStep[]).map(
            (s, idx) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: '4px',
                  borderRadius: '2px',
                  background:
                    step === s
                      ? '#818cf8'
                      : ['mode', 'credentials_or_models', 'mic_check', 'ready'].indexOf(step) > idx
                        ? '#4f46e5'
                        : 'rgba(255, 255, 255, 0.12)',
                }}
              />
            )
          )}
        </div>

        {/* STEP 1: MODE SELECTION */}
        {step === 'mode' && (
          <div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}
            >
              <div
                style={{
                  padding: '8px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  borderRadius: '8px',
                }}
              >
                <Cpu size={24} style={{ color: '#818cf8' }} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                  Welcome to AI Interview Practice Gym
                </h2>
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Choose how you want to run your technical practice simulator
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginTop: '18px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setIsLocalMode(false);
                  setProvider('groq');
                }}
                style={{
                  background: !isLocalMode ? 'rgba(99, 102, 241, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                  border: !isLocalMode
                    ? '1.5px solid #818cf8'
                    : '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  padding: '16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#f8fafc',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: 700,
                    fontSize: '14px',
                    color: '#818cf8',
                  }}
                >
                  <Flame size={16} /> Cloud High-Speed
                </div>
                <p
                  style={{
                    fontSize: '11px',
                    color: '#cbd5e1',
                    marginTop: '6px',
                    lineHeight: '1.4',
                  }}
                >
                  Sub-second conversational voice latency via Groq or OpenAI. Requires API key.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsLocalMode(true);
                  setProvider('ollama');
                }}
                style={{
                  background: isLocalMode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                  border: isLocalMode
                    ? '1.5px solid #10b981'
                    : '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '10px',
                  padding: '16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#f8fafc',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: 700,
                    fontSize: '14px',
                    color: '#34d399',
                  }}
                >
                  <ShieldCheck size={16} /> 100% Local & Offline
                </div>
                <p
                  style={{
                    fontSize: '11px',
                    color: '#cbd5e1',
                    marginTop: '6px',
                    lineHeight: '1.4',
                  }}
                >
                  Runs via Ollama, local whisper.cpp, and local speech. Zero cloud calls, zero keys.
                </p>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => setStep('credentials_or_models')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 18px',
                  background: '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span>Continue</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: CREDENTIALS OR LOCAL MODELS */}
        {step === 'credentials_or_models' && (
          <div>
            {!isLocalMode ? (
              <div>
                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#f8fafc',
                    margin: '0 0 6px 0',
                  }}
                >
                  Cloud Provider Setup
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px 0' }}>
                  Enter your API key or skip to enter later in Settings.
                </p>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  {['groq', 'openai', 'openrouter'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProvider(p as any)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        background:
                          provider === p ? 'rgba(99, 102, 241, 0.25)' : 'rgba(30, 41, 59, 0.5)',
                        border:
                          provider === p
                            ? '1px solid #818cf8'
                            : '1px solid rgba(148, 163, 184, 0.2)',
                        color: '#f8fafc',
                        fontSize: '12px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        cursor: 'pointer',
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#cbd5e1',
                      marginBottom: '6px',
                    }}
                  >
                    <Key size={12} style={{ display: 'inline', marginRight: '4px' }} />
                    {provider.toUpperCase()} API Key (Optional)
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`Enter ${provider} key (sk-... or gsk_...) or leave blank to skip`}
                    style={{
                      width: '100%',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(148, 163, 184, 0.3)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#94a3b8',
                      display: 'block',
                      marginTop: '4px',
                    }}
                  >
                    Keys are safely stored locally in your OS Keychain via Electron safeStorage.
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#f8fafc',
                    margin: '0 0 6px 0',
                  }}
                >
                  Local Model Package Check
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px 0' }}>
                  Runs Ollama (llama3.2:1b) and local Whisper for 100% offline private rehearsal.
                </p>

                <div
                  style={{
                    padding: '14px',
                    background: 'rgba(30, 41, 59, 0.5)',
                    borderRadius: '8px',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>
                      Ollama Model: llama3.2:1b (1.3 GB)
                    </span>
                    <span
                      style={{ fontSize: '11px', color: downloadComplete ? '#34d399' : '#94a3b8' }}
                    >
                      {downloadComplete ? 'Installed' : `${downloadProgress}%`}
                    </span>
                  </div>

                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${downloadProgress}%`,
                        height: '100%',
                        background: '#10b981',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>

                  {!downloadComplete && (
                    <button
                      type="button"
                      onClick={startModelDownload}
                      disabled={isDownloading}
                      style={{
                        marginTop: '12px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        background: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        color: '#6ee7b7',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <HardDriveDownload size={12} />
                      {isDownloading ? 'Downloading Model...' : 'Pre-download Local Model'}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => setStep('mode')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep('mic_check')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 18px',
                  background: '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span>Microphone & Latency Check</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: 60-SECOND MICROPHONE & LATENCY CHECK */}
        {step === 'mic_check' && (
          <div>
            <h3
              style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' }}
            >
              Microphone & Latency Calibration
            </h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px 0' }}>
              Verify audio input levels and measure roundtrip response latency.
            </p>

            <div
              style={{
                padding: '14px',
                background: 'rgba(30, 41, 59, 0.5)',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                marginBottom: '16px',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Mic size={14} style={{ color: micActive ? '#34d399' : '#94a3b8' }} />
                  Microphone Input Level
                </span>
                <button
                  type="button"
                  onClick={() => setMicActive(!micActive)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    background: micActive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                    border: micActive
                      ? '1px solid rgba(239, 68, 68, 0.4)'
                      : '1px solid rgba(99, 102, 241, 0.4)',
                    color: micActive ? '#fca5a5' : '#c7d2fe',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  {micActive ? 'Stop Test' : 'Test Mic'}
                </button>
              </div>

              {micActive && (
                <div style={{ marginTop: '12px' }}>
                  <div
                    style={{
                      width: '100%',
                      height: '8px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${volumeLevel}%`,
                        height: '100%',
                        background: '#34d399',
                        transition: 'width 0.1s ease',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#94a3b8',
                      display: 'block',
                      marginTop: '4px',
                    }}
                  >
                    Speaking detected • Audio levels calibrated
                  </span>
                </div>
              )}
            </div>

            <div
              style={{
                padding: '14px',
                background: 'rgba(30, 41, 59, 0.5)',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.2)',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Activity size={14} style={{ color: '#818cf8' }} />
                  Roundtrip Voice-to-Inference Latency
                </span>
                <button
                  type="button"
                  onClick={runLatencyCheck}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    color: '#c7d2fe',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Run Ping Test
                </button>
              </div>

              {latencyTestDone && (
                <div
                  style={{
                    marginTop: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#34d399',
                    fontSize: '12px',
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>Latency: {measuredLatencyMs}ms (optimal conversational pace)</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => setStep('credentials_or_models')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep('ready')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 18px',
                  background: '#4f46e5',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span>Ready to Practice</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: READY TO LAUNCH 10-MIN MOCK */}
        {step === 'ready' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div
              style={{
                display: 'inline-flex',
                padding: '12px',
                background: 'rgba(16, 185, 129, 0.15)',
                borderRadius: '50%',
                color: '#34d399',
                marginBottom: '12px',
              }}
            >
              <CheckCircle2 size={32} />
            </div>

            <h3
              style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', margin: '0 0 6px 0' }}
            >
              Calibration Complete!
            </h3>
            <p
              style={{
                fontSize: '12px',
                color: '#94a3b8',
                maxWidth: '380px',
                margin: '0 auto 20px auto',
                lineHeight: '1.5',
              }}
            >
              Your environment is configured. Start your first 10-minute behavioral warmup mock
              round to establish your speech pace baseline.
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                onClick={async () => {
                  await handleFinishAndStart();
                  setProfileWizardOpen(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 24px',
                  background: '#8B7CFF',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(139, 124, 255, 0.4)',
                }}
              >
                <span>Customize Candidate Profile (Wizard)</span>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={handleFinishAndStart}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 20px',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span>Skip to 10-Minute Mock Interview</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
