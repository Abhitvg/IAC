import React from 'react';
import LiveStatusBar from './LiveStatusBar';
import DetectedQuestion from './DetectedQuestion';
import LiveTranscript from './LiveTranscript';
import FollowUpPanel from './FollowUpPanel';
import SessionControls from './SessionControls';
import Teleprompter from '../Teleprompter'; // from phase 1
import { useAppStore } from '../../store/useAppStore';

export default function InterviewWorkspace() {
  const { diagnosticState } = useAppStore();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#0a0a0f', overflow: 'hidden' }}>
      <Teleprompter />
      <LiveStatusBar />
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: '0 0 65%', display: 'flex', flexDirection: 'column', padding: '0 40px', overflowY: 'auto' }}>
          <DetectedQuestion />
          <FollowUpPanel />
        </div>
        
        <div style={{ flex: '0 0 35%', minWidth: '300px' }}>
          <LiveTranscript />
        </div>
      </div>
      
      <SessionControls />

      <div style={{ position: 'fixed', bottom: 10, left: 10, background: 'rgba(0,0,0,0.8)', color: '#0f0', padding: '10px', fontSize: '12px', zIndex: 9999, fontFamily: 'monospace', border: '1px solid #0f0', borderRadius: '4px' }}>
          <strong>Phase 8.2 Diagnostics</strong><br/>
          Mic: {diagnosticState.micActive ? 'Active' : 'Inactive'} (Vol: {diagnosticState.currentDb} dB)<br/>
          VAD: {diagnosticState.speechDetected ? 'Speech Detected' : 'Silent'}<br/>
          Recording: {diagnosticState.blobSize} bytes ({diagnosticState.mimeType})<br/>
          Whisper: {diagnosticState.whisperStatus}<br/>
          Question Matched: {diagnosticState.questionMatched ? 'Yes' : 'No'}<br/>
          Latest Transcript: {diagnosticState.latestTranscript}<br/>
      </div>
    
    </div>
  );
}