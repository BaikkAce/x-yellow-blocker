(function () {
  'use strict';

  const DEFAULT_SETTINGS = Object.freeze({
    settingsVersion: 6,
    enabled: true,
    hideDetected: true,
    autoBlock: true,
    hideThreshold: 65,
    autoBlockThreshold: 65,
    blockDelayMs: 900,
    maxBlocksPerSession: 30,
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
      merged.blockDelayMs = base.blockDelayMs;
    }
    // v6 permanently removes community account upload and remote account
    // blocking. Drop stale values left by earlier versions.
    delete merged.communitySharingEnabled;
    delete merged.remoteAccountSyncEnabled;
    return merged;
  }

  globalThis.XybDefaults = {
    DEFAULT_SETTINGS,
    cloneDefaultSettings,
    mergeSettings
  };
})();
