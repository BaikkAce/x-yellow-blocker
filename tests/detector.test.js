import assert from 'node:assert/strict';
import test from 'node:test';

await import('../src/defaults.js');
await import('../src/detector.js');

const { evaluateTweet, normalizeHandle } = globalThis.XybDetector;
const { mergeSettings } = globalThis.XybDefaults;

function verdict(overrides = {}, settings = {}) {
  return evaluateTweet({
    handle: '@normal_user',
    displayName: 'Normal User',
    tweetText: 'This is a normal reply about the product launch.',
    isReply: true,
    externalLinks: [],
    verified: false,
    ...overrides
  }, settings);
}

test('flags clear Chinese adult solicitation as high-confidence auto-block candidate', () => {
  const result = verdict({
    displayName: '寂寞学妹 找男友',
    tweetText: '点主页看私房资源 加微私聊',
    externalLinks: ['https://t.co/abc123']
  });

  assert.equal(result.shouldHide, true);
  assert.equal(result.shouldAutoBlock, true);
  assert.equal(result.category, 'cn_adult_solicitation');
  assert.ok(result.score >= 90);
});

test('flags English bio-link adult promotion', () => {
  const result = verdict({
    displayName: 'Mia 🔞',
    tweetText: 'Check my bio for spicy pics and OnlyFans content',
    externalLinks: ['https://onlyfans.com/example']
  });

  assert.equal(result.shouldHide, true);
  assert.equal(result.shouldAutoBlock, true);
  assert.equal(result.category, 'adult_solicitation');
});

test('treats the default detected threshold as an auto-block candidate', () => {
  const result = verdict({
    displayName: '寂寞找聊',
    tweetText: '加微私聊'
  });

  assert.equal(result.shouldHide, true);
  assert.equal(result.shouldAutoBlock, true);
  assert.ok(result.score >= 65);
});

test('flags X sensitive adult content warnings even with little tweet text', () => {
  const result = verdict({
    displayName: 'photo account',
    tweetText: '',
    articleText: 'Content warning: Adult Content'
  });

  assert.equal(result.shouldHide, true);
  assert.equal(result.shouldAutoBlock, true);
  assert.equal(result.category, 'adult_solicitation');
});

test('flags a single adult marker paired with profile lure', () => {
  const result = verdict({
    displayName: 'Mika 🔞',
    tweetText: '看我主页'
  });

  assert.equal(result.shouldHide, true);
  assert.equal(result.shouldAutoBlock, true);
});

test('blocks reply authors when the display name itself is explicit adult solicitation', () => {
  const result = verdict({
    displayName: '同城约炮 私房资源',
    tweetText: '看看',
    isReply: true
  });

  assert.equal(result.shouldHide, true);
  assert.equal(result.shouldAutoBlock, true);
  assert.equal(result.category, 'cn_adult_solicitation');
});

test('blocks reply authors when the display name advertises adult platforms', () => {
  const result = verdict({
    displayName: 'OnlyFans girl 🔞',
    tweetText: 'hi',
    isReply: true
  });

  assert.equal(result.shouldHide, true);
  assert.equal(result.shouldAutoBlock, true);
  assert.equal(result.category, 'adult_solicitation');
});

test('blocks adult-lure display names paired with short obfuscated reply text', () => {
  const samples = [
    ['乔虹奶油少妇💚', 'q\ns\n:'],
    ['霞霞爱吃大香蕉❤️', 'y\nl\n~'],
    ['莉莉爱几把💘', 'z\nr\n-'],
    ['芊芊找主人💋', 'h\nl\n{'],
    ['同城无偿约🌸Marion', 's\nv\n+']
  ];

  for (const [displayName, tweetText] of samples) {
    const result = verdict({ displayName, tweetText, isReply: true });

    assert.equal(result.shouldHide, true, displayName);
    assert.equal(result.shouldAutoBlock, true, displayName);
    assert.equal(result.category, 'cn_adult_solicitation', displayName);
  }
});

test('blocks the reported adult display-name spam samples', () => {
  const samples = [
    { displayName: '雪晴 同城上门', tweetText: '❤️', isReply: false },
    { displayName: '同城无偿约 Marion', tweetText: 's v +', isReply: true },
    { displayName: '乔虹奶油少妇', tweetText: 'q s :', isReply: true }
  ];

  for (const sample of samples) {
    const result = verdict(sample);
    assert.equal(result.shouldAutoBlock, true, sample.displayName);
  }
});

test('blocks the reported adult display-name spam replies', () => {
  const samples = [
    { displayName: '雪晴 同城上门', tweetText: '❤️', isReply: true },
    { displayName: '同城无偿约 Marion', tweetText: 's v +', isReply: true },
    { displayName: '乔虹奶油少妇', tweetText: 'q s :', isReply: true }
  ];

  for (const sample of samples) {
    const result = verdict(sample);
    assert.equal(result.shouldAutoBlock, true, sample.displayName);
  }
});

test('blocks the reported adult lure reply samples', () => {
  const samples = [
    '比她好看的)p没她骚^^比她骚的没她好看 @GuruGodi',
    '线下sao货没人比她sao @GuruGodi',
    '30+的rt体制内老师 玩的就是返差 @x'
  ];

  for (const tweetText of samples) {
    const result = verdict({ tweetText, isReply: true });
    assert.equal(result.shouldAutoBlock, true, tweetText);
  }
});

test('blocks the reported adult lure reply samples with mention targets', () => {
  const samples = [
    { displayName: 'harley scherago', tweetText: '比她好看的)p没她骚^^比她骚的没她好看 @GuruGodi', isReply: true },
    { displayName: 'Avery', tweetText: '线下sao货没人比她sao @GuruGodi', isReply: true },
    { displayName: 'Toda Arisa', tweetText: '30+的rt体制内老师 玩的就是返差 @taocczf', isReply: true }
  ];

  for (const sample of samples) {
    const result = verdict(sample);
    assert.equal(result.shouldAutoBlock, true, sample.displayName);
  }
});

