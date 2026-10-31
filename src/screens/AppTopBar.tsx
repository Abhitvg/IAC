import React from 'react';
import {
  Search,
  Bell,
  Settings,
  Mic,
  Volume2,
  VolumeX,
  History,
  ShieldCheck,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { isSoundMuted, toggleSoundMuted } from '../utils/soundEffects';

interface AppTopBarProps {
  currentTitle: string;
}

export const AppTopBar: React.FC<AppTopBarProps> = ({ currentTitle }) => {
  const {
    isRecording,
    toggleRecording,
    setSettingsOpen,
    setSessionsOpen,
    targetRole,
  } = useAppStore();

  const [soundMuted, setSoundMutedState] = React.useState(() => isSoundMuted());
  const handleToggleSound = () => {
    const next = toggleSoundMuted();
    setSoundMutedState(next);
  };

  return (
    <header
      role="banner"
      style={{
        height: '48px',
        background: '#11141B',
        borderBottom: '1px solid #292E3A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Left: Active Section & Target Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#F3F4F8', margin: 0 }}>
          {currentTitle}
        </h2>
        {targetRole && (
          <span
            style={{
              fontSize: '11px',
              color: '#9299AA',
              background: '#171B24',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid #292E3A',
            }}
          >
            Target: <strong style={{ color: '#F3F4F8' }}>{targetRole}</strong>
          </span>
        )}
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Audio Recording Toggle */}
        <button
          type="button"
          onClick={toggleRecording}
          aria-label={isRecording ? 'Stop Audio Recording' : 'Start Audio Recording'}
          title="Toggle Audio Recording (Shortcut: R)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            background: isRecording ? '#F16F78' : '#171B24',
            color: isRecording ? '#0D0F14' : '#F3F4F8',
            border: isRecording ? '1px solid #F16F78' : '1px solid #292E3A',
            transition: 'all 0.15s ease',
          }}
        >
          <Mic size={13} />
          <span>{isRecording ? 'Rec Active' : 'Mic On'}</span>
        </button>

        {/* Sessions History */}
        <button
          type="button"
          onClick={() => setSessionsOpen(true)}
          aria-label="View Session History"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'pointer',
            background: '#171B24',
            color: '#9299AA',
            border: '1px solid #292E3A',
          }}
          className="hover:text-[#F3F4F8] hover:bg-[#1E2330]"
        >
          <History size={13} />
          <span>Sessions</span>
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open Settings"
          style={{
            padding: '6px',
            borderRadius: '6px',
            background: '#171B24',
            color: '#9299AA',
            border: '1px solid #292E3A',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className="hover:text-[#F3F4F8] hover:bg-[#1E2330]"
        >
          <Settings size={14} />
        </button>

        {/* Sound FX Toggle */}
        <button
          type="button"
          onClick={handleToggleSound}
          aria-label={soundMuted ? 'Unmute Sound FX' : 'Mute Sound FX'}
          style={{
            padding: '6px',
            borderRadius: '6px',
            background: soundMuted ? 'rgba(241, 111, 120, 0.12)' : '#171B24',
            color: soundMuted ? '#F16F78' : '#9299AA',
            border: soundMuted ? '1px solid rgba(241, 111, 120, 0.3)' : '1px solid #292E3A',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {soundMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      </div>
    </header>
  );
};

