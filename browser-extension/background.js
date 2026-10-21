let ws = null;
let reconnectInterval = null;
const DEFAULT_PORT = 31415;

async function getToken() {
  return new Promise((resolve) => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['extensionToken'], (result) => {
        resolve(result?.extensionToken || '');
      });
    } else {
      resolve('');
    }
  });
}

async function connectWebSocket() {
  if (ws && ws.readyState !== WebSocket.CLOSED) return;

  const token = await getToken();
  const wsUrl = token
    ? `ws://127.0.0.1:${DEFAULT_PORT}?token=${encodeURIComponent(token)}`
    : `ws://127.0.0.1:${DEFAULT_PORT}`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[Extension] Connected securely to AI Interview Practice Gym');
      if (token) {
        ws.send(JSON.stringify({ type: 'auth', token }));
      }
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
    };

    ws.onclose = () => {
      ws = null;
      if (!reconnectInterval) {
        reconnectInterval = setInterval(connectWebSocket, 5000);
      }
    };

    ws.onerror = (error) => {
      console.error('[Extension] WebSocket error:', error);
    };
  } catch (err) {
    console.error('[Extension] Failed to create WebSocket connection:', err);
  }
}

connectWebSocket();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'send-to-assistant',
    title: 'Send Question to Practice Gym',
    contexts: ['selection', 'page'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'send-to-assistant') {
    const rawContent = (info.selectionText || tab.url || '').trim();
    if (!rawContent) return;

    const payload = {
      type: info.selectionText ? 'selected-text' : 'page-url',
      content: rawContent.slice(0, 8000), // Enforce length boundary
      source: tab?.url ? new URL(tab.url).hostname : 'unknown',
      timestamp: new Date().toISOString(),
    };

    sendToApp(payload);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'sendContext') {
    sendToApp(message.payload);
    sendResponse({ success: true });
  } else if (message.action === 'updateToken') {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ extensionToken: message.token }, () => {
        if (ws) {
          ws.close();
        }
        connectWebSocket();
        sendResponse({ success: true });
      });
      return true;
    }
  }
});

function sendToApp(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  } else {
    console.log('[Extension] Cannot send: App not connected', payload);
  }
}
