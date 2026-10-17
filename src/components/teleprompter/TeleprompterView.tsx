import { readAndParseFile } from '../../services/resume';
import React, { useEffect, useRef, useState } from "react";
import { useAppStore, TeleprompterFontSize } from "../../store/useAppStore";
import { InterviewEngine } from "../../services/InterviewEngine";
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
  Loader2,
  Send,
  Target,
  FileUp
} from "lucide-react";

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
    setSessionsOpen,
    targetRole,
    setResumeModalOpen,
    setResumeText,
    setJobDescriptionText,
    setToast
  } = useAppStore();

  const isListening =
    status === "listening" ||
    status === "transcribing" ||
    status === "analyzing" ||
    status === "generating";
  const isGenerating = status === "analyzing" || status === "generating";

  // Manual Question Input
  const [manualInput, setManualInput] = useState("");

  // Window-level Drag and Drop support
  const [isWindowDragging, setIsWindowDragging] = useState(false);

  const handleWindowDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsWindowDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    try {
      setToast(`Reading ${file.name}...`);
      const text = await readAndParseFile(file);
      if (!text || !text.trim()) {
        setToast(`Could not extract text from ${file.name}`);
        return;
      }

      const lower = file.name.toLowerCase();
      if (lower.includes('jd') || lower.includes('job') || lower.includes('description')) {
        setJobDescriptionText(text.trim());
        setToast(`🎯 Loaded ${file.name} as Target Job Description!`);
      } else {
        setResumeText(text.trim());
        setToast(`📄 Loaded ${file.name} as Candidate Resume!`);
      }
    } catch (err: any) {
      console.error('File drop error:', err);
      setToast(`Error parsing file: ${err?.message || err}`);
    }
  };

  // Session Timer
  const [seconds, setSeconds] = useState(45);
  const [timerRunning, setTimerRunning] = useState(true);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

  // When a new question is detected, automatically reset teleprompter scroll to top!
  useEffect(() => {
    if (currentQuestion && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentQuestion]);

  const handleRestartScrolling = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const fontSizes: Record<TeleprompterFontSize, { label: string; size: string; line: string }> = {
    small: { label: "Small font", size: "16px", line: "1.75" },
    medium: { label: "Medium font", size: "20px", line: "1.8" },
    large: { label: "Large font", size: "26px", line: "1.85" },
    xlarge: { label: "X-Large font", size: "32px", line: "1.9" },
  };

  const handleExit = () => {
    window.electronAPI?.close();
  };

  const handleTriggerQuestion = (q: string) => {
    if (!q || !q.trim()) return;
    InterviewEngine.handleEvent({ type: "QUESTION_DETECTED", text: q.trim() });
    setManualInput("");
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleTriggerQuestion(manualInput);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsWindowDragging(true); }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsWindowDragging(false);
        }
      }}
      onDrop={handleWindowDrop}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: `rgba(12, 12, 20, ${windowOpacity})`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: isWindowDragging ? "2px dashed #818cf8" : "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "10px",
        overflow: "hidden",
        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.75)",
        userSelect: "none"
      }}
    >
      {/* Drag & Drop Visual Overlay */}
      {isWindowDragging && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 100,
            background: "rgba(15, 15, 30, 0.94)",
            backdropFilter: "blur(12px)",
            border: "2px dashed #818cf8",
            borderRadius: "10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            color: "#f8fafc",
            pointerEvents: "none"
          }}
        >
          <FileUp size={44} style={{ color: "#818cf8" }} />
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#e0e7ff" }}>
            Drop File to Load Candidate Resume or Job Description
          </div>
          <div style={{ fontSize: "12px", color: "#a5b4fc" }}>
            Supports PDF, Word DOCX, Markdown, Text (.pdf, .docx, .txt, .md)
          </div>
        </div>
      )}
      {/* ════════════ TOP TELEPROMPTER CONTROL BAR (Matches Reference Photo) ════════════ */}
      <div
        className="teleprompter-draggable"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: "rgba(18, 18, 28, 0.92)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          gap: "6px",
          flexWrap: "nowrap"
        }}
      >
        {/* Left: Font Size Buttons */}
        <div className="teleprompter-nodrag" style={{ display: "flex", alignItems: "center", gap: "3px" }}>
          {(["small", "medium", "large", "xlarge"] as TeleprompterFontSize[]).map((f) => (
            <button
              key={f}
              onClick={() => setTeleprompterFontSize(f)}
              style={{
                background: teleprompterFontSize === f ? "#3730a3" : "rgba(255, 255, 255, 0.06)",
                color: teleprompterFontSize === f ? "#ffffff" : "#94a3b8",
                border: teleprompterFontSize === f ? "1px solid #6366f1" : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "4px",
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: teleprompterFontSize === f ? 600 : 400,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease"
              }}
            >
              {fontSizes[f].label}
            </button>
          ))}
        </div>

        {/* Center: Scroll Controls & Timer */}
        <div className="teleprompter-nodrag" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <button
            onClick={handleRestartScrolling}
            title="Restart scrolling from the top"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(255, 255, 255, 0.06)",
              color: "#e2e8f0",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 500,
              cursor: "pointer"
            }}
          >
            <RotateCcw size={11} /> Restart scrolling
          </button>

          <button
            onClick={() => setIsAutoScrolling(!isAutoScrolling)}
            title={isAutoScrolling ? "Pause scrolling" : "Resume auto-scroll"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "3px",
              background: isAutoScrolling ? "#1e1b4b" : "rgba(255, 255, 255, 0.06)",
              color: isAutoScrolling ? "#a5b4fc" : "#94a3b8",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              cursor: "pointer"
            }}
          >
            {isAutoScrolling ? <Pause size={11} /> : <Play size={11} />}
            <span>{isAutoScrolling ? "Pause" : "Scroll"}</span>
          </button>

          <button
            onClick={() =>
              setScrollSpeed(
                scrollSpeed === 0.7 ? 1.0 : scrollSpeed === 1.0 ? 1.5 : scrollSpeed === 1.5 ? 2.0 : 0.7
              )
            }
            title="Scroll Speed"
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              color: "#c7d2fe",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "4px",
              padding: "4px 6px",
              fontSize: "11px",
              cursor: "pointer"
            }}
          >
            {scrollSpeed}x
          </button>

          {/* Running Timer Badge (e.g. 00:45) */}
          <div
            onClick={() => setTimerRunning(!timerRunning)}
            title="Click to pause or resume timer"
            style={{
              display: "flex",
              alignItems: "center",
              background: "#1e1b4b",
              border: "1px solid #4338ca",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 700,
              color: "#a5b4fc",
              letterSpacing: "0.5px",
              cursor: "pointer"
            }}
          >
            {formatTimer(seconds)}
          </div>
        </div>

        {/* Right: Opacity Selector, History, Settings, Exit Button */}
        <div className="teleprompter-nodrag" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <select
            value={windowOpacity}
            onChange={(e) => setWindowOpacity(parseFloat(e.target.value))}
            title="Teleprompter Overlay Transparency"
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              color: "#cbd5e1",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "4px",
              padding: "3px 6px",
              fontSize: "11px",
              cursor: "pointer",
              outline: "none"
            }}
          >
            <option value={0.55} style={{ background: "#111827" }}>55% Glass</option>
            <option value={0.78} style={{ background: "#111827" }}>78% Glass</option>
            <option value={0.9} style={{ background: "#111827" }}>90% Glass</option>
            <option value={0.98} style={{ background: "#111827" }}>Solid</option>
          </select>

          <button
            onClick={() => setResumeModalOpen(true)}
            title="Configure Candidate Resume & Target Job Description"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))',
              color: '#e0e7ff',
              border: '1px solid rgba(168, 85, 247, 0.45)',
              borderRadius: '4px',
              padding: '3px 8px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <Target size={12} style={{ color: '#a855f7' }} />
            <span>🎯 {targetRole || 'Resume & JD'}</span>
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            title="AI & Whisper Settings"
            style={{
              background: "transparent",
              color: "#94a3b8",
              border: "none",
              padding: "4px",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            <Settings size={13} />
          </button>

          <button
            onClick={() => setSessionsOpen(true)}
            title="Session History"
            style={{
              background: "transparent",
              color: "#94a3b8",
              border: "none",
              padding: "4px",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            <History size={13} />
          </button>

          {/* Red Exit Button (Matches photo) */}
          <button
            onClick={handleExit}
            style={{
              background: "#e11d48",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s ease"
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
          overflowY: "auto",
          padding: "24px 32px",
          scrollBehavior: "smooth",
          userSelect: "text"
        }}
      >
        {/* Active Detected Question Header */}
        {currentQuestion && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(99, 102, 241, 0.22)",
              border: "1px solid rgba(129, 140, 248, 0.4)",
              borderRadius: "6px",
              padding: "6px 12px",
              marginBottom: "16px",
              color: "#e0e7ff",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.2px"
            }}
          >
            <Sparkles size={13} style={{ color: "#818cf8" }} />
            <span>Q: {currentQuestion}</span>
          </div>
        )}

        {/* Teleprompter Answer Text */}
        <div
          style={{
            fontSize: fontSizes[teleprompterFontSize].size,
            lineHeight: fontSizes[teleprompterFontSize].line,
            color: "#f8fafc",
            fontWeight: 450,
            letterSpacing: "0.25px",
            textShadow: "0 2px 4px rgba(0, 0, 0, 0.95)",
            whiteSpace: "pre-wrap"
          }}
        >
          {currentAnswer ? (
            <div>
              {currentAnswer}
              {isGenerating && (
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "18px",
                    background: "#6366f1",
                    marginLeft: "4px",
                    verticalAlign: "middle",
                    animation: "pulse 1s infinite"
                  }}
                />
              )}
            </div>
          ) : isGenerating ? (
            <div style={{ color: "#94a3b8", display: "flex", alignItems: "center", gap: "8px", fontSize: "18px" }}>
              <Loader2 size={18} className="spin" /> Generating answer live with Groq Qwen 27B...
            </div>
          ) : (
            <div style={{ color: "#cbd5e1", fontSize: "18px", lineHeight: "1.8" }}>
              <p style={{ marginBottom: "12px", color: "#93c5fd", fontWeight: 600 }}>
                ● Eye-Contact Teleprompter Ready
              </p>
              <p style={{ color: "#94a3b8", fontSize: "15px" }}>
                Position this transparent overlay window directly beneath your webcam lens over your video call (Zoom, Google Meet, Teams).
              </p>
              <p style={{ color: "#94a3b8", fontSize: "15px", marginTop: "10px" }}>
                Speak naturally or type any question below — the real-time AI answer will stream right here so you can speak fluently while maintaining continuous eye contact.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ════════════ BOTTOM STEALTH TOOLBAR & INPUT BAR ════════════ */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: "rgba(12, 12, 20, 0.96)",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "8px 14px",
          gap: "8px"
        }}
      >
        {/* Row 1: Direct Question Input Box & Quick Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
          <form
            onSubmit={handleFormSubmit}
            style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}
          >
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Type or paste any interview question & press Enter..."
              style={{
                flex: 1,
                background: "rgba(255, 255, 255, 0.07)",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "12px",
                color: "#f8fafc",
                outline: "none"
              }}
            />
            <button
              type="submit"
              disabled={!manualInput.trim()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: manualInput.trim() ? "#4f46e5" : "rgba(255, 255, 255, 0.05)",
                color: manualInput.trim() ? "#ffffff" : "#64748b",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: manualInput.trim() ? "pointer" : "default",
                whiteSpace: "nowrap"
              }}
            >
              <Send size={11} /> Ask AI
            </button>
          </form>

          {/* Quick Test Question Pills (Resume & JD Grounded) */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <span style={{ color: "#64748b", fontSize: "11px" }}>Quick:</span>
            <button
              onClick={() => handleTriggerQuestion("Tell me about yourself and your background.")}
              title="Answers in 1st-person matching your Resume and target JD"
              style={{
                background: "rgba(168, 85, 247, 0.18)",
                border: "1px solid rgba(168, 85, 247, 0.35)",
                color: "#e9d5ff",
                borderRadius: "12px",
                padding: "3px 8px",
                fontSize: "11px",
                cursor: "pointer"
              }}
            >
              ⚡ About Me
            </button>
            <button
              onClick={() => handleTriggerQuestion("Why are you a good fit for this role?")}
              title="Answers matching your Resume experience to the Job Description"
              style={{
                background: "rgba(168, 85, 247, 0.18)",
                border: "1px solid rgba(168, 85, 247, 0.35)",
                color: "#e9d5ff",
                borderRadius: "12px",
                padding: "3px 8px",
                fontSize: "11px",
                cursor: "pointer"
              }}
            >
              ⚡ Fit for Role
            </button>
            <button
              onClick={() => handleTriggerQuestion("Can you describe a challenging production issue you resolved?")}
              style={{
                background: "rgba(99, 102, 241, 0.15)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                color: "#c7d2fe",
                borderRadius: "12px",
                padding: "3px 8px",
                fontSize: "11px",
                cursor: "pointer"
              }}
            >
              ⚡ Challenge
            </button>
            <button
              onClick={() => handleTriggerQuestion("What is your experience with AWS CodePipeline?")}
              style={{
                background: "rgba(99, 102, 241, 0.15)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                color: "#c7d2fe",
                borderRadius: "12px",
                padding: "3px 8px",
                fontSize: "11px",
                cursor: "pointer"
              }}
            >
              ⚡ CodePipeline
            </button>
          </div>
        </div>

        {/* Row 2: Mic Status & Live Audio Diagnostics */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "#94a3b8"
          }}
        >
          {/* Left: Mic toggle button & Live Hearing Indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={toggleRecording}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: isListening ? "#dc2626" : "#4f46e5",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "4px 10px",
                fontWeight: 600,
                fontSize: "11px",
                cursor: "pointer",
                boxShadow: isListening ? "0 0 10px rgba(220, 38, 38, 0.5)" : "none"
              }}
            >
              {isListening ? (
                <>
                  <MicOff size={12} />
                  <span>Listening ({diagnosticState.currentDb} dB)</span>
                </>
              ) : (
                <>
                  <Mic size={12} />
                  <span>Start Listening</span>
                </>
              )}
            </button>

            {/* Status explanation */}
            <span style={{ color: isListening ? "#86efac" : "#94a3b8" }}>
              {status === "transcribing"
                ? "🎙️ Transcribing speech..."
                : status === "analyzing" || status === "generating"
                ? "⚡ Streaming answer..."
                : isListening
                ? "● Continuous mic active"
                : "Mic paused"}
            </span>

            {/* Live heard ticker */}
            {diagnosticState.latestTranscript && diagnosticState.latestTranscript !== "(empty)" && (
              <span
                style={{
                  maxWidth: "280px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "#cbd5e1"
                }}
                title={diagnosticState.latestTranscript}
              >
                Heard: "{diagnosticState.latestTranscript}"
              </span>
            )}
          </div>

          {/* Right: Copy Answer Button */}
          {currentAnswer && (
            <button
              onClick={copyAnswer}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#cbd5e1",
                borderRadius: "4px",
                padding: "3px 8px",
                fontSize: "11px",
                cursor: "pointer"
              }}
            >
              <Copy size={11} /> Copy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
