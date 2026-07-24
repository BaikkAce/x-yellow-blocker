(function () {
  'use strict';

  const STORAGE_KEY = 'settings';
  const { mergeSettings, WORKER_URL } = globalThis.XybDefaults;
  const { normalizeHandle } = globalThis.XybDetector;
  const {
    MUTE_SYNC_STORAGE_KEY,
    DEFAULT_MUTE_WORDS,
    createMuteSyncState
  } = globalThis.XybMuteWords;
  const { REMOTE_LISTS_STORAGE_KEY } = globalThis.XybRemoteLists;
  const {
    COMMUNITY_REPORTS_STORAGE_KEY,
    AUTO_REPORTED_STORAGE_KEY,
    normalizeState: normalizeCommunityState,
    getCommunityReportBatch,
    buildCommunityIssueUrl,
    markCommunityReportsSubmitted,
    loadAutoReportedCache,
    getOrCreateClientId
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
    communityNote: document.getElementById('communityNote'),
    communityStatus: document.getElementById('communityStatus'),
    submitCommunityReports: document.getElementById('submitCommunityReports'),
    blockedCount: document.getElementById('blockedCount'),
    blockedList: document.getElementById('blockedList')
  };

  let settings = mergeSettings({});
  let muteSyncState = null;
  let remoteBlocklists = { keywords: [], accounts: [], fetchedAt: 0 };
  let remoteStatus = null;
  let communityReports = normalizeCommunityState(null);
  let autoReportedCache = [];
  let blockedInfo = {};
  let saveTimer = null;

  boot();

  async function boot() {
    [settings, muteSyncState, remoteBlocklists, remoteStatus, communityReports, autoReportedCache, blockedInfo] = await Promise.all([
      loadSettings(),
      loadMuteSyncState(),
      loadRemoteBlocklists(),
      loadRemoteStatus(),
      loadCommunityReports(),
      loadAutoReportedCache(sg),
      loadBlockedInfo()
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

    const stats = settings.stats || {};
    els.detected.textContent = stats.detected || 0;
    els.queued.textContent = stats.queued || 0;
    els.blocked.textContent = stats.blocked || 0;
    els.failed.textContent = stats.failed || 0;
    renderMuteSync();
    renderRemoteLists();
    renderCommunityReports();
    renderBlockedList();
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
      if (changes[AUTO_REPORTED_STORAGE_KEY]) {
        autoReportedCache = loadAutoReportedCacheSync(changes[AUTO_REPORTED_STORAGE_KEY].newValue);
        renderCommunityReports();
      }
      if (changes[STORAGE_KEY]) {
        settings = mergeSettings(changes[STORAGE_KEY].newValue);
        renderBlockedList();
      }
      if (changes['xybBlockedInfo']) {
        blockedInfo = changes['xybBlockedInfo'].newValue || {};
        renderBlockedList();
      }
    });
  }

  async function loadCommunityReports() {
    const data = await chrome.storage.local.get(COMMUNITY_REPORTS_STORAGE_KEY);
    return normalizeCommunityState(data && data[COMMUNITY_REPORTS_STORAGE_KEY]);
  }

  function renderCommunityReports() {
    const autoReported = autoReportedCache.length;
    const workerReady = !!WORKER_URL;

    if (!settings.communitySharingEnabled) {
      els.communityStatus.textContent = '未开启';
      els.submitCommunityReports.hidden = true;
    } else if (workerReady) {
      els.communityStatus.textContent = autoReported > 0
        ? `匿名自动上报中 · 本次 ${autoReported} 个`
        : '匿名自动上报已就绪';
      els.submitCommunityReports.hidden = true;
    } else {
      els.communityStatus.textContent = 'Worker 未配置 · 使用手动提交';
      els.submitCommunityReports.hidden = false;
      els.submitCommunityReports.disabled = communityReports.pending.length === 0;
      els.communityStatus.textContent = `待贡献 ${communityReports.pending.length} 个`;
    }
  }

  function loadAutoReportedCacheSync(value) {
    const handles = Array.isArray(value) ? value : (value && value[AUTO_REPORTED_STORAGE_KEY]);
    return Array.isArray(handles)
      ? handles.map(h => String(h).trim().toLowerCase()).filter(h => h && h.startsWith('@'))
      : [];
  }

  async function submitCommunityReports() {
    const batch = getCommunityReportBatch(communityReports);
    if (!settings.communitySharingEnabled || !batch.length) return;
    els.submitCommunityReports.disabled = true;
    try {
      await navigator.clipboard.writeText(batch.join('\n'));
      const version = chrome.runtime.getManifest().version;
      await chrome.tabs.create({ url: buildCommunityIssueUrl(version), active: true });
      communityReports = markCommunityReportsSubmitted(communityReports, batch);
      await chrome.storage.local.set({ [COMMUNITY_REPORTS_STORAGE_KEY]: communityReports });
      window.close();
    } catch {
      els.communityStatus.textContent = '复制失败，名单仍保留';
      els.submitCommunityReports.disabled = false;
    }
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

  async function loadBlockedInfo() {
    const data = await chrome.storage.local.get('xybBlockedInfo');
    return (data && data.xybBlockedInfo) || {};
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

  function placeholder() {
    const span = document.createElement('span');
    span.className = 'blocked-avatar-placeholder';
    return span;
  }

  function renderBlockedList() {
    const handles = Array.isArray(settings.blockedHandles) ? settings.blockedHandles : [];
    els.blockedCount.textContent = `${handles.length} 个`;
    els.blockedList.innerHTML = '';

    if (!handles.length) {
      const empty = document.createElement('p');
      empty.className = 'shared-empty';
      empty.textContent = '暂无已屏蔽账号。';
      els.blockedList.appendChild(empty);
      return;
    }

    const whitelist = new Set((settings.whitelist || []).map(normalizeHandle));
    for (const handle of handles) {
      const normalized = normalizeHandle(handle);
      const info = blockedInfo[normalized] || {};
      const item = document.createElement('div');
      item.className = 'blocked-item' + (whitelist.has(normalized) ? ' whitelisted' : '');

      // Avatar
      if (info.avatarUrl) {
        const img = document.createElement('img');
        img.className = 'blocked-avatar';
        img.src = info.avatarUrl;
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        // Show first letter of name/handle while loading
        const letter = (info.displayName || handle).charAt(0).toUpperCase();
        img.setAttribute('data-fallback', letter);
        let replaced = false;
        img.onerror = () => { if (!replaced) { replaced = true; img.replaceWith(placeholder()); } };
        // Timeout fallback: if image doesn't load in 4s, swap to placeholder
        setTimeout(() => { if (!replaced && !img.complete) { replaced = true; img.replaceWith(placeholder()); } }, 4000);
        item.appendChild(img);
      } else {
        item.appendChild(placeholder());
      }

      // Name + handle
      const text = document.createElement('div');
      text.className = 'blocked-text';
      if (info.displayName) {
        const name = document.createElement('span');
        name.className = 'blocked-name';
        name.textContent = info.displayName;
        text.appendChild(name);
      }
      const h = document.createElement('span');
      h.className = 'handle';
      h.textContent = handle;
      text.appendChild(h);
      item.appendChild(text);

      const btn = document.createElement('button');
      btn.type = 'button';
      const isWhitelisted = whitelist.has(normalized);
      btn.textContent = isWhitelisted ? '已加白' : '移除并加白';
      btn.disabled = isWhitelisted;
      if (!isWhitelisted) {
        btn.addEventListener('click', () => removeAndWhitelist(handle, btn, item));
      }

      item.appendChild(btn);
      els.blockedList.appendChild(item);
    }
  }

  async function removeAndWhitelist(handle, btn, item) {
    btn.disabled = true;
    btn.textContent = '处理中…';
    try {
      const normalized = normalizeHandle(handle);
      // Remove from blockedHandles
      settings.blockedHandles = (settings.blockedHandles || []).filter(h => normalizeHandle(h) !== normalized);
      // Add to whitelist (dedupe)
      const wl = new Set((settings.whitelist || []).map(normalizeHandle));
      if (!wl.has(normalized)) {
        settings.whitelist = [...(settings.whitelist || []), normalized];
      }
      await chrome.storage.local.set({ [STORAGE_KEY]: settings });
      // Clean up blocked info
      if (blockedInfo[normalized]) {
        delete blockedInfo[normalized];
        await chrome.storage.local.set({ xybBlockedInfo: blockedInfo });
      }
      // Update the whitelist textarea
      els.whitelist.value = (settings.whitelist || []).join('\n');
      btn.textContent = '已加白';
      item.classList.add('whitelisted');
    } catch (error) {
      btn.disabled = false;
      btn.textContent = '失败';
      console.warn('[XYB] remove+whitelist failed for', handle, error && error.message || error);
      setTimeout(() => { btn.textContent = '移除并加白'; }, 1500);
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
      whitelist: parseHandles(els.whitelist.value)
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

  function sg(key) { return chrome.storage.local.get(key); }
  function ss(items) { return chrome.storage.local.set(items); }
})();
