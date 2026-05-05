import { CONFIG } from './config.js';

export async function fetchProfile(username, options = {}) {
  const baseUrl = options.baseUrl || CONFIG.apiBaseUrl;
  const apiKey = options.apiKey || localStorage.getItem('myKey');
  if (!apiKey) throw new Error('No API key found');

  const url = `${baseUrl.replace(/\/$/, '')}/api/full?username=${encodeURIComponent(username.trim().replace(/^@/, ''))}`;
  const controller = new AbortController();
  const timeout = options.timeout || CONFIG.timeout;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try { const err = await res.json(); errMsg = err.error || errMsg; } catch (_) {}
      throw new Error(errMsg);
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Unknown API error');
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timeout');
    throw err;
  }
}

export async function fetchAvatarBlob(avatarUrl) {
  if (!avatarUrl) return null;
  try {
    const res = await fetch(avatarUrl);
    if (!res.ok) return null;
    return await res.blob();
  } catch (e) {
    console.warn('Failed to fetch avatar blob', avatarUrl, e);
    return null;
  }
}