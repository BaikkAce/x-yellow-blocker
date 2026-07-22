(function () {
  'use strict';

  const STORAGE_KEY = 'settings';
  const { mergeSettings } = globalThis.XybDefaults;
  const { normalizeHandle } = globalThis.XybDetector;
  const {
    MUTE_SYNC_STORAGE_KEY,
    DEFAULT_MUTE_WORDS,
    createMuteSyncState
  } = globalThis.XybMuteWords;
  const { REMOTE_LISTS_STORAGE_KEY } = globalThis.XybRemoteLists;
  const {
    COMMUNITY_REPORTS_STORAGE_KEY,
    normalizeState: normalizeCommunityState,
    getCommunityReportBatch,
    buildCommunityIssueUrl,
    markCommunityReportsSubmitted
  } = globalThis.XybCommunitySharing;
  const REMOTE_STATUS_KEY = 'remoteBlocklistsStatus';

  const els = {
    enabled: document.getElementById('enabled'),
    hideDetected: document.getElementById('hideDetected'),
    autoBlock: document.getElementById('autoBlock'),
    hideThreshold: document.getElementById('hideThreshold'),
    autoBlockThreshold: document.getElementById('autoBlockThreshold'),
    blockDelayMs: document.getElementById('blockDelayMs'),
    maxBlocksPerSession: document.getElementById('maxBlocksPerSession'),
    whitelist: document.getElementById('whitelist'),
    followedHandles: document.getElementById('followedHandles'),
    status: document.getElementById('status'),
    resetStats: document.getElementById('resetStats'),
    openX: document.getElementById('openX'),
    detected: document.getElementById('detected'),
    queued: document.getElementById('queued'),
    blocked: document.getElementById('blocked'),
    failed: document.getElementById('failed'),
    muteSyncProgress: document.getElementById('muteSyncProgress'),
    syncMuteWords: document.getElementById('syncMuteWords'),
    cancelMuteWords: document.getElementById('cancelMuteWords'),
    remoteListStatus: document.getElementById('remoteListStatus'),
    refreshRemoteLists: document.getElementById('refreshRemoteLists'),
    communitySharingEnabled: document.getElementById('communitySharingEnabled'),
    communityStatus: document.getElementById('communityStatus'),
    submitCommunityReports: document.getElementById('submitCommunityReports')
  };

  let settings = mergeSettings({});
  let muteSyncState = null;
  let remoteBlocklists = { keywords: [], accounts: [], fetchedAt: 0 };
  let remoteStatus = null;
  let communityReports = normalizeCommunityState(null);
  let saveTimer = null;

  boot();

  async function boot() {
    [settings, muteSyncState, remoteBlocklists, remoteStatus, communityReports] = await Promise.all([
      loadSettings(),
      loadMuteSyncState(),
      loadRemoteBlocklists(),
      loadRemoteStatus(),
      loadCommunityReports()
    ]);
    render();
    bindEvents();
    watchMuteSync();
  }

  async function loadSettings() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const merged = mergeSettings(data && data[STORAGE_KEY]);
    await chrome.storage.local.set({ [STORAGE_KEY]: merged });
    return merged;
  }

  function bindEvents() {
    ['enabled', 'hideDetected', 'autoBlock', 'communitySharingEnabled'].forEach(id => {
      els[id].addEventListener('change', () => updateFromForm());
    });
    ['hideThreshold', 'autoBlockThreshold', 'blockDelayMs', 'maxBlocksPerSession'].forEach(id => {
      els[id].addEventListener('input', () => updateFromForm());
    });
    els.whitelist.addEventListener('input', () => updateFromForm());
    els.followedHandles.addEventListener('input', () => updateFromForm());
    els.resetStats.addEventListener('click', () => {
      settings.stats = { detected: 0, queued: 0, blocked: 0, failed: 0 };
      saveNow();
      render();
    });
    els.openX.addEventListener('click', () => chrome.tabs.create({ url: 'https://x.com/home' }));
    els.syncMuteWords.addEventListener('click', startMuteSync);
    els.cancelMuteWords.addEventListener('click', cancelMuteSync);
    els.refreshRemoteLists.addEventListener('click', refreshRemoteLists);
    els.submitCommunityReports.addEventListener('click', submitCommunityReports);
  }

  function render() {
    els.enabled.checked = !!settings.enabled;
    els.hideDetected.checked = !!settings.hideDetected;
    els.autoBlock.checked = !!settings.autoBlock;
    els.communitySharingEnabled.checked = !!settings.communitySharingEnabled;
    els.hideThreshold.value = settings.hideThreshold;
    els.autoBlockThreshold.value = settings.autoBlockThreshold;
    els.blockDelayMs.value = settings.blockDelayMs;
    els.maxBlocksPerSession.value = settings.maxBlocksPerSession;
    els.whitelist.value = (settings.whitelist || []).join('\n');
    els.followedHandles.value = (settings.followedHandles || []).join('\n');

    const stats = settings.stats || {};
    els.detected.textContent = stats.detected || 0;
    els.queued.textContent = stats.queued || 0;
    els.blocked.textContent = stats.blocked || 0;
    els.failed.textContent = stats.failed || 0;
    renderMuteSync();
    renderRemoteLists();
    renderCommunityReports();
  }

  async function loadMuteSyncState() {
    const data = await chrome.storage.local.get(MUTE_SYNC_STORAGE_KEY);
    return data && data[MUTE_SYNC_STORAGE_KEY] || null;
  }

  function watchMuteSync() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[MUTE_SYNC_STORAGE_KEY]) {
        muteSyncState = changes[MUTE_SYNC_STORAGE_KEY].newValue || null;
        renderMuteSync();
      }
      if (changes[REMOTE_LISTS_STORAGE_KEY]) {
        remoteBlocklists = changes[REMOTE_LISTS_STORAGE_KEY].newValue || { keywords: [], accounts: [], fetchedAt: 0 };
        renderRemoteLists();
      }
      if (changes[REMOTE_STATUS_KEY]) {
        remoteStatus = changes[REMOTE_STATUS_KEY].newValue || null;
        renderRemoteLists();
      }
      if (changes[COMMUNITY_REPORTS_STORAGE_KEY]) {
        communityReports = normalizeCommunityState(changes[COMMUNITY_REPORTS_STORAGE_KEY].newValue);
        renderCommunityReports();
      }
    });
  }

  async function loadCommunityReports() {
    const data = await chrome.storage.local.get(COMMUNITY_REPORTS_STORAGE_KEY);
    return normalizeCommunityState(data && data[COMMUNITY_REPORTS_STORAGE_KEY]);
  }

  function renderCommunityReports() {
    const count = communityReports.pending.length;
    els.communityStatus.textContent = `待贡献 ${count} 个`;
    els.submitCommunityReports.disabled = !settings.communitySharingEnabled || count === 0;
  }

  async function submitCommunityReports() {
    const batch = getCommunityReportBatch(communityReports);
    if (!settings.communitySharingEnabled || !batch.length) return;
    const version = chrome.runtime.getManifest().version;
    await chrome.tabs.create({ url: buildCommunityIssueUrl(batch, version), active: true });
    communityReports = markCommunityReportsSubmitted(communityReports, batch);
    await chrome.storage.local.set({ [COMMUNITY_REPORTS_STORAGE_KEY]: communityReports });
    window.close();
  }

  async function startMuteSync() {
    const words = [...DEFAULT_MUTE_WORDS, ...(remoteBlocklists.keywords || [])];
    muteSyncState = createMuteSyncState(words);
    await chrome.storage.local.set({ [MUTE_SYNC_STORAGE_KEY]: muteSyncState });
    renderMuteSync();
    await chrome.tabs.create({ url: 'https://x.com/settings/add_muted_keyword', active: true });
    window.close();
  }

  async function loadRemoteBlocklists() {
    const data = await chrome.storage.local.get(REMOTE_LISTS_STORAGE_KEY);
    return data && data[REMOTE_LISTS_STORAGE_KEY] || { keywords: [], accounts: [], fetchedAt: 0 };
  }

  async function loadRemoteStatus() {
    const data = await chrome.storage.local.get(REMOTE_STATUS_KEY);
    return data && data[REMOTE_STATUS_KEY] || null;
  }

  async function refreshRemoteLists() {
    els.refreshRemoteLists.disabled = true;
    els.remoteListStatus.textContent = '更新中';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'XYB_REFRESH_REMOTE_LISTS' });
      if (!result || !result.ok) throw new Error(result && result.error || '更新失败');
      remoteBlocklists = result.lists;
      remoteStatus = { ok: true, updatedAt: Date.now(), error: '' };
    } catch (error) {
      remoteStatus = { ok: false, updatedAt: Date.now(), error: String(error && error.message || error) };
    } finally {
      els.refreshRemoteLists.disabled = false;
      renderRemoteLists();
    }
  }

  function renderRemoteLists() {
    const keywordCount = Array.isArray(remoteBlocklists.keywords) ? remoteBlocklists.keywords.length : 0;
    const accountCount = Array.isArray(remoteBlocklists.accounts) ? remoteBlocklists.accounts.length : 0;
    if (remoteStatus && remoteStatus.ok) {
      els.remoteListStatus.textContent = `远程：${keywordCount} 词 · ${accountCount} 账号`;
    } else if (remoteStatus && remoteStatus.error) {
      els.remoteListStatus.textContent = `远程更新失败，使用缓存 ${keywordCount}/${accountCount}`;
    } else {
      els.remoteListStatus.textContent = `远程缓存：${keywordCount} 词 · ${accountCount} 账号`;
    }
  }

  async function cancelMuteSync() {
    if (!muteSyncState) return;
    muteSyncState = {
      ...muteSyncState,
      active: false,
      phase: 'cancelled',
      currentWord: '',
      updatedAt: Date.now(),
      finishedAt: Date.now()
    };
    await chrome.storage.local.set({ [MUTE_SYNC_STORAGE_KEY]: muteSyncState });
    renderMuteSync();
  }

  function renderMuteSync() {
    const state = muteSyncState;
    const total = state && Array.isArray(state.words) ? state.words.length : DEFAULT_MUTE_WORDS.length;
    const index = state ? Math.min(Number(state.index || 0), total) : 0;

    if (!state) {
      els.muteSyncProgress.textContent = `${total} 个词`;
    } else if (state.active) {
      els.muteSyncProgress.textContent = `${index}/${total} · 新增 ${state.added || 0} · 跳过 ${state.skipped || 0}`;
    } else if (state.phase === 'complete') {
      els.muteSyncProgress.textContent = `完成 · 新增 ${state.added || 0} · 跳过 ${state.skipped || 0}`;
    } else if (state.phase === 'cancelled') {
      els.muteSyncProgress.textContent = `已停止 ${index}/${total}`;
    } else {
      els.muteSyncProgress.textContent = `${index}/${total}`;
    }

    els.syncMuteWords.disabled = !!(state && state.active);
    els.syncMuteWords.textContent = state && state.active ? '同步进行中' : '同步到当前 X 账号';
    els.cancelMuteWords.hidden = !(state && state.active);
  }

  function updateFromForm() {
    settings = mergeSettings({
      ...settings,
      enabled: els.enabled.checked,
      hideDetected: els.hideDetected.checked,
      autoBlock: els.autoBlock.checked,
      communitySharingEnabled: els.communitySharingEnabled.checked,
      hideThreshold: readNumber(els.hideThreshold, 65),
      autoBlockThreshold: readNumber(els.autoBlockThreshold, 65),
      blockDelayMs: readNumber(els.blockDelayMs, 2500),
      maxBlocksPerSession: readNumber(els.maxBlocksPerSession, 30),
      whitelist: parseHandles(els.whitelist.value),
      followedHandles: parseHandles(els.followedHandles.value)
    });
    renderCommunityReports();
    scheduleSave();
  }

  function readNumber(input, fallback) {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function parseHandles(value) {
    const seen = new Set();
    return String(value || '')
      .split(/[\n,，\s]+/)
      .map(normalizeHandle)
      .filter(Boolean)
      .filter(handle => {
        if (seen.has(handle)) return false;
        seen.add(handle);
        return true;
      });
  }

  function scheduleSave() {
    els.status.textContent = '保存中';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    els.status.textContent = '已保存';
    setTimeout(() => { els.status.textContent = '已加载'; }, 900);
  }
})();
