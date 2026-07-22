import assert from 'node:assert/strict';
import test from 'node:test';

await import('../src/mute-words.js');

const {
  DEFAULT_MUTE_WORDS,
  createMuteSyncState,
  advanceMuteSyncState
} = globalThis.XybMuteWords;

test('ships the high-confidence mute words from reported spam samples', () => {
  const expected = [
    '同城上门',
    '无偿约',
    'sao货',
    '体制内老师',
    '主页能打',
    '玩的就是返差'
  ];

  for (const word of expected) assert.ok(DEFAULT_MUTE_WORDS.includes(word), word);
});

test('creates a deterministic deduplicated sync queue', () => {
  const state = createMuteSyncState([' 同城上门 ', 'sao货', '同城上门', '']);

  assert.equal(state.active, true);
  assert.deepEqual(state.words, ['同城上门', 'sao货']);
  assert.equal(state.index, 0);
  assert.equal(state.phase, 'navigate');
});

test('advances successful and skipped mute words without losing progress', () => {
  const initial = createMuteSyncState(['同城上门', 'sao货']);
  const added = advanceMuteSyncState(initial, { outcome: 'added' });
  const skipped = advanceMuteSyncState(added, { outcome: 'skipped', reason: 'already exists' });

  assert.equal(added.index, 1);
  assert.equal(added.added, 1);
  assert.equal(skipped.index, 2);
  assert.equal(skipped.skipped, 1);
  assert.equal(skipped.active, false);
  assert.equal(skipped.phase, 'complete');
  assert.equal(skipped.failures[0].word, 'sao货');
});
