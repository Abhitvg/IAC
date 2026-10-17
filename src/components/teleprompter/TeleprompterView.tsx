import React, { useEffect, useRef, useState } from 'react';
import { useAppStore, TeleprompterFontSize } from '../../store/useAppStore';
import { InterviewEngine } from '../../services/InterviewEngine';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Mic, 
  MicOff, 
  Copy, 
  Settings, 
  History, 
  Sparkles,
  Loader2
} from 'lucide-react';

export default function TeleprompterView() {
  const {
    currentQuestion,
    currentAnswer,
    status,
    diagnosticState,
    teleprompterFontSize,
    setTeleprompterFontSize,
    isAutoScrolling,
    setIsAutoScrolling,
    scrollSpeed,
    setScrollSpeed,
    windowOpacity,
    setWindowOpacity,
    toggleRecording,
    copyAnswer,
    setSettingsOpen,
    setSessionsOpen
  } = useAppStore();

  const isListening = status === 'listening';
  const isGenerating = status === 'analyzing' || status === 'generating';

  // Session Timer
  const [seconds, setSeconds] = useState(45);
  const [timerRunning, setTimerRunning] = useState(true);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Auto-scrolling logic
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!isAutoScrolling || isHovered) return;
    const el = scrollRef.current;
    if (!el) return;

    const interval = setInterval(() => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) return;
      el.scrollTop += 0.8 * scrollSpeed;
    }, 30);

    return () => clearInterval(interval);
  }, [isAutoScrolling, scrollSpeed, isHovered]);

  const handleRestartScrolling = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const fontSizes: Record<TeleprompterFontSize, { label: string; size: string; line: string }> = {
    small: { label: 'Small font', size: '16px', line: '1.75' },
    medium: { label: 'Medium font', size: '20px', line: '1.8' },
    large: { label: 'Large font', size: '26px', line: '1.85' },
    xlarge: { label: 'X-Large font', size: '32px', line: '1.9' },
  };

  const handleExit = () => {
    window.electronAPI?.close();
  };

  const handleQuickQuestion = (q: string) => {
    InterviewEngine.handleEvent({ type: 'QUESTION_DETECTED', text: q });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: `rgba(12, 12, 20, ${windowOpacity})`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75)',
        userSelect: 'none'
      }}
    >
      {/* ════════════ TOP TELEPROMPTER CONTROL BAR (Matches Reference Photo) ════════════ */}
      <div
        className="teleprompter-draggable"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          background: 'rgba(18, 18, 28, 0.92)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          gap: '6px',
          flexWrap: 'nowrap'
        }}
      >
        {/* Left: Font Size Buttons */}
        <div className="teleprompter-nodrag" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {(['small', 'medium', 'large', 'xlarge'] as TeleprompterFontSize[]).map((f) => (
            <button
              key={f}
              onClick={() => setTeleprompterFontSize(f)}
              style={{
                background: teleprompterFontSize === f ? '#3730a3' : 'rgba(255, 255, 255, 0.06)',
                color: teleprompterFontSize === f ? '#ffffff' : '#94a3b8',
                border: teleprompterFontSize === f ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: teleprompterFontSize === f ? 600 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              {fontSizes[f].label}
            </button>
          ))}
        </div>

        {/* Center: Scroll Controls & Timer */}
        <div className="teleprompter-nodrag" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button
            onClick={handleRestartScrolling}
            title="Restart scrolling from the top"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#e2e8f0',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={11} /> Restart scrolling
          </button>

          <button
            onClick={() => setIsAutoScrolling(!isAutoScrolling)}
            title={isAutoScrolling ? 'Pause scrolling' : 'Resume auto-scroll'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              background: isAutoScrolling ? '#1e1b4b' : 'rgba(255, 255, 255, 0.06)',
              color: isAutoScrolling ? '#a5b4fc' : '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            {isAutoScrolling ? <Pause size={11} /> : <Play size={11} />}
            <span>{isAutoScrolling ? 'Pause' : 'Scroll'}</span>
          </button>

          <button
            onClick={() => setScrollSpeed(scrollSpeed === 0.7 ? 1.0 : scrollSpeed === 1.0 ? 1.5 : scrollSpeed === 1.5 ? 2.0 : 0.7)}
            title="Scroll Speed"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#c7d2fe',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              padding: '4px 6px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            {scrollSpeed}x
          </button>

          {/* Running Timer Badge (e.g. 00:45) */}
          <div
            onClick={() => setTimerRunning(!timerRunning)}
            title="Click to pause or resume timer"
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              color: '#f8fafc',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              fontFamily: 'monospace',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: timerRunning ? '#22c55e' : '#eab308' }} />
            {formatTimer(seconds)}
          </div>
        </div>

        {/* Right: Opacity, Settings, Red Exit Button */}
        <div className="teleprompter-nodrag" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <select
            value={windowOpacity}
            onChange={(e) => setWindowOpacity(parseFloat(e.target.value))}
            title="Window Translucency"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              padding: '3px 4px',
              fontSize: '10px',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="0.55">55% Glass</option>
            <option value="0.78">78% Glass</option>
            <option value="0.90">90% Glass</option>
            <option value="0.98">Solid</option>
          </select>

          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              padding: '4px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            <Settings size={13} />
          </button>

          <button
            onClick={() => setSessionsOpen(true)}
            title="Session History"
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              padding: '4px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            <History size={13} />
          </button>

          {/* Red Exit Button (Matches photo) */}
          <button
            onClick={handleExit}
            style={{
              background: '#e11d48',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s ease'
            }}
          >
            Exit
          </button>
        </div>
      </div>

      {/* ════════════ MIDDLE TELEPROMPTER BODY ════════════ */}
      <div
        ref={scrollRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 32px',
          scrollBehavior: 'smooth',
          userSelect: 'text'
        }}
      >
        {/* Active Detected Question Header */}
        {currentQuestion && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(99, 102, 241, 0.22)',
              border: '1px solid rgba(129, 140, 248, 0.4)',
              borderRadius: '6px',
              padding: '6px 12px',
              marginBottom: '16px',
              color: '#e0e7ff',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.2px'
            }}
          >
            <Sparkles size={13} style={{ color: '#818cf8' }} />
            <span>Q: {currentQuestion}</span>
          </div>
        )}

        {/* Teleprompter Answer Text */}
        <div
          style={{
            fontSize: fontSizes[teleprompterFontSize].size,
            lineHeight: fontSizes[teleprompterFontSize].line,
            color: '#f8fafc',
            fontWeight: 450,
            letterSpacing: '0.25px',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.95)',
            whiteSpace: 'pre-wrap'
          }}
        >
          {currentAnswer ? (
            <div>
              {currentAnswer}
              {isGenerating && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '18px',
                    background: '#6366f1',
                    marginLeft: '4px',
                    verticalAlign: 'middle',
                    animation: 'pulse 1s infinite'
                  }}
                />
              )}
            </div>
          ) : isGenerating ? (
            <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
              <Loader2 size={18} className="spin" /> Generating answer live with Groq Qwen 27B...
            </div>
          ) : (
            <div style={{ color: '#cbd5e1', fontSize: '18px', lineHeight: '1.8' }}>
              <p style={{ marginBottom: '12px', color: '#93c5fd', fontWeight: 600 }}>
                ● Eye-Contact Teleprompter Ready
              </p>
              <p style={{ color: '#94a3b8', fontSize: '15px' }}>
                Position this transparent overlay window directly beneath your webcam lens over your video call (Zoom, Google Meet, Teams).
              </p>
              <p style={{ color: '#94a3b8', fontSize: '15px', marginTop: '10px' }}>
                When the interviewer asks a question, the real-time AI answer will stream right here so you can speak fluently while maintaining direct eye contact.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ════════════ BOTTOM STEALTH TOOLBAR ════════════ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'rgba(12, 12, 20, 0.94)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          gap: '12px',
          fontSize: '12px'
        }}
      >
        {/* Mic Toggle Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={toggleRecording}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isListening ? '#dc2626' : '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: isListening ? '0 0 10px rgba(220, 38, 38, 0.5)' : 'none'
            }}
          >
            {isListening ? (
              <>
                <MicOff size={13} />
                <span>Listening ({diagnosticState.currentDb} dB)</span>
              </>
            ) : (
              <>
                <Mic size={13} />
                <span>Start Listening</span>
              </>
            )}
          </button>

          {/* Real-time speech ticker */}
          {diagnosticState.latestTranscript && diagnosticState.latestTranscript !== '(empty)' && (
            <div
              style={{
                maxWidth: '220px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: '#94a3b8',
                fontSize: '11px'
              }}
              title={diagnosticState.latestTranscript}
            >
              Heard: "{diagnosticState.latestTranscript}"
            </div>
          )}
        </div>

        {/* Quick Test Question Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#64748b', fontSize: '11px' }}>Quick test:</span>
          <button
            onClick={() => handleQuickQuestion('What is AWS CodePipeline?')}
            style={{
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              color: '#c7d2fe',
              borderRadius: '12px',
              padding: '3px 9px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            ⚡ AWS CodePipeline
          </button>
          <button
            onClick={() => handleQuickQuestion('Explain CI/CD in DevOps')}
            style={{
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              color: '#c7d2fe',
              borderRadius: '12px',
              padding: '3px 9px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            ⚡ CI/CD
          </button>
        </div>

        {/* Copy Answer Button */}
        {currentAnswer && (
          <button
            onClick={copyAnswer}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#cbd5e1',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            <Copy size={11} /> Copy
          </button>
        )}
      </div>
    </div>
  );
}
