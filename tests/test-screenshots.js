import assert from 'node:assert/strict';
import test from 'node:test';

await import('../src/defaults.js');
await import('../src/detector.js');
const { evaluateTweet } = globalThis.XybDetector;

const cases = [
  { name: '水超多波波（蹲一个搭子）', handle: '@test1' },
  { name: '健身教练琴姐（同城男大无偿）', handle: '@test2' },
  { name: '爱后入的欣欣（单身免费）', handle: '@test3' },
  { name: '学生妍妍（找固炮）', handle: '@test4' },
  { name: '九九妹子（找个线下）', handle: '@test5' },
  { name: '纯情雯雯（dd个线下的哥）', handle: '@test6' },
  { name: '娜娜学姐（蹲一个搭子）', handle: '@test7' },
  { name: '希希姐姐（喜欢私 可y）', handle: '@test8' },
  { name: '琪琪姐姐（离得近的来）', handle: '@test9' },
  { name: '子御姐姐（男大弟来）', handle: '@test10' },
  { name: '小寒妹妹（谁来当我主人）', handle: '@test11' },
  { name: '幼师佳佳子（今晚准时涩播）', handle: '@test12' },
  { name: '饥渴孕妇想找个哥哥约操', handle: '@spam1' },
  { name: '女仆需要你主人', handle: '@spam2' },
  { name: '性感御姐线下无偿', handle: '@spam3' },
  { name: '学生妹性奴精准配对', handle: '@spam4' },
  { name: '玉琪妹妹（chu男无偿）', handle: '@spam5' },
  { name: '找个会舔B的公狗约范', handle: '@spam6' },
  { name: '馨儿妹妹（今晚准时涩播）', handle: '@spam7' },
  { name: '饥渴孕妇想找个哥哥约操', handle: '@spam8' },
];

const baseSettings = { hideThreshold: 65, autoBlockThreshold: 65, whitelist: [], followedHandles: [], blockedHandles: [], remoteKeywords: [], blockedAccounts: [] };

let detected = 0;
let missed = [];
for (const c of cases) {
  const verdict = evaluateTweet({
    handle: c.handle,
    displayName: c.name,
    tweetText: '',
    articleText: '',
    externalLinks: [],
    isReply: false,
    verified: false
  }, baseSettings);

  if (verdict.shouldHide) {
    detected++;
  } else {
    missed.push(c.name + ' (score: ' + verdict.score + ')');
  }
}

console.log('\n=== Detection Results ===');
console.log('Detected: ' + detected + '/' + cases.length);
console.log('Missed (' + missed.length + '):');
missed.forEach(m => console.log('  - ' + m));

assert.ok(detected >= cases.length * 0.7, 'Should detect at least 70%, got ' + detected);
