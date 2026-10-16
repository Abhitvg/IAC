import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Copy, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';

export default function DetectedQuestion() {
  const { currentQuestion, currentAnswer, status, copyAnswer } = useAppStore();
  const isGenerating = status === 'analyzing' || status === 'generating';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', padding: '20px 0' }}>
      {/* Detected Question Card */}
      <div className="card question-card">
        <div className="card__header">
          <span className="card__label">DETECTED QUESTION</span>
          {currentQuestion && (
            <span className={`card__badge ${isGenerating ? 'card__badge--medium' : 'card__badge--easy'}`}>
              {status === 'analyzing' ? 'ANALYZING...' : status === 'generating' ? 'GENERATING...' : 'LIVE'}
            </span>
          )}
        </div>
        <div className="card__body">
          {currentQuestion ? (
            <div className="question-text" style={{ fontSize: '16px', fontWeight: 600 }}>
              {currentQuestion}
            </div>
          ) : (
            <div className="question-placeholder">
              Listening for interview questions... Ask or say a question like "What is AWS CodePipeline?"
            </div>
          )}
        </div>
      </div>

      {/* Generated Output Card */}
      <div className="card answer-card" style={{ flex: 1, minHeight: '280px' }}>
        <div className="card__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={14} style={{ color: '#818cf8' }} />
            <span className="card__label">AI GENERATED ANSWER</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isGenerating && (
              <span style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Loader2 size={12} className="spin" /> Generating live...
              </span>
            )}
            {status === 'ready' && currentAnswer && (
              <span style={{ fontSize: '11px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={12} /> Ready
              </span>
            )}
            {currentAnswer && (
              <button
                onClick={copyAnswer}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#1e1b4b',
                  border: '1px solid #4338ca',
                  color: '#c7d2fe',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                <Copy size={11} /> Copy
              </button>
            )}
          </div>
        </div>

        <div className="card__body" style={{ minHeight: '200px' }}>
          {currentAnswer ? (
            <div style={{ color: '#f1f5f9', fontSize: '15px', lineHeight: '1.75', whiteSpace: 'pre-wrap' }}>
              {currentAnswer}
            </div>
          ) : isGenerating ? (
            <div style={{ color: '#94a3b8', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Loader2 size={16} className="spin" />
              <span>Streaming answer using Groq Qwen 27B...</span>
            </div>
          ) : (
            <div className="question-placeholder">
              The AI answer will appear here in real-time when a question is detected. You can also click "Analyze" below.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
