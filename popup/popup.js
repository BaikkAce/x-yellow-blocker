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

  const REMOTE_STATUS_KEY = 'remoteBlocklistsStatus';
  const DIAGNOSTIC_LOG_KEY = 'xybDiagnosticLog';

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
    blockedCount: document.getElementById('blockedCount'),
    blockedList: document.getElementById('blockedList'),
    diagnosticCount: document.getElementById('diagnosticCount'),
    diagnosticLog: document.getElementById('diagnosticLog'),
    copyDiagnosticLog: document.getElementById('copyDiagnosticLog'),
    clearDiagnosticLog: document.getElementById('clearDiagnosticLog')
  };

  let settings = mergeSettings({});
  let muteSyncState = null;
  let remoteBlocklists = { keywords: [], lureSamples: [], fetchedAt: 0 };
  let remoteStatus = null;
  let blockedInfo = {};
  let diagnosticLogs = [];
  let saveTimer = null;

  boot();

  async function boot() {
    [settings, muteSyncState, remoteBlocklists, remoteStatus, blockedInfo] = await Promise.all([
      loadSettings(),
      loadMuteSyncState(),
      loadRemoteBlocklists(),
      loadRemoteStatus(),
      loadBlockedInfo()
    ]);
    diagnosticLogs = await loadDiagnosticLogs();
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
    ['enabled', 'hideDetected', 'autoBlock'].forEach(id => {
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
    els.copyDiagnosticLog.addEventListener('click', copyDiagnosticLogs);
    els.clearDiagnosticLog.addEventListener('click', clearDiagnosticLogs);
  }

  function render() {
    els.enabled.checked = !!settings.enabled;
    els.hideDetected.checked = !!settings.hideDetected;
    els.autoBlock.checked = !!settings.autoBlock;
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
    renderBlockedList();
    renderDiagnosticLogs();
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
        remoteBlocklists = changes[REMOTE_LISTS_STORAGE_KEY].newValue || { keywords: [], lureSamples: [], fetchedAt: 0 };
        renderRemoteLists();
      }
      if (changes[REMOTE_STATUS_KEY]) {
        remoteStatus = changes[REMOTE_STATUS_KEY].newValue || null;
        renderRemoteLists();
      }
      if (changes[STORAGE_KEY]) {
        settings = mergeSettings(changes[STORAGE_KEY].newValue);
        renderBlockedList();
      }
      if (changes['xybBlockedInfo']) {
        blockedInfo = changes['xybBlockedInfo'].newValue || {};
        renderBlockedList();
      }
      if (changes[DIAGNOSTIC_LOG_KEY]) {
        diagnosticLogs = Array.isArray(changes[DIAGNOSTIC_LOG_KEY].newValue)
          ? changes[DIAGNOSTIC_LOG_KEY].newValue
          : [];
        renderDiagnosticLogs();
      }
    });
  }

  async function startMuteSync() {
    // The content script first scans the active X account, then refreshes
    // cloud keywords and builds a missing-only queue.
    muteSyncState = createMuteSyncState([]);
    await chrome.storage.local.set({ [MUTE_SYNC_STORAGE_KEY]: muteSyncState });
    renderMuteSync();
    await chrome.tabs.create({ url: 'https://x.com/settings/muted_keywords', active: true });
    window.close();
  }

  async function loadRemoteBlocklists() {
    const data = await chrome.storage.local.get(REMOTE_LISTS_STORAGE_KEY);
    return data && data[REMOTE_LISTS_STORAGE_KEY] || { keywords: [], lureSamples: [], fetchedAt: 0 };
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
    const sampleCount = Array.isArray(remoteBlocklists.lureSamples) ? remoteBlocklists.lureSamples.length : 0;
    if (remoteStatus && remoteStatus.ok) {
      els.remoteListStatus.textContent = `GitHub：${keywordCount} 词 · ${sampleCount} 语言样本`;
    } else if (remoteStatus && remoteStatus.error) {
      els.remoteListStatus.textContent = `更新失败，使用缓存：${keywordCount} 词 · ${sampleCount} 样本`;
    } else {
      els.remoteListStatus.textContent = `缓存：${keywordCount} 词 · ${sampleCount} 语言样本`;
    }
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
        img.onerror = () => { img.style.display = 'none'; };
        item.appendChild(img);
      } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'blocked-avatar-placeholder';
        item.appendChild(placeholder);
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

  async function loadDiagnosticLogs() {
    const data = await chrome.storage.local.get(DIAGNOSTIC_LOG_KEY);
    return Array.isArray(data && data[DIAGNOSTIC_LOG_KEY]) ? data[DIAGNOSTIC_LOG_KEY] : [];
  }

  function formatDiagnosticLogs() {
    return diagnosticLogs.slice(-100).map(entry => {
      const time = String(entry.timestamp || '').replace('T', ' ').replace('Z', '');
      return `${time} ${entry.event || 'unknown'} ${JSON.stringify(entry.details || {})}`;
    }).join('\n');
  }

  function renderDiagnosticLogs() {
    els.diagnosticCount.textContent = `${diagnosticLogs.length} 条`;
    els.diagnosticLog.textContent = diagnosticLogs.length ? formatDiagnosticLogs() : '暂无日志';
    els.copyDiagnosticLog.disabled = diagnosticLogs.length === 0;
    els.clearDiagnosticLog.disabled = diagnosticLogs.length === 0;
  }

  async function copyDiagnosticLogs() {
    await navigator.clipboard.writeText(formatDiagnosticLogs());
    els.copyDiagnosticLog.textContent = '已复制';
    setTimeout(() => { els.copyDiagnosticLog.textContent = '复制日志'; }, 1200);
  }

  async function clearDiagnosticLogs() {
    await chrome.storage.local.set({ [DIAGNOSTIC_LOG_KEY]: [] });
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
    } else if (state.active && state.phase === 'scan') {
      els.muteSyncProgress.textContent = '正在读取已有屏蔽词…';
    } else if (state.active) {
      els.muteSyncProgress.textContent = `${index}/${total} · 新增 ${state.added || 0} · 已有 ${state.existing || 0}`;
    } else if (state.phase === 'complete') {
      els.muteSyncProgress.textContent = `完成 · 新增 ${state.added || 0} · 已有 ${state.existing || 0} · 失败 ${(state.failures || []).length}`;
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
      hideThreshold: readNumber(els.hideThreshold, 65),
      autoBlockThreshold: readNumber(els.autoBlockThreshold, 65),
      blockDelayMs: readNumber(els.blockDelayMs, 2500),
      maxBlocksPerSession: readNumber(els.maxBlocksPerSession, 30),
      whitelist: parseHandles(els.whitelist.value)
    });
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
