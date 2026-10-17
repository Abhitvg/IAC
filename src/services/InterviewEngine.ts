import { buildCandidateSystemPrompt } from './candidatePersona';
import { globalLatencyTracker } from './LatencyTracker';
import { useAppStore } from "../store/useAppStore";
import { AudioRecorder } from "./audio";
import { transcribeAudio, extractQuestions } from "./whisper";
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
            // Return to listening state to capture next speech immediately
            store.setStatus("listening");
            return;
          }

          store.updateDiagnostics({
            latestTranscript: text,
            whisperStatus: "transcribed successfully"
          });

          store.addTranscript({
            id: Date.now().toString(),
            speaker: "interviewer",
            text: text,
            timestamp: Date.now()
          });

          // Check if utterance is a question or interview prompt
          const extracted = extractQuestions(text);
          // Any utterance >= 4 characters during an interview is treated as an active question/prompt
          const matched = extracted.length > 0 || text.length >= 4;
          store.updateDiagnostics({ questionMatched: matched });

          if (matched) {
            InterviewEngine.handleEvent({ type: "QUESTION_DETECTED", text: text });
          } else {
            store.setStatus("listening");
          }
        } catch (e: any) {
          store.updateDiagnostics({
            whisperStatus: "error: " + (e?.message || e)
          });
          console.error("[InterviewEngine] Transcription error:", e);
          store.setStatus("listening"); // Auto-recover so listening is never permanently blocked
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
                  // IMPORTANT: Transition back to listening so subsequent questions are detected continuously!
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
        break;
    }
  }
}
