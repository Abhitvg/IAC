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
  Flame,
} from 'lucide-react';
import { getDefaultModelForProvider, AIProviderId } from '../services/models/modelRegistry';
import { persistOnboardingCredential } from '../services/onboarding/credentialSetup';
import { persistOnboardingSettings } from '../services/onboarding/settingsSetup';

type OnboardingStep = 'mode' | 'credentials_or_models' | 'mic_check' | 'ready';

export default function OnboardingModal() {
  const { setToast, setProfileWizardOpen } = useAppStore();
  const { startMockSession } = usePracticeStore();

  const [step, setStep] = useState<OnboardingStep>('mode');
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [provider, setProvider] = useState<'groq' | 'openai' | 'ollama'>('groq');
  const [apiKey, setApiKey] = useState('');

  // Live microphone test state. Never fabricate meter readings or latency results.
  const [micActive, setMicActive] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 'mic_check' || !micActive) {
      setVolumeLevel(0);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let animationFrame = 0;

    const startMicrophoneTest = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Microphone access is unavailable in this environment.');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        audioContext = new AudioContext();
        if (audioContext.state === 'suspended') await audioContext.resume();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);

        const updateInputLevel = () => {
          if (cancelled) return;
          analyser.getFloatTimeDomainData(samples);
          let sumSquares = 0;
          for (let index = 0; index < samples.length; index += 1) {
            sumSquares += samples[index] * samples[index];
          }
          const rms = Math.sqrt(sumSquares / samples.length);
          setVolumeLevel(Math.min(100, Math.round(rms * 400)));
          animationFrame = requestAnimationFrame(updateInputLevel);
        };

        updateInputLevel();
      } catch (error: unknown) {
        if (!cancelled) {
          setMicError(error instanceof Error ? error.message : String(error));
          setMicActive(false);
        }
      }
    };

    void startMicrophoneTest();

    return () => {
      cancelled = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close().catch(() => undefined);
      }
    };
  }, [step, micActive]);

  const handleFinishAndStart = async (): Promise<boolean> => {
    try {
      const activeProv = isLocalMode ? 'ollama' : (provider as AIProviderId);

      // A supplied key is not optional once entered: confirm the protected main-
      // process credential store accepted it before marking setup complete.
      if (!isLocalMode) {
        await persistOnboardingCredential(provider, apiKey, (service, key) => {
          const writeCredential = window.electronAPI?.setApiKey;
          if (typeof writeCredential !== 'function') {
            throw new Error(
              'Secure credential storage is unavailable. Your key was not saved; configure it later in Settings.'
            );
          }
          return writeCredential(service, key);
        });
      }

      const onboardingSettings = {
        aiProvider: activeProv,
        aiModel: getDefaultModelForProvider(activeProv, 'llm'),
        whisperModel: isLocalMode
          ? 'local-whisper-cpp'
          : getDefaultModelForProvider(activeProv, 'stt'),
      };
      const writeSetting = window.electronAPI?.setSettings;

      // Persist the provider/model configuration before changing local state.
      await persistOnboardingSettings(Object.entries(onboardingSettings), writeSetting);
      useAppStore.setState((state) => ({
        settings: { ...state.settings, ...onboardingSettings },
      }));

      // Completion is persisted only after credentials and provider/model settings.
      await persistOnboardingSettings([['hasCompletedOnboarding', true]], writeSetting);
      useAppStore.setState((state) => ({
        settings: { ...state.settings, hasCompletedOnboarding: true },
      }));

      // Start the first session after setup has been durably completed.
      try {
        startMockSession('behavioral', 'friendly_recruiter', false);
      } catch (sessionError) {
        console.error('[Onboarding] Initial mock session could not start:', sessionError);
        setToast('Setup was saved, but the initial mock could not start. Open Mock Gym to begin.');
        return true;
      }

      setToast('Welcome! Your 10-minute initial mock interview has started.');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setToast(`Setup error: ${message}`);
      return false;
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
                  Cloud live interviews upload microphone audio to Groq or OpenAI for transcription,
                  then send the recognized question and your resume, job description, target role,
                  and recent Q&A context to the selected LLM. These live requests do not show a
                  per-question redaction preview.
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
                  <ShieldCheck size={16} /> Local mode (requires local setup)
                </div>
                <p
                  style={{
                    fontSize: '11px',
                    color: '#cbd5e1',
                    marginTop: '6px',
                    lineHeight: '1.4',
                  }}
                >
                  Uses Ollama and local Whisper when installed and configured. This screen does not
                  verify offline readiness.
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
                  {(['groq', 'openai'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setProvider(p);
                        setApiKey('');
                      }}
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
                    Keys are encrypted with OS-backed Electron safeStorage. On Linux, GNOME Keyring
                    or KDE Wallet must be available; the app will not persist keys using an
                    unprotected local fallback.
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
                  Local Model Requirements
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px 0' }}>
                  Local mode requires Ollama and a local Whisper runtime. Installation and model
                  availability are not verified here.
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
                  <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.5', margin: 0 }}>
                    This screen does not download or verify local models. Install Ollama, pull
                    <code> llama3.2:1b </code>, and configure the local Whisper runtime separately.
                  </p>
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
              Microphone Test
            </h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px 0' }}>
              Test real microphone input. Provider response latency is not measured during
              onboarding.
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
                  aria-pressed={micActive}
                  onClick={() => {
                    setMicError(null);
                    setMicActive((active) => !active);
                  }}
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
                    role="meter"
                    aria-label="Microphone input level"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={volumeLevel}
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
                    Live microphone input level. Speak to see the meter.
                  </span>
                </div>
              )}
              {micError && (
                <span
                  role="alert"
                  style={{ display: 'block', marginTop: '8px', color: '#fca5a5', fontSize: '11px' }}
                >
                  {micError}
                </span>
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
                  Provider response latency
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Not measured during setup
                </span>
              </div>
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
              Setup Review Complete
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
              Your setup choices are saved. Microphone input can be tested above, but provider
              latency and local model availability are not verified automatically. Start a
              behavioral warmup when your provider or local runtime is ready.
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
                  if (await handleFinishAndStart()) {
                    setProfileWizardOpen(true);
                  }
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