test('blocks adult mention-lure templates even when X omits reply context in the DOM', () => {
  const samples = [
    'qx体制内老师 sao的很 @taocczf 9b',
    'sao货sh 没人比她sao❣ @Shawnszn26 4g',
    '30+的ln体制内老师 已探路花样多@yemodq 3n',
    '刷了半天的X yj就她的主页能打✈了 @yn0422 9c',
    '30+的hj体制内老师 玩的就是返差@yemodq 9z'
  ];

  for (const tweetText of samples) {
    const result = verdict({ tweetText, isReply: false });
    assert.equal(result.shouldHide, true, tweetText);
    assert.equal(result.shouldAutoBlock, true, tweetText);
  }
});

test('does not score split-character replies independently of adult signals', () => {
  const result = verdict({
    displayName: 'Normal User',
    tweetText: 'q s :',
    isReply: true
  });

  assert.equal(result.score, 0);
  assert.equal(result.shouldHide, false);
  assert.equal(result.shouldAutoBlock, false);
  assert.ok(!result.reasons.includes('split-character spam reply'));
});

test('blocks adult-lure display names paired with adult emoji even with neutral reply text', () => {
  const result = verdict({
    displayName: '芊芊找主人💋',
    tweetText: 'hello',
    isReply: true
  });

  assert.equal(result.shouldHide, true);
  assert.equal(result.shouldAutoBlock, true);
  assert.equal(result.category, 'cn_adult_solicitation');
});

test('blocks adult descriptor comments that lure to mentioned accounts', () => {
  const samples = [
    ['比她好看的p没她骚^^比她骚的没她好看 @GuruGodi'],
    ['>=推特,v第一骚 @HakanPlt1'],
    ['/线下sao货没人比她sao @GuruGodi'],
    ['比她好看的nw没她骚 f比她骚的没她好看 @GuruGodi'],
    ['30+的rt体制内老师 玩的就是返差 @taocczf 0b'],
    ['30+的np体制内老师 已探路花样多@taocczf 2m'],
    ['她太涩了 vq 我真顶不住 @ykcr651 7z'],
    ['刷了半天的X kw就她的主页能打✈了 @LSCDD 4q'],
    ['sao货fb 没人比她sao❣ @LSCDD 8w']
  ];

  for (const [tweetText] of samples) {
    const result = verdict({
      displayName: 'Normal User',
      tweetText,
      isReply: true
    });

    assert.equal(result.shouldHide, true, tweetText);
    assert.equal(result.shouldAutoBlock, true, tweetText);
    assert.equal(result.category, 'cn_adult_solicitation', tweetText);
  }
});

test('does not block a single casual adult adjective with a mentioned account', () => {
  const result = verdict({
    displayName: 'Design Notes',
    tweetText: '这个发布节奏有点骚 @team 但功能不错',
    isReply: true
  });

  assert.equal(result.shouldHide, false);
  assert.equal(result.shouldAutoBlock, false);
});

test('does not block short obfuscated-looking replies without adult display signals', () => {
  const result = verdict({
    displayName: 'Product Notes',
    tweetText: 'q\ns\n:',
    isReply: true
  });

  assert.equal(result.shouldHide, false);
  assert.equal(result.shouldAutoBlock, false);
});

test('defaults to automatic X blocking after migration', () => {
  const settings = mergeSettings({ autoBlock: false, autoBlockThreshold: 90 });

  assert.equal(settings.autoBlock, true);
  assert.equal(settings.autoBlockThreshold, settings.hideThreshold);
  assert.equal(settings.communitySharingEnabled, false);
  assert.equal(settings.settingsVersion, 3);
});

test('does not treat a suspicious-looking handle as evidence by itself', () => {
  const result = verdict({
    handle: '@sao_88888',
    displayName: 'Saoirse Dev',
    tweetText: 'Great writeup. The caching section was useful.',
    externalLinks: []
  });

  assert.equal(result.shouldHide, false);
  assert.equal(result.shouldAutoBlock, false);
  assert.equal(result.score, 0);
});

test('keeps normal tweets visible', () => {
  const result = verdict({
    displayName: 'Research Notes',
    tweetText: 'The paper compares retrieval quality across multilingual datasets.',
    isReply: false,
    externalLinks: []
  });

  assert.equal(result.shouldHide, false);
  assert.equal(result.shouldAutoBlock, false);
});

test('protects followed and whitelisted accounts from hiding and auto-blocking', () => {
  const followed = verdict({
    handle: '@friend',
    displayName: '朋友',
    tweetText: '加微私聊 私房资源 点主页',
    externalLinks: ['https://t.co/abc']
  }, { followedHandles: ['@friend'] });

  const whitelisted = verdict({
    handle: '@trusted',
    displayName: '可信账号',
    tweetText: 'OnlyFans check my bio',
    externalLinks: ['https://example.com']
  }, { whitelist: ['trusted'] });

  assert.equal(followed.protected, true);
  assert.equal(followed.shouldHide, false);
  assert.equal(followed.shouldAutoBlock, false);
  assert.equal(whitelisted.protected, true);
  assert.equal(whitelisted.shouldHide, false);
  assert.equal(whitelisted.shouldAutoBlock, false);
});

test('normalizes handles consistently', () => {
  assert.equal(normalizeHandle('User_Name'), '@user_name');
  assert.equal(normalizeHandle('@User_Name'), '@user_name');
  assert.equal(normalizeHandle(''), '');
});
