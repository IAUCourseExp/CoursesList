// Shared clipboard behaviour (BUG-14). The components used to chain bare
// .then()s, so a denied permission or an unavailable Clipboard API silently
// swallowed the copy and the UI kept pretending nothing happened.
//
// copyText() resolves to true only after the text is really on the clipboard;
// callers decide what honest feedback to show when it resolves to false.

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied / document not focused / insecure context - fall
    // through to the legacy path before giving up.
  }

  // Legacy fallback for contexts without navigator.clipboard.
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
