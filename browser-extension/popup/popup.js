document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('token-input');
  const saveBtn = document.getElementById('save-token');
  const sendUrlBtn = document.getElementById('send-url');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  // Load saved token
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['extensionToken'], (result) => {
      if (result && result.extensionToken) {
        tokenInput.value = result.extensionToken;
      }
    });
  }

  // Ping test
  fetch('http://127.0.0.1:31415/ping')
    .then((res) => {
      if (res.ok) {
        statusDot.className = 'dot connected';
        statusText.textContent = 'App connected (127.0.0.1:31415)';
      } else {
        statusText.textContent = 'App listening';
      }
    })
    .catch(() => {
      statusText.textContent = 'App not connected';
    });

  saveBtn.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    chrome.runtime.sendMessage({ action: 'updateToken', token }, (response) => {
      if (response && response.success) {
        statusText.textContent = 'Token saved. Reconnecting...';
        setTimeout(() => window.close(), 800);
      }
    });
  });

  sendUrlBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        chrome.runtime.sendMessage({
          action: 'sendContext',
          payload: {
            type: 'page-url',
            content: tabs[0].url,
            source: new URL(tabs[0].url).hostname,
            timestamp: new Date().toISOString(),
          },
        });
        window.close();
      }
    });
  });
});
