import { detectLanguageHint } from "../../services/screenSolver";
import { readAndParseFile } from "../../services/resume";
import React, { useEffect, useRef, useState, useMemo } from "react";
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
  FileUp,
  Shield,
  CheckCircle2,
  Volume2,
  Crop,
  ScanText,
  Code,
  Check,
  Terminal
} from "lucide-react";

interface CodeBlockCardProps {
  language: string;
  code: string;
  index: number;
  onCopy: (code: string, index: number) => void;
  isCopied: boolean;
}

function CodeBlockCard({ language, code, index, onCopy, isCopied }: CodeBlockCardProps) {
  const cleanCode = code.trim();
  const lines = cleanCode.split("\n");
  const lineCount = lines.length;
  const displayLang = (language || "code").toUpperCase();

  return (
    <div
      style={{
        margin: "14px 0",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(99, 102, 241, 0.4)",
        background: "#080c16",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.7)",
        fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
      }}
    >
      {/* Code Header Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "7px 12px",
          background: "rgba(255, 255, 255, 0.05)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          fontSize: "11px",
          color: "#94a3b8"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#38bdf8",
              boxShadow: "0 0 8px #38bdf8"
            }}
          />
          <span style={{ fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.5px" }}>
            {displayLang}
          </span>
          <span style={{ color: "#64748b", fontSize: "10px" }}>
            ({lineCount} {lineCount === 1 ? "line" : "lines"})
          </span>
        </div>

        <button
          onClick={() => onCopy(cleanCode, index)}
          title="Copy ONLY this clean code directly to clipboard (ready to paste into LeetCode / HackerRank / Editor)"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            background: isCopied
              ? "rgba(16, 185, 129, 0.3)"
              : "linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(79, 70, 229, 0.5))",
            color: isCopied ? "#6ee7b7" : "#e0e7ff",
            border: isCopied
              ? "1px solid rgba(52, 211, 153, 0.7)"
              : "1px solid rgba(129, 140, 248, 0.5)",
            borderRadius: "5px",
            padding: "4px 10px",
            fontSize: "11px",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
            boxShadow: isCopied ? "0 0 10px rgba(16, 185, 129, 0.4)" : "none"
          }}
        >
          {isCopied ? <Check size={12} /> : <Copy size={12} />}
          <span>{isCopied ? "✓ Copied Code!" : "📋 Copy Code Only"}</span>
        </button>
      </div>

      {/* Code Body with Line Numbers */}
      <div
        style={{
          display: "flex",
          overflowX: "auto",
          padding: "10px 0",
          fontSize: "13px",
          lineHeight: "1.65",
          tabSize: 4
        }}
      >
        {/* Line numbers column */}
        <div
          style={{
            padding: "0 12px 0 14px",
            color: "#475569",
            textAlign: "right",
            userSelect: "none",
            borderRight: "1px solid rgba(255, 255, 255, 0.06)",
            fontSize: "12px",
            lineHeight: "1.65"
          }}
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code Content column */}
        <pre
          style={{
            margin: 0,
            padding: "0 16px",
            color: "#f8fafc",
            fontFamily: "inherit",
            fontSize: "inherit",
            lineHeight: "inherit",
            whiteSpace: "pre",
            userSelect: "text",
            flex: 1
          }}
        >
          {cleanCode}
        </pre>
      </div>
    </div>
  );
}

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
    copyCodeOnly,
    responseMode,
    setResponseMode,
    setSettingsOpen,
    setSessionsOpen,
    targetRole,
    setResumeModalOpen,
    setResumeText,
    setJobDescriptionText,
    setToast,
    recitalState,
    lastInterruption,
    doneAnswering,
    settings,
    updateSetting
  } = useAppStore();

  const isListening =
    status === "listening" ||
    status === "transcribing" ||
    status === "analyzing" ||
    status === "generating";
  const isGenerating = status === "analyzing" || status === "generating";

  const [manualInput, setManualInput] = useState("");
  const [copiedCodeIndices, setCopiedCodeIndices] = useState<Record<number, boolean>>({});
  const [copiedPrimary, setCopiedPrimary] = useState(false);

  const handleCopyCodeBlock = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIndices(prev => ({ ...prev, [index]: true }));
    setToast("💻 Clean code copied to clipboard!");
    setTimeout(() => {
      setCopiedCodeIndices(prev => ({ ...prev, [index]: false }));
    }, 2500);
  };

  const handleCopyPrimaryCode = () => {
    const success = copyCodeOnly();
    if (success) {
      setCopiedPrimary(true);
      setTimeout(() => setCopiedPrimary(false), 2500);
    }
  };

  const [isStealthActive, setIsStealthActive] = useState(true);

  const handleToggleStealth = async () => {
    const next = !isStealthActive;
    setIsStealthActive(next);
    await window.electronAPI?.setContentProtection?.(next);
    setToast(
      next
        ? "🛡️ Screen Stealth ON: Window is completely invisible in screen share (Zoom, Meet, Teams)"
        : "⚠️ Screen Stealth OFF: Window is now visible in screen share"
    );
  };

  const [isScreenReading, setIsScreenReading] = useState(false);

  const handleScreenCapture = async (mode: "fullscreen" | "snip" = "fullscreen") => {
    if (isScreenReading) return;
    setIsScreenReading(true);
    setToast(
      mode === "snip"
        ? "✂️ Snip Active: Drag a rectangle directly over the question or code on screen"
        : "📸 Reading interviewer screen via Apple Vision Neural OCR..."
    );

    try {
      const res = await window.electronAPI?.captureScreenAndOCR?.(mode);
      if (res?.cancelled) {
        setToast("Screen capture cancelled.");
        setIsScreenReading(false);
        return;
      }
      if (!res?.success || !res?.text) {
        setToast(res?.error || "No readable text or code found on screen.");
        setIsScreenReading(false);
        return;
      }

      const lang = detectLanguageHint(res.text);
      if (lang.isNonEnglish) {
        setToast(`🌐 Screen is in ${lang.languageName} ${lang.flag}! Translating to English & solving...`);
      } else {
        setToast("🧠 Problem extracted from screen! Generating 100% verified solution...");
      }
      InterviewEngine.handleEvent({
        type: "SCREEN_PROBLEM_DETECTED",
        rawText: res.text,
        mode
      });
    } catch (err: any) {
      console.error("[TeleprompterView] Screen capture error:", err);
      setToast("Screen capture error: " + (err?.message || err));
    } finally {
      setIsScreenReading(false);
    }
  };

  const [isWindowDragging, setIsWindowDragging] = useState(false);

  const handleWindowDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsWindowDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "webp", "bmp", "tiff"].includes(ext || "")) {
      try {
        setToast(`📸 Reading ${file.name} with Apple Vision Neural OCR...`);
        const res = await window.electronAPI?.ocrImageFile?.((file as any).path);
        if (res?.success && res.text) {
          const lang = detectLanguageHint(res.text);
          if (lang.isNonEnglish) {
            setToast(`🌐 Detected ${lang.languageName} ${lang.flag} in ${file.name}! Translating to English & solving...`);
          } else {
            setToast(`🧠 Extracted problem from ${file.name}! Solving with 0-hallucination verification...`);
          }
          InterviewEngine.handleEvent({
            type: "SCREEN_PROBLEM_DETECTED",
            rawText: res.text,
            mode: "fullscreen"
          });
          return;
        } else {
          setToast(res?.error || "No readable text found in dropped image.");
          return;
        }
      } catch (err: any) {
        console.error("Image OCR error:", err);
        setToast("Image OCR error: " + (err?.message || err));
        return;
      }
    }

    try {
      setToast(`Reading ${file.name}...`);
      const text = await readAndParseFile(file);
      if (!text || !text.trim()) {
        setToast(`Could not extract text from ${file.name}`);
        return;
      }

      const lower = file.name.toLowerCase();
      if (lower.includes("jd") || lower.includes("job") || lower.includes("description")) {
        setJobDescriptionText(text.trim());
        setToast(`🎯 Loaded ${file.name} as Target Job Description!`);
      } else {
        setResumeText(text.trim());
        setToast(`📄 Loaded ${file.name} as Candidate Resume!`);
      }
    } catch (err: any) {
      console.error("File drop error:", err);
      setToast(`Error parsing file: ${err?.message || err}`);
    }
  };

  const [seconds, setSeconds] = useState(0);
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

  useEffect(() => {
    if (currentQuestion) {
      setSeconds(0);
      setTimerRunning(true);
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [currentQuestion]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.code === "KeyS" || e.key.toLowerCase() === "s")) {
        e.preventDefault();
        handleScreenCapture("fullscreen");
        return;
      }

      if (e.code === "Space" && currentAnswer) {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== "INPUT" && activeTag !== "TEXTAREA") {
          e.preventDefault();
          doneAnswering();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentAnswer, doneAnswering]);

  const handleRestartScrolling = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const fontSizes: Record<TeleprompterFontSize, { label: string; size: string; line: string }> = {
    small: { label: "Small", size: "15px", line: "1.7" },
    medium: { label: "Medium", size: "18px", line: "1.75" },
    large: { label: "Large", size: "23px", line: "1.8" },
    xlarge: { label: "XL", size: "28px", line: "1.85" },
  };

  const handleExit = () => {
    window.electronAPI?.close();
  };

  const handleTriggerQuestion = (q: string) => {
    if (!q || !q.trim()) return;
    InterviewEngine.handleEvent({
      type: "QUESTION_DETECTED",
      text: q.trim()
    });
  };

  const wordCount = currentAnswer ? currentAnswer.trim().split(/\s+/).filter(Boolean).length : 0;
  const estMinutes = (wordCount / 135).toFixed(1);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleTriggerQuestion(manualInput.trim());
    setManualInput("");
  };

  // Parse Answer into Structured Segments (Text vs. Code Blocks vs. Quiz Highlights)
  const parsedSegments = useMemo(() => {
    if (!currentAnswer) return [];

    const segments: Array<{ type: "text" | "code"; content?: string; language?: string; code?: string }> = [];
    const codeBlockRegex = new RegExp("```([a-zA-Z0-9_-]*)\\n([\\s\\S]*?)(?:```|$)", "g");
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(currentAnswer)) !== null) {
      if (match.index > lastIndex) {
        const text = currentAnswer.slice(lastIndex, match.index).trim();
        if (text) {
          segments.push({ type: "text", content: text });
        }
      }

      const lang = match[1] || settings?.preferredLanguage?.toLowerCase() || "code";
      const code = match[2] || "";
      segments.push({
        type: "code",
        language: lang,
        code: code
      });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < currentAnswer.length) {
      const remainingText = currentAnswer.slice(lastIndex).trim();
      if (remainingText) {
        segments.push({ type: "text", content: remainingText });
      }
    }

    return segments;
  }, [currentAnswer, settings?.preferredLanguage]);

  const hasCodeBlock = useMemo(() => {
    return parsedSegments.some(s => s.type === "code" && s.code && s.code.trim().length > 0);
  }, [parsedSegments]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsWindowDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsWindowDragging(false);
        }
      }}
      onDrop={handleWindowDrop}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: `rgba(8, 10, 20, ${windowOpacity})`,
        color: "#f8fafc",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "8px",
        boxSizing: "border-box",
        position: "relative"
      }}
    >
      {/* Drag & Drop Overlay */}
      {isWindowDragging && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 100,
            background: "rgba(15, 15, 30, 0.94)",
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
            Drop File to Load Resume, Job Description, or Question Image
          </div>
          <div style={{ fontSize: "12px", color: "#a5b4fc" }}>
            Supports PDF, Word DOCX, Text, and Screenshots (.png, .jpg, .webp, .pdf, .docx)
          </div>
        </div>
      )}

      {/* ════════════ TOP TELEPROMPTER CONTROL BAR ════════════ */}
      <div
        className="teleprompter-draggable"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: `rgba(16, 18, 30, ${Math.min(0.72, windowOpacity * 0.75 + 0.15)})`,
          borderBottom: "1px solid rgba(255, 255, 255, 0.10)",
          gap: "8px",
          flexWrap: "nowrap"
        }}
      >
        {/* Left: Mode Selector Pills (Coding / Interview / Quiz) */}
        <div className="teleprompter-nodrag" style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(0, 0, 0, 0.45)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "6px",
              padding: "2px",
              gap: "2px"
            }}
          >
            {[
              { id: "coding", label: "💻 Coding", title: "Coding Mode: 100% verified compilable code, syntax card, Big-O & 1-click copy" },
              { id: "interview", label: "🎙️ Interview", title: "Interview Mode: Spoken STAR answers, eye-contact teleprompter flow" },
              { id: "quiz", label: "📝 Quiz", title: "Quiz / MCQ Mode: High-contrast correct answer banner + 1-sentence proof" }
            ].map((m) => {
              const active = responseMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setResponseMode(m.id as any);
                    setToast(`Mode switched to: ${m.label}`);
                  }}
                  title={m.title}
                  style={{
                    background: active
                      ? m.id === "coding"
                        ? "linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(79, 70, 229, 0.95))"
                        : m.id === "quiz"
                        ? "linear-gradient(135deg, rgba(16, 185, 129, 0.9), rgba(5, 150, 105, 0.95))"
                        : "linear-gradient(135deg, rgba(168, 85, 247, 0.9), rgba(147, 51, 234, 0.95))"
                      : "transparent",
                    color: active ? "#ffffff" : "#94a3b8",
                    border: active ? "1px solid rgba(255, 255, 255, 0.3)" : "1px solid transparent",
                    borderRadius: "4px",
                    padding: "3px 8px",
                    fontSize: "11px",
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                    boxShadow: active ? "0 2px 6px rgba(0, 0, 0, 0.4)" : "none"
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* If in Coding Mode: Show Language Selector Dropdown */}
          {responseMode === "coding" && (
            <select
              value={settings?.preferredLanguage || "Java"}
              onChange={(e) => {
                updateSetting("preferredLanguage", e.target.value);
                setToast(`💻 Coding Language: ${e.target.value}`);
              }}
              title="Preferred programming language for coding challenge solutions"
              style={{
                background: "rgba(99, 102, 241, 0.25)",
                color: "#e0e7ff",
                border: "1px solid rgba(129, 140, 248, 0.45)",
                borderRadius: "4px",
                padding: "3px 6px",
                fontSize: "11px",
                fontWeight: 650,
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="Java" style={{ background: "#0f172a", color: "#fff" }}>☕ Java</option>
              <option value="Python" style={{ background: "#0f172a", color: "#fff" }}>🐍 Python</option>
              <option value="TypeScript" style={{ background: "#0f172a", color: "#fff" }}>🔷 TypeScript</option>
              <option value="JavaScript" style={{ background: "#0f172a", color: "#fff" }}>⚡ JavaScript</option>
              <option value="C++" style={{ background: "#0f172a", color: "#fff" }}>⚙️ C++</option>
              <option value="Go" style={{ background: "#0f172a", color: "#fff" }}>🐹 Go</option>
              <option value="SQL" style={{ background: "#0f172a", color: "#fff" }}>🗄️ SQL</option>
            </select>
          )}

          {/* Font Size Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            {(["small", "medium", "large", "xlarge"] as TeleprompterFontSize[]).map((f) => (
              <button
                key={f}
                onClick={() => setTeleprompterFontSize(f)}
                style={{
                  background: teleprompterFontSize === f ? "#3730a3" : "rgba(255, 255, 255, 0.06)",
                  color: teleprompterFontSize === f ? "#ffffff" : "#94a3b8",
                  border: teleprompterFontSize === f ? "1px solid #6366f1" : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "4px",
                  padding: "3px 6px",
                  fontSize: "10px",
                  fontWeight: teleprompterFontSize === f ? 700 : 400,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease"
                }}
              >
                {fontSizes[f].label}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Scroll Controls & Timer */}
        <div className="teleprompter-nodrag" style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
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
            <RotateCcw size={11} /> Restart
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

          {/* Live Session Timer Badge */}
          <div
            onClick={() => setTimerRunning(!timerRunning)}
            title="Click to pause or reset session timer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "#1e1b4b",
              border: "1px solid #4338ca",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "11px",
              fontWeight: 700,
              color: "#a5b4fc",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
          >
            <span>⏱️</span>
            <span>{formatTimer(seconds)}</span>
          </div>

          {/* Word Count & Read Time Badge */}
          {currentAnswer && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "4px",
                padding: "4px 7px",
                fontSize: "11px",
                color: "#cbd5e1",
                whiteSpace: "nowrap"
              }}
              title="Target: ~380-430 words for a standard 3-minute spoken response"
            >
              <span>📊</span>
              <span>{wordCount} words (~{estMinutes}m)</span>
            </div>
          )}
        </div>

        {/* Right: Opacity Selector, Stealth, Resume Modal, Settings, History, Exit */}
        <div className="teleprompter-nodrag" style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <button
              onClick={() => setWindowOpacity(Math.max(0.12, Math.round((windowOpacity - 0.1) * 100) / 100))}
              title="More transparent (Clearer glass)"
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                color: "#e2e8f0",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "4px",
                padding: "2px 6px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              -
            </button>
            <select
              value={windowOpacity}
              onChange={(e) => setWindowOpacity(parseFloat(e.target.value))}
              title="Teleprompter Overlay Transparency"
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                color: "#e0e7ff",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                borderRadius: "4px",
                padding: "3px 6px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value={0.15} style={{ background: "#111827" }}>15% Ultra Clear</option>
              <option value={0.25} style={{ background: "#111827" }}>25% Clear Glass</option>
              <option value={0.35} style={{ background: "#111827" }}>35% Frosted Glass</option>
              <option value={0.50} style={{ background: "#111827" }}>50% Medium Glass</option>
              <option value={0.70} style={{ background: "#111827" }}>70% Deep Glass</option>
              <option value={0.88} style={{ background: "#111827" }}>88% High Contrast</option>
              <option value={0.98} style={{ background: "#111827" }}>98% Solid Dark</option>
            </select>
            <button
              onClick={() => setWindowOpacity(Math.min(0.98, Math.round((windowOpacity + 0.1) * 100) / 100))}
              title="Less transparent (More solid)"
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                color: "#e2e8f0",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "4px",
                padding: "2px 6px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              +
            </button>
          </div>

          <button
            onClick={handleToggleStealth}
            title={
              isStealthActive
                ? "Screen Stealth ON: Teleprompter is 100% invisible to Zoom, Google Meet, Teams, Discord & recordings"
                : "Screen Stealth OFF: Teleprompter is visible to screen share"
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: isStealthActive ? "rgba(16, 185, 129, 0.16)" : "rgba(239, 68, 68, 0.16)",
              border: isStealthActive ? "1px solid rgba(52, 211, 153, 0.4)" : "1px solid rgba(239, 68, 68, 0.4)",
              color: isStealthActive ? "#6ee7b7" : "#fca5a5",
              borderRadius: "4px",
              padding: "3px 8px",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease"
            }}
          >
            <Shield size={12} style={{ color: isStealthActive ? "#34d399" : "#f87171" }} />
            <span>{isStealthActive ? "Stealth ON" : "Stealth OFF"}</span>
          </button>

          <button
            onClick={() => setResumeModalOpen(true)}
            title="Configure Candidate Resume & Target Job Description"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))",
              color: "#e0e7ff",
              border: "1px solid rgba(168, 85, 247, 0.45)",
              borderRadius: "4px",
              padding: "3px 8px",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            <Target size={12} style={{ color: "#a855f7" }} />
            <span>🎯 {targetRole || "Resume & JD"}</span>
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
          padding: "20px 28px",
          scrollBehavior: "smooth",
          userSelect: "text"
        }}
      >
        {/* Active Detected Question Header & Done Answering Button */}
        {currentQuestion && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              background: "rgba(99, 102, 241, 0.22)",
              border: "1px solid rgba(129, 140, 248, 0.4)",
              borderRadius: "6px",
              padding: "6px 12px",
              marginBottom: "10px",
              color: "#e0e7ff",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.2px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, overflow: "hidden" }}>
              <Sparkles size={13} style={{ color: "#818cf8", flexShrink: 0 }} />
              <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                Q: {currentQuestion}
              </span>
            </div>

            {currentAnswer && (
              <button
                onClick={doneAnswering}
                title="Mark answer complete and listen for next question (or press Space)"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "rgba(34, 197, 94, 0.2)",
                  border: "1px solid rgba(74, 222, 128, 0.5)",
                  color: "#86efac",
                  borderRadius: "4px",
                  padding: "3px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }}
              >
                <CheckCircle2 size={12} />
                <span>Done Answering (Space)</span>
              </button>
            )}
          </div>
        )}

        {/* Floating Quick Action: Copy Code 1-Click Banner (When Code is Detected) */}
        {hasCodeBlock && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              background: "linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.2))",
              border: "1px solid rgba(129, 140, 248, 0.45)",
              borderRadius: "6px",
              padding: "6px 12px",
              marginBottom: "12px",
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.3)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#c7d2fe", fontWeight: 600 }}>
              <Terminal size={14} style={{ color: "#818cf8" }} />
              <span>💻 Optimal Compilable Code Solution Ready ({settings?.preferredLanguage || "Java"})</span>
            </div>

            <button
              onClick={handleCopyPrimaryCode}
              title="Copy the code solution directly to clipboard (ready for LeetCode / HackerRank / IDE)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: copiedPrimary
                  ? "rgba(16, 185, 129, 0.35)"
                  : "linear-gradient(135deg, #4f46e5, #4338ca)",
                color: copiedPrimary ? "#6ee7b7" : "#ffffff",
                border: copiedPrimary ? "1px solid #10b981" : "1px solid #6366f1",
                borderRadius: "5px",
                padding: "4px 12px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 8px rgba(79, 70, 229, 0.4)",
                transition: "all 0.15s ease"
              }}
            >
              {copiedPrimary ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedPrimary ? "✓ Code Copied!" : "📋 Copy Code (1-Click)"}</span>
            </button>
          </div>
        )}

        {/* Dynamic Recital / Interruption Banner */}
        {recitalState === "reciting" && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(59, 130, 246, 0.18)",
              border: "1px solid rgba(96, 165, 250, 0.4)",
              borderRadius: "6px",
              padding: "6px 12px",
              marginBottom: "14px",
              color: "#93c5fd",
              fontSize: "12px",
              fontWeight: 600
            }}
          >
            <Volume2 size={13} style={{ color: "#60a5fa" }} />
            <span>🗣️ Reciting Answer: Mic is automatically paused for your speech • Auto-listening for interruptions</span>
          </div>
        )}

        {recitalState === "interrupted" && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(239, 68, 68, 0.24)",
              border: "1px solid rgba(248, 113, 113, 0.55)",
              borderRadius: "6px",
              padding: "6px 12px",
              marginBottom: "14px",
              color: "#fca5a5",
              fontSize: "12px",
              fontWeight: 600
            }}
          >
            <span style={{ fontSize: "14px" }}>⚡</span>
            <span>Interviewer Interruption Detected: "{lastInterruption || currentQuestion}" — Reacting live</span>
          </div>
        )}

        {/* Teleprompter Answer Content Area */}
        <div
          style={{
            fontSize: fontSizes[teleprompterFontSize].size,
            lineHeight: fontSizes[teleprompterFontSize].line,
            color: "#f8fafc",
            fontWeight: 450,
            letterSpacing: "0.2px",
            textShadow: "0 1px 3px rgba(0, 0, 0, 0.98), 0 2px 8px rgba(0, 0, 0, 0.9), 0 0 16px rgba(0, 0, 0, 0.7)"
          }}
        >
          {currentAnswer ? (
            <div>
              {parsedSegments.map((segment, idx) => {
                if (segment.type === "code" && segment.code) {
                  return (
                    <CodeBlockCard
                      key={idx}
                      index={idx}
                      language={segment.language || settings?.preferredLanguage || "code"}
                      code={segment.code}
                      onCopy={handleCopyCodeBlock}
                      isCopied={!!copiedCodeIndices[idx]}
                    />
                  );
                }

                const text = segment.content || "";
                const isQuizHighlight = text.includes("CORRECT ANSWER:") || text.includes("CORRECT OPTION:");

                if (isQuizHighlight) {
                  return (
                    <div
                      key={idx}
                      style={{
                        margin: "12px 0 16px 0",
                        padding: "12px 16px",
                        background: "linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.15))",
                        border: "2px solid rgba(52, 211, 153, 0.7)",
                        borderRadius: "8px",
                        boxShadow: "0 0 20px rgba(16, 185, 129, 0.25)",
                        color: "#f0fdf4",
                        whiteSpace: "pre-wrap"
                      }}
                    >
                      {text}
                    </div>
                  );
                }

                return (
                  <div key={idx} style={{ whiteSpace: "pre-wrap", marginBottom: "12px" }}>
                    {text}
                  </div>
                );
              })}

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
              <p style={{ marginBottom: "10px", color: "#93c5fd", fontWeight: 600 }}>
                ● Teleprompter & Code Assistant Ready
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "10px",
                  margin: "14px 0",
                  fontSize: "13px"
                }}
              >
                <div style={{ background: "rgba(99, 102, 241, 0.12)", border: "1px solid rgba(129, 140, 248, 0.3)", borderRadius: "6px", padding: "10px" }}>
                  <div style={{ fontWeight: 700, color: "#a5b4fc", marginBottom: "4px" }}>💻 Coding Mode</div>
                  <div style={{ color: "#94a3b8", fontSize: "12px", lineHeight: "1.5" }}>
                    Verified, runnable code in your language with line numbers, Big-O proof, and 1-click clipboard copy.
                  </div>
                </div>
                <div style={{ background: "rgba(168, 85, 247, 0.12)", border: "1px solid rgba(192, 132, 252, 0.3)", borderRadius: "6px", padding: "10px" }}>
                  <div style={{ fontWeight: 700, color: "#d8b4fe", marginBottom: "4px" }}>🎙️ Interview Mode</div>
                  <div style={{ color: "#94a3b8", fontSize: "12px", lineHeight: "1.5" }}>
                    Natural first-person spoken STAR responses tailored to your candidate persona (Abhishek Singh).
                  </div>
                </div>
                <div style={{ background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(52, 211, 153, 0.3)", borderRadius: "6px", padding: "10px" }}>
                  <div style={{ fontWeight: 700, color: "#86efac", marginBottom: "4px" }}>📝 Quiz / MCQ Mode</div>
                  <div style={{ color: "#94a3b8", fontSize: "12px", lineHeight: "1.5" }}>
                    Instant highlighted correct option with 1-line proof and brief explanation of why other options are wrong.
                  </div>
                </div>
              </div>
              <p style={{ color: "#94a3b8", fontSize: "14px" }}>
                Use <strong>📸 Solve Screen (⌘⇧S)</strong> or <strong>✂️ Snip Box</strong> to solve any question on your screen instantly.
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
          background: `rgba(12, 14, 24, ${Math.min(0.78, windowOpacity * 0.75 + 0.18)})`,
          borderTop: "1px solid rgba(255, 255, 255, 0.10)",
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
              placeholder="Type or paste any interview / coding question & press Enter..."
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
                background: manualInput.trim() ? "#4f46e5" : "rgba(255, 255, 255, 0.08)",
                color: manualInput.trim() ? "#ffffff" : "#64748b",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontWeight: 600,
                fontSize: "12px",
                cursor: manualInput.trim() ? "pointer" : "default"
              }}
            >
              <Send size={12} />
              <span>Solve</span>
            </button>
          </form>

          {/* Quick-Test Buttons tailored to Coding, Quiz & Interview */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <button
              onClick={() => {
                setResponseMode("coding");
                handleTriggerQuestion("Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. Provide optimal O(N) solution with Hash Table.");
              }}
              title="Test Coding Challenge Mode (Two Sum in preferred language)"
              style={{
                background: "linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(79, 70, 229, 0.25))",
                border: "1px solid rgba(129, 140, 248, 0.55)",
                color: "#c7d2fe",
                borderRadius: "12px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              💻 Two Sum
            </button>
            <button
              onClick={() => {
                setResponseMode("quiz");
                handleTriggerQuestion("Question: Which of the following is true regarding Inodes in Unix filesystems?\nA) They store file name and data\nB) They store file metadata and data block pointers\nC) They reside in MBR\nD) They are only used in FAT32\nSelect the single correct option and justify.");
              }}
              title="Test Quiz / MCQ Mode (Highlight correct answer + proof)"
              style={{
                background: "linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.25))",
                border: "1px solid rgba(52, 211, 153, 0.55)",
                color: "#a7f3d0",
                borderRadius: "12px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              📝 MCQ Quiz
            </button>
            <button
              onClick={() => {
                setResponseMode("interview");
                handleTriggerQuestion("Tell me about a challenging distributed systems backend issue you solved at ATMA Research or Quorum.");
              }}
              title="Test Behavioral / STAR Interview Response Mode"
              style={{
                background: "linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(147, 51, 234, 0.25))",
                border: "1px solid rgba(192, 132, 252, 0.55)",
                color: "#e9d5ff",
                borderRadius: "12px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              🎙️ Behavioral
            </button>
            <button
              onClick={() => InterviewEngine.handleEvent({
                type: "SCREEN_PROBLEM_DETECTED",
                rawText: "Pregunta: Dado un arreglo de números enteros nums y un valor entero target, devuelva los índices de los dos elementos que sumados sean iguales a target. Asuma que cada entrada tiene exactamente una solución y no use el mismo elemento dos veces. Ejemplo: nums = [2, 7, 11, 15], target = 9 -> Salida: [0, 1]",
                mode: "fullscreen"
              })}
              title="Test Automatic Spanish Detection, English Translation & Code Solution"
              style={{
                background: "linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(220, 38, 38, 0.25))",
                border: "1px solid rgba(248, 113, 113, 0.55)",
                color: "#fecaca",
                borderRadius: "12px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              🇪🇸 Spanish
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
          {/* Screen OCR & Solve Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <button
              onClick={() => handleScreenCapture("fullscreen")}
              disabled={isScreenReading}
              title="Capture Interviewer's Shared Screen & Solve 100% accurately (Shortcut: Cmd+Shift+S)"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                background: isScreenReading
                  ? "rgba(245, 158, 11, 0.3)"
                  : "linear-gradient(135deg, rgba(16, 185, 129, 0.28), rgba(5, 150, 105, 0.28))",
                color: isScreenReading ? "#fde68a" : "#6ee7b7",
                border: isScreenReading ? "1px solid #f59e0b" : "1px solid rgba(52, 211, 153, 0.45)",
                borderRadius: "6px",
                padding: "4px 10px",
                fontWeight: 650,
                fontSize: "11px",
                cursor: isScreenReading ? "wait" : "pointer",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap"
              }}
            >
              {isScreenReading ? <Loader2 size={12} className="spin" /> : <ScanText size={12} />}
              <span>{isScreenReading ? "Reading Screen..." : "📸 Solve Screen (⌘⇧S)"}</span>
            </button>

            <button
              onClick={() => handleScreenCapture("snip")}
              disabled={isScreenReading}
              title="Snip specific question box / code snippet on screen"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(99, 102, 241, 0.2)",
                color: "#c7d2fe",
                border: "1px solid rgba(129, 140, 248, 0.35)",
                borderRadius: "6px",
                padding: "4px 8px",
                fontWeight: 600,
                fontSize: "11px",
                cursor: isScreenReading ? "wait" : "pointer",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap"
              }}
            >
              <Crop size={11} />
              <span>✂️ Snip Box</span>
            </button>
          </div>

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
            <span
              style={{
                color:
                  recitalState === "reciting"
                    ? "#93c5fd"
                    : recitalState === "interrupted"
                    ? "#fca5a5"
                    : isListening
                    ? "#86efac"
                    : "#94a3b8"
              }}
            >
              {status === "transcribing"
                ? "🎙️ Transcribing speech..."
                : status === "analyzing" || status === "generating"
                ? "⚡ Streaming answer..."
                : recitalState === "reciting"
                ? "🗣️ Candidate answering (mic echo paused • listening for third person)"
                : recitalState === "interrupted"
                ? "⚡ Interviewer interrupted! Reacting live..."
                : isListening
                ? "● Continuous mic active (auto echo-filtering)"
                : "Mic paused"}
            </span>

            {/* Live heard ticker */}
            {diagnosticState.latestTranscript && diagnosticState.latestTranscript !== "(empty)" && (
              <span
                style={{
                  maxWidth: "240px",
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

          {/* Right: Copy Full Answer Button */}
          {currentAnswer && (
            <button
              onClick={copyAnswer}
              title="Copy entire answer including explanations to clipboard"
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
              <Copy size={11} /> Copy Full Answer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}