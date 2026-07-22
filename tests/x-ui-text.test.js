import assert from 'node:assert/strict';
import test from 'node:test';

await import('../src/x-ui-text.js');

const { isBlockMenuText, isConfirmBlockText } = globalThis.XybXUiText;

test('matches Chinese X block menu items with a handle', () => {
  assert.equal(isBlockMenuText('屏蔽 @yellow_user', '@yellow_user'), true);
  assert.equal(isBlockMenuText('封锁 @yellow_user', '@yellow_user'), true);
});

test('matches English X block menu items with a handle', () => {
  assert.equal(isBlockMenuText('Block @yellow_user', '@yellow_user'), true);
});

test('does not mistake unblock actions for block actions', () => {
  assert.equal(isBlockMenuText('取消屏蔽 @yellow_user', '@yellow_user'), false);
  assert.equal(isBlockMenuText('Unblock @yellow_user', '@yellow_user'), false);
});

test('matches localized confirm block button text', () => {
  assert.equal(isConfirmBlockText('屏蔽'), true);
  assert.equal(isConfirmBlockText('封锁'), true);
  assert.equal(isConfirmBlockText('Block'), true);
});
