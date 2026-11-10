import { EvidenceVerificationService } from '../services/evidenceVerificationService';
import {
  createExtensionTokenInfo,
  createPublicSettingsSnapshot,
  isTrustedSender,
} from '../services/security';
import fs from 'fs';
import path from 'path';
import { ipcMain, BrowserWindow, clipboard } from 'electron';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import crypto from 'crypto';
import { CredentialStore } from '../services/credentialStore';
import {
  transcribeCloudAudio,
  type CloudTranscriptionRequest,
} from '../services/cloudTranscription';
import { validateCloudModelPreflight } from '../services/modelPreflight';
import {
  startCloudLLMStream,
  validateCloudLLMStreamRequest,
  type CloudLLMStreamRequest,
} from '../services/cloudLLMStreaming';
import {
  MessageRateLimiter,
  parseBrowserContextMessage,
} from '../services/browserContextValidation';

let wsServer: WebSocketServer | null = null;
let httpServer: http.Server | null = null;
let mainWindowRef: BrowserWindow | null = null;
const cloudTranscriptionControllers = new Map<string, AbortController>();
const cloudLLMControllers = new Map<string, AbortController>();

const ALLOWED_SETTING_KEYS = new Set([
  'aiProvider',
  'aiModel',
  'whisperModel',
  'preferredLanguage',
  'responseMode',
  'temperature',
  'maxTokens',
  'theme',
  'audioFormat',
  'browserIntegration',
  'alwaysOnTop',
  'shortcuts',
  'systemPrompt',
  'customApiEndpoint',
  'ollamaEndpoint',
  'teleprompterFontSize',
  'hasCompletedOnboarding',
  'windowOpacity',
  'lastModelMigrationNotice',
]);

export function validateCloudTranscriptionRequest(
  request: unknown
): request is CloudTranscriptionRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return false;
  const candidate = request as Record<string, unknown>;
  const audio = candidate.audio;
  return (
    typeof candidate.requestId === 'string' &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(candidate.requestId) &&
    (candidate.provider === 'groq' || candidate.provider === 'openai') &&
    candidate.model === (candidate.provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1') &&
    audio instanceof Uint8Array &&
    audio.byteLength >= 400 &&
    audio.byteLength <= 25 * 1024 * 1024 &&
    (candidate.language === undefined ||
      (typeof candidate.language === 'string' && candidate.language.length <= 12)) &&
    (candidate.prompt === undefined ||
      (typeof candidate.prompt === 'string' && candidate.prompt.length <= 4000))
  );
}

export function validateCloudPreflightRequest(
  request: unknown
): request is { provider: 'groq' | 'openai' | 'openrouter'; model: string } {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return false;
  const candidate = request as Record<string, unknown>;
  return (
    ['groq', 'openai', 'openrouter'].includes(String(candidate.provider)) &&
    typeof candidate.model === 'string' &&
    candidate.model.trim().length > 0 &&
    candidate.model.length <= 160
  );
}

export function validateSetting(key: string, value: any): boolean {
  if (!ALLOWED_SETTING_KEYS.has(key)) {
    throw new Error(`Unauthorized setting key: "${key}"`);
  }

  switch (key) {
    case 'aiProvider':
      if (!['openai', 'groq', 'openrouter', 'ollama'].includes(value)) {
        throw new Error(`Invalid aiProvider: "${value}"`);
      }
      break;
    case 'windowOpacity':
      if (typeof value !== 'number' || isNaN(value) || value < 0.1 || value > 1.0) {
        throw new Error(`Invalid windowOpacity: ${value}. Must be between 0.1 and 1.0.`);
      }
      break;
    case 'responseMode':
      if (!['coding', 'interview'].includes(value)) {
        throw new Error(`Invalid responseMode: "${value}"`);
      }
      break;
    case 'temperature':
      if (typeof value !== 'number' || value < 0 || value > 2) {
        throw new Error(`Invalid temperature: ${value}. Must be between 0 and 2.`);
      }
      break;
    case 'maxTokens':
      if (typeof value !== 'number' || value < 50 || value > 8192) {
        throw new Error(`Invalid maxTokens: ${value}. Must be between 50 and 8192.`);
      }
      break;
    case 'browserIntegration':
    case 'alwaysOnTop':
    case 'hasCompletedOnboarding':
      if (typeof value !== 'boolean') {
        throw new Error(`Setting "${key}" must be a boolean.`);
      }
      break;
    case 'lastModelMigrationNotice':
      if (value !== null && typeof value !== 'object') {
        throw new Error(`Setting "${key}" must be an object or null.`);
      }
      break;
    case 'ollamaEndpoint':
    case 'customApiEndpoint':
      if (typeof value !== 'string' || value.length > 512) {
        throw new Error(`Endpoint URL for "${key}" exceeds max length.`);
      }
      break;
  }

  return true;
}

