export function load(key, defaultVal) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return defaultVal;
  }
  if (!raw) return defaultVal;
  try {
    const parsed = JSON.parse(raw);
    return (parsed !== null && parsed !== undefined) ? parsed : defaultVal;
  } catch {
    // Older Settings code wrote some keys as plain text, not JSON — still use them.
    return raw;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Storage write failed:', e);
  }
}

export function remove(key) {
  try { localStorage.removeItem(key); } catch {}
}

