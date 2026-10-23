import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppStore, TeleprompterFontSize } from '../../store/useAppStore';
import { RotateCcw, Volume2 } from 'lucide-react';

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

function cleanWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export const RecitalTeleprompterText: React.FC<RecitalTeleprompterTextProps> = ({
  text,
  fontSize,
  isInterviewFocusMode = false,
}) => {
  const { transcript, diagnosticState, isRecording } = useAppStore();
  const [spokenWordCount, setSpokenWordCount] = useState(0);
  const activeWordRef = useRef<HTMLSpanElement | null>(null);

  // Parse paragraphs and token stream
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
  }, [text]);

  // Fuzzy matcher to advance spokenWordCount
  const matchAndAdvance = (spokenUtterance: string) => {
    if (!spokenUtterance || allTokens.length === 0) return;
    const spokenTokens = spokenUtterance
      .split(/\s+/)
      .map(cleanWord)
      .filter(Boolean);

    setSpokenWordCount((prev) => {
      let idx = prev;
      for (const token of spokenTokens) {
        if (idx >= allTokens.length) break;
        const expected = allTokens[idx].clean;

        // Direct token match
        if (
          expected === token ||
          (expected.length >= 3 && token.includes(expected)) ||
          (token.length >= 3 && expected.includes(token))
        ) {
          idx++;
          continue;
        }

        // Lookahead up to 3 tokens (e.g., candidate skipped a word or contraction)
        let foundAhead = -1;
        for (let ahead = 1; ahead <= 3 && idx + ahead < allTokens.length; ahead++) {
          const aheadClean = allTokens[idx + ahead].clean;
          if (
            aheadClean === token ||
            (aheadClean.length >= 3 && token.includes(aheadClean)) ||
            (token.length >= 3 && aheadClean.includes(token))
          ) {
            foundAhead = idx + ahead;
            break;
          }
        }

        if (foundAhead !== -1) {
          idx = foundAhead + 1;
        }
      }
      return Math.min(allTokens.length, Math.max(prev, idx));
    });
  };

  // Sync with store transcript messages (Whisper / Audio engine)
  useEffect(() => {
    if (!transcript || transcript.length === 0) return;
    const userUtterances = transcript
      .filter((m) => m.speaker === 'user')
      .map((m) => m.text);
    if (userUtterances.length > 0) {
      matchAndAdvance(userUtterances[userUtterances.length - 1]);
    }
  }, [transcript]);

  // Sync with latest live transcript from diagnostics
  useEffect(() => {
    if (diagnosticState?.latestTranscript) {
      matchAndAdvance(diagnosticState.latestTranscript);
    }
  }, [diagnosticState?.latestTranscript]);

  // Optional zero-latency Web Speech recognition listener for interim word streaming
  useEffect(() => {
    if (typeof window === 'undefined' || !isRecording) return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    let recognition: any = null;
    try {
      recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          interim += event.results[i][0].transcript + ' ';
        }
        if (interim.trim()) {
          matchAndAdvance(interim.trim());
        }
      };

      recognition.onerror = () => {
        // Fallback gracefully to Whisper audio recorder stream
      };

      recognition.start();
    } catch {
      // Ignore if permission or initialization fails, fallback to Whisper transcript
    }

    return () => {
      try {
        recognition?.stop();
      } catch {}
    };
  }, [isRecording, allTokens]);

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
                  onClick={() => setSpokenWordCount(token.globalIndex + 1)}
                  title={'Word ' + (token.globalIndex + 1) + ' of ' + totalWords + ' (Click to set speech progress)'}
                  className={wordClass}
                >
                  {token.raw}{' '}
                </span>
              );
            })}
          </p>
        ))}
      </div>

      {/* Floating Recital Progress Pill */}
      {totalWords > 0 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10 text-[11px] text-slate-400 select-none">
          <div className="flex items-center gap-2">
            <span
              className={
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold ' +
                (progressPct === 100
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                  : progressPct > 0
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700')
              }
            >
              <span
                className={
                  'w-1.5 h-1.5 rounded-full ' +
                  (progressPct > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500')
                }
              />
              <span>
                {progressPct === 100
                  ? '✓ Answer Completed'
                  : spokenWordCount + '/' + totalWords + ' words (' + progressPct + '%)'}
              </span>
            </span>

            {isRecording && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-400/80">
                <Volume2 size={11} className="animate-pulse" />
                <span>Live word tracking active</span>
              </span>
            )}
          </div>

          {spokenWordCount > 0 && (
            <button
              type="button"
              onClick={() => setSpokenWordCount(0)}
              title="Reset speech tracking to beginning"
              className="px-2 py-0.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-slate-200 transition text-[10px] flex items-center gap-1"
            >
              <RotateCcw size={10} />
              <span>Reset</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
