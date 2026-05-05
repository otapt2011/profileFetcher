export function extractFollowing(jsonData) {
  const raw = jsonData?.["Profile And Settings"]?.["Following"]?.["Following"];
  if (!Array.isArray(raw)) throw new Error('Following list not found');
  const rawTotal = raw.length;
  const filtered = raw
    .filter(entry => entry.UserName && entry.UserName.trim() !== 'N/A')
    .map(entry => ({
      UserName: (entry.UserName || '').trim().replace(/^[.@]+/, ''),
      Date: entry.Date || ''
    }));
  return { rawTotal, list: filtered };
}

export function extractFollowers(jsonData) {
  const raw = jsonData?.["Profile And Settings"]?.["Follower"]?.["FansList"];
  if (!Array.isArray(raw)) return { rawTotal: 0, list: [] };
  const rawTotal = raw.length;
  const filtered = raw
    .filter(entry => entry.UserName && entry.UserName.trim() !== 'N/A')
    .map(entry => ({
      UserName: (entry.UserName || '').trim().replace(/^[.@]+/, ''),
      Date: entry.Date || ''
    }));
  return { rawTotal, list: filtered };
}

export function extractBlocked(jsonData) {
  const raw = jsonData?.["Profile And Settings"]?.["Block List"]?.["BlockList"];
  if (!Array.isArray(raw)) return { rawTotal: 0, list: [] };
  const rawTotal = raw.length;
  const filtered = raw
    .filter(entry => entry.UserName && entry.UserName.trim() !== 'N/A')
    .map(entry => ({
      UserName: (entry.UserName || '').trim().replace(/^[.@]+/, ''),
      Date: entry.Date || ''
    }));
  return { rawTotal, list: filtered };
}

export function flattenProfileData(apiResponse, item) {
  const profile = apiResponse.profile || {};
  const stats = apiResponse.stats || {};
  return {
    ...profile,
    ...stats,
    username: item.UserName || profile.username,
    following_date: item.Date || '',
    follower_date: item.followerDate || null,
    friendship: item.friendship || 'following',
  };
}