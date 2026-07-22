(function () {
  'use strict';

  const MUTE_SYNC_STORAGE_KEY = 'muteWordSync';
  const DEFAULT_MUTE_WORDS = Object.freeze([
    '速约',
    'yp',
    '炮友',
    '破处',
    '同城资源',
    '固炮',
    '约p',
    '同城上门',
    '上门服务',
    '无偿约',
    '同城无偿约',
    '找主人',
    '少妇',
    '奶油少妇',
    '爱几把',
    '爱吃大香蕉',
    'sao',
    '骚',
    'sao货',
    '线下sao',
    '第一骚',
    '比她好看',
    '没她骚',
    '比她骚',
    '没人比她sao',
    '体制内老师',
    '探路花样多',
    '玩的就是反差',
    '玩的就是返差',
    '主页能打',
    '点主页',
    '看主页',
    '约炮',
    '约啪',
    '外围',
    '楼凤',
    '包夜',
    '空降',
    '可上门',
    '私信约'
  ]);

  function normalizeMuteWords(words) {
    const seen = new Set();
    return (Array.isArray(words) ? words : [])
      .map(word => String(word || '').trim())
      .filter(Boolean)
      .filter(word => {
        const key = word.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function createMuteSyncState(words = DEFAULT_MUTE_WORDS) {
    return {
      active: true,
      words: normalizeMuteWords(words),
      index: 0,
      added: 0,
      skipped: 0,
      failures: [],
      phase: 'navigate',
      currentWord: '',
      startedAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function advanceMuteSyncState(state, result = {}) {
    const current = state && typeof state === 'object' ? state : createMuteSyncState([]);
    const words = normalizeMuteWords(current.words);
    const index = Math.max(0, Number(current.index || 0));
    const word = words[index] || current.currentWord || '';
    const added = Number(current.added || 0) + (result.outcome === 'added' ? 1 : 0);
    const skipped = Number(current.skipped || 0) + (result.outcome === 'skipped' ? 1 : 0);
    const failures = Array.isArray(current.failures) ? [...current.failures] : [];

    if (result.outcome === 'skipped') {
      failures.push({ word, reason: String(result.reason || 'skipped') });
    }

    const nextIndex = Math.min(index + 1, words.length);
    const complete = nextIndex >= words.length;
    return {
      ...current,
      words,
      index: nextIndex,
      added,
      skipped,
      failures,
      active: !complete,
      phase: complete ? 'complete' : 'navigate',
      currentWord: '',
      updatedAt: Date.now(),
      ...(complete ? { finishedAt: Date.now() } : {})
    };
  }

  globalThis.XybMuteWords = {
    MUTE_SYNC_STORAGE_KEY,
    DEFAULT_MUTE_WORDS,
    normalizeMuteWords,
    createMuteSyncState,
    advanceMuteSyncState
  };
})();
