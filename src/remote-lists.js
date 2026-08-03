(function () {
  'use strict';

  const REMOTE_LISTS_STORAGE_KEY = 'remoteBlocklists';
  const REMOTE_LIST_URLS = Object.freeze({
    keywords: 'https://raw.githubusercontent.com/BaikkAce/x-yellow-blocker/main/blocklists/keywords.txt',
    lureSamples: 'https://raw.githubusercontent.com/BaikkAce/x-yellow-blocker/main/blocklists/lure-samples.json'
  });

  // Remote files are inert data. Detection algorithms and thresholds remain
  // packaged with the extension and can never be changed by GitHub data.
  const MAX_KEYWORDS = 500;
  const MAX_KEYWORD_LENGTH = 60;
  const MAX_LURE_SAMPLES = 2000;
  const MAX_SAMPLE_TEXT_LENGTH = 320;
  const MAX_PROFILE_NAME_LENGTH = 80;
  const MAX_FETCH_BYTES = 512 * 1024;
  const ALLOWED_SAMPLE_CATEGORIES = new Set([
    'cn_adult_solicitation',
    'adult_solicitation',
    'remote_sample'
  ]);

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

  function sanitizeRemoteText(value, maxLength) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, ' ')
      .replace(/[<>{}\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  function parseKeywordList(text) {
    return parseLines(text)
      .filter(word => !/[<>{}\\]/.test(word))
      .map(word => sanitizeRemoteText(word, MAX_KEYWORD_LENGTH))
      .filter(word => word.length > 0)
      .slice(0, MAX_KEYWORDS);
  }

  function normalizePatternId(value) {
    const id = String(value || '').trim().toLocaleLowerCase();
    return /^[a-z0-9][a-z0-9_-]{2,63}$/.test(id) ? id : '';
  }

  function parseLureSamples(text) {
    let input;
    try {
      input = JSON.parse(String(text || '{}'));
    } catch {
      return [];
    }
    if (!input || Number(input.version) !== 2 || !Array.isArray(input.samples)) {
      return [];
    }

    const seen = new Set();
    const result = [];
    for (const row of input.samples.slice(0, MAX_LURE_SAMPLES * 2)) {
      if (!row || typeof row !== 'object' || row.enabled === false) continue;
      const textValue = sanitizeRemoteText(row.text, MAX_SAMPLE_TEXT_LENGTH);
      const displayName = sanitizeRemoteText(row.displayName, MAX_PROFILE_NAME_LENGTH);
      const category = String(row.category || 'remote_sample');
      const suppliedId = normalizePatternId(row.id || row.fingerprint);
      const textLength = [...textValue].length;
      const displayNameLength = [...displayName].length;
      const dedupeKey = `${textValue.toLocaleLowerCase()}\n${displayName.toLocaleLowerCase()}`;
      // A curated row may describe either a stable reply template or a
      // distinctive display-name template. Display-name-only rows are still
      // gated by reply context and low-information body checks in detector.js.
      if ((textLength < 6 && displayNameLength < 6) || !ALLOWED_SAMPLE_CATEGORIES.has(category)) continue;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      result.push({
        id: suppliedId || `pattern-${result.length + 1}`,
        displayName,
        text: textValue,
        category,
        note: sanitizeRemoteText(row.note, 120)
      });
      if (result.length >= MAX_LURE_SAMPLES) break;
    }
    return result;
  }

  function createRemoteBlocklists({
    keywordsText = '',
    lureSamplesText = '',
    fetchedAt = Date.now()
  } = {}) {
    return {
      keywords: parseKeywordList(keywordsText),
      lureSamples: parseLureSamples(lureSamplesText),
      fetchedAt,
      source: 'github-curated-data'
    };
  }

  async function fetchRemoteBlocklists(fetcher = fetch, urls = REMOTE_LIST_URLS) {
    async function fetchText(name, url) {
      const response = await fetcher(url, { cache: 'no-store' });
      if (!response || !response.ok) {
        throw new Error(`${name} request failed: ${response && response.status || 'network error'}`);
      }
      const text = await response.text();
      if (text.length > MAX_FETCH_BYTES) {
        console.warn(`[XYB] ${name} exceeded ${MAX_FETCH_BYTES} bytes, truncating`);
        return text.slice(0, MAX_FETCH_BYTES);
      }
      return text;
    }

    const [keywordsText, lureSamplesText] = await Promise.all([
      fetchText('keywords', urls.keywords),
      fetchText('lure samples', urls.lureSamples)
    ]);
    return createRemoteBlocklists({
      keywordsText,
      lureSamplesText,
      fetchedAt: Date.now()
    });
  }

  globalThis.XybRemoteLists = {
    REMOTE_LISTS_STORAGE_KEY,
    REMOTE_LIST_URLS,
    parseKeywordList,
    parseLureSamples,
    createRemoteBlocklists,
    fetchRemoteBlocklists
  };
})();
