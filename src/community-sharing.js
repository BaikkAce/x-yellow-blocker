(function () {
  'use strict';

  const COMMUNITY_REPORTS_STORAGE_KEY = 'communityReports';
  const COMMUNITY_REPOSITORY = 'BaikkAce/x-yellow-blocker';
  const MAX_PENDING_REPORTS = 100;
  const MAX_REPORT_BATCH = 30;

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

  function buildCommunityIssueUrl(handles, extensionVersion = '') {
    const batch = normalizeHandleList(handles).slice(0, MAX_REPORT_BATCH);
    const url = new URL(`https://github.com/${COMMUNITY_REPOSITORY}/issues/new`);
    url.searchParams.set('template', 'community-block-report.yml');
    url.searchParams.set('title', `[Community report] ${batch.length} blocked account${batch.length === 1 ? '' : 's'}`);
    url.searchParams.set('handles', batch.join('\n'));
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

  globalThis.XybCommunitySharing = {
    COMMUNITY_REPORTS_STORAGE_KEY,
    COMMUNITY_REPOSITORY,
    MAX_REPORT_BATCH,
    normalizeHandle,
    normalizeState,
    enqueueCommunityReport,
    getCommunityReportBatch,
    buildCommunityIssueUrl,
    markCommunityReportsSubmitted
  };
})();
