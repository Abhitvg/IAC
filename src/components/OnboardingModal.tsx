import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ShieldCheck, Cpu, Key, ArrowRight } from 'lucide-react';

export default function OnboardingModal() {
  const { updateSetting, setToast } = useAppStore();
  const [provider, setProvider] = useState<'groq' | 'openai' | 'openrouter' | 'ollama'>('groq');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      updateSetting('aiProvider', provider);
      if (provider === 'groq') {
        updateSetting('aiModel', 'openai/gpt-oss-120b');
        updateSetting('whisperModel', 'whisper-large-v3');
      } else if (provider === 'openai') {
        updateSetting('aiModel', 'gpt-4o-mini');
        updateSetting('whisperModel', 'whisper-1');
      } else if (provider === 'ollama') {
        updateSetting('aiModel', 'llama3.2:1b');
      }

      if (provider !== 'ollama' && apiKey.trim()) {
        await window.electronAPI?.setApiKey?.(provider, apiKey.trim());
      }

      updateSetting('hasCompletedOnboarding', true);
      setToast('Welcome! Your practice gym is ready.');
    } catch (err: any) {
      setToast(`Setup error: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
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
          width: '540px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div
            style={{ padding: '8px', background: 'rgba(99, 102, 241, 0.2)', borderRadius: '8px' }}
          >
            <Cpu size={24} style={{ color: '#818cf8' }} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
              Welcome to AI Interview Practice Gym
            </h2>
            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Your dedicated AI technical interviewer & real-time mock coaching simulator
            </p>
          </div>
        </div>

        <div
          style={{
            background: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '18px',
          }}
        >
          <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6' }}>
            🏋️ <strong>How it works:</strong> The AI acts as your mock interviewer. Practice DSA
            coding challenges, system design architectures, and STAR behavioral questions out loud.
            Get immediate coaching, model solutions, and scoring.
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#cbd5e1',
              marginBottom: '6px',
            }}
          >
            Choose Your AI Provider (Bring-Your-Own-Key)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {[
              {
                id: 'groq',
                name: 'Groq (Recommended)',
                desc: 'Ultra-low latency sub-second voice',
              },
              { id: 'openai', name: 'OpenAI', desc: 'GPT-4o & Whisper-1' },
              { id: 'openrouter', name: 'OpenRouter', desc: 'Flexible multi-model routing' },
              {
                id: 'ollama',
                name: 'Ollama (Local Offline)',
                desc: '100% private, zero cloud keys',
              },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id as any)}
                style={{
                  background:
                    provider === p.id ? 'rgba(99, 102, 241, 0.25)' : 'rgba(30, 41, 59, 0.5)',
                  border:
                    provider === p.id ? '1px solid #818cf8' : '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '6px',
                  padding: '10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#f8fafc',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '12px',
                    color: provider === p.id ? '#c7d2fe' : '#e2e8f0',
                  }}
                >
                  {p.name}
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {provider !== 'ollama' && (
          <div style={{ marginBottom: '18px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#cbd5e1',
                marginBottom: '6px',
              }}
            >
              <Key
                size={12}
                style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }}
              />
              {provider.toUpperCase()} API Key
            </label>
            <input
              type="password"
              className="field__input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Enter your ${provider} API key (e.g. ${provider === 'groq' ? 'gsk_...' : 'sk-...'})`}
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '5px',
                fontSize: '11px',
                color: '#10b981',
              }}
            >
              <ShieldCheck size={12} />
              <span>
                Encrypted locally in your OS Keychain via Electron safeStorage. Never sent to third
                parties.
              </span>
            </div>
          </div>
        )}

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}
        >
          <button
            type="button"
            className="action-btn action-btn--primary"
            onClick={handleFinish}
            disabled={isSaving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span>{isSaving ? 'Configuring...' : 'Start Practicing'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
