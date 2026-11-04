import React from 'react';
import {
  Check,
  X,
  Pencil,
  RefreshCw,
  FileText,
  SkipForward,
  Square,
  WandSparkles,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export default function LiveTranscript() {
  const {
    transcript,
    lastUnconfirmedTranscript,
    overrideTranscriptAsQuestion,
    clearUnconfirmedTranscript,
    setPipelineStage,
    setStatus,
    generateAnswerFromTranscript,
    currentQuestion,
    status,
    blockedReason,
    draftAnswer,
    clearAnswerQueue,
    recoveredPartialAnswer,
    setCurrentQuestion,
    setLastUnconfirmedTranscript,
  } = useAppStore();

  const handleConfirmQuestion = async () => {
    if (!lastUnconfirmedTranscript?.text.trim()) return;
    await overrideTranscriptAsQuestion(lastUnconfirmedTranscript.text);
  };

  const handleRetry = async () => {
    const question = currentQuestion || lastUnconfirmedTranscript?.text || '';
    if (question.trim()) await generateAnswerFromTranscript(question);
  };

  const handleEdit = () => {
    const question = currentQuestion || lastUnconfirmedTranscript?.text || '';
    const edited = window.prompt('Edit the detected question', question);
    if (edited && edited.trim()) {
      setLastUnconfirmedTranscript({
        id: 'edited_' + Date.now(),
        text: edited.trim(),
        confidence: 1,
        reason: 'User-edited question',
        timestamp: Date.now(),
      });
      setCurrentQuestion(edited.trim());
    }
  };

  const handleSkip = () => {
    clearAnswerQueue();
    clearUnconfirmedTranscript();
    setLastUnconfirmedTranscript(null);
    setCurrentQuestion('');
    setPipelineStage('listening');
    setStatus('listening');
  };

  const handleCancel = () => {
    void import('../../services/InterviewEngine').then(({ InterviewEngine }) => {
      void InterviewEngine.handleEvent({ type: 'CANCEL_ACTIVE_REQUEST' });
    });
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
          <p style={{ margin: '0 0 8px', lineHeight: 1.5 }}>{lastUnconfirmedTranscript.text}</p>
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

      {(currentQuestion ||
        lastUnconfirmedTranscript ||
        status === 'error' ||
        status === 'paused') && (
        <section
          aria-label="Question recovery actions"
          style={{ marginBottom: 14, padding: 12, border: '1px solid #334155', borderRadius: 8 }}
        >
          <h3 style={{ margin: '0 0 10px', fontSize: 13 }}>Question recovery</h3>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() =>
                void generateAnswerFromTranscript(
                  lastUnconfirmedTranscript?.text || currentQuestion || ''
                )
              }
              style={actionStyle}
            >
              <WandSparkles size={13} /> Finalize &amp; Generate
            </button>
            <button
              type="button"
              onClick={() => void handleRetry()}
              disabled={status !== 'error' && status !== 'ready'}
              style={actionStyle}
            >
              <RefreshCw size={13} /> Retry Answer
            </button>
            <button
              type="button"
              onClick={() =>
                void generateAnswerFromTranscript(
                  transcript
                    .map((t) => t.text)
                    .join(' ')
                    .trim()
                )
              }
              style={actionStyle}
            >
              <FileText size={13} /> Generate from Transcript
            </button>
            <button type="button" onClick={handleEdit} style={actionStyle}>
              <Pencil size={13} /> Edit Question
            </button>
            <button type="button" onClick={handleSkip} style={actionStyle}>
              <SkipForward size={13} /> Skip Question
            </button>
            <button type="button" onClick={handleCancel} style={actionStyle}>
              <Square size={13} /> Cancel Current Request
            </button>
          </div>
          {(status === 'error' || blockedReason) && (
            <p role="alert" style={{ color: '#fca5a5', fontSize: 12, margin: '10px 0 0' }}>
              {blockedReason || 'Generation failed. Transcript retained for recovery.'}
            </p>
          )}
          {(draftAnswer || recoveredPartialAnswer) && (
            <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 0 }}>
              Partial output retained locally (
              {(draftAnswer || recoveredPartialAnswer || '').length} characters).
            </p>
          )}
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

const actionStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  border: '1px solid #475569',
  borderRadius: 6,
  padding: '7px 9px',
  background: '#111827',
  color: '#e2e8f0',
  fontSize: 11,
  cursor: 'pointer',
};
