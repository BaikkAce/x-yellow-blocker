(function () {
  'use strict';

  const COMMUNITY_REPORTS_STORAGE_KEY = 'communityReports';
  const AUTO_REPORTED_STORAGE_KEY = 'autoReported';
  const COMMUNITY_REPOSITORY = 'BaikkAce/x-yellow-blocker';
  const MAX_PENDING_REPORTS = 100;
  const MAX_REPORT_BATCH = 30;
  const MAX_AUTO_REPORTED_CACHE = 500;

  function normalizeHandle(value) {
    const raw = String(value || '').trim();
    const urlMatch = raw.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,20})(?:\/|$)/i);
    const candidate = (urlMatch ? urlMatch[1] : raw.replace(/^@+/, '')).toLowerCase();
    return /^[a-z0-9_]{1,20}$/.test(candidate) ? `@${candidate}` : '';
  }

  function normalizeState(value) {
    const input = value && typeof value === 'object' ? value : {};
    return {
      pending: normalizeHandleList(input.pending).slice(-MAX_PENDING_REPORTS),
      submitted: normalizeHandleList(input.submitted).slice(-500),
      updatedAt: Number(input.updatedAt || 0)
    };
  }

  function normalizeHandleList(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
      .map(normalizeHandle)
      .filter(Boolean)
      .filter(handle => {
        if (seen.has(handle)) return false;
        seen.add(handle);
        return true;
      });
  }

  function enqueueCommunityReport(current, handle, now = Date.now()) {
    const state = normalizeState(current);
    const normalized = normalizeHandle(handle);
    if (!normalized || state.pending.includes(normalized) || state.submitted.includes(normalized)) return state;
    return {
      ...state,
      pending: [...state.pending, normalized].slice(-MAX_PENDING_REPORTS),
      updatedAt: now
    };
  }

  function getCommunityReportBatch(current) {
    return normalizeState(current).pending.slice(0, MAX_REPORT_BATCH);
  }

  function buildCommunityIssueUrl(extensionVersion = '') {
    const url = new URL(`https://github.com/${COMMUNITY_REPOSITORY}/issues/new`);
    url.searchParams.set('template', 'community-block-report.yml');
    url.searchParams.set('title', '[Community report]');
    url.searchParams.set('version', String(extensionVersion || 'unknown').slice(0, 40));
    return url.toString();
  }

  function markCommunityReportsSubmitted(current, handles, now = Date.now()) {
    const state = normalizeState(current);
    const submittedBatch = normalizeHandleList(handles);
    const submittedSet = new Set(submittedBatch);
    return {
      pending: state.pending.filter(handle => !submittedSet.has(handle)),
      submitted: normalizeHandleList([...state.submitted, ...submittedBatch]).slice(-500),
      updatedAt: now
    };
  }

  // =========================================================================
  //  Auto-report (anonymous, verifiable)
  // =========================================================================

  // Generate a 22-char anonymous client ID. Stored once in chrome.storage.local.
  function generateClientId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 22; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }

  async function getOrCreateClientId(storageGet, storageSet) {
    const key = 'xybClientId';
    const data = await storageGet(key);
    if (data && data[key] && typeof data[key] === 'string' && data[key].length >= 8) {
      return data[key];
    }
    const id = generateClientId();
    await storageSet({ [key]: id });
    return id;
  }

  // Build a verification payload from the detector verdict.
  // The backend validates score >= 65 and non-empty reasons.
  function buildVerificationPayload(verdict) {
    if (!verdict) return null;
    return {
      score: Number(verdict.score || 0),
      category: String(verdict.category || ''),
      reasons: Array.isArray(verdict.reasons) ? verdict.reasons.slice(0, 10) : []
    };
  }

  // Check and track already-auto-reported handles to avoid duplicate requests.
  async function loadAutoReportedCache(storageGet) {
    const data = await storageGet(AUTO_REPORTED_STORAGE_KEY);
    const handles = data && data[AUTO_REPORTED_STORAGE_KEY];
    return Array.isArray(handles) ? handles.map(normalizeHandle).filter(Boolean) : [];
  }

  async function saveAutoReportedCache(storageSet, cache, handle) {
    const normalized = normalizeHandle(handle);
    if (!normalized) return cache;
    const next = [...cache, normalized].slice(-MAX_AUTO_REPORTED_CACHE);
    await storageSet({ [AUTO_REPORTED_STORAGE_KEY]: next });
    return next;
  }

  function wasAlreadyAutoReported(cache, handle) {
    const normalized = normalizeHandle(handle);
    return !!(normalized && cache.includes(normalized));
  }

  globalThis.XybCommunitySharing = {
    COMMUNITY_REPORTS_STORAGE_KEY,
    AUTO_REPORTED_STORAGE_KEY,
    COMMUNITY_REPOSITORY,
    MAX_REPORT_BATCH,
    normalizeHandle,
    normalizeState,
    enqueueCommunityReport,
    getCommunityReportBatch,
    buildCommunityIssueUrl,
    markCommunityReportsSubmitted,
    getOrCreateClientId,
    generateClientId,
    buildVerificationPayload,
    loadAutoReportedCache,
    saveAutoReportedCache,
    wasAlreadyAutoReported
  };
})();
