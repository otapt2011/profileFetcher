import { state } from './state.js';

export function downloadProfilesJSON() {
  if (!state.profileData.length) return;
  const blob = new Blob([JSON.stringify(state.profileData, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'tiktok_profiles.json');
}

export function downloadFollowingJSON() {
  if (!state.followingList.length) return;
  const blob = new Blob([JSON.stringify(state.followingList, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'tiktok_following.json');
}

export async function downloadSQLiteDB() {
  if (!state.sqliteReady || !state.sqliteDB) return;
  const buffer = state.sqliteDB.jaferExport();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  downloadBlob(blob, 'tiktok_profiles.db');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}