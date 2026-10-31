import { copyToClipboard } from '../utils/clipboard';
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { usePracticeStore } from '../store/usePracticeStore';
import { X, Save, AlertTriangle, Volume2, VolumeX } from 'lucide-react';
import { isSoundMuted, toggleSoundMuted } from '../utils/soundEffects';

export default function SettingsPanel() {
  const { deleteAllFeedbackAndPracticeData } = usePracticeStore();
  const {
    settings,
    updateSetting,
    setSettingsOpen,
    clearAllData,
    selectedAudioDeviceId,
    setSelectedAudioDeviceId,
  } = useAppStore();
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extensionToken, setExtensionToken] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);
  const [soundMuted, setSoundMutedState] = useState(() => isSoundMuted());

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === 'audioinput');
        setAudioDevices(inputs);
      } catch (e) {
        console.error('Failed to enumerate audio devices:', e);
      }
    };
    fetchDevices();
  }, []);

  // Load current API key on mount
  useEffect(() => {
    const loadKey = async () => {
      if (settings?.aiProvider) {
        try {
          const key = await window.electronAPI?.getApiKey(settings.aiProvider);
          setApiKey(key || '');
        } catch {
          setErrorMessage('Unable to retrieve stored API key from keychain.');
        }
      }
    };
    loadKey();
    window.electronAPI?.getWsInfo?.().then((info) => {
      if (info?.token) setExtensionToken(info.token);
    });
  }, [settings?.aiProvider]);

  if (!settings) return null;

  const handleProviderChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value;
    updateSetting('aiProvider', provider);

    // Set default model for provider
    if (provider === 'groq') updateSetting('aiModel', 'openai/gpt-oss-120b');
    else if (provider === 'openai') updateSetting('aiModel', 'gpt-4o-mini');
    else if (provider === 'openrouter') updateSetting('aiModel', 'google/gemini-3.8-flash');
    else if (provider === 'ollama') updateSetting('aiModel', 'llama3.2:1b');
  };

  const saveApiKey = async () => {
    if (!settings.aiProvider) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await window.electronAPI?.setApiKey(settings.aiProvider, apiKey.trim());
      updateSetting('hasApiKey', apiKey.trim().length > 0);
    } catch {
      setErrorMessage('Failed to encrypt and store API key in system keychain.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="backdrop" onClick={() => setSettingsOpen(false)} aria-hidden="true" />
      <div
        className="panel"
        role="dialog"
        aria-labelledby="settings-dialog-title"
        aria-modal="true"
      >
        <div className="panel__header">
          <h2 id="settings-dialog-title" className="panel__title">
            Settings &amp; Configuration
          </h2>
          <button
            className="action-btn"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close Settings Panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="panel__content">
          {errorMessage && (
            <div
              role="alert"
              style={{
                padding: '8px 12px',
                marginBottom: '12px',
                background: 'var(--error-bg)',
                border: '1px solid rgba(248, 113, 113, 0.3)',
                borderRadius: '6px',
                color: 'var(--error)',
                fontSize: '12px',
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* AI Engine Settings */}
          <div className="settings-section">
            <h3 className="settings-section__title">AI Scoring &amp; Interview Provider</h3>

            <div className="field">
              <label className="field__label" htmlFor="ai-provider-select">
                Provider
              </label>
              <select
                id="ai-provider-select"
                className="field__select"
                value={settings.aiProvider}
                onChange={handleProviderChange}
                aria-label="AI Provider selection"
              >
                <option value="groq">Groq (Ultra-fast LLM &amp; Whisper)</option>
                <option value="openai">OpenAI (GPT-4o &amp; Whisper)</option>
                <option value="openrouter">OpenRouter (Multi-model)</option>
                <option value="ollama">Ollama (100% Offline Local)</option>
              </select>
            </div>

            {settings.aiProvider !== 'ollama' && (
              <div className="field">
                <label className="field__label" htmlFor="api-key-input">
                  API Key
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    id="api-key-input"
                    type="password"
                    className="field__input"
                    style={{ flex: 1 }}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`Enter ${settings.aiProvider} API key`}
                    aria-label={`Enter ${settings.aiProvider} API key`}
                  />
                  <button
                    className="action-btn action-btn--primary"
                    style={{ padding: '0 12px' }}
                    onClick={saveApiKey}
                    disabled={loading}
                    aria-label="Save API Key securely"
                  >
                    {loading ? (
                      <div className="spinner" style={{ width: 14, height: 14 }} />
                    ) : (
                      <Save size={14} />
                    )}
                  </button>
                </div>
                <span className="field__hint">
                  🔒 Stored securely in your OS keychain via Electron safeStorage.
                </span>
              </div>
            )}

            {settings.aiProvider === 'ollama' && (
              <div className="field">
                <label className="field__label" htmlFor="ollama-endpoint-input">
                  Ollama Endpoint
                </label>
                <input
                  id="ollama-endpoint-input"
                  type="text"
                  className="field__input"
                  value={settings.ollamaEndpoint}
                  onChange={(e) => updateSetting('ollamaEndpoint', e.target.value)}
                  aria-label="Ollama HTTP Endpoint"
                />
              </div>
            )}

            {settings.aiProvider === 'custom' && (
              <div className="field">
                <label className="field__label" htmlFor="custom-endpoint-input">
                  Custom Endpoint
                </label>
                <input
                  id="custom-endpoint-input"
                  type="text"
                  className="field__input"
                  value={settings.customApiEndpoint}
                  onChange={(e) => updateSetting('customApiEndpoint', e.target.value)}
                  placeholder="https://api.example.com/v1/chat/completions"
                  aria-label="Custom API Endpoint"
                />
              </div>
            )}

            <div className="field">
              <label className="field__label" htmlFor="ai-model-input">
                Model
              </label>
              <input
                id="ai-model-input"
                type="text"
                className="field__input"
                value={settings.aiModel}
                onChange={(e) => updateSetting('aiModel', e.target.value)}
                aria-label="AI Model name"
              />
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section__title">Preferences &amp; Accessibility</h3>

            <div className="field">
              <label className="field__label" htmlFor="theme-select">
                Appearance Theme
              </label>
              <select
                id="theme-select"
                className="field__select"
                value={settings.theme || 'dark'}
                onChange={(e) => updateSetting('theme', e.target.value)}
                aria-label="Appearance Theme"
              >
                <option value="dark">Dark Theme (Studio High Contrast)</option>
                <option value="light">Light Theme (Clean Daylight Studio)</option>
              </select>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="sound-fx-toggle">
                Practice Audio Feedback &amp; Sound Chimes
              </label>
              <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">
                    Synthesized Practice Audio Chimes
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Gentle Web Audio chimes for round starts and celebration arpeggios upon drill completion.
                  </span>
                </div>
                <button
                  type="button"
                  id="sound-fx-toggle"
                  onClick={() => {
                    const next = toggleSoundMuted();
                    setSoundMutedState(next);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    soundMuted
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  {soundMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  <span>{soundMuted ? "🔇 Muted" : "🔊 Active"}</span>
                </button>
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="audio-device-select">
                🎙️ Audio Input Device
              </label>
              <select
                id="audio-device-select"
                className="field__select"
                value={selectedAudioDeviceId || ''}
                onChange={(e) => setSelectedAudioDeviceId(e.target.value)}
                aria-label="Audio Input Device"
              >
                <option value="">Default System Microphone</option>
                {audioDevices.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId}>
                    {d.label || `Microphone ${idx + 1}`}
                  </option>
                ))}
              </select>
              <span className="field__hint">
                Directly route AirPods, USB headset, or virtual audio loopback.
              </span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="programming-lang-select">
                Preferred Programming Language
              </label>
              <select
                id="programming-lang-select"
                className="field__select"
                value={settings.preferredLanguage}
                onChange={(e) => updateSetting('preferredLanguage', e.target.value)}
                aria-label="Preferred Programming Language"
              >
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="cpp">C++</option>
                <option value="go">Go</option>
                <option value="csharp">C#</option>
              </select>
            </div>

            <div className="toggle-row">
              <span className="toggle-row__label">Browser Extension Integration</span>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(settings.browserIntegration)}
                aria-label="Toggle Browser Extension Integration"
                className={`toggle ${settings.browserIntegration ? 'active' : ''}`}
                onClick={() => updateSetting('browserIntegration', !settings.browserIntegration)}
              />
            </div>
            {settings.browserIntegration && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '10px',
                  background: 'var(--bg-card, rgba(30, 41, 59, 0.5))',
                  borderRadius: '6px',
                  border: '1px solid var(--border-default, rgba(148, 163, 184, 0.2))',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted, #94a3b8)',
                    marginBottom: '4px',
                  }}
                >
                  Extension Pairing Token (Required by extension for security):
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="password"
                    readOnly
                    value={extensionToken}
                    aria-label="Extension pairing security token"
                    style={{
                      flex: 1,
                      fontSize: '11px',
                      padding: '4px 8px',
                      background: 'var(--bg-tertiary, #0f172a)',
                      border: '1px solid var(--border-subtle, #334155)',
                      borderRadius: '4px',
                      color: 'var(--text-primary, #cbd5e1)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await copyToClipboard(extensionToken);
                      setTokenCopied(true);
                      setTimeout(() => setTokenCopied(false), 2000);
                    }}
                    aria-label="Copy extension pairing token"
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      background: 'var(--accent-primary, #4f46e5)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    {tokenCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="settings-section">
            <h3 className="settings-section__title">System Prompt</h3>
            <div className="field">
              <label className="sr-only" htmlFor="system-prompt-textarea">
                System Prompt
              </label>
              <textarea
                id="system-prompt-textarea"
                className="field__textarea"
                value={settings.systemPrompt}
                onChange={(e) => updateSetting('systemPrompt', e.target.value)}
                rows={4}
                aria-label="Custom Interviewer System Prompt"
              />
              <span className="field__hint">Customize how the AI behaves and responds.</span>
            </div>
          </div>

          <div
            className="settings-section"
            data-testid="settings-calibration-reminder"
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              marginBottom: '16px',
            }}
          >
            <h3
              className="settings-section__title"
              style={{
                color: '#fbbf24',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                margin: 0,
                marginBottom: '6px',
              }}
            >
              ⚖️ Calibration Reminder
            </h3>
            <p
              style={{
                fontSize: '11px',
                color: '#cbd5e1',
                lineHeight: '1.5',
                margin: 0,
              }}
            >
              AI scores are estimates, may be wrong, and should be compared against feedback from
              real people when possible. Language models can miss nuanced engineering context,
              non-standard system designs, or delivery subtleties. Treat these rubric scores as
              iterative coaching benchmarks rather than definitive hiring decisions.
            </p>
          </div>

          <div className="settings-section" style={{ marginTop: 'auto' }}>
            <h3 className="settings-section__title" style={{ color: 'var(--error)' }}>
              Danger Zone
            </h3>
            <button
              className="danger-btn"
              onClick={() => {
                const confirmed =
                  typeof window !== 'undefined' && window.confirm
                    ? window.confirm(
                        'Are you sure you want to permanently delete all feedback records, practice sessions, transcripts, and study plans?'
                      )
                    : true;
                if (confirmed) {
                  deleteAllFeedbackAndPracticeData();
                  clearAllData();
                }
              }}
              aria-label="Delete all feedback and practice data"
              data-testid="delete-all-feedback-practice-data"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangle size={14} />
              Delete all feedback and practice data
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
