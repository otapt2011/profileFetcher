// js/config.js
export const DEFAULT_HIDDEN_COLS = ['username', 'followingCount', 'follower_date', 'friendship'];
export const DEFAULT_DB_FILE_PATH = '/assets/proxyDB/TikTokProfile.db'; // <-- single source of truth

export const CONFIG = {
  apiBaseUrl: 'https://tik-proxy.vercel.app',
  concurrency: parseInt(localStorage.getItem('concurrency')) || 8,
  timeout: parseInt(localStorage.getItem('fetchTimeout')) || 15000,
  fetchAvatarBlobs: localStorage.getItem('fetchAvatarBlobs') === 'true' || false,
  dbFilePath: localStorage.getItem('dbFilePath') || DEFAULT_DB_FILE_PATH
};