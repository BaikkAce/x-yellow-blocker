/* global importScripts */
importScripts('defaults.js', 'remote-lists.js');

(function () {
  'use strict';

  const {
    REMOTE_LISTS_STORAGE_KEY,
    REMOTE_LIST_URLS,
    fetchRemoteBlocklists
  } = globalThis.XybRemoteLists;
  const STATUS_KEY = 'remoteBlocklistsStatus';
  let refreshPromise = null;

  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('refreshRemoteLists', { periodInMinutes: 60 });
    refreshRemoteBlocklists();
  });
  chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create('refreshRemoteLists', { periodInMinutes: 60 });
    refreshRemoteBlocklists();
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'refreshRemoteLists') refreshRemoteBlocklists();
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === 'XYB_REFRESH_REMOTE_LISTS') {
      refreshRemoteBlocklists()
        .then(lists => sendResponse({ ok: true, lists }))
        .catch(error => sendResponse({ ok: false, error: String(error && error.message || error) }));
      return true;
    }

    return false;
  });

  function refreshRemoteBlocklists() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function doRefresh() {
    try {
      // Cross-origin requests run in the extension service worker with the
      // manifest host permission. Content scripts remain same-origin bound.
      // Source: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
      const lists = await fetchRemoteBlocklists(fetch, REMOTE_LIST_URLS);
      await chrome.storage.local.set({
        [REMOTE_LISTS_STORAGE_KEY]: lists,
        [STATUS_KEY]: { ok: true, updatedAt: Date.now(), error: '' }
      });
      return lists;
    } catch (error) {
      await chrome.storage.local.set({
        [STATUS_KEY]: { ok: false, updatedAt: Date.now(), error: String(error && error.message || error) }
      });
      throw error;
    }
  }
})();
