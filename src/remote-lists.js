(function () {
  'use strict';

  const REMOTE_LISTS_STORAGE_KEY = 'remoteBlocklists';
  const REMOTE_LIST_URLS = Object.freeze({
    keywords: 'https://raw.githubusercontent.com/BaikkAce/x-yellow-blocker/main/blocklists/keywords.txt',
    accounts: 'https://raw.githubusercontent.com/BaikkAce/x-yellow-blocker/main/blocklists/accounts.txt'
  });

  function parseLines(text) {
    const seen = new Set();
    return String(text || '')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .filter(line => {
        const key = line.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function parseKeywordList(text) {
    return parseLines(text).filter(word => word.length <= 80);
  }

  function normalizeBlockedAccount(value) {
    const raw = String(value || '').trim();
    const urlMatch = raw.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,20})(?:\/|$)/i);
    const candidate = (urlMatch ? urlMatch[1] : raw.replace(/^@+/, '')).toLowerCase();
    return /^[a-z0-9_]{1,20}$/.test(candidate) ? `@${candidate}` : '';
  }

  function parseAccountList(text) {
    const seen = new Set();
    return parseLines(text)
      .map(normalizeBlockedAccount)
      .filter(Boolean)
      .filter(handle => {
        if (seen.has(handle)) return false;
        seen.add(handle);
        return true;
      });
  }

  function createRemoteBlocklists({ keywordsText = '', accountsText = '', fetchedAt = Date.now() } = {}) {
    return {
      keywords: parseKeywordList(keywordsText),
      accounts: parseAccountList(accountsText),
      fetchedAt,
      source: 'github'
    };
  }

  async function fetchRemoteBlocklists(fetcher = fetch, urls = REMOTE_LIST_URLS) {
    async function fetchText(name, url) {
      const response = await fetcher(url, { cache: 'no-store' });
      if (!response || !response.ok) {
        throw new Error(`${name} list request failed: ${response && response.status || 'network error'}`);
      }
      return response.text();
    }

    const [keywordsText, accountsText] = await Promise.all([
      fetchText('keywords', urls.keywords),
      fetchText('accounts', urls.accounts)
    ]);
    return createRemoteBlocklists({ keywordsText, accountsText, fetchedAt: Date.now() });
  }

  globalThis.XybRemoteLists = {
    REMOTE_LISTS_STORAGE_KEY,
    REMOTE_LIST_URLS,
    parseKeywordList,
    parseAccountList,
    normalizeBlockedAccount,
    createRemoteBlocklists,
    fetchRemoteBlocklists
  };
})();
