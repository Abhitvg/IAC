// Listen for specific key combinations or specific events in the page
document.addEventListener('keydown', (e) => {
  // Option/Alt + A to quickly send selected text
  if (e.altKey && e.key === 'a') {
    const selectedText = window.getSelection().toString();
    if (selectedText) {
      chrome.runtime.sendMessage({
        action: 'sendContext',
        payload: {
          type: 'selected-text',
          content: selectedText,
          source: window.location.hostname,
          timestamp: new Date().toISOString()
        }
      });
      
      // Visual feedback
      showFeedback('Sent to Assistant');
    }
  }
});

function showFeedback(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #7c5cfc;
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    font-family: sans-serif;
    font-size: 14px;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: opacity 0.3s;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
