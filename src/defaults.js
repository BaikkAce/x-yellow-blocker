(function () {
  'use strict';

  const DEFAULT_SETTINGS = Object.freeze({
    settingsVersion: 3,
    enabled: true,
    hideDetected: true,
    autoBlock: true,
    hideThreshold: 65,
    autoBlockThreshold: 65,
    blockDelayMs: 2500,
    maxBlocksPerSession: 30,
    communitySharingEnabled: false,
    whitelist: [],
    followedHandles: [],
    blockedHandles: [],
    stats: {
      detected: 0,
      queued: 0,
      blocked: 0,
      failed: 0
    }
  });

  function cloneDefaultSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  function mergeSettings(stored) {
    const base = cloneDefaultSettings();
    const input = stored && typeof stored === 'object' ? stored : {};
    const merged = {
      ...base,
      ...input,
      stats: { ...base.stats, ...(input.stats || {}) },
      whitelist: Array.isArray(input.whitelist) ? input.whitelist : base.whitelist,
      followedHandles: Array.isArray(input.followedHandles) ? input.followedHandles : base.followedHandles,
      blockedHandles: Array.isArray(input.blockedHandles) ? input.blockedHandles : base.blockedHandles
    };
    if (input.settingsVersion !== base.settingsVersion) {
      merged.settingsVersion = base.settingsVersion;
      merged.autoBlock = base.autoBlock;
      merged.autoBlockThreshold = base.autoBlockThreshold;
    }
    return merged;
  }

  // Cloudflare Worker URL — deployed backend for anonymous community reporting
  const WORKER_URL = 'https://xyb-reports.xyb-blocker.workers.dev';

  const CLIENT_ID_STORAGE_KEY = 'xybClientId';

  globalThis.XybDefaults = {
    DEFAULT_SETTINGS,
    cloneDefaultSettings,
    mergeSettings,
    WORKER_URL,
    CLIENT_ID_STORAGE_KEY
  };
})();
