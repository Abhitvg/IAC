import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerGenerationService } from '../src/services/AnswerGenerationService';
import { DiagnosticLoggerService } from '../src/services/diagnosticLogger';
import { RateLimitGovernor } from '../src/services/rateLimitGovernor';
import { startCloudLLMStream } from '../electron/services/cloudLLMStreaming';

function createStreamingResponse(text: string): Response {
  const encoder = new TextEncoder();
  const payload = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function createElectronGateway(credentialStore: { getKey: ReturnType<typeof vi.fn> }) {
  const chunkListeners = new Set<(payload: any) => void>();
  const doneListeners = new Set<(payload: any) => void>();
  const errorListeners = new Set<(payload: any) => void>();
  const controllers = new Map<string, AbortController>();
  const startedRequests: Array<{ requestId: string; question: string }> = [];
  const cancelledRequestIds: string[] = [];

  const send = (channel: string, payload: any) => {
    const listeners =
      channel === 'ai:stream-chunk'
        ? chunkListeners
        : channel === 'ai:stream-done'
          ? doneListeners
          : errorListeners;
    for (const listener of listeners) listener(payload);
  };

  return {
    startCloudLLMStream: async (request: any) => {
      startedRequests.push({ requestId: request.requestId, question: request.question });
      const controller = new AbortController();
      controllers.set(request.requestId, controller);
      try {
        const result = await startCloudLLMStream(
          request,
          credentialStore as any,
          controller.signal,
          send
        );
        if (!result.ok) controllers.delete(request.requestId);
        return result;
      } catch (error) {
        controllers.delete(request.requestId);
        throw error;
      }
    },
    startedRequests,
    cancelledRequestIds,
    cancelCloudLLMStream: async (requestId: string) => {
      cancelledRequestIds.push(requestId);
      const controller = controllers.get(requestId);
      if (!controller) return false;
      controller.abort();
      controllers.delete(requestId);
      return true;
    },
    onAIStreamChunk: (callback: (payload: any) => void) => {
      chunkListeners.add(callback);
      return () => chunkListeners.delete(callback);
    },
    onAIStreamDone: (callback: (payload: any) => void) => {
      doneListeners.add(callback);
      return () => doneListeners.delete(callback);
    },
    onAIStreamError: (callback: (payload: any) => void) => {
      errorListeners.add(callback);
      return () => errorListeners.delete(callback);
    },
  };
}

describe('AnswerGenerationService request supersession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retries a transient provider connection failure before any answer token is emitted', async () => {
    vi.spyOn(RateLimitGovernor, 'calculateBackoffDelayMs').mockReturnValue(1);
    const credentialStore = {
      getKey: vi.fn(async () => 'gsk_test_key_123456789012345678901234567890'),
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(createStreamingResponse('A hash table maps keys to values.'));
    const gateway = createElectronGateway(credentialStore);
    vi.stubGlobal('window', { electronAPI: gateway });
    vi.stubGlobal('fetch', fetchMock);

    const tokens: string[] = [];
    const result = await AnswerGenerationService.getInstance().generateAnswer(
      {
        requestId: 'transient-network-retry',
        type: 'interview',
        text: 'What is a hash table?',
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        preferredLanguage: 'Java',
      },
      { onToken: (token) => tokens.push(token) }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('VALIDATED');
    expect(tokens.join('')).toContain('hash table');

    const events =
      DiagnosticLoggerService.getInstance().getEventsForRequest('transient-network-retry');
    expect(events.some((event) => event.pipelineStage === 'generating')).toBe(true);
    expect(events.some((event) => event.pipelineStage === 'streaming')).toBe(true);
    const terminal = events.find((event) => event.finalOutcome === 'SUCCESS');
    expect(terminal?.totalGenerationTimeMs).toBeGreaterThan(0);
    expect(terminal?.timeToFirstTokenMs).toBeGreaterThanOrEqual(0);
    expect(terminal?.receivedTokenCount).toBeGreaterThan(0);
  });

  it('does not retry or append a second answer after partial output', async () => {
    const credentialStore = {
      getKey: vi.fn(async () => 'gsk_test_key_123456789012345678901234567890'),
    };
    const encoder = new TextEncoder();
    const interruptedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: 'Partial answer only.' } }] })}\n\n`
            )
          );
          setTimeout(() => controller.error(new TypeError('socket hang up')), 0);
        }, 10);
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(interruptedStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    );
    const gateway = createElectronGateway(credentialStore);
    vi.stubGlobal('window', { electronAPI: gateway });
    vi.stubGlobal('fetch', fetchMock);

    const tokens: string[] = [];
    const result = await AnswerGenerationService.getInstance().generateAnswer(
      {
        requestId: 'partial-stream-must-not-retry',
        type: 'interview',
        text: 'What is a hash table?',
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        preferredLanguage: 'Java',
      },
      { onToken: (token) => tokens.push(token) }
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') {
      throw new Error(`Expected a failed partial result, received ${result.status}.`);
    }
    expect(result.partialAnswer).toContain('Partial answer only.');
    expect(tokens.join('')).toContain('Partial answer only.');
  });

  it('preserves partial tokens for recovery when the caller cancels a live stream', async () => {
    const credentialStore = {
      getKey: vi.fn(async () => 'gsk_test_key_123456789012345678901234567890'),
    };
    const caller = new AbortController();
    const encoder = new TextEncoder();
    const interruptedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content: 'A partial but useful answer.' } }] })}\n\n`
          )
        );
        setTimeout(() => controller.error(new TypeError('stream interrupted')), 100);
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(interruptedStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    );
    const gateway = createElectronGateway(credentialStore);
    vi.stubGlobal('window', { electronAPI: gateway });
    vi.stubGlobal('fetch', fetchMock);

    const result = await AnswerGenerationService.getInstance().generateAnswer(
      {
        requestId: 'partial-output-cancel-recovery',
        type: 'interview',
        text: 'Explain a hash table.',
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        preferredLanguage: 'Java',
        signal: caller.signal,
      },
      {
        onToken: () => caller.abort(new DOMException('Candidate cancelled', 'AbortError')),
      }
    );

    expect(result.status).toBe('ABORTED');
    expect(result.partialAnswer).toContain('A partial but useful answer.');
    const { useAppStore } = await import('../src/store/useAppStore');
    expect(useAppStore.getState().recoveredPartialAnswer).toContain('A partial but useful answer.');

    const events = DiagnosticLoggerService.getInstance().getEventsForRequest(
      'partial-output-cancel-recovery'
    );
    const terminal = events.find((event) => event.finalOutcome === 'ABORTED');
    expect(terminal?.failureKind).toBe('CANCELLED');
    expect(terminal?.partialOutputRecovered).toBe(true);
    expect(terminal?.partialOutputCharacterCount).toBeGreaterThan(0);
    useAppStore.getState().setRecoveredPartialAnswer(null);
  });

  it('classifies a stream inactivity deadline separately and records partial recovery', async () => {
    const credentialStore = {
      getKey: vi.fn(async () => 'gsk_test_key_123456789012345678901234567890'),
    };
    const encoder = new TextEncoder();
    const timedOutStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content: 'A partial answer before timeout.' } }] })}\n\n`
          )
        );
        setTimeout(
          () =>
            controller.error(
              Object.assign(new Error('Stream inactivity timeout exceeded'), {
                name: 'TimeoutError',
              })
            ),
          10
        );
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(timedOutStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    );
    const gateway = createElectronGateway(credentialStore);
    vi.stubGlobal('window', { electronAPI: gateway });
    vi.stubGlobal('fetch', fetchMock);

    const result = await AnswerGenerationService.getInstance().generateAnswer({
      requestId: 'partial-output-timeout-recovery',
      type: 'interview',
      text: 'Explain a hash table.',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      preferredLanguage: 'Java',
    });

    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') throw new Error('Expected a timeout failure result.');
    expect(result.cleanAnswer).toBe('');
    expect(result.partialAnswer).toContain('A partial answer before timeout.');
    const events = DiagnosticLoggerService.getInstance().getEventsForRequest(
      'partial-output-timeout-recovery'
    );
    const terminal = events.find((event) => event.finalOutcome === 'FAILED');
    expect(terminal?.failureKind).toBe('TIMEOUT');
    expect(terminal?.partialOutputRecovered).toBe(true);
    expect(terminal?.partialOutputCharacterCount).toBeGreaterThan(0);
    const { useAppStore } = await import('../src/store/useAppStore');
    expect(useAppStore.getState().recoveredPartialAnswer).toContain(
      'A partial answer before timeout.'
    );
    useAppStore.getState().setRecoveredPartialAnswer(null);
  });

  it('suppresses tokens from a superseded interview request', async () => {
    const credentialStore = {
      getKey: vi.fn(async () => 'gsk_test_key_123456789012345678901234567890'),
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return createStreamingResponse('This answer belongs to the stale request.');
      })
      .mockResolvedValueOnce(createStreamingResponse('This is the current answer.'));
    const gateway = createElectronGateway(credentialStore);
    vi.stubGlobal('window', { electronAPI: gateway });
    vi.stubGlobal('fetch', fetchMock);

    const staleTokens: string[] = [];
    const currentTokens: string[] = [];
    const service = AnswerGenerationService.getInstance();
    const staleRequest = service.generateAnswer(
      {
        requestId: 'stale-interview-request',
        type: 'interview',
        text: 'What is a binary search tree?',
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        preferredLanguage: 'Java',
      },
      { onToken: (token) => staleTokens.push(token) }
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce(), { interval: 1 });

    const currentRequest = service.generateAnswer(
      {
        requestId: 'current-interview-request',
        type: 'interview',
        text: 'What is a hash table?',
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        preferredLanguage: 'Java',
      },
      { onToken: (token) => currentTokens.push(token) }
    );

    const [staleResult, currentResult] = await Promise.all([staleRequest, currentRequest]);

    expect(staleResult.status).toBe('ABORTED');
    const staleProviderRequest = gateway.startedRequests.find((request) =>
      request.question.includes('binary search tree')
    );
    expect(staleProviderRequest).toBeDefined();
    expect(gateway.cancelledRequestIds).toContain(staleProviderRequest?.requestId);
    expect(staleTokens).toEqual([]);
    expect(currentResult.status).toBe('VALIDATED');
    expect(currentTokens.join('')).toContain('current answer');
    expect(currentTokens.join('')).not.toContain('stale request');
  });
});
