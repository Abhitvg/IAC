import React from 'react';
import { useAppStore } from '../../store/useAppStore';

export default function SessionControls() {
  const { status, toggleRecording, analyzeTranscript } = useAppStore();
  
  return (
    <div style={{ height: '64px', borderTop: '1px solid #2d2b3b', display: 'flex', alignItems: 'center', padding: '0 24px', gap: '12px' }}>
      <button onClick={toggleRecording}>{status === 'listening' ? 'Stop' : 'Listen'}</button>
      <button onClick={analyzeTranscript}>Analyze</button>
    </div>
  );
}