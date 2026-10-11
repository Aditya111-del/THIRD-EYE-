/**
 * Cross-platform clipboard utility for THIRD EYE IDE
 * Interfaces natively with Electron OS clipboard with resilient browser fallbacks.
 */

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Electron Native OS Clipboard (Zero permissions, highest reliability)
  if (typeof window !== "undefined" && window.electronAPI?.clipboard?.writeText) {
    try {
      const res = await window.electronAPI.clipboard.writeText(text);
      if (res) return true;
    } catch (err) {
      console.warn("[clipboard] Electron clipboard.writeText error:", err);
    }
  }

  // 2. Web Clipboard API
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("[clipboard] navigator.clipboard.writeText error:", err);
    }
  }

  // 3. Document ExecCommand fallback (for older engines or unfocused windows)
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    textarea.setAttribute("readonly", "");
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch (err) {
    console.warn("[clipboard] execCommand fallback error:", err);
    return false;
  }
}

export async function readFromClipboard(): Promise<string> {
  // 1. Electron Native OS Clipboard (Zero permission prompt, instant response)
  if (typeof window !== "undefined" && window.electronAPI?.clipboard?.readText) {
    try {
      const text = await window.electronAPI.clipboard.readText();
      if (typeof text === "string" && text.length > 0) {
        return text;
      }
    } catch (err) {
      console.warn("[clipboard] Electron clipboard.readText error:", err);
    }
  }

  // 2. Web Clipboard API
  if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText();
      if (typeof text === "string") {
        return text;
      }
    } catch (err) {
      console.warn("[clipboard] navigator.clipboard.readText error:", err);
    }
  }

  return "";
}
