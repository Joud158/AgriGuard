const VOICE_DRAFT_KEY = 'agriguard-event-voice-draft';

export function saveVoiceDraft(payload) {
  try {
    sessionStorage.setItem(VOICE_DRAFT_KEY, JSON.stringify(payload || {}));
  } catch {
    // Ignore storage errors. Voice drafting is optional.
  }
}

export function loadVoiceDraft() {
  try {
    const raw = sessionStorage.getItem(VOICE_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearVoiceDraft() {
  try {
    sessionStorage.removeItem(VOICE_DRAFT_KEY);
  } catch {
    // Ignore storage errors.
  }
}
