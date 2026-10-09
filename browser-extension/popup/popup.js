document.addEventListener('DOMContentLoaded', () => {
  const sendBtn = document.getElementById('send-url');
  
  sendBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.runtime.sendMessage({
      action: 'sendContext',
      payload: {
        type: 'page-url',
        content: tab.url,
        source: new URL(tab.url).hostname,
        timestamp: new Date().toISOString()
      }
    });
    
    sendBtn.textContent = 'Sent!';
    setTimeout(() => {
      window.close();
    }, 1000);
  });

  // Basic connection check (pinging the background script to see if it thinks it's connected)
  // For a real extension, we'd add IPC between popup and background to check WS status
});
