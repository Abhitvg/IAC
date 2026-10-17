import { classifyUtterance } from './interruptionDetector';
import { buildCandidateSystemPrompt } from './candidatePersona';
import { globalLatencyTracker } from './LatencyTracker';
import { useAppStore } from "../store/useAppStore";
import { AudioRecorder } from "./audio";
import { transcribeAudio } from "./whisper";
import { streamAnswer } from "./ai";

const audioService = new AudioRecorder();
let activeAbortController: AbortController | null = null;

export class InterviewEngine {
  static async handleEvent(event: any) {
    const store = useAppStore.getState();

    switch (event.type) {
      case "START_LISTENING":
        globalLatencyTracker.mark("speechStart");
        store.setStatus("listening");
        store.setRecitalState("listening");
        try {
          await audioService.start(async (utteranceBlob: Blob) => {
            if (utteranceBlob.size < 500) {
              store.updateDiagnostics({ whisperStatus: "empty (blob too small)" });
              return;
            }
            store.updateDiagnostics({ whisperStatus: "transcribing..." });
            InterviewEngine.handleEvent({
              type: "UTTERANCE_FINALIZED",
              blob: utteranceBlob
            });
          });
        } catch (e: any) {
          store.updateDiagnostics({ whisperStatus: "Mic error: " + (e?.message || e) });
          console.error("[InterviewEngine] Microphone start error:", e);
          store.setStatus("idle");
          store.setRecitalState("idle");
        }
        break;

      case "UTTERANCE_FINALIZED":
        globalLatencyTracker.mark("speechEnd");
        globalLatencyTracker.mark("transcriptionStart");
        store.setStatus("transcribing");
        try {
          const result = await transcribeAudio(event.blob, store.settings);
          globalLatencyTracker.mark("transcriptionEnd");
          let text = (result?.text || "").trim();

          // Strip non-speech brackets like [BLANK_AUDIO], (beep), [MUSIC], etc.
          text = text.replace(/\[[^\]]+\]|\([^)]+\)/g, "").trim();

          if (!text) {
            store.updateDiagnostics({
              whisperStatus: "no speech detected in utterance"
            });
            store.setStatus("listening");
            return;
          }

          store.updateDiagnostics({
            latestTranscript: text
          });

          // Intelligent Classification: Distinguish Candidate Recital vs. Third-Person Interruption
          const classification = classifyUtterance(
            text,
            store.currentAnswer,
            store.teleprompterQueue
          );

          console.log("[InterviewEngine] Utterance classification:", classification.type, `(${classification.reason})`, `"${text}"`);

          // 1. CANDIDATE RECITAL: Candidate is repeating the teleprompted answer
          // -> Suppress mic echo so it does NOT wipe or re-trigger the teleprompter
          if (classification.type === "CANDIDATE_RECITAL") {
            store.setRecitalState("reciting");
            store.updateDiagnostics({
              whisperStatus: `🗣️ Mic paused for self-speech: ${classification.reason}`,
              recitalState: "reciting",
              questionMatched: false
            });

            store.addTranscript({
              id: Date.now().toString(),
              speaker: "user",
              text: text,
              timestamp: Date.now()
            });

            // Keep the teleprompter answer completely active and visible!
            store.setStatus("listening");
            return;
          }

          // 2. CONVERSATIONAL FILLER ("Yeah", "Okay", "Right")
          if (classification.type === "CONVERSATIONAL_FILLER") {
            store.updateDiagnostics({
              whisperStatus: `Conversational filler ignored ("${text}")`
            });
            store.setStatus("listening");
            return;
          }

          // 3. INTERVIEWER INTERRUPTION OR NEW QUESTION
          // -> Third person interrupted! Immediately react, capture question, and stream answer
          if (classification.type === "INTERVIEWER_INTERRUPTION" || classification.type === "INTERVIEWER_QUESTION") {
            const questionText = classification.questionText || text;
            const isInterruption = classification.type === "INTERVIEWER_INTERRUPTION";

            store.setRecitalState(isInterruption ? "interrupted" : "listening");
            store.setLastInterruption(questionText);
            store.updateDiagnostics({
              latestTranscript: questionText,
              whisperStatus: isInterruption
                ? `⚡ Interviewer interruption: "${questionText.slice(0, 45)}..."`
                : "Interviewer question received",
              recitalState: isInterruption ? "interrupted" : "listening",
              questionMatched: true
            });

            if (isInterruption) {
              store.setToast(`⚡ Third-person interruption: "${questionText.slice(0, 50)}..."`);
            }

            store.addTranscript({
              id: Date.now().toString(),
              speaker: "interviewer",
              text: questionText,
              timestamp: Date.now()
            });

            InterviewEngine.handleEvent({ type: "QUESTION_DETECTED", text: questionText });
            return;
          }

          store.setStatus("listening");
        } catch (e: any) {
          store.updateDiagnostics({
            whisperStatus: "error: " + (e?.message || e)
          });
          console.error("[InterviewEngine] Transcription error:", e);
          store.setStatus("listening");
        }
        break;

