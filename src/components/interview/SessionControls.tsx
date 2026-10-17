import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { InterviewEngine } from '../../services/InterviewEngine';
import { Mic, MicOff, Play, Send } from 'lucide-react';

export default function SessionControls() {
  const { status, toggleRecording, analyzeTranscript } = useAppStore();
  const [customQuery, setCustomQuery] = useState('');
  const isListening = status === 'listening';

  const handleSendCustom = (textToSend?: string) => {
    const q = (textToSend || customQuery).trim();
    if (!q) return;
    InterviewEngine.handleEvent({ type: 'QUESTION_DETECTED', text: q });
    setCustomQuery('');
  };

  return (
    <div style={{
      borderTop: '1px solid #1f1d2e',
      background: '#0d0c14',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      flexWrap: 'wrap'
    }}>
      {/* Primary Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={toggleRecording}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: isListening ? '#dc2626' : '#4f46e5',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: isListening ? '0 0 12px rgba(220, 38, 38, 0.5)' : 'none'
          }}
        >
          {isListening ? (
            <>
              <MicOff size={16} /> Stop Listening
            </>
          ) : (
            <>
              <Mic size={16} /> Start Listening
            </>
          )}
        </button>

        <button
          onClick={analyzeTranscript}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#1e1c2b',
            border: '1px solid #332f48',
            color: '#c4c1dc',
            borderRadius: '6px',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <Play size={14} /> Analyze Last
        </button>
      </div>

      {/* Quick Test Prompt & Manual Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '520px' }}>
        <input
          type="text"
          placeholder="Or type a test question (e.g. What is AWS CodePipeline?)"
          value={customQuery}
          onChange={(e) => setCustomQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSendCustom(); }}
          style={{
            flex: 1,
            background: '#161523',
            border: '1px solid #28243c',
            color: '#f8fafc',
            borderRadius: '6px',
            padding: '7px 12px',
            fontSize: '12px',
            outline: 'none'
          }}
        />
        <button
          onClick={() => handleSendCustom()}
          disabled={!customQuery.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: customQuery.trim() ? '#6366f1' : '#232135',
            color: customQuery.trim() ? '#ffffff' : '#6b6882',
            border: 'none',
            borderRadius: '6px',
            padding: '7px 12px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: customQuery.trim() ? 'pointer' : 'default'
          }}
        >
          <Send size={13} /> Ask
        </button>
      </div>

      {/* Quick Test Pills */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={() => handleSendCustom('What is AWS CodePipeline?')}
          style={{
            background: '#1a192a',
            border: '1px solid #2f2c45',
            color: '#a5b4fc',
            borderRadius: '12px',
            padding: '4px 10px',
            fontSize: '11px',
            cursor: 'pointer'
          }}
        >
          ⚡ AWS CodePipeline
        </button>
        <button
          onClick={() => handleSendCustom('Explain CI/CD in DevOps')}
          style={{
            background: '#1a192a',
            border: '1px solid #2f2c45',
            color: '#a5b4fc',
            borderRadius: '12px',
            padding: '4px 10px',
            fontSize: '11px',
            cursor: 'pointer'
          }}
        >
          ⚡ CI/CD
        </button>
      </div>
    </div>
  );
}
