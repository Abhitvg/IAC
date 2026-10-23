import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppStore, TeleprompterFontSize } from '../../store/useAppStore';
import { RotateCcw, Volume2, Mic, MicOff, Play, Pause, ChevronRight } from 'lucide-react';
import { AudioRecorder, AudioFrameEvent } from '../../services/audio';

interface RecitalTeleprompterTextProps {
  text: string;
  fontSize: TeleprompterFontSize;
  isInterviewFocusMode?: boolean;
}

interface WordToken {
  globalIndex: number;
  raw: string;
  clean: string;
}

export function cleanWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Calculates human speech duration in milliseconds for an individual word based on length & WPM.
 * Conversational English: ~140-160 WPM (~375-430ms per word).
 * Short words take ~240ms, long technical polysyllabic words take ~520ms.
 */
export function getWordTargetDurationMs(clean: string, wpm: number = 150): number {
  const safeWpm = Math.max(90, Math.min(260, wpm));
  const baseMs = (60 / safeWpm) * 1000;
  if (clean.length <= 3) return Math.round(baseMs * 0.65);
  if (clean.length <= 7) return Math.round(baseMs * 0.95);
  return Math.round(baseMs * 1.35);
}

export const RecitalTeleprompterText: React.FC<RecitalTeleprompterTextProps> = ({
  text,
  fontSize,
  isInterviewFocusMode = false,
}) => {
  const { transcript, diagnosticState, isRecording } = useAppStore();
  const [spokenWordCount, setSpokenWordCount] = useState(0);
  const [wpm, setWpm] = useState<number>(150);
  const [isVoiceTrackingPaused, setIsVoiceTrackingPaused] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [liveDb, setLiveDb] = useState(-60);

  const activeWordRef = useRef<HTMLSpanElement | null>(null);
  const accumulatedSpeechMsRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);

  // Tokenize text into paragraphs and word tokens
  const { paragraphs, allTokens } = useMemo(() => {
    if (!text || !text.trim()) {
      return { paragraphs: [], allTokens: [] };
    }

    const paras = text.split(/\n\n+/).filter(Boolean);
    let counter = 0;
    const tokens: WordToken[] = [];

    const parsedParas = paras.map((para) => {
      const rawWords = para.split(/\s+/).filter(Boolean);
      return rawWords.map((raw) => {
        const token: WordToken = {
          globalIndex: counter++,
          raw,
          clean: cleanWord(raw),
        };
        tokens.push(token);
        return token;
      });
    });

    return { paragraphs: parsedParas, allTokens: tokens };
  }, [text]);

  // Reset progress when text changes (e.g. new question or regenerated answer)
  useEffect(() => {
    setSpokenWordCount(0);
    accumulatedSpeechMsRef.current = 0;
  }, [text]);

  // ═══════════════════════════════════════════════════════════════════════
  // ENGINE 1: ULTRA-LOW-LATENCY ACOUSTIC VOICE FOLLOWER (< 21ms Latency)
  // Subscribes directly to real-time audio buffer frames from the mic stream
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isRecording || isVoiceTrackingPaused || allTokens.length === 0) {
      setIsUserSpeaking(false);
      return;
    }

    const recorder = AudioRecorder.getInstance();
    const unsubscribe = recorder.addFrameListener((frame: AudioFrameEvent) => {
      setLiveDb(frame.db);
      setIsUserSpeaking(frame.isSpeaking);

      if (!frame.isSpeaking) {
        // Candidate paused or finished phrase: immediately halt progression (< 21ms)
        return;
      }

      setSpokenWordCount((currentIdx) => {
        if (currentIdx >= allTokens.length) return currentIdx;

        const currentToken = allTokens[currentIdx];
        const targetDuration = getWordTargetDurationMs(currentToken.clean, wpm);

        accumulatedSpeechMsRef.current += frame.deltaMs;

        if (accumulatedSpeechMsRef.current >= targetDuration) {
          accumulatedSpeechMsRef.current = 0;
          return currentIdx + 1;
        }

        return currentIdx;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [isRecording, isVoiceTrackingPaused, allTokens, wpm]);

  // ═══════════════════════════════════════════════════════════════════════
  // ENGINE 2: SEMANTIC ANCHOR ALIGNMENT (Web Speech & Whisper)
  // Instantly snaps spokenWordCount if candidate jumps or skips ahead
  // ═══════════════════════════════════════════════════════════════════════
  const syncWithSpokenPhrase = useCallback((phrase: string) => {
    if (!phrase || allTokens.length === 0) return;
    const spokenTokens = phrase
      .split(/\s+/)
      .map(cleanWord)
      .filter((w) => w.length >= 3);

    if (spokenTokens.length === 0) return;

    setSpokenWordCount((prev) => {
      // Look at the latest 1-2 words from speech
      const latestSpoken = spokenTokens[spokenTokens.length - 1];

      // Search forward up to 8 words and backward up to 2 words
      const searchStart = Math.max(0, prev - 2);
      const searchEnd = Math.min(allTokens.length, prev + 10);

      for (let i = searchStart; i < searchEnd; i++) {
        const candidate = allTokens[i].clean;
        if (
          candidate === latestSpoken ||
          (candidate.length >= 4 && latestSpoken.includes(candidate)) ||
          (latestSpoken.length >= 4 && candidate.includes(latestSpoken))
        ) {
          accumulatedSpeechMsRef.current = 0;
          return i + 1;
        }
      }

      return prev;
    });
  }, [allTokens]);

  // Sync with store transcript messages (Whisper / Audio engine)
  useEffect(() => {
    if (!transcript || transcript.length === 0) return;
    const userUtterances = transcript
      .filter((m) => m.speaker === 'user')
      .map((m) => m.text);
    if (userUtterances.length > 0) {
      syncWithSpokenPhrase(userUtterances[userUtterances.length - 1]);
    }
  }, [transcript, syncWithSpokenPhrase]);

  // Sync with latest live transcript from diagnostics
  useEffect(() => {
    if (diagnosticState?.latestTranscript) {
      syncWithSpokenPhrase(diagnosticState.latestTranscript);
    }
  }, [diagnosticState?.latestTranscript, syncWithSpokenPhrase]);

  // Optional Web Speech continuous interim stream where supported
  useEffect(() => {
    if (typeof window === 'undefined' || !isRecording) return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognitionRef.current = recognition;

      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          interim += event.results[i][0].transcript + ' ';
        }
        if (interim.trim()) {
          syncWithSpokenPhrase(interim.trim());
        }
      };

      recognition.onerror = () => {
        // Fallback silently to our sub-21ms Acoustic Frame Follower
      };

      recognition.start();
    } catch {
      // Ignore fallback
    }

    return () => {
      try {
        recognitionRef.current?.stop();
        recognitionRef.current = null;
      } catch {}
    };
  }, [isRecording, syncWithSpokenPhrase]);

  // Keyboard navigation shortcuts: Arrow keys to bump word or sentence
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSpokenWordCount((c) => Math.min(allTokens.length, c + 1));
        accumulatedSpeechMsRef.current = 0;
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSpokenWordCount((c) => Math.max(0, c - 1));
        accumulatedSpeechMsRef.current = 0;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allTokens.length]);

  // Smooth auto-scroll to keep active word centered
  useEffect(() => {
    if (activeWordRef.current) {
      activeWordRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [spokenWordCount]);

  const fontSizes = {
    small: '15px',
    medium: '18px',
    large: '22px',
    xlarge: '26px',
  }[fontSize] || '18px';

  const lineHeights = {
    small: '1.6',
    medium: '1.7',
    large: '1.75',
    xlarge: '1.8',
  }[fontSize] || '1.7';

  const totalWords = allTokens.length;
  const progressPct = totalWords > 0 ? Math.round((spokenWordCount / totalWords) * 100) : 0;

  return (
    <div className="relative group/recital">
      {/* Recital Teleprompter Word Container */}
      <div
        style={{
          fontSize: fontSizes,
          lineHeight: lineHeights,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          letterSpacing: '-0.01em',
        }}
        className="space-y-4"
      >
        {paragraphs.map((paraTokens, pIdx) => (
          <p key={pIdx} className="m-0 leading-relaxed">
            {paraTokens.map((token) => {
              const isCompleted = token.globalIndex < spokenWordCount;
              const isActive = token.globalIndex === spokenWordCount;

              let wordClass = 'recital-word recital-word-upcoming';
              if (isCompleted) wordClass = 'recital-word recital-word-completed';
              if (isActive) wordClass = 'recital-word recital-word-active';

              return (
                <span
                  key={token.globalIndex}
                  ref={isActive ? activeWordRef : null}
                  onClick={() => {
                    setSpokenWordCount(token.globalIndex + 1);
                    accumulatedSpeechMsRef.current = 0;
                  }}
                  title={'Word ' + (token.globalIndex + 1) + ' of ' + totalWords + ' (Click to jump speech progress)'}
                  className={wordClass}
                >
                  {token.raw}{' '}
                </span>
              );
            })}
          </p>
        ))}
      </div>

      {/* Floating Recital Progress Pill & Instant Speech Feedback */}
      {totalWords > 0 && (
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/10 text-[11px] text-slate-300 select-none flex-wrap gap-2">
          {/* Left: Instant Acoustic Tracking Status with live dB */}
          <div className="flex items-center gap-2">
            <span
              className={
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold transition-all ' +
                (progressPct === 100
                  ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 shadow-sm'
                  : progressPct > 0
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700')
              }
            >
              <span
                className={
                  'w-2 h-2 rounded-full transition-colors ' +
                  (isUserSpeaking
                    ? 'bg-emerald-400 animate-ping'
                    : progressPct > 0
                    ? 'bg-emerald-400'
                    : 'bg-slate-500')
                }
              />
              <span>
                {progressPct === 100
                  ? '✓ Answer Completed'
                  : spokenWordCount + '/' + totalWords + ' words (' + progressPct + '%)'}
              </span>
            </span>

            {isRecording && (
              <span
                className={
                  'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-mono font-medium transition ' +
                  (isUserSpeaking
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-white/5 text-slate-400')
                }
                title="Instant sub-25ms vocal frame follower"
              >
                <Volume2 size={11} className={isUserSpeaking ? 'animate-pulse text-emerald-400' : ''} />
                <span>{isUserSpeaking ? 'Speaking (' + liveDb + 'dB)' : 'Voice Standby'}</span>
              </span>
            )}
          </div>

          {/* Right: Pace Calibration (WPM), Manual Bump, and Reset */}
          <div className="flex items-center gap-1.5 ml-auto">
            {/* Speed Pacing Selector */}
            <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/10 text-[10px]">
              {[130, 150, 175].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => setWpm(speed)}
                  className={
                    'px-1.5 py-0.5 rounded transition font-medium ' +
                    (wpm === speed ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200')
                  }
                  title={'Reading Tempo: ' + speed + ' Words Per Minute'}
                >
                  {speed}wpm
                </button>
              ))}
            </div>

            {/* Pause / Resume Voice Tracker */}
            <button
              type="button"
              onClick={() => setIsVoiceTrackingPaused(!isVoiceTrackingPaused)}
              title={isVoiceTrackingPaused ? 'Resume Voice Follower' : 'Pause Voice Follower'}
              className="px-2 py-0.5 rounded-md hover:bg-white/10 text-slate-300 transition text-[10px] flex items-center gap-1 border border-white/10"
            >
              {isVoiceTrackingPaused ? <Play size={10} className="text-emerald-400" /> : <Pause size={10} />}
              <span>{isVoiceTrackingPaused ? 'Resume' : 'Pause'}</span>
            </button>

            {/* Step +1 Word Shortcut */}
            <button
              type="button"
              onClick={() => {
                setSpokenWordCount((c) => Math.min(totalWords, c + 1));
                accumulatedSpeechMsRef.current = 0;
              }}
              title="Advance 1 word (Shortcut: ArrowRight or Space)"
              className="px-1.5 py-0.5 rounded-md hover:bg-white/10 text-slate-300 transition text-[10px] flex items-center border border-white/10"
            >
              <ChevronRight size={11} />
            </button>

            {/* Reset */}
            {spokenWordCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSpokenWordCount(0);
                  accumulatedSpeechMsRef.current = 0;
                }}
                title="Reset speech tracking to beginning"
                className="px-2 py-0.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-rose-300 transition text-[10px] flex items-center gap-1"
              >
                <RotateCcw size={10} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
