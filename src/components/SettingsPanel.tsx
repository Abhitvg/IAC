import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { X, Save, AlertTriangle } from 'lucide-react';

export default function SettingsPanel() {
  const { settings, updateSetting, setSettingsOpen, clearAllData } = useAppStore();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);

  // Load current API key on mount
  useEffect(() => {
    const loadKey = async () => {
      if (settings?.aiProvider) {
        const key = await window.electronAPI?.getApiKey(settings.aiProvider);
        setApiKey(key || '');
      }
    };
    loadKey();
  }, [settings?.aiProvider]);

  if (!settings) return null;

  const handleProviderChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value;
    updateSetting('aiProvider', provider);
    
    // Set default model for provider
    if (provider === 'openai') updateSetting('aiModel', 'gpt-4o-mini');
    else if (provider === 'openrouter') updateSetting('aiModel', 'google/gemini-3.8-flash');
    else if (provider === 'ollama') updateSetting('aiModel', 'llama3.2:1b');
  };

  const saveApiKey = async () => {
    setLoading(true);
    await window.electronAPI?.setApiKey(settings.aiProvider, apiKey);
    setLoading(false);
  };

  return (
    <>
      <div className="panel-overlay" onClick={() => setSettingsOpen(false)} />
      <div className="panel">
        <div className="panel__header">
          <h2 className="panel__title">Settings</h2>
          <button className="panel__close" onClick={() => setSettingsOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="panel__body">
          <div className="settings-section">
            <h3 className="settings-section__title">AI Configuration</h3>
            
            <div className="field">
              <label className="field__label">Provider</label>
              <select className="field__select" value={settings.aiProvider} onChange={handleProviderChange}>
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
                <option value="ollama">Ollama (Local)</option>
                <option value="custom">Custom API</option>
              </select>
            </div>

            {settings.aiProvider !== 'ollama' && (
              <div className="field">
                <label className="field__label">API Key</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="password"
                    className="field__input"
                    style={{ flex: 1 }}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`Enter ${settings.aiProvider} API key`}
                  />
                  <button 
                    className="action-btn action-btn--primary" 
                    style={{ padding: '0 12px' }}
                    onClick={saveApiKey}
                    disabled={loading}
                  >
                    {loading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
                  </button>
                </div>
                <span className="field__hint">Stored securely in OS keychain.</span>
              </div>
            )}

            {settings.aiProvider === 'ollama' && (
              <div className="field">
                <label className="field__label">Ollama Endpoint</label>
                <input
                  type="text"
                  className="field__input"
                  value={settings.ollamaEndpoint}
                  onChange={(e) => updateSetting('ollamaEndpoint', e.target.value)}
                />
              </div>
            )}

            {settings.aiProvider === 'custom' && (
              <div className="field">
                <label className="field__label">Custom Endpoint</label>
                <input
                  type="text"
                  className="field__input"
                  value={settings.customApiEndpoint}
                  onChange={(e) => updateSetting('customApiEndpoint', e.target.value)}
                  placeholder="https://api.example.com/v1/chat/completions"
                />
              </div>
            )}

            <div className="field">
              <label className="field__label">Model</label>
              <input
                type="text"
                className="field__input"
                value={settings.aiModel}
                onChange={(e) => updateSetting('aiModel', e.target.value)}
              />
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section__title">Preferences</h3>
            
            <div className="field">
              <label className="field__label">Preferred Programming Language</label>
              <select 
                className="field__select"
                value={settings.preferredLanguage}
                onChange={(e) => updateSetting('preferredLanguage', e.target.value)}
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
                className={`toggle ${settings.browserIntegration ? 'active' : ''}`}
                onClick={() => updateSetting('browserIntegration', !settings.browserIntegration)}
              />
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-section__title">System Prompt</h3>
            <div className="field">
              <textarea
                className="field__textarea"
                value={settings.systemPrompt}
                onChange={(e) => updateSetting('systemPrompt', e.target.value)}
                rows={4}
              />
              <span className="field__hint">Customize how the AI behaves and responds.</span>
            </div>
          </div>

          <div className="settings-section" style={{ marginTop: 'auto' }}>
            <h3 className="settings-section__title" style={{ color: 'var(--error)' }}>Danger Zone</h3>
            <button className="danger-btn" onClick={clearAllData} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <AlertTriangle size={14} />
              Clear All Data & Sessions
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
