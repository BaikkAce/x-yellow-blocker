(function () {
  'use strict';

  const FALLBACK_SETTINGS = {
    hideThreshold: 65,
    autoBlockThreshold: 65,
    whitelist: [],
    followedHandles: []
  };

  const RX = Object.freeze({
    cnAdultDirect: [
      /约\s*[炮p]/i,
      /寻\s*(固\s*)?[炮p]/i,
      /炮\s*友/,
      /裸\s*聊/,
      /援\s*交/,
      /包\s*养/,
      /破\s*处/,
      /楼\s*凤/,
      /福\s*利\s*姬/,
      /私\s*房\s*(照|图|资源|视频)?/,
      /无\s*码\s*(资源|视频|图)?/,
      /成人\s*(内容|资源|影片|视频|直播)?/,
      /色情\s*(内容|资源|影片|视频|直播)?/,
      /18\s*[禁+]/,
      /少\s*妇/,
      /奶\s*油\s*少\s*妇/,
      /爱\s*吃\s*大\s*香\s*蕉/,
      /大\s*香\s*蕉/,
      /爱\s*几\s*把/,
      /(几|鸡|雞)\s*(把|巴)/,
      /同\s*城\s*上\s*门/,
      /上\s*门\s*(服\s*务|约)?/,
      /无\s*偿\s*约/,
      /同\s*城\s*(无\s*偿\s*)?约/,
      /体\s*制\s*内\s*老\s*师/,
      /玩\s*的\s*就\s*是\s*(反|返)\s*差/,
      /探\s*路\s*花\s*样\s*多/,
      /主\s*页\s*(能|可|可以)?\s*打/,
      /顶\s*不\s*住/,
      /(骚|淫|浪)\s*(货|妹|姐|妇|逼)/,
      /sao\s*(货|妹|姐|b|逼)/i
    ],
    cnAdultDisplay: [
      /找\s*(男\s*友|老\s*公)/,
      /找\s*主\s*人/,
      /寂\s*寞\s*(找|等|约)/,
      /单\s*身\s*找/,
      /同\s*城\s*上\s*门/,
      /上\s*门/,
      /无\s*偿\s*约/,
      /同\s*城\s*(无\s*偿\s*)?约/,
      /同\s*城.{0,6}(约|上\s*门)/,
      /奶\s*油\s*少\s*妇/,
      /大\s*香\s*蕉/,
      /爱\s*几\s*把/,
      /少\s*妇/,
      /(嫩\s*妹|学\s*妹|空\s*姐|护\s*士).{0,6}(找|约|聊|等)/,
      // 2026-07 新增：搭讪引流变种
      /蹲\s*一\s*个\s*搭\s*子/,
      /(蹲|等|找)\s*搭\s*子/,
      /(找|等)\s*线\s*下/,
      /dd\s*个?\s*线\s*下/,
      /d\s*我\s*私/,
      /喜\s*欢\s*私/,
      /可\s*y\b/,
      /可\s*约/,
      /离\s*得\s*近/,
      /男\s*大.{0,4}来/,
      /学\s*妹.{0,4}(无\s*偿|免费|约)/,
      /单\s*身\s*(免费|无\s*偿)/,
      /约\s*(操|范|p|泡)/,
      /找\s*哥\s*哥\s*约/,
      /找\s*约\s*/,
      /找\s*固\s*炮/,
      /((饥|渴)\s*渴?)|饥\s*渴/,
      /准\s*时\s*涩/,
      /涩\s*播/,
      /色\s*播/,
      /色\s*流/,
      /色\s*图/,
      /性\s*奴/,
      /公\s*狗/,
      /母\s*狗/,
      /母\s*犬/,
      /主\s*人\s*(来|招)/,
      /当\s*(我|你)\s*主\s*人/,
      /妹\s*子\s*约/,
      /妹\s*约/,
      /友\s*友\s*约/,
      /(约|找)\s*友\s*友/,
      /骚\s*妹/,
      /骚\s*姐/,
      /约\s*一\s*下/,
      /不\s*要\s*钱\s*约/,
      /免\s*费\s*约/,
      /夜\s*聊/,
      /深\s*夜\s*聊/,
      /陪\s*(聊|睡|玩)/,
      /过\s*夜/,
      /点\s*(我|她|她|主)\s*((私|主).{0,2}(聊|信))/,
      /\d+\s*(点|点\s*钟)\s*[准上]?(\s*直播|\s*开\s*播|\s*涩)/,
      /(今|明)\s*晚\s*(\d+\s*点?|准时)/,
      /戒\s*撸/,
      /打\s*飞\s*机/,
      /打\s*灰\s*机/,
      /青\s*楼/,
      /卖\s*春/,
      /找\s*乐\s*子/,
      // 2026-07 补充：隐性引流词
      /(男|女|大|小)\s*仆/,
      /女\s*仆\s*(需|招|找|等)/,
      /御\s*姐/,
      /主\s*奴/,
      /主\s*子/,
      /主\s*(女|男)/,
      /chu\s*(男|女|n|nv)/i,
      /处\s*(男|女)/,
      /(处|chu)\s*(男|n)/i,
      /(饥|渴)\s*渴/,
      /饥\s*渴\s*(孕|妇)?/,
      /(孕|孕\s*妇)/,
      /线\s*下\s*(无\s*偿|约|来|找)/,
      /线\s*下.{0,4}/,
      /找\s*线\s*下/,
      /同城\s*\S{0,4}男\s*大/,
      /男\s*大\S{0,4}无\s*偿/,
      /(大|小)\s*姐.{0,4}(找|约|来)/,
      /(找|约|等)\s*男\s*大/,
      /(后\s*入|后入)/,
      /爱\s*后\s*入/,
      /双\s*飞/,
      /群\s*啪/,
      /约\s*炮\s*群/,
      /(裸|透|骚|淫|浪)\s*(聊|拍|照|视频)/,
      /找\s*狗/,
      /主\s*仆\s*关\s*系/,
      /B\s*D\s*S\s*M/i,
      /(舔|吃)\s*(b|逼|屌|鸡巴)/,
      /配\s*对\s*(约|女|男)/
    ],
    cnContact: [
      /加\s*(微|v|vx|Ｖ|V)/i,
      /加\s*(tg|电\s*报|纸\s*飞\s*机)/i,
      /私\s*(信|聊|我)/,
      /d\s*我/i,
      /dm\s*me/i,
      /telegram/i
    ],
    cnBioLure: [
      /点[击我]?\s*主\s*页/,
      /看\s*我?\s*主\s*页/,
      /(看|进|去)\s*主\s*页/,
      /主\s*页\s*(有|看|拿|取)/,
      /资\s*源\s*(看|拿|在|有)/
    ],
    cnMentionAdultLure: [
      /第\s*一\s*(骚|sao)/i,
      /比\s*她\s*好\s*看.{0,24}没\s*她\s*(骚|sao)/i,
      /比\s*她\s*(骚|sao).{0,24}没\s*她\s*好\s*看/i,
      /没\s*人\s*比\s*她\s*(sao|骚)/i,
      /线\s*下.{0,12}(sao|骚)\s*货/i,
      /sao\s*货.{0,16}没\s*人\s*比\s*她\s*(sao|骚)/i,
      /30\+\s*的?.{0,8}体\s*制\s*内\s*老\s*师.{0,24}(反\s*差|返\s*差|花\s*样\s*多|探\s*路|玩\s*的\s*就\s*是)?/,
      /体\s*制\s*内\s*老\s*师/,
      /玩\s*的\s*就\s*是\s*(反|返)\s*差/,
      /太\s*[涩瑟色]\s*了.{0,12}顶\s*不\s*住/,
      /主\s*页.{0,12}(能|可|可以).{0,6}打(?:\s*(飞\s*机|飛\s*機|✈))?/,
      /刷\s*了.{0,16}主\s*页.{0,12}能\s*打/
    ],
    enAdultDirect: [
      /\bonly\s*fans\b/i,
      /\bonlyfans\b/i,
      /\bfansly\b/i,
      /\bchaturbate\b/i,
      /\b18\+\s*(content|only|pics?|videos?)\b/i,
      /\bnsfw\s*(content|pics?|videos?)\b/i,
      /\bspicy\s*(content|pics?|videos?)\b/i,
      /\bnudes?\b/i
    ],
    enBioLure: [
      /\bcheck\s+(my|the)\s+bio\b/i,
      /\blink\s+(in|on)\s+(my\s+)?bio\b/i,
      /\bbio\s+link\b/i,
      /\btap\s+(my\s+)?profile\b/i,
      /\bvisit\s+(my\s+)?profile\b/i
    ],
    enContact: [
      /\bdm\s+(me\s+)?(for|baby|daddy|pics?|content)\b/i,
      /\bslide\s+into\s+(my\s+)?dms\b/i,
      /\bopen\s+(my\s+)?dms\b/i
    ],
    adultPlatformUrl: /\b(onlyfans\.com|fansly\.com|chaturbate\.com|manyvids\.com|fansone\.co)\b/i,
    xAdultWarning: /(adult\s+content|sensitive\s+content|content\s+warning|成人内容|敏感内容|センシティブな内容)/i,
    shortLink: /\b(t\.co|bit\.ly|tinyurl\.com|cutt\.ly|linktr\.ee|beacons\.ai|bio\.site|taplink\.cc)\b/i,
    mentionedHandle: /(^|[^a-zA-Z0-9_])@[a-zA-Z0-9_]{1,20}\b/,
    saoToken: /(骚|sao)/gi,
    nsfwEmoji: /[🔞🍑🍆💦👅👙🩲💋]/gu,
    anyEmoji: /\p{Extended_Pictographic}/gu,
    wordLike: /[a-zA-Z]{3,}|[一-鿿]{2,}/
  });

  function normalizeHandle(handle) {
    const raw = String(handle || '').trim().replace(/^@+/, '').toLowerCase();
    return raw ? '@' + raw : '';
  }

  function normalizeSpace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function listHasHandle(list, handle) {
    const normalized = normalizeHandle(handle);
    if (!normalized || !Array.isArray(list)) return false;
    return list.some(item => normalizeHandle(item) === normalized);
  }

  function countMatches(text, regex) {
    return (String(text || '').match(regex) || []).length;
  }

  function hasAny(regexes, text) {
    return regexes.some(regex => regex.test(text));
  }

  function findRemoteKeyword(keywords, text) {
    const haystack = normalizeSpace(text).toLocaleLowerCase();
    if (!haystack || !Array.isArray(keywords)) return '';
    return keywords.find(keyword => {
      const needle = normalizeSpace(keyword).toLocaleLowerCase();
      return needle && needle.length <= 80 && haystack.includes(needle);
    }) || '';
  }

  function isLowInformationReplyText(text) {
    const normalized = normalizeSpace(text);
    const compact = normalized.replace(/\s+/g, '');
    if (!compact || [...compact].length > 8) return false;
    if (!/^[a-z0-9~`!@#$%^&*()_+\-=[\]{}\\|;:'",.<>/?]+$/i.test(compact)) return false;

    const tokens = normalized.split(/\s+/).filter(Boolean);
    return tokens.length >= 2 || [...compact].length <= 3;
  }

  function evaluateTweet(tweet, settings = {}) {
    const config = { ...FALLBACK_SETTINGS, ...(settings || {}) };
    const handle = normalizeHandle(tweet && tweet.handle);

    if (listHasHandle(config.whitelist, handle) || listHasHandle(config.followedHandles, handle)) {
      return buildResult({
        handle,
        score: 0,
        category: 'protected',
        reasons: ['protected handle'],
        protected: true,
        settings: config
      });
    }

    const displayName = normalizeSpace(tweet && tweet.displayName);
    const rawTweetText = String((tweet && tweet.tweetText) || '');
    const tweetText = normalizeSpace(rawTweetText);
    const articleText = normalizeSpace(tweet && tweet.articleText);
    const combined = `${displayName} ${tweetText} ${articleText}`;
    const urls = Array.isArray(tweet && tweet.externalLinks) ? tweet.externalLinks.join(' ') : '';
    const isReply = !!(tweet && tweet.isReply);
    const isLowInformationReply = isReply && isLowInformationReplyText(tweetText);

    let score = 0;
    const reasons = [];
    const categoryScores = new Map();

    function add(points, reason, category) {
      score += points;
      reasons.push(reason);
      if (category) categoryScores.set(category, (categoryScores.get(category) || 0) + points);
    }

    const cnDirect = hasAny(RX.cnAdultDirect, combined);
    const cnDirectInDisplay = hasAny(RX.cnAdultDirect, displayName);
    const cnDisplay = hasAny(RX.cnAdultDisplay, displayName);
    const cnContact = hasAny(RX.cnContact, combined);
    const cnBioLure = hasAny(RX.cnBioLure, combined);
    const enDirectInDisplay = hasAny(RX.enAdultDirect, displayName) || RX.adultPlatformUrl.test(displayName);
    const enDirect = hasAny(RX.enAdultDirect, combined) || RX.adultPlatformUrl.test(urls);
    const enBioLure = hasAny(RX.enBioLure, combined);
    const enContact = hasAny(RX.enContact, combined);
    const hasShortLink = RX.shortLink.test(urls) || RX.shortLink.test(tweetText);
    const hasAdultWarning = RX.xAdultWarning.test(articleText);
    const nsfwEmojiInDisplay = countMatches(displayName, RX.nsfwEmoji) >= 1;
    const hasMentionedHandle = RX.mentionedHandle.test(tweetText);
    const saoDescriptorCount = countMatches(tweetText, RX.saoToken);
    const cnMentionAdultLure = hasAny(RX.cnMentionAdultLure, tweetText);
    const remoteBlockedAccount = listHasHandle(config.blockedAccounts, handle);
    const remoteBlockedKeyword = findRemoteKeyword(config.remoteKeywords, combined);

    const strongDisplayName = hasAny([
      /同\s*城\s*上\s*门/,
      /无\s*偿\s*约/,
      /找\s*主\s*人/,
      /奶\s*油\s*少\s*妇/,
      /大\s*香\s*蕉/,
      /爱\s*几\s*把/,
      /爱\s*吃\s*大\s*香\s*蕉/,
      /同\s*城\s*(无\s*偿\s*)?约/
    ], displayName);
    const emojiOnlyBody = !RX.wordLike.test(tweetText) && (countMatches(tweetText, RX.anyEmoji) >= 1 || [...tweetText.replace(/\s+/g, '')].length <= 2);

    if (hasAdultWarning) add(100, 'X adult/sensitive content warning', 'adult_solicitation');
    if (remoteBlockedAccount) add(100, 'remote blocked account', 'remote_blocklist');
    if (remoteBlockedKeyword) add(75, `remote blocked keyword: ${remoteBlockedKeyword}`, 'remote_blocklist');
    if (cnDirect) add(50, 'explicit Chinese adult term', 'cn_adult_solicitation');
    if (cnDirectInDisplay) add(40, 'explicit adult term in display name', 'cn_adult_solicitation');
    if (cnDisplay) add(40, 'Chinese adult-solicitation display name', 'cn_adult_solicitation');
    if (strongDisplayName) add(45, 'strong adult solicitation display name', 'cn_adult_solicitation');
    if (cnContact && (cnDirect || cnDisplay || cnBioLure)) add(25, 'contact lure paired with adult signal', 'cn_adult_solicitation');
    if (cnBioLure && (cnDirect || cnDisplay || cnContact)) add(25, 'profile/resource lure paired with adult signal', 'cn_adult_solicitation');
    if ((cnDisplay || cnDirectInDisplay || strongDisplayName) && isLowInformationReply) add(40, 'adult-lure display name paired with low-information reply', 'cn_adult_solicitation');
    if ((cnDisplay || strongDisplayName) && nsfwEmojiInDisplay && isReply) add(35, 'adult-lure display name paired with adult emoji', 'cn_adult_solicitation');
    if ((cnDisplay || strongDisplayName) && emojiOnlyBody) add(50, 'emoji-only body with adult display name', 'cn_adult_solicitation');
    if (isLowInformationReply && (cnDisplay || cnDirectInDisplay || strongDisplayName || nsfwEmojiInDisplay)) {
      add(25, 'split-character spam reply', 'cn_adult_solicitation');
    }
    if (hasMentionedHandle && cnMentionAdultLure) add(70, 'adult descriptor mention lure', 'cn_adult_solicitation');
    if (isReply && cnMentionAdultLure) add(70, 'adult descriptor lure reply', 'cn_adult_solicitation');
    if (hasMentionedHandle && saoDescriptorCount >= 2) add(65, 'repeated adult descriptor mention lure', 'cn_adult_solicitation');

    if (enDirect) add(50, 'explicit English adult platform/content term', 'adult_solicitation');
    if (enDirectInDisplay) add(25, 'adult platform/content term in display name', 'adult_solicitation');
    if (enBioLure && enDirect) add(30, 'bio-link lure paired with adult signal', 'adult_solicitation');
    if (enContact && enDirect) add(25, 'DM lure paired with adult signal', 'adult_solicitation');

    if (hasShortLink && (cnDirect || cnDisplay || cnContact || enDirect || enBioLure)) {
      add(15, 'short/external link paired with adult lure', cnDirect || cnDisplay || cnContact ? 'cn_adult_solicitation' : 'adult_solicitation');
    }

    if (isReply && (cnContact || enContact || cnBioLure || enBioLure)) {
      add(10, 'reply-context solicitation', cnContact || cnBioLure ? 'cn_adult_solicitation' : 'adult_solicitation');
    }

    const nsfwEmojiCount = countMatches(combined, RX.nsfwEmoji);
    const emojiCount = countMatches(tweetText, RX.anyEmoji);
    const textLength = [...tweetText].length || 1;
    const nearEmojiTemplate = emojiCount >= 4 && !RX.wordLike.test(tweetText);

    if (nsfwEmojiCount >= 2) add(25, 'multiple NSFW emoji', 'adult_solicitation');
    if (nsfwEmojiCount >= 1 && (cnBioLure || enBioLure || cnContact || enContact || hasShortLink)) {
      add(60, 'adult marker paired with profile/contact lure', cnBioLure || cnContact ? 'cn_adult_solicitation' : 'adult_solicitation');
    }
    if (nearEmojiTemplate && isReply) add(20, 'emoji-template reply', 'adult_solicitation');
    if (emojiCount >= 6 && emojiCount / textLength > 0.4) add(10, 'high emoji density', 'adult_solicitation');

    const category = pickCategory(categoryScores);
    return buildResult({ handle, score, category, reasons, protected: false, settings: config });
  }

  function pickCategory(categoryScores) {
    let winner = 'normal';
    let max = 0;
    for (const [category, score] of categoryScores.entries()) {
      if (score > max) {
        max = score;
        winner = category;
      }
    }
    return winner;
  }

  function buildResult({ handle, score, category, reasons, protected: isProtected, settings }) {
    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    const hideThreshold = Number(settings.hideThreshold || FALLBACK_SETTINGS.hideThreshold);
    const autoBlockThreshold = Number(settings.autoBlockThreshold || FALLBACK_SETTINGS.autoBlockThreshold);
    const shouldHide = !isProtected && clamped >= hideThreshold;
    const shouldAutoBlock = !isProtected && clamped >= autoBlockThreshold;
    return {
      handle,
      score: clamped,
      confidence: clamped,
      category,
      reasons,
      protected: !!isProtected,
      shouldHide,
      shouldAutoBlock
    };
  }

  globalThis.XybDetector = {
    evaluateTweet,
    normalizeHandle
  };
})();