      case "QUESTION_DETECTED":
        globalLatencyTracker.mark("questionDetected");
        // Abort previous running generation if another question arrives
        if (activeAbortController) {
          activeAbortController.abort();
          activeAbortController = null;
        }

        activeAbortController = new AbortController();
        store.incrementGenerationId();
        store.clearAnswerQueue();
        store.setCurrentQuestion(event.text);
        store.setCurrentAnswer("");
        store.setStatus("analyzing");
        store.setRecitalState("listening");

        const currentGen = useAppStore.getState().generationId;

        try {
          globalLatencyTracker.mark("generationStart");
          const groqKey = import.meta.env.VITE_GROQ_API_KEY;
          if (!groqKey) {
            throw new Error("VITE_GROQ_API_KEY not configured in .env.local");
          }

          const currentStore = useAppStore.getState();
          const candidateSystemPrompt = buildCandidateSystemPrompt(
            currentStore.resumeText,
            currentStore.jobDescriptionText,
            currentStore.targetRole,
            currentStore.settings?.preferredLanguage || 'JavaScript'
          );

          await streamAnswer(
            event.text,
            {
              type: "groq",
              apiKey: groqKey,
              model: "qwen/qwen3.8-27b",
              temperature: store.settings?.temperature || 0.6,
              maxTokens: store.settings?.maxTokens || 1000,
              systemPrompt: candidateSystemPrompt
            },
            (currentStore.settings?.preferredLanguage || 'javascript') as any,
            {
              onToken: (token) => {
                if (useAppStore.getState().generationId === currentGen) {
                  useAppStore.getState().appendAnswerToken(token);
                  if (useAppStore.getState().status !== "generating") {
                    useAppStore.getState().setStatus("generating");
                  }
                }
              },
              onSentence: (sentence) => {
                if (!(globalLatencyTracker as any)._firstSentenceFired) {
                  (globalLatencyTracker as any)._firstSentenceFired = true;
                  globalLatencyTracker.mark("firstSentence");
                }
                if (useAppStore.getState().generationId === currentGen) {
                  const currentQueue = useAppStore.getState().teleprompterQueue;
                  useAppStore.getState().enqueueSentences([...currentQueue, sentence]);
                }
              },
              onComplete: (full) => {
                globalLatencyTracker.mark("generationEnd");
                console.log("Latency Report:", globalLatencyTracker.getReport());
                if (useAppStore.getState().generationId === currentGen) {
                  useAppStore.getState().setCurrentAnswer(full);
                  // Transition back to listening for third person / candidate speech
                  useAppStore.getState().setRecitalState("listening");
                  useAppStore.getState().setStatus("listening");
                }
              },
              onError: (err) => {
                console.error("[InterviewEngine] Generation stream error:", err);
                store.updateDiagnostics({
                  whisperStatus: "gen error: " + (err.message || String(err))
                });
              }
            },
            activeAbortController.signal
          );
        } catch (e: any) {
          if (e.name !== "AbortError") {
            console.error("[InterviewEngine] Generation Failed:", e.message);
            store.updateDiagnostics({
              whisperStatus: "generation error: " + (e.message || String(e))
            });
            store.setStatus("error");
            setTimeout(() => {
              if (useAppStore.getState().status === "error") {
                console.log("[InterviewEngine] Auto-recovering to listening state.");
                store.setStatus("listening");
              }
            }, 3000);
          }
        }
        break;

      case "STOP_LISTENING":
        if (activeAbortController) {
          activeAbortController.abort();
          activeAbortController = null;
        }
        await audioService.stop();
        store.setStatus("idle");
        store.setRecitalState("idle");
        break;
    }
  }
}
