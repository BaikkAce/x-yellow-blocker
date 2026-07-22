(function () {
  'use strict';

  const UNBLOCK_TEXT = /(unblock|取消屏蔽|解除屏蔽|取消封鎖|解除封鎖|取消封锁|解除封锁|ブロック解除)/i;
  const BLOCK_WORDS = ['block', '屏蔽', '封鎖', '封锁', 'ブロック'];

  function compactText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeHandle(handle) {
    const raw = String(handle || '').trim().replace(/^@+/, '').toLowerCase();
    return raw ? '@' + raw : '';
  }

  function isBlockMenuText(text, handle) {
    const value = compactText(text);
    if (!value || UNBLOCK_TEXT.test(value)) return false;
    if (!hasBlockWord(value)) return false;

    const normalized = normalizeHandle(handle);
    if (!normalized) return true;
    const bare = normalized.slice(1);
    const lower = value.toLowerCase();

    if (lower.includes(normalized) || lower.includes(bare)) return true;
    return !/@[a-z0-9_]+/i.test(value);
  }

  function isConfirmBlockText(text) {
    const value = compactText(text);
    if (!value || UNBLOCK_TEXT.test(value)) return false;
    return /^(block|屏蔽|封鎖|封锁|ブロック)$/i.test(value);
  }

  function hasBlockWord(text) {
    const lower = String(text || '').toLowerCase();
    if (/\bblock\b/i.test(lower)) return true;
    return BLOCK_WORDS.slice(1).some(word => lower.includes(word.toLowerCase()));
  }

  globalThis.XybXUiText = {
    compactText,
    isBlockMenuText,
    isConfirmBlockText
  };
})();
