import { globalLatencyTracker } from './LatencyTracker';
import { useAppStore } from '../store/useAppStore';
import { AudioRecorder } from './audio';
import { transcribeAudio } from './whisper';
import { streamAnswer } from './ai';
import { extractQuestions } from './whisper';

const audioService = new AudioRecorder();
let activeAbortController: AbortController | null = null;

export class InterviewEngine {
    static async handleEvent(event: any) {
        const store = useAppStore.getState();
        
        switch(event.type) {
            case 'START_LISTENING':
                globalLatencyTracker.mark('speechStart');
                store.setStatus('listening');
                try {
                    await audioService.start(async (utteranceBlob) => {
                        if (utteranceBlob.size < 500) {
                        store.updateDiagnostics({ whisperStatus: 'empty (blob too small)' });
                        return;
                    }
                    store.updateDiagnostics({ whisperStatus: 'pending' });
                    InterviewEngine.handleEvent({ type: 'UTTERANCE_FINALIZED', blob: utteranceBlob });
                });
                } catch (e: any) {
                    store.updateDiagnostics({ whisperStatus: 'error: ' + e.message });
                    console.error('Microphone start error:', e);
                    store.setStatus('idle');
                }
                break;
                
            case 'UTTERANCE_FINALIZED':
                globalLatencyTracker.mark('speechEnd');
                globalLatencyTracker.mark('transcriptionStart');
                store.setStatus('transcribing');
                try {
                    const result = await transcribeAudio(event.blob, store.settings);
                    globalLatencyTracker.mark('transcriptionEnd');
                    store.updateDiagnostics({ latestTranscript: result.text || '(empty)', whisperStatus: result.text ? 'success' : 'empty' });
                    
                    if (result && result.text.length > 5) {
                        // "D. Display the transcript as soon as transcription succeeds, even if question classification fails."
                        
                        store.addTranscript({ id: Date.now().toString(), speaker: 'unknown', text: result.text, timestamp: Date.now() });
                        
                        const extracted = extractQuestions(result.text);
                        const matched = extracted.length > 0 || result.text.length > 20;
                        store.updateDiagnostics({ questionMatched: matched });
                        
                        if (matched) {
                             InterviewEngine.handleEvent({ type: 'QUESTION_DETECTED', text: result.text });
                        } else {
                             store.setStatus('listening');
                        }
                    } else {
                        store.setStatus('listening');
                    }
                } catch(e: any) {
                    store.updateDiagnostics({ whisperStatus: 'error: ' + e.message });
                    console.error('Transcription error:', e);
                    store.setStatus('listening'); // Auto-recover
                }
                break;

            case 'QUESTION_DETECTED':
                globalLatencyTracker.mark('questionDetected');
// Cancellation logic
                if (activeAbortController) {
                    activeAbortController.abort();
                    activeAbortController = null;
                }
                
                activeAbortController = new AbortController();
                store.incrementGenerationId();
                store.clearAnswerQueue();
                store.setCurrentQuestion(event.text);
                store.setStatus('analyzing');
                
                const currentGen = useAppStore.getState().generationId;
                
                try {
                    globalLatencyTracker.mark('generationStart');
                    await streamAnswer(
                        event.text, 
                        {
                            type: 'groq',
                            apiKey: import.meta.env.VITE_GROQ_API_KEY,
                            model: 'llama-3.1-8b-instant',
                            temperature: store.settings?.temperature || 0.7,
                            maxTokens: store.settings?.maxTokens || 1000,
                            systemPrompt: 'You are an expert technical interviewer.'
                        }, 
                        'javascript', 
                        {
                            onSentence: (sentence) => {
                                if (!(globalLatencyTracker as any)._firstSentenceFired) {
                                    (globalLatencyTracker as any)._firstSentenceFired = true;
                                    globalLatencyTracker.mark('firstSentence');
                                }
                                if (useAppStore.getState().generationId === currentGen) {
                                    useAppStore.getState().enqueueSentences([...useAppStore.getState().teleprompterQueue, sentence]);
                                }
                            },
                            onComplete: (full) => {
                                globalLatencyTracker.mark('generationEnd');
                                console.log('Latency Report:', globalLatencyTracker.getReport());
                                if (useAppStore.getState().generationId === currentGen) {
                                    store.setStatus('ready');
                                }
                            }
                        },
                        activeAbortController.signal
                    );
                } catch(e: any) {
                    if (e.name !== 'AbortError') {
                        console.error('[InterviewEngine] Generation Failed:', e.message);
                        store.setStatus('error');
                        setTimeout(() => {
                            if (useAppStore.getState().status === 'error') {
                                console.log('[InterviewEngine] Auto-recovering to listening state.');
                                store.setStatus('listening');
                            }
                        }, 4000);
                    }
                }
                break;

            case 'STOP_LISTENING':
                if (activeAbortController) activeAbortController.abort();
                await audioService.stop();
                store.setStatus('idle');
                break;
        }
    }
}