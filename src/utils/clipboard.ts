/**
 * Cross-platform, reliable clipboard utility.
 * Guarantees copying works in Electron (via native IPC),
 * modern browsers (via navigator.clipboard with fallback),
 * and legacy/unfocused contexts (via document.execCommand).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof text !== 'string') {
    text = String(text ?? '');
  }

  // 1. Electron Native Clipboard IPC (Most reliable in Electron, works even if window is unfocused or transparent)
  try {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.copyToClipboard) {
      const res = await (window as any).electronAPI.copyToClipboard(text);
      if (res?.success !== false) {
        return true;
      }
    }
  } catch (err) {
    console.warn('[Clipboard] Electron native copy failed, attempting browser fallback:', err);
  }

  // 2. Modern Browser Async Clipboard API
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('[Clipboard] navigator.clipboard.writeText failed, attempting execCommand fallback:', err);
  }

  // 3. Fallback: document.execCommand('copy') with hidden textarea
  try {
    if (typeof document !== 'undefined') {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      // Prevent scrolling to bottom of page
      textArea.style.position = 'fixed';
      textArea.style.top = '-9999px';
      textArea.style.left = '-9999px';
      textArea.style.opacity = '0';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);
      textArea.select();
      textArea.setSelectionRange(0, text.length);
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) return true;
    }
  } catch (fallbackErr) {
    console.error('[Clipboard] All copy mechanisms failed:', fallbackErr);
  }

  return false;
}