export function setupIpcHandlers(mainWindow: BrowserWindow | null) {
  mainWindowRef = mainWindow;

  const Store = require('electron-store');
  const store = new Store({
    name: 'settings',
    defaults: {
      aiProvider: 'groq',
      aiModel: 'openai/gpt-oss-120b',
      whisperModel: 'whisper-large-v3-turbo',
      preferredLanguage: 'java',
      responseMode: 'interview',
      temperature: 0.2,
      maxTokens: 2048,
      theme: 'dark',
      audioFormat: 'wav',
      browserIntegration: false,
      alwaysOnTop: false,
      teleprompterFontSize: 'large',
      hasCompletedOnboarding: false,
      extensionToken: crypto.randomUUID(),
      shortcuts: {
        record: 'R',
        analyze: 'A',
        copyAnswer: 'C',
        quickAnswer: 'Q',
        detailedAnswer: 'D',
        minimize: 'Escape',
        regenerate: 'CommandOrControl+Enter',
      },
      systemPrompt:
        'You are an expert technical interviewer and coach in a live practice interview gym.',
      customApiEndpoint: '',
      ollamaEndpoint: 'http://127.0.0.1:11434',
    },
  });

  const credentialStore = new CredentialStore(store);

  // Check and log configured credentials locally without unprompted remote network calls
  credentialStore.hasKey('groq').then((has) => {
    console.log('[CredentialStore] Groq credential present:', has);
  });

  // Automatic credential & model migration
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    let keyToMigrate = process.env.GROQ_API_KEY;
    if (!keyToMigrate && fs.existsSync(envPath)) {
      const envRaw = fs.readFileSync(envPath, 'utf8');
      const match = envRaw.match(/GROQ_API_KEY\s*=\s*['"]?(gsk_[A-Za-z0-9_-]+)['"]?/);
      if (match && match[1]) keyToMigrate = match[1];
    }
    if (keyToMigrate) {
      credentialStore.hasKey('groq').then((has) => {
        if (!has) {
          credentialStore.setKey('groq', keyToMigrate);
          console.log('[CredentialStore] Auto-configured Groq API key.');
        }
      });
    }

    // Auto-heal provider/model settings ONLY for Groq retired models, leaving non-Groq and
    // custom models untouched
    const curProvider = store.get('aiProvider');
    if (!curProvider) {
      store.set('aiProvider', 'groq');
      store.set('aiModel', 'openai/gpt-oss-120b');
      store.set('whisperModel', 'whisper-large-v3-turbo');
    } else if (curProvider === 'groq') {
      const curModel = store.get('aiModel');
      const RETIRED_GROQ_IDS = new Set([
        'llama-3.3-70b-versatile',
        'llama-3.1-70b-versatile',
        'llama-3.1-8b-instant',
        'llama-3.2-1b-preview',
        'llama-3.2-3b-preview',
        'llama-3.2-11b-vision-preview',
        'llama-3.2-90b-vision-preview',
        'llama3-70b-8192',
        'llama3-8b-8192',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
        'gemma-7b-it',
        'openrouter/free',
      ]);
      const rawModel =
        typeof curModel === 'string'
          ? curModel
              .trim()
              .toLowerCase()
              .replace(/^groq\//, '')
          : '';
      if (!curModel || RETIRED_GROQ_IDS.has(rawModel)) {
        const newModel =
          rawModel.includes('8b') ||
          rawModel.includes('9b') ||
          rawModel.includes('1b') ||
          rawModel.includes('3b')
            ? 'openai/gpt-oss-20b'
            : 'openai/gpt-oss-120b';
        store.set('aiModel', newModel);
        store.set('lastModelMigrationNotice', {
          timestamp: Date.now(),
          previousModel: curModel || 'empty',
          newModel,
          reason: 'Legacy Groq model retired. Migrated to active replacement.',
          dismissed: false,
        });
      }
    }
  } catch (err) {
    console.warn('[CredentialStore] Migration notice:', err);
  }

  // Settings IPC with schema validation
  ipcMain.handle('settings:get', (event) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    return createPublicSettingsSnapshot(store.store, ALLOWED_SETTING_KEYS);
  });
  ipcMain.handle('settings:set', (event, key: string, value: any) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    validateSetting(key, value);
    store.set(key, value);
    return true;
  });

  // Cloud-provider preflight runs in Electron main so saved API keys never enter Settings renderer state.
  ipcMain.handle('ai:preflight', async (event, request: unknown) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    if (!validateCloudPreflightRequest(request)) {
      throw new Error('Invalid cloud model preflight request');
    }
    const apiKey = await credentialStore.getKey(request.provider);
    return validateCloudModelPreflight(request.provider, request.model, apiKey || '');
  });

  ipcMain.handle('ai:stream-start', async (event, request: unknown) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    if (!validateCloudLLMStreamRequest(request) || !request.stream) {
      throw new Error('Invalid cloud generation request');
    }
    if (cloudLLMControllers.has(request.requestId)) {
      throw new Error('A generation request with this ID is already active.');
    }

    const controller = new AbortController();
    cloudLLMControllers.set(request.requestId, controller);
    try {
      const result = await startCloudLLMStream(
        request as CloudLLMStreamRequest,
        credentialStore,
        controller.signal,
        (channel, payload) => {
          mainWindowRef?.webContents.send(channel, payload);
          if (channel === 'ai:stream-done' || channel === 'ai:stream-error') {
            cloudLLMControllers.delete(request.requestId);
          }
        }
      );
      if (!result.ok) cloudLLMControllers.delete(request.requestId);
      return result;
    } catch (error) {
      cloudLLMControllers.delete(request.requestId);
      throw error;
    }
  });

  ipcMain.handle('ai:stream-cancel', (event, requestId: unknown) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(requestId)) return false;
    const controller = cloudLLMControllers.get(requestId);
    if (!controller) return false;
    controller.abort();
    cloudLLMControllers.delete(requestId);
    return true;
  });

  ipcMain.handle('stt:transcribe', async (event, request: unknown) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    if (!validateCloudTranscriptionRequest(request)) {
      throw new Error('Invalid cloud transcription request');
    }
    if (cloudTranscriptionControllers.has(request.requestId)) {
      throw new Error('A transcription request with this ID is already active.');
    }

    const controller = new AbortController();
    cloudTranscriptionControllers.set(request.requestId, controller);
    try {
      const apiKey = await credentialStore.getKey(request.provider);
      return await transcribeCloudAudio(request, apiKey || '', controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return { cancelled: true, text: '' };
      throw error;
    } finally {
      cloudTranscriptionControllers.delete(request.requestId);
    }
  });

  ipcMain.handle('stt:cancel', (event, requestId: unknown) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    if (typeof requestId !== 'string' || requestId.length > 128) return false;
    const controller = cloudTranscriptionControllers.get(requestId);
    if (!controller) return false;
    controller.abort();
    return true;
  });

  // Secure safeStorage credential handlers. Decrypted keys never cross IPC.
  ipcMain.handle('credentials:set', async (event, service: string, key: string) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    return credentialStore.setKey(service, key);
  });

  ipcMain.handle('credentials:has', async (event, service: string) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    return credentialStore.hasKey(service);
  });

  ipcMain.handle('credentials:delete', async (event, service: string) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    return credentialStore.deleteKey(service);
  });

  ipcMain.handle('credentials:list', async (event) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    return credentialStore.listConfigured();
  });

  // Secure WebSocket server for Chrome extension
  ipcMain.handle('ws:get-info', (event) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    const token = store.get('extensionToken') || crypto.randomUUID();
    store.set('extensionToken', token);
    const address = httpServer?.address();
    const port = address && typeof address === 'object' ? address.port : 31415;
    return createExtensionTokenInfo(port, token);
  });

  ipcMain.handle('ws:copy-token', (event) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    const token = store.get('extensionToken') || crypto.randomUUID();
    store.set('extensionToken', token);
    clipboard.writeText(token);
    return true;
  });

  ipcMain.handle('ws:start', (event) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    if (wsServer && httpServer) {
      const address = httpServer.address();
      const port = address && typeof address === 'object' ? address.port : 31415;
      const token = store.get('extensionToken') || crypto.randomUUID();
      store.set('extensionToken', token);
      return createExtensionTokenInfo(port, token);
    }

    const token = store.get('extensionToken') || crypto.randomUUID();
    store.set('extensionToken', token);

    // Create HTTP server strictly bound to 127.0.0.1 (loopback only)
    httpServer = http.createServer((req, res) => {
      // Simple health ping check
      if (req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', app: 'AI Interview Practice Gym' }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    wsServer = new WebSocketServer({ server: httpServer, maxPayload: 256 * 1024 });

    wsServer.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      // Reject web pages and non-extension origins. Authentication remains mandatory.
      const origin = req.headers['origin'];
      if (origin) {
        let parsedOrigin: URL;
        try {
          parsedOrigin = new URL(origin);
        } catch {
          ws.close(1008, 'Invalid origin');
          return;
        }
        if (
          parsedOrigin.protocol !== 'chrome-extension:' ||
          !/^[a-p]{32}$/.test(parsedOrigin.hostname)
        ) {
          console.warn(`[Security] Rejected WebSocket origin: ${origin}`);
          ws.close(1008, 'Unauthorized origin');
          return;
        }
      }

      // Authentication material is never accepted in the URL.
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      if (reqUrl.searchParams.has('token')) {
        ws.close(1008, 'Token must not be supplied in URL');
        return;
      }
      const expectedToken = store.get('extensionToken');
      const providedToken = req.headers['x-extension-token'];
      let isAuthenticated = Boolean(
        typeof providedToken === 'string' &&
        typeof expectedToken === 'string' &&
        providedToken === expectedToken
      );
      const rateLimiter = new MessageRateLimiter(30, 60_000);

      const authTimeout = setTimeout(() => {
        if (!isAuthenticated) {
          ws.close(1008, 'Authentication timeout');
        }
      }, 5000);

      ws.on('message', (rawMessage: Buffer) => {
        if (!rateLimiter.allow()) {
          console.warn('[Security] WebSocket connection exceeded message rate limit.');
          ws.close(1008, 'Message rate limit exceeded');
          return;
        }

        try {
          const data: unknown = JSON.parse(rawMessage.toString('utf8'));

          if (!isAuthenticated) {
            if (
              data &&
              typeof data === 'object' &&
              !Array.isArray(data) &&
              (data as Record<string, unknown>).type === 'auth' &&
              typeof (data as Record<string, unknown>).token === 'string' &&
              (data as Record<string, unknown>).token === expectedToken
            ) {
              isAuthenticated = true;
              clearTimeout(authTimeout);
              ws.send(JSON.stringify({ type: 'auth-success' }));
              return;
            }
            ws.close(1008, 'Invalid token');
            return;
          }

          const message = parseBrowserContextMessage(data);
          if (!message) {
            console.warn('[Security] Rejected malformed browser context payload.');
            ws.close(1008, 'Invalid message payload');
            return;
          }

          const sanitizedContent = `<<<EXTERNAL_UNTRUSTED_CONTENT>>>\n${message.content}\n<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>`;
          mainWindowRef?.webContents.send('browser-context', {
            ...message,
            content: sanitizedContent,
            isUntrusted: true,
          });
        } catch {
          ws.close(1008, 'Invalid JSON message');
        }
      });

      ws.on('close', () => {
        clearTimeout(authTimeout);
      });
    });

    httpServer.listen(31415, '127.0.0.1', () => {
      console.log('[WebSocket] Server securely listening on 127.0.0.1:31415');
    });

    return createExtensionTokenInfo(31415, token);
  });

  // Privileged Evidence Inspection Handlers (Sender-validated, payload-sanitized)
  ipcMain.handle('evidence:inspect-repository', async (event, request: any) => {
    if (!isTrustedSender(event, mainWindowRef)) {
      throw new Error('Unauthorized IPC sender');
    }
    if (!request || typeof request !== 'object' || !request.repositoryUrl) {
      throw new Error('Invalid repository inspection request payload');
    }
    return EvidenceVerificationService.inspectRepository(request);
  });

  ipcMain.handle('evidence:inspect-document', async (event, request: any) => {
    if (!isTrustedSender(event, mainWindowRef)) {
      throw new Error('Unauthorized IPC sender');
    }
    if (!request || typeof request !== 'object' || !request.documentBytes) {
      throw new Error('Invalid document inspection request payload');
    }
    return EvidenceVerificationService.inspectDocument(request);
  });

  ipcMain.handle('evidence:verify-audit', async (event, attestation: any) => {
    if (!isTrustedSender(event, mainWindowRef)) {
      throw new Error('Unauthorized IPC sender');
    }
    if (!attestation || typeof attestation !== 'object') {
      throw new Error('Invalid independent audit attestation payload');
    }
    return EvidenceVerificationService.verifySignedAttestation(attestation);
  });

  ipcMain.handle('evidence:verify-seal', async (event, result: any) => {
    if (!isTrustedSender(event, mainWindowRef)) {
      throw new Error('Unauthorized IPC sender');
    }
    if (!result || typeof result !== 'object') return false;
    return EvidenceVerificationService.verifySeal(result);
  });

  ipcMain.handle('ws:stop', (event) => {
    if (!isTrustedSender(event, mainWindowRef)) throw new Error('Unauthorized IPC sender');
    if (wsServer) {
      wsServer.close();
      wsServer = null;
    }
    if (httpServer) {
      httpServer.close();
      httpServer = null;
    }
    return true;
  });
}
