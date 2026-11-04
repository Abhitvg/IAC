import React from 'react';
import { Check, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export default function LiveTranscript() {
  const {
    transcript,
    lastUnconfirmedTranscript,
    overrideTranscriptAsQuestion,
    clearUnconfirmedTranscript,
    setPipelineStage,
    setStatus,
  } = useAppStore();

  const handleConfirmQuestion = async () => {
    if (!lastUnconfirmedTranscript?.text.trim()) return;
    await overrideTranscriptAsQuestion(lastUnconfirmedTranscript.text);
  };

  const handleDismiss = () => {
    clearUnconfirmedTranscript();
    setPipelineStage('listening');
    setStatus('listening');
  };

  return (
    <div style={{ color: '#fff', height: '100%', overflowY: 'auto', padding: '12px' }}>
      {lastUnconfirmedTranscript && (
        <section
          role="alert"
          aria-live="assertive"
          aria-labelledby="unconfirmed-transcript-title"
          style={{
            marginBottom: '16px',
            padding: '12px',
            border: '1px solid #d97706',
            borderRadius: '8px',
            background: 'rgba(120, 53, 15, 0.2)',
          }}
        >
          <h3 id="unconfirmed-transcript-title" style={{ margin: '0 0 8px', fontSize: '13px' }}>
            Confirm detected speech
          </h3>
          <p style={{ margin: '0 0 8px', lineHeight: 1.5 }}>
            {lastUnconfirmedTranscript.text}
          </p>
          <p style={{ margin: '0 0 12px', color: '#fbbf24', fontSize: '11px' }}>
            Speaker uncertain · {Math.round(lastUnconfirmedTranscript.confidence * 100)}% confidence
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleConfirmQuestion}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                border: 0,
                borderRadius: '6px',
                padding: '8px 10px',
                background: '#047857',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              <Check size={14} /> Confirm as question
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                border: '1px solid #64748b',
                borderRadius: '6px',
                padding: '8px 10px',
                background: 'transparent',
                color: '#e2e8f0',
                cursor: 'pointer',
              }}
            >
              <X size={14} /> Dismiss
            </button>
          </div>
        </section>
      )}

      <div aria-label="Live transcript">
        {transcript.map((t) => (
          <div key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid #27272a' }}>
            <strong>{t.speaker}:</strong> {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
