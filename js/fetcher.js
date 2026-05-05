import { state } from './state.js';
import { CONFIG } from './config.js';
import { helpers } from './helpers.js';
import { fetchProfile, fetchAvatarBlob } from './api.js';
import { flattenProfileData } from './extractor.js';
import { upsertProfile, recordFetchCompletion, updateStatusDisplay } from './database.js';
import { renderTable, renderProgress, updateButtons, scheduleTableRender } from './renderer.js';
import { DOM } from './DOM.js';

async function asyncPool(limit, items, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

export function pause() {
  if (state.fetchState === 'running') state.fetchState = 'paused';
  updateButtons();
}

export function stop() {
  state.fetchState = 'stopped';
  updateButtons();
}

export async function fetchAllProfiles(options = {}) {
  const { onItemDone, skipFinalMessage } = options;
  state.fetchState = 'running';
  updateButtons();
  const list = state.followingList;
  const total = list.length;
  if (!state.sqliteReady) { alert('SQLite database not ready.'); return; }
  const owner = state.me?.userName;
  if (!owner) { alert('Owner username missing.'); return; }

  let processed = 0;
  renderProgress(0, total, 'Starting following fetch...');

  try {
    await asyncPool(CONFIG.concurrency, list, async (item) => {
      if (state.fetchState === 'stopped') return;
      while (state.fetchState === 'paused') await helpers.sleep(200);
      if (state.fetchState === 'stopped') return;

      try {
        const resp = await fetchProfile(item.UserName, { timeout: CONFIG.timeout });
        let flat = flattenProfileData(resp, item);
        flat.status = 'success';
        if (CONFIG.fetchAvatarBlobs) {
          flat.avatar = await fetchAvatarBlob(flat.avatarUrl);
          if (flat.avatar) {
            flat.avatarObjectURL = URL.createObjectURL(flat.avatar);
          }
        }
        state.profileData.push(flat);
        await upsertProfile(flat, owner, {
          isFollowing: true,
          isFollower: item.friendship === 'friend',
          following_date: item.Date,
          follower_date: item.followerDate || null
        });
      } catch (err) {
        const failed = {
          username: item.UserName,
          displayName: '', avatarUrl: '', bio: '',
          verified: false, privateAccount: false, secUid: '',
          followerCount: 0, followingCount: 0, heartCount: 0, videoCount: 0,
          following_date: item.Date,
          follower_date: item.followerDate || null,
          friendship: item.friendship || 'following',
          status: 'failed',
          error: err.message,
        };
        state.profileData.push(failed);
        await upsertProfile(failed, owner, {
          isFollowing: true,
          isFollower: item.friendship === 'friend',
          following_date: item.Date,
          follower_date: item.followerDate || null
        });
      }

      processed++;
      if (onItemDone) onItemDone();
      scheduleTableRender();
      updateStatusDisplay();
      renderProgress(processed, total, `${processed}/${total} profiles processed`);
    });

    recordFetchCompletion(new Date().toISOString(), owner);
    if (state.fetchState !== 'stopped') {
      if (!skipFinalMessage) {
        const success = state.profileData.filter(r => r.status === 'success').length;
        renderProgress(total, total, `Done! ${success}/${total} profiles.`);
      }
    } else {
      DOM.progressText.textContent = `Stopped after ${processed} profiles.`;
    }
  } catch (err) {
    console.error('Following fetch error:', err);
    DOM.progressText.textContent = 'Following fetch error: ' + err.message;
  } finally {
    state.fetchState = 'idle';
    updateButtons();
    updateStatusDisplay();
  }
}

export async function fetchAllBlocked(options = {}) {
  const { onItemDone, skipFinalMessage } = options;
  state.fetchState = 'running';
  updateButtons();
  const list = state.blockedList;
  const total = list.length;
  if (!state.sqliteReady) { alert('SQLite database not ready.'); return; }
  const owner = state.me?.userName;
  if (!owner) { alert('Owner username missing.'); return; }

  let processed = 0;
  renderProgress(0, total, 'Starting blocked fetch...');

  try {
    await asyncPool(CONFIG.concurrency, list, async (item) => {
      if (state.fetchState === 'stopped') return;
      while (state.fetchState === 'paused') await helpers.sleep(200);
      if (state.fetchState === 'stopped') return;

      try {
        const resp = await fetchProfile(item.UserName, { timeout: CONFIG.timeout });
        let flat = flattenProfileData(resp, item);
        flat.status = 'success';
        if (CONFIG.fetchAvatarBlobs) {
          flat.avatar = await fetchAvatarBlob(flat.avatarUrl);
          if (flat.avatar) {
            flat.avatarObjectURL = URL.createObjectURL(flat.avatar);
          }
        }
        flat.blocked_date = item.Date;
        flat.friendship = 'blocked';
        state.blockedData.push(flat);
        await upsertProfile(flat, owner, {
          isBlocked: true,
          blocked_date: item.Date
        });
      } catch (err) {
        const failed = {
          username: item.UserName,
          displayName: '', avatarUrl: '', bio: '',
          verified: false, privateAccount: false, secUid: '',
          followerCount: 0, followingCount: 0, heartCount: 0, videoCount: 0,
          blocked_date: item.Date,
          friendship: 'blocked',
          status: 'failed',
          error: err.message,
        };
        state.blockedData.push(failed);
        await upsertProfile(failed, owner, {
          isBlocked: true,
          blocked_date: item.Date
        });
      }

      processed++;
      if (onItemDone) onItemDone();
      updateStatusDisplay();
      renderProgress(processed, total, `${processed}/${total} blocked profiles processed`);
    });

    recordFetchCompletion(new Date().toISOString(), owner);
    if (state.fetchState !== 'stopped') {
      if (!skipFinalMessage) {
        const success = state.blockedData.filter(r => r.status === 'success').length;
        renderProgress(total, total, `Done! ${success}/${total} blocked profiles.`);
      }
    } else {
      DOM.progressText.textContent = `Stopped after ${processed} blocked profiles.`;
    }
  } catch (err) {
    console.error('Blocked fetch error:', err);
    DOM.progressText.textContent = 'Blocked fetch error: ' + err.message;
  } finally {
    state.fetchState = 'idle';
    updateButtons();
    updateStatusDisplay();
  }
}

export async function fetchAllProfilesAndBlocked() {
  const followingTotal = state.followingList.length;
  const blockedTotal = state.blockedList.length;
  const grandTotal = followingTotal + blockedTotal;
  let completed = 0;

  const onItemDone = () => {
    completed++;
    renderProgress(completed, grandTotal, `Combined: ${completed}/${grandTotal} profiles`);
  };

  await fetchAllProfiles({ onItemDone, skipFinalMessage: true });
  if (state.fetchState === 'stopped') return;
  await fetchAllBlocked({ onItemDone, skipFinalMessage: true });

  if (state.fetchState !== 'stopped') {
    renderProgress(grandTotal, grandTotal, `Combined fetch complete: ${completed} profiles.`);
  }
  state.fetchState = 'idle';
  updateButtons();
  updateStatusDisplay();
}