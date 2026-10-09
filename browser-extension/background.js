let ws = null;
let reconnectInterval = null;
let port = 0;

// Try to discover the app's WebSocket port
async function discoverPort() {
  // In a real implementation, the app could write its port to a known local file
  // or use a fixed port like 31415. For simplicity, we'll try a list of ports.
  const portsToTry = [31415, 31416, 31417, 31418];
  
  for (const p of portsToTry) {
    try {
      const response = await fetch(`http://127.0.0.1:${p}/ping`);
      if (response.ok) {
        port = p;
        return true;
      }
    } catch (e) {
      // Ignore connection refused
    }
  }
  return false;
}

function connectWebSocket() {
  if (ws && ws.readyState !== WebSocket.CLOSED) return;

  // Assuming the app runs its WS server on a fixed port for simplicity,
  // or the user configures it. Let's use 31415 as a default convention.
  ws = new WebSocket('ws://127.0.0.1:31415');

  ws.onopen = () => {
    console.log('Connected to AI Interview Assistant');
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
  };

  ws.onclose = () => {
    console.log('Disconnected from AI Interview Assistant');
    ws = null;
    if (!reconnectInterval) {
      reconnectInterval = setInterval(connectWebSocket, 5000);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Initial connection
connectWebSocket();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'send-to-assistant',
    title: 'Send to AI Interview Assistant',
    contexts: ['selection', 'page']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'send-to-assistant') {
    const payload = {
      type: info.selectionText ? 'selected-text' : 'page-url',
      content: info.selectionText || tab.url,
      source: new URL(tab.url).hostname,
      timestamp: new Date().toISOString()
    };

    sendToApp(payload);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'sendContext') {
    sendToApp(message.payload);
    sendResponse({ success: true });
  }
});

function sendToApp(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  } else {
    console.log('Cannot send: App not connected', payload);
  }
}
