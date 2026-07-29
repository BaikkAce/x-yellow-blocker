(function () {
  'use strict';

  if (!globalThis.XybDetector || !globalThis.XybDefaults || !globalThis.XybXUiText || !globalThis.XybMuteWords || !globalThis.XybRemoteLists) {
    console.warn('[XYB] Missing detector/defaults bootstrap');
    return;
  }

  const { evaluateTweet, normalizeHandle } = globalThis.XybDetector;
  const { mergeSettings } = globalThis.XybDefaults;
  const { compactText, isBlockMenuText, isConfirmBlockText } = globalThis.XybXUiText;
  const {
    MUTE_SYNC_STORAGE_KEY,
    DEFAULT_MUTE_WORDS,
    normalizeMuteWords,
    createMuteSyncState,
    advanceMuteSyncState
  } = globalThis.XybMuteWords;
  const { REMOTE_LISTS_STORAGE_KEY } = globalThis.XybRemoteLists;

  const STORAGE_KEY = 'settings';
  const DIAGNOSTIC_LOG_KEY = 'xybDiagnosticLog';
  const MAX_DIAGNOSTIC_ENTRIES = 200;
  const REMOTE_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // refresh keywords and language samples every hour
  const ARTICLE_SELECTOR = 'article[data-testid="tweet"], article[role="article"]';
  const RESERVED_PATHS = /^(home|explore|notifications|messages|i|settings|search|compose|bookmarks|following|followers|jobs)$/i;
  let settings = mergeSettings({});
  let remoteBlocklists = { keywords: [], lureSamples: [], fetchedAt: 0 };
  let observer = null;
  let processingQueue = false;
  let sessionBlockCount = 0;
  const processed = new WeakSet();
  const blockQueue = [];
  const queuedHandles = new Set();
  const pendingStats = { detected: 0, queued: 0, blocked: 0, failed: 0 };
  let statsTimer = null;
  let muteSyncBusy = false;
  let diagnosticWritePromise = Promise.resolve();

  boot();

  async function boot() {
    [settings, remoteBlocklists] = await Promise.all([loadSettings(), loadRemoteBlocklists()]);
    applyDocumentState();
    attachObserver();
    initialScan();
    watchSettings();
    watchRemoteBlocklists();
    installMuteSyncListener();
    resumeMuteWordSync();
    refreshRemoteBlocklistsIfStale();
    setInterval(refreshRemoteBlocklistsIfStale, REMOTE_REFRESH_INTERVAL_MS);
    logDiagnostic('boot', {
      autoBlock: settings.autoBlock,
      threshold: settings.autoBlockThreshold,
      delayMs: settings.blockDelayMs,
      sessionLimit: settings.maxBlocksPerSession,
      path: location.pathname
    });
    console.info('[XYB] loaded', { autoBlock: settings.autoBlock, hideThreshold: settings.hideThreshold });
  }

  async function loadSettings() {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      const merged = mergeSettings(data && data[STORAGE_KEY]);
      await chrome.storage.local.set({ [STORAGE_KEY]: merged });
      return merged;
    } catch (error) {
      console.warn('[XYB] failed to load settings', error);
      return mergeSettings({});
    }
  }

  async function loadRemoteBlocklists() {
    try {
      const data = await chrome.storage.local.get(REMOTE_LISTS_STORAGE_KEY);
      const stored = data && data[REMOTE_LISTS_STORAGE_KEY];
      return {
        keywords: Array.isArray(stored && stored.keywords) ? stored.keywords : [],
        lureSamples: Array.isArray(stored && stored.lureSamples) ? stored.lureSamples : [],
        fetchedAt: Number(stored && stored.fetchedAt || 0)
      };
    } catch (error) {
      console.warn('[XYB] failed to load remote blocklists', error);
      return { keywords: [], lureSamples: [], fetchedAt: 0 };
    }
  }

  function watchRemoteBlocklists() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[REMOTE_LISTS_STORAGE_KEY]) return;
      const next = changes[REMOTE_LISTS_STORAGE_KEY].newValue || {};
      remoteBlocklists = {
        keywords: Array.isArray(next.keywords) ? next.keywords : [],
        lureSamples: Array.isArray(next.lureSamples) ? next.lureSamples : [],
        fetchedAt: Number(next.fetchedAt || 0)
      };
      reEvaluateAll();
    });
  }

  function refreshRemoteBlocklistsIfStale() {
    if (Date.now() - Number(remoteBlocklists.fetchedAt || 0) < REMOTE_REFRESH_INTERVAL_MS) return;
    chrome.runtime.sendMessage({ type: 'XYB_REFRESH_REMOTE_LISTS' }).catch(error => {
      console.warn('[XYB] remote blocklist refresh failed', error);
    });
  }

  function watchSettings() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      const previous = settings;
      settings = mergeSettings(changes[STORAGE_KEY].newValue);
      applyDocumentState();
      if (needsReEvaluation(previous, settings)) reEvaluateAll();
    });
  }

  function installMuteSyncListener() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message.type !== 'string') return false;

      if (message.type === 'XYB_START_MUTE_SYNC') {
        startMuteWordSync(message.words)
          .then(state => sendResponse({ ok: true, state }))
          .catch(error => sendResponse({ ok: false, error: String(error && error.message || error) }));
        return true;
      }

      if (message.type === 'XYB_CANCEL_MUTE_SYNC') {
        cancelMuteWordSync()
          .then(state => sendResponse({ ok: true, state }))
          .catch(error => sendResponse({ ok: false, error: String(error && error.message || error) }));
        return true;
      }

      return false;
    });
  }

  async function startMuteWordSync(words) {
    const state = createMuteSyncState(words);
    if (!state.words.length) throw new Error('屏蔽词列表为空');
    await saveMuteSyncState(state);
    renderMuteSyncToast(state);
    setTimeout(() => location.assign('/settings/muted_keywords'), 50);
    return state;
  }

  async function cancelMuteWordSync() {
    const state = await loadMuteSyncState();
    const cancelled = {
      ...(state || createMuteSyncState([])),
      active: false,
      phase: 'cancelled',
      currentWord: '',
      updatedAt: Date.now(),
      finishedAt: Date.now()
    };
    await saveMuteSyncState(cancelled);
    renderMuteSyncToast(cancelled);
    return cancelled;
  }

  async function resumeMuteWordSync() {
    if (muteSyncBusy) return;
    const state = await loadMuteSyncState();
    if (!state || !state.active) {
      renderMuteSyncToast(state);
      return;
    }

    renderMuteSyncToast(state);
    if (state.phase === 'scan') {
      if (!location.pathname.includes('/settings/muted_keywords')) {
        location.assign('/settings/muted_keywords');
        return;
      }
      setTimeout(() => scanExistingMuteWords(state), 180);
      return;
    }

    if (Number(state.index || 0) >= state.words.length) {
      await finishMuteWordSync(state);
      return;
    }

    if (location.pathname.includes('/settings/muted_keywords') && state.phase === 'submitted') {
      const next = advanceMuteSyncState(state, { outcome: 'added' });
      await saveMuteSyncState(next);
      renderMuteSyncToast(next);
      if (next.active) setTimeout(() => location.assign('/settings/add_muted_keyword'), 100);
      return;
    }

    const deduped = advancePastExistingMuteWords(state);
    if (deduped.index !== state.index) {
      await saveMuteSyncState(deduped);
      renderMuteSyncToast(deduped);
      if (!deduped.active) return;
      setTimeout(() => location.assign('/settings/add_muted_keyword'), 100);
      return;
    }

    if (!location.pathname.includes('/settings/add_muted_keyword')) {
      location.assign('/settings/add_muted_keyword');
      return;
    }

    if (state.phase === 'submitted') {
      const next = advanceMuteSyncState(state, { outcome: 'skipped', reason: '页面重载后未确认保存' });
      await saveMuteSyncState(next);
      renderMuteSyncToast(next);
      if (next.active) setTimeout(() => location.assign('/settings/add_muted_keyword'), 100);
      return;
    }

    setTimeout(() => submitCurrentMuteWord(state), 180);
  }

  async function scanExistingMuteWords(initialState) {
    if (muteSyncBusy) return;
    muteSyncBusy = true;
    try {
      const latest = await loadMuteSyncState();
      const state = latest && latest.active ? latest : initialState;
      if (!state || !state.active || state.phase !== 'scan') return;

      const found = new Set();
      let stableRounds = 0;
      let previousSize = -1;
      const scroller = findMuteWordsScroller();
      for (let round = 0; round < 50 && stableRounds < 3; round += 1) {
        collectVisibleMuteWords().forEach(word => found.add(word));
        const before = readScrollTop(scroller);
        scrollMuteWords(scroller, Math.max(500, window.innerHeight * 0.8));
        await sleep(90);
        const after = readScrollTop(scroller);
        if (found.size === previousSize && after === before) stableRounds += 1;
        else stableRounds = 0;
        previousSize = found.size;
      }
      writeScrollTop(scroller, 0);

      let cloudKeywords = remoteBlocklists.keywords || [];
      try {
        const refreshed = await chrome.runtime.sendMessage({ type: 'XYB_REFRESH_REMOTE_LISTS' });
        if (refreshed && refreshed.ok && refreshed.lists && Array.isArray(refreshed.lists.keywords)) {
          cloudKeywords = refreshed.lists.keywords;
        }
      } catch (error) {
        console.warn('[XYB] cloud keywords refresh failed; using cache', error);
      }

      const allCandidates = normalizeMuteWords([...DEFAULT_MUTE_WORDS, ...cloudKeywords]);
      const existingKeys = new Set(normalizeMuteWords([...found]).map(word => word.toLocaleLowerCase()));
      const missingWords = allCandidates.filter(word => !existingKeys.has(word.toLocaleLowerCase()));
      const scanned = {
        ...state,
        words: missingWords,
        index: 0,
        added: 0,
        skipped: allCandidates.length - missingWords.length,
        existing: allCandidates.length - missingWords.length,
        failures: [],
        existingWords: normalizeMuteWords([...found]),
        candidateCount: allCandidates.length,
        phase: 'navigate',
        updatedAt: Date.now()
      };
      if (!missingWords.length) {
        scanned.active = false;
        scanned.phase = 'complete';
        scanned.finishedAt = Date.now();
      }
      await saveMuteSyncState(scanned);
      renderMuteSyncToast(scanned);
      if (scanned.active) setTimeout(() => location.assign('/settings/add_muted_keyword'), 100);
    } finally {
      muteSyncBusy = false;
    }
  }

  function collectVisibleMuteWords() {
    const candidates = [];
    document.querySelectorAll('a[href*="/settings/muted_keywords/"]').forEach(link => {
      const line = firstMeaningfulLine(link.textContent);
      if (line) candidates.push(line);
    });
    if (!candidates.length) {
      document.querySelectorAll('[data-testid="cellInnerDiv"]').forEach(cell => {
        const text = compactText(cell.textContent);
        const looksLikeMuteEntry = /(主页时间线|通知|直到你取消|24\s*小时|7\s*天|30\s*天|home timeline|notifications|until you unmute|forever)/i.test(text);
        if (!looksLikeMuteEntry && !cell.querySelector('[data-testid="caret"], button[aria-haspopup="menu"]')) return;
        const line = extractMuteWordFromCell(cell);
        if (line) candidates.push(line);
      });
    }
    return normalizeMuteWords(candidates);
  }

  function firstMeaningfulLine(value) {
    const ignored = /^(muted|屏蔽|已屏蔽|来自|通知|home timeline|notifications|until|永久|forever|more|更多)$/i;
    return String(value || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line && line.length <= 100 && !ignored.test(line)) || '';
  }

  function extractMuteWordFromCell(cell) {
    const ignored = /^(主页时间线|通知|来自任何人|来自你未关注的人|直到你取消隐藏该词语|24\s*小时|7\s*天|30\s*天|home timeline|notifications|from anyone|from people you don't follow|until you unmute the word|24 hours|7 days|30 days|forever|更多|more)$/i;
    const spanTexts = Array.from(cell.querySelectorAll('span'))
      .map(span => compactText(span.textContent))
      .filter(text => text && text.length <= 100 && !ignored.test(text));
    return spanTexts[0] || firstMeaningfulLine(cell.textContent);
  }

  function findMuteWordsScroller() {
    const main = document.querySelector('main') || document.body;
    const candidates = [document.scrollingElement, ...main.querySelectorAll('div')]
      .filter(Boolean)
      .filter(element => element.scrollHeight > element.clientHeight + 80)
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    return candidates[0] || document.scrollingElement;
  }

  function readScrollTop(scroller) {
    return scroller === document.scrollingElement ? window.scrollY : Number(scroller.scrollTop || 0);
  }

  function writeScrollTop(scroller, value) {
    if (scroller === document.scrollingElement) window.scrollTo(0, value);
    else scroller.scrollTop = value;
  }

  function scrollMuteWords(scroller, amount) {
    writeScrollTop(scroller, readScrollTop(scroller) + amount);
  }

  function advancePastExistingMuteWords(state) {
    let next = state;
    const existing = new Set(normalizeMuteWords(state.existingWords).map(word => word.toLocaleLowerCase()));
    while (next.active && Number(next.index || 0) < next.words.length) {
      const word = String(next.words[next.index] || '').trim();
      if (!existing.has(word.toLocaleLowerCase())) break;
      next = advanceMuteSyncState(next, { outcome: 'existing', reason: '已存在' });
    }
    return next;
  }

  async function submitCurrentMuteWord(initialState) {
    if (muteSyncBusy) return;
    muteSyncBusy = true;

    try {
      const latest = await loadMuteSyncState();
      const state = latest && latest.active ? latest : initialState;
      if (!state || !state.active) return;

      const word = state.words[state.index];
      if (!word) {
        await finishMuteWordSync(state);
        return;
      }

      const input = await waitFor(findMuteWordInput, 7000);
      if (!input) {
        await skipMuteWord(state, '找不到 X 屏蔽词输入框');
        return;
      }

      setInputValue(input, word);
      const alreadyExists = await waitFor(() => muteWordAlreadyExists(word), 400);
      if (alreadyExists) {
        await skipExistingMuteWord(state);
        return;
      }
      const saveButton = await waitFor(findMuteWordSaveButton, 1200);
      if (!saveButton) {
        await skipMuteWord(state, '找不到 X 保存按钮');
        return;
      }

      const submitted = {
        ...state,
        phase: 'submitted',
        currentWord: word,
        updatedAt: Date.now()
      };
      await saveMuteSyncState(submitted);
      renderMuteSyncToast(submitted);
      saveButton.click();

      const saved = await waitFor(() => location.pathname.includes('/settings/muted_keywords'), 3500);
      if (!saved) {
        await skipMuteWord(submitted, readMuteWordFormError() || 'X 未确认保存，可能已存在');
        return;
      }

      const next = advanceMuteSyncState(submitted, { outcome: 'added' });
      await saveMuteSyncState(next);
      renderMuteSyncToast(next);
      if (next.active) setTimeout(() => location.assign('/settings/add_muted_keyword'), 100);
    } finally {
      muteSyncBusy = false;
    }
  }

  function findMuteWordInput() {
    return Array.from(document.querySelectorAll('input[type="text"]')).find(input => {
      return input.getAttribute('role') !== 'combobox' && !input.disabled;
    }) || null;
  }

  function findMuteWordSaveButton() {
    const candidates = document.querySelectorAll('button, div[role="button"]');
    for (const button of candidates) {
      const text = compactText(button.textContent);
      if (!/^(保存|Save|保存する|저장)$/i.test(text)) continue;
      if (button.disabled || button.getAttribute('aria-disabled') === 'true') continue;
      return button;
    }
    return null;
  }

  function setInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function readMuteWordFormError() {
    const text = compactText((document.querySelector('main') || document.body).textContent);
    const match = text.match(/(已经存在|已存在|重复|duplicate|already exists|无法保存|保存失败)/i);
    return match ? match[0] : '';
  }

  async function skipMuteWord(state, reason) {
    const next = advanceMuteSyncState(state, { outcome: 'skipped', reason });
    await saveMuteSyncState(next);
    renderMuteSyncToast(next);
    if (next.active) setTimeout(() => location.assign('/settings/add_muted_keyword'), 150);
  }

  async function finishMuteWordSync(state) {
    const finished = {
      ...state,
      active: false,
      phase: 'complete',
      currentWord: '',
      updatedAt: Date.now(),
      finishedAt: Date.now()
    };
    await saveMuteSyncState(finished);
    renderMuteSyncToast(finished);
  }

  async function loadMuteSyncState() {
    const data = await chrome.storage.local.get(MUTE_SYNC_STORAGE_KEY);
    return data && data[MUTE_SYNC_STORAGE_KEY] || null;
  }

  async function saveMuteSyncState(state) {
    await chrome.storage.local.set({ [MUTE_SYNC_STORAGE_KEY]: state });
  }

  function renderMuteSyncToast(state) {
    let toast = document.querySelector('.xyb-mute-sync-toast');
    if (!state || (!state.active && !['complete', 'cancelled'].includes(state.phase))) {
      if (toast) toast.remove();
      return;
    }

    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'xyb-mute-sync-toast';
      document.documentElement.appendChild(toast);
    }

    if (state.phase === 'complete') {
      toast.textContent = `屏蔽词同步完成：新增 ${state.added || 0}，已存在 ${state.existing || 0}，失败 ${(state.failures || []).length}`;
      setTimeout(() => toast && toast.remove(), 5000);
      return;
    }
    if (state.phase === 'cancelled') {
      toast.textContent = '屏蔽词同步已停止';
      setTimeout(() => toast && toast.remove(), 2500);
      return;
    }

    const total = Array.isArray(state.words) ? state.words.length : 0;
    const position = Math.min(Number(state.index || 0) + 1, total);
    toast.textContent = state.phase === 'scan'
      ? '正在读取当前 X 账号已有屏蔽词…'
      : `正在同步 X 屏蔽词 ${position}/${total}${state.currentWord ? `：${state.currentWord}` : ''}`;
  }

  function needsReEvaluation(previous, next) {
    const keys = ['enabled', 'hideDetected', 'autoBlock', 'hideThreshold', 'autoBlockThreshold'];
    if (keys.some(key => previous[key] !== next[key])) return true;
    return !sameHandleList(previous.whitelist, next.whitelist) ||
      !sameHandleList(previous.followedHandles, next.followedHandles) ||
      !sameHandleList(previous.blockedHandles, next.blockedHandles);
  }

  function sameHandleList(a, b) {
    const left = (Array.isArray(a) ? a : []).map(normalizeHandle).sort().join('\n');
    const right = (Array.isArray(b) ? b : []).map(normalizeHandle).sort().join('\n');
    return left === right;
  }

  function applyDocumentState() {
    document.documentElement.dataset.xybEnabled = settings.enabled ? '1' : '0';
    document.documentElement.dataset.xybHide = settings.hideDetected ? '1' : '0';
    document.documentElement.dataset.xybAutoBlock = settings.autoBlock ? '1' : '0';
  }

  function attachObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      const articles = new Set();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          collectTweetArticles(node, articles);
        }
      }
      for (const article of articles) evaluateArticle(article);
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  function collectTweetArticles(node, out) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches && node.matches(ARTICLE_SELECTOR)) out.add(node);
    if (node.querySelectorAll) {
      node.querySelectorAll(ARTICLE_SELECTOR).forEach(article => out.add(article));
    }
  }

  function initialScan() {
    document.querySelectorAll(ARTICLE_SELECTOR).forEach(article => evaluateArticle(article));
  }

  function reEvaluateAll() {
    document.querySelectorAll(ARTICLE_SELECTOR).forEach(article => {
      processed.delete(article);
      clearArticleState(article);
      evaluateArticle(article);
    });
  }

  function evaluateArticle(article) {
    if (!article || processed.has(article)) return;
    processed.add(article);

    if (!settings.enabled) {
      clearArticleState(article);
      return;
    }

    const tweet = extractTweet(article);
    if (!tweet || !tweet.handle) return;

    // Product boundary: only moderate replies under an opened post. Never
    // hide/block the root post, timeline posts, search results or profiles.
    if (!tweet.isThreadReply) {
      clearArticleState(article);
      article.dataset.xyb = 'out-of-scope';
      return;
    }

    const verdict = evaluateTweet(tweet, {
      ...settings,
      remoteKeywords: remoteBlocklists.keywords,
      remoteLureSamples: remoteBlocklists.lureSamples
    });
    article.dataset.xybHandle = tweet.handle;
    article.dataset.xybScore = String(verdict.score);

    if (verdict.shouldHide) {
      logDiagnostic('detected', {
        handle: tweet.handle,
        score: verdict.score,
        shouldAutoBlock: verdict.shouldAutoBlock,
        autoBlockEnabled: settings.autoBlock
      });
      markDetected(article, tweet, verdict);
      countDetected(article);
      if (settings.autoBlock && verdict.shouldAutoBlock) {
        enqueueBlock({ article, tweet, verdict, manual: false });
      }
      return;
    }

    article.dataset.xyb = verdict.protected ? 'protected' : 'ok';
  }

  function extractTweet(article) {
    const userNameEl = article.querySelector('[data-testid="User-Name"]');
    const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
    if (!userNameEl) return null;

    const handle = extractHandle(userNameEl);
    if (!handle) return null;

    const tweetText = tweetTextEl ? extractTextWithEmoji(tweetTextEl) : '';
    const userNameText = extractTextWithEmoji(userNameEl);
    const displayName = cleanDisplayName(userNameText, handle);
    const avatarImg = article.querySelector('img[src*="profile_images"]') ||
      article.querySelector('img[src*="twimg.com/profile"]');
    const avatarUrl = avatarImg ? (avatarImg.src || '').replace('_normal', '_bigger') : '';
    const externalLinks = Array.from(article.querySelectorAll('a[href]'))
      .map(link => link.href || link.getAttribute('href') || '')
      .filter(isExternalLink);

    return {
      handle,
      displayName,
      avatarUrl,
      tweetText,
      articleText: extractTextWithEmoji(article),
      externalLinks,
      isReply: isReplyArticle(article),
      isThreadReply: isThreadReplyArticle(article),
      verified: !!article.querySelector('svg[data-testid="icon-verified"]')
    };
  }

  function muteWordAlreadyExists(word) {
    const text = compactText((document.querySelector('main') || document.body).textContent);
    const duplicateMessage = /(已经隐藏了|已经屏蔽了|已隐藏|已屏蔽|already muted|already hidden|already exists|すでにミュート|이미 뮤트)/i.test(text);
    return duplicateMessage && text.toLocaleLowerCase().includes(String(word || '').trim().toLocaleLowerCase());
  }

  async function skipExistingMuteWord(state) {
    const next = advanceMuteSyncState(state, { outcome: 'existing', reason: 'X 确认已存在' });
    await saveMuteSyncState(next);
    renderMuteSyncToast(next);
    if (next.active) setTimeout(() => location.assign('/settings/add_muted_keyword'), 100);
  }

  function isThreadReplyArticle(article) {
    const rootMatch = location.pathname.match(/\/status\/(\d+)/i);
    if (!rootMatch) return false;
    const articleStatusId = extractArticleStatusId(article);
    return !!articleStatusId && articleStatusId !== rootMatch[1];
  }

  function extractArticleStatusId(article) {
    // The timestamp link is the tweet's canonical permalink. Restricting the
    // lookup to links containing <time> avoids mistaking quoted posts for the
    // comment itself.
    const time = article.querySelector('a[href*="/status/"] time');
    const permalink = time && time.closest('a[href*="/status/"]');
    const href = permalink && permalink.getAttribute('href') || '';
    const match = href.match(/\/status\/(\d+)/i);
    return match ? match[1] : '';
  }

  function extractHandle(root) {
    const links = Array.from(root.querySelectorAll('a[href^="/"]'));
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/^\/([A-Za-z0-9_]+)(?:\/|$)/);
      if (!match || RESERVED_PATHS.test(match[1])) continue;
      return normalizeHandle(match[1]);
    }
    return '';
  }

  function cleanDisplayName(text, handle) {
    const handleName = handle.replace(/^@/, '');
    return String(text || '')
      .replace(new RegExp('@?' + escapeRegExp(handleName), 'ig'), '')
      .replace(/·\s*\d+[smhdwy]\b/ig, '')
      .split('\n')[0]
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractTextWithEmoji(element) {
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'IMG' && node.getAttribute('alt')) {
          text += node.getAttribute('alt');
        } else if (node.tagName === 'BR') {
          text += '\n';
        } else {
          text += extractTextWithEmoji(node);
        }
      }
    }
    return text;
  }

  function isExternalLink(href) {
    if (!href) return false;
    try {
      const url = new URL(href, location.href);
      return !/(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(url.hostname);
    } catch {
      return false;
    }
  }

  function isReplyArticle(article) {
    const text = article.textContent || '';
    return /Replying to|回复|回覆|返信先/i.test(text.slice(0, 500));
  }

  function markDetected(article, tweet, verdict) {
    article.dataset.xyb = 'detected';
    article.dataset.xybCategory = verdict.category;
    article.dataset.xybHandle = tweet.handle;
    ensureBanner(article, tweet, verdict);
  }

  function ensureBanner(article, tweet, verdict) {
    let banner = article.querySelector(':scope > .xyb-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'xyb-banner';
      banner.innerHTML = [
        '<div class="xyb-main">',
        '  <span class="xyb-dot"></span>',
        '  <span class="xyb-title"></span>',
        '  <span class="xyb-meta"></span>',
        '</div>',
        '<div class="xyb-actions">',
        '  <button type="button" data-xyb-action="toggle">显示</button>',
        '  <button type="button" data-xyb-action="block">屏蔽</button>',
        '  <button type="button" data-xyb-action="trust">信任</button>',
        '</div>',
        '<div class="xyb-reasons"></div>'
      ].join('');
      banner.addEventListener('click', event => handleBannerClick(event, article));
      article.insertBefore(banner, article.firstChild);
    }

    banner.querySelector('.xyb-title').textContent = '疑似黄色引流';
    banner.querySelector('.xyb-meta').textContent = settings.autoBlock
      ? `${tweet.handle} · ${verdict.score}`
      : `${tweet.handle} · ${verdict.score} · 自动屏蔽已关闭`;
    banner.querySelector('.xyb-reasons').textContent = verdict.reasons.join(' · ');
    banner.querySelector('[data-xyb-action="block"]').disabled = !tweet.handle || isBlocked(tweet.handle);
  }

  function handleBannerClick(event, article) {
    const button = event.target.closest('button[data-xyb-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();

    const action = button.dataset.xybAction;
    const handle = article.dataset.xybHandle;
    if (action === 'toggle') {
      const revealed = article.dataset.xyb === 'revealed';
      article.dataset.xyb = revealed ? 'detected' : 'revealed';
      button.textContent = revealed ? '显示' : '收起';
      return;
    }
    if (action === 'trust' && handle) {
      addWhitelist(handle);
      return;
    }
    if (action === 'block' && handle) {
      const tweet = extractTweet(article);
      enqueueBlock({ article, tweet: tweet || { handle }, verdict: { shouldAutoBlock: true }, manual: true });
    }
  }

  function countDetected(article) {
    if (article.dataset.xybCounted === '1') return;
    article.dataset.xybCounted = '1';
    updateStats({ detected: 1 });
  }

  function enqueueBlock(job) {
    const handle = normalizeHandle(job.tweet && job.tweet.handle);
    if (!handle) {
      logDiagnostic('queue_rejected', { reason: 'missing_handle' });
      return;
    }
    if (queuedHandles.has(handle)) {
      logDiagnostic('queue_duplicate', { handle });
      markBlockState(job.article, 'queued');
      return;
    }
    if (isBlocked(handle)) {
      logDiagnostic('queue_rejected', { handle, reason: 'already_blocked_locally' });
      markBlockState(job.article, 'done');
      return;
    }
    if (listHas(settings.whitelist, handle) || listHas(settings.followedHandles, handle)) {
      logDiagnostic('queue_rejected', { handle, reason: 'trusted_or_followed' });
      markBlockState(job.article, 'failed', '账号在本机信任名单中');
      return;
    }
    if (!job.manual && sessionBlockCount >= Number(settings.maxBlocksPerSession || 30)) {
      logDiagnostic('queue_rejected', { handle, reason: 'session_limit', sessionBlockCount });
      markBlockState(job.article, 'failed', '已达到本轮自动屏蔽上限');
      return;
    }

    queuedHandles.add(handle);
    blockQueue.push({ ...job, handle, enqueuedAt: Date.now() });
    logDiagnostic('queued', { handle, manual: !!job.manual, queueLength: blockQueue.length });
    if (job.article) job.article.dataset.xybBlock = 'queued';
    updateStats({ queued: 1 });
    processBlockQueue();
  }

  async function processBlockQueue() {
    if (processingQueue) return;
    processingQueue = true;
    while (blockQueue.length) {
      const job = blockQueue.shift();
      queuedHandles.delete(job.handle);
      if (!job.manual && !settings.autoBlock) {
        logDiagnostic('queue_skipped', { handle: job.handle, reason: 'auto_block_disabled' });
        markBlockState(job.article, 'failed', '自动屏蔽已关闭');
        continue;
      }
      if (!job.manual && sessionBlockCount >= Number(settings.maxBlocksPerSession || 30)) {
        logDiagnostic('queue_skipped', { handle: job.handle, reason: 'session_limit', sessionBlockCount });
        markBlockState(job.article, 'failed', '已达到本轮自动屏蔽上限');
        continue;
      }
      await sleep(Number(settings.blockDelayMs || 2500));
      logDiagnostic('attempt_started', { handle: job.handle, articleConnected: !!(job.article && document.contains(job.article)) });
      const result = await attemptBlock(job);
      if (result.ok) {
        sessionBlockCount += 1;
        await rememberBlocked(job.handle, job.tweet);
        markBlockState(job.article, 'done');
        logDiagnostic('attempt_succeeded', { handle: job.handle });
        updateStats({ blocked: 1 });
      } else {
        markBlockState(job.article, 'failed', result.reason);
        logDiagnostic('attempt_failed', { handle: job.handle, reason: result.reason });
        updateStats({ failed: 1 });
      }
    }
    processingQueue = false;
  }

  async function attemptBlock(job) {
    const article = job.article;
    if (!article || !document.contains(article)) return { ok: false, reason: '推文已从页面移除' };
    markBlockState(article, 'working');
    // X anchors the dropdown to the More button's layout box. A fully
    // collapsed article has no usable anchor, so reveal it only while the
    // native block UI is being operated.
    const previousArticleState = article.dataset.xyb;
    article.dataset.xyb = 'revealed';

    const moreButton = findMoreButton(article);
    if (!moreButton) {
      logDiagnostic('more_button_missing', {
        handle: job.handle,
        buttons: collectButtonDiagnostics(article)
      });
      article.dataset.xyb = previousArticleState;
      return { ok: false, reason: '找不到更多菜单' };
    }
    logDiagnostic('more_button_found', {
      handle: job.handle,
      testId: moreButton.getAttribute('data-testid') || '',
      ariaLabel: moreButton.getAttribute('aria-label') || ''
    });
    moreButton.click();

    const menuItem = await waitFor(() => findBlockMenuItem(job.handle), 1800);
    if (!menuItem) {
      logDiagnostic('block_menu_missing', {
        handle: job.handle,
        menuTexts: collectMenuDiagnostics()
      });
      closeTransientUi();
      article.dataset.xyb = previousArticleState;
      return { ok: false, reason: '找不到屏蔽菜单项' };
    }
    logDiagnostic('block_menu_found', { handle: job.handle, text: compactText(menuItem.textContent).slice(0, 160) });
    menuItem.click();

    const confirmButton = await waitFor(findConfirmBlockButton, 2200);
    if (!confirmButton) {
      logDiagnostic('confirm_button_missing', {
        handle: job.handle,
        dialogTexts: collectDialogDiagnostics()
      });
      closeTransientUi();
      article.dataset.xyb = previousArticleState;
      return { ok: false, reason: '找不到确认屏蔽按钮' };
    }
    logDiagnostic('confirm_button_found', {
      handle: job.handle,
      text: compactText(confirmButton.textContent).slice(0, 80),
      testId: confirmButton.getAttribute('data-testid') || ''
    });
    confirmButton.click();
    await sleep(700);
    if (document.contains(article)) article.dataset.xyb = previousArticleState;
    return { ok: true };
  }

  function collectButtonDiagnostics(article) {
    return Array.from(article.querySelectorAll('button, div[role="button"]'))
      .slice(0, 25)
      .map(button => ({
        testId: button.getAttribute('data-testid') || '',
        ariaLabel: button.getAttribute('aria-label') || '',
        text: compactText(button.textContent).slice(0, 60)
      }));
  }

  function collectMenuDiagnostics() {
    return Array.from(document.querySelectorAll('[role="menuitem"], [role="menu"] [role="button"], [data-testid="Dropdown"] button'))
      .slice(0, 30)
      .map(item => compactText(item.textContent).slice(0, 160))
      .filter(Boolean);
  }

  function collectDialogDiagnostics() {
    return Array.from(document.querySelectorAll('[role="dialog"] button, [role="dialog"] div[role="button"]'))
      .slice(0, 25)
      .map(item => compactText(item.textContent).slice(0, 120))
      .filter(Boolean);
  }

  function logDiagnostic(event, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      event: String(event || 'unknown').slice(0, 80),
      details
    };
    console.info('[XYB diagnostic]', entry);
    diagnosticWritePromise = diagnosticWritePromise
      .then(async () => {
        const data = await chrome.storage.local.get(DIAGNOSTIC_LOG_KEY);
        const current = Array.isArray(data && data[DIAGNOSTIC_LOG_KEY]) ? data[DIAGNOSTIC_LOG_KEY] : [];
        await chrome.storage.local.set({
          [DIAGNOSTIC_LOG_KEY]: [...current, entry].slice(-MAX_DIAGNOSTIC_ENTRIES)
        });
      })
      .catch(error => console.warn('[XYB] diagnostic log write failed', error));
  }

  function findMoreButton(article) {
    const selectors = [
      '[data-testid="caret"]',
      'button[aria-label="More"]',
      'button[aria-label="更多"]',
      'button[aria-label="さらに表示"]',
      'button[aria-label*="More"]',
      'button[aria-label*="更多"]',
      'button[aria-label*="さらに"]'
    ];
    for (const selector of selectors) {
      const button = article.querySelector(selector);
      if (button) return button;
    }
    return Array.from(article.querySelectorAll('button[aria-haspopup="menu"], div[role="button"][aria-haspopup="menu"]')).at(-1) || null;
  }

  function findBlockMenuItem(handle) {
    const items = document.querySelectorAll('[role="menuitem"], [data-testid="Dropdown"] [role="menuitem"], [data-testid="Dropdown"] [role="button"], [data-testid="Dropdown"] button');
    for (const item of items) {
      if (isBlockMenuText(item.textContent, handle)) {
        return item.closest('[role="menuitem"], [role="button"], button') || item;
      }
    }
    return null;
  }

  function findConfirmBlockButton() {
    const candidates = document.querySelectorAll('[data-testid="confirmationSheetConfirm"], [role="dialog"] button, [role="dialog"] div[role="button"]');
    for (const button of candidates) {
      if (button.getAttribute('data-testid') === 'confirmationSheetConfirm') return button;
      const text = compactText(button.textContent);
      if (isConfirmBlockText(text)) return button;
    }
    return null;
  }

  function markBlockState(article, state, reason = '') {
    if (!article) return;
    article.dataset.xybBlock = state;
    const banner = article.querySelector(':scope > .xyb-banner');
    const meta = banner && banner.querySelector('.xyb-meta');
    if (!meta) return;
    const labels = {
      queued: '已排队',
      working: '屏蔽中',
      done: '已屏蔽',
      failed: '屏蔽失败'
    };
    meta.textContent = `${article.dataset.xybHandle || ''} · ${article.dataset.xybScore || ''} · ${labels[state] || state}`;
    const reasons = banner.querySelector('.xyb-reasons');
    if (state === 'failed' && reasons && reason) {
      reasons.textContent = `${reasons.textContent} · ${reason}`;
    }
  }

  async function rememberBlocked(handle, info) {
    const normalized = normalizeHandle(handle);
    if (!normalized || isBlocked(normalized)) return;
    const next = [...(settings.blockedHandles || []), normalized];
    await patchSettings({ blockedHandles: next });
    if (info && (info.displayName || info.avatarUrl)) {
      try {
        const data = await chrome.storage.local.get('xybBlockedInfo');
        const all = (data && data.xybBlockedInfo) || {};
        all[normalized] = { displayName: info.displayName || '', avatarUrl: info.avatarUrl || '', blockedAt: Date.now() };
        await chrome.storage.local.set({ xybBlockedInfo: all });
      } catch (e) {
        console.warn('[XYB] failed to store blocked info', e);
      }
    }
  }

  async function addWhitelist(handle) {
    const normalized = normalizeHandle(handle);
    if (!normalized || listHas(settings.whitelist, normalized)) return;
    const next = [...(settings.whitelist || []), normalized];
    await patchSettings({ whitelist: next });
    document.querySelectorAll(`article[data-xyb-handle="${cssEscape(normalized)}"]`).forEach(article => {
      article.dataset.xyb = 'protected';
      article.removeAttribute('data-xyb-block');
    });
  }

  async function patchSettings(patch) {
    settings = mergeSettings({ ...settings, ...patch });
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  }

  function updateStats(delta) {
    for (const key of Object.keys(delta)) pendingStats[key] += delta[key];
    if (statsTimer) return;
    statsTimer = setTimeout(flushStats, 700);
  }

  async function flushStats() {
    statsTimer = null;
    const delta = { ...pendingStats };
    for (const key of Object.keys(pendingStats)) pendingStats[key] = 0;
    const stats = { ...(settings.stats || {}) };
    for (const [key, value] of Object.entries(delta)) stats[key] = (stats[key] || 0) + value;
    await patchSettings({ stats });
  }

  function isBlocked(handle) {
    return listHas(settings.blockedHandles, handle);
  }

  function listHas(list, handle) {
    const normalized = normalizeHandle(handle);
    return Array.isArray(list) && list.some(item => normalizeHandle(item) === normalized);
  }

  function clearArticleState(article) {
    delete article.dataset.xyb;
    delete article.dataset.xybCategory;
    delete article.dataset.xybHandle;
    delete article.dataset.xybScore;
    delete article.dataset.xybBlock;
    const banner = article.querySelector(':scope > .xyb-banner');
    if (banner) banner.remove();
  }

  function closeTransientUi() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function waitFor(getter, timeoutMs) {
    const start = Date.now();
    return new Promise(resolve => {
      const tick = () => {
        const value = getter();
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function cssEscape(value) {
    if (globalThis.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value).replace(/"/g, '\\"');
  }
})();
