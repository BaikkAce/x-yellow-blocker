# X Yellow Blocker — Chrome Web Store 完整上架素材

> 版本：**0.6.0**（对应 `x-yellow-blocker-v0.6.0.zip`）
> 用法：照着下面每一节，把文字粘进商店后台对应字段；图片按「素材清单」单独上传。
> 重要：Chrome Web Store **默认语言必须是英文（en）**，中文作为附加语言。下面两版都给了，英文先填。

---

## 0. 素材清单（要上传的图片/文件）

| 用途 | 文件 | 尺寸 | 说明 |
|------|------|------|------|
| 扩展图标（必填） | `assets/icons/icon128.png` | 128×128 | 商店列表 + 详情页主图标 |
| 小图标 | `assets/icons/icon16.png` `icon32.png` `icon48.png` | 16/32/48 | 已在 zip 内，自动读取 |
| 截图 1（必填，至少 1 张） | `store-assets/screenshot-1280x800.png` | 1280×800 | **当前为示意稿**，建议换成真实弹窗/拦截效果截图 |
| 推广小图（可选） | `store-assets/promo-440x280.png` | 440×280 | 搜索结果推广位 |
| 推广大图（可选，未提供） | — | 920×680 | 如需可补 |
| 推广横幅（可选，未提供） | — | 1400×560 | 如需可补 |
| 隐私政策（必填，链接） | `PRIVACY.md`（仓库内） | — | 见下方隐私政策 URL |

> 截图/推广图是用 HTML 渲染的**示意稿**（展示界面概念）。审核更稳妥的做法是上传**真实扩展运行截图**。需要我帮你把真实界面渲染成 1280×800 截图可说一声。

---

## 1. 商品详情（Listing details）

### 1A. English（en）— 默认语言，必填

**Name（名称）**
```
X Yellow Blocker
```

**Summary（摘要 / 一句话，≤132 字符）**
```
Detects and collapses adult-solicitation spam on X, blocks high-confidence accounts via X's native menu, and anonymously syncs a shared blocklist.
```

**Detailed description（详细说明）**
```
X Yellow Blocker targets adult-solicitation spam accounts in X posts and reply threads. The extension analyzes display names, post text, links, and X's sensitive-content labels locally; when a high-confidence rule matches, it collapses the content and can block the author through X's on-page block menu.

Key features:
- Scans dynamically loaded tweets and reply-thread comments
- Detects Chinese/English adult-solicitation, contact-info lures, profile lures, and obfuscated spam phrasing
- Blocks accounts through X's visible menu — no private X API calls
- Syncs high-confidence muted words to the signed-in X account
- Updates shared keyword and account blocklists from a public GitHub repository
- Whitelist and follow-protection take priority to reduce false blocks
- Optional anonymous community sharing (off by default, never submits post text)

Optional community sharing: after X confirms a block, the extension reports only the normalized @handle and an anonymous per-install identifier to a Cloudflare Worker. One report immediately publishes the handle to the public shared blocklist. Any user can dispute a shared handle from the popup; three independent disputes remove it (self-healing), after which two independent re-reports are required to re-add it. No post text, images, or identity are transmitted.

The extension is not affiliated with X Corp. and is not an official X product. Changes to X's page structure may temporarily affect automatic blocking.
```

**Category（分类）**：`Productivity`
**Language（语言）**：`English`
**Homepage（主页）**：`https://github.com/BaikkAce/x-yellow-blocker`
**Support（支持）**：`https://github.com/BaikkAce/x-yellow-blocker/issues`
**Privacy policy（隐私政策）**：`https://github.com/BaikkAce/x-yellow-blocker/blob/main/PRIVACY.md`

---

### 1B. 中文（简体）— 附加语言

**名称**
```
X Yellow Blocker
```

**摘要**
```
识别并折叠 X 上的成人引流垃圾内容，通过 X 原生界面屏蔽高置信度账号，匿名自动同步共享屏蔽名单。
```

**详细说明**
```
X Yellow Blocker 专门处理 X 推文与评论区中的成人引流垃圾账号。扩展在浏览器本地分析昵称、正文、链接和 X 敏感内容提示，命中高置信度规则后折叠内容，并可通过 X 页面自带的屏蔽菜单封锁作者。

主要功能：

- 扫描动态加载的推文和评论区回复
- 识别中英文成人引流、联系方式诱导、主页诱导和变形垃圾话术
- 通过 X 可见菜单完成账号屏蔽，不调用 X 私有 API
- 将高命中词同步到当前登录的 X 账号
- 从公开 GitHub 仓库更新共享屏蔽词和账号名单
- 白名单与关注保护优先，减少误屏蔽
- 可选匿名社区贡献，默认关闭且不提交推文正文

可选的社区贡献：开启后，X 确认屏蔽成功时，扩展仅把规范化的 @handle 与匿名本机标识上报到 Cloudflare Worker。一次上报即把该 handle 发布到公共共享名单；任意用户都可在弹窗对共享 handle 发起「误报」，累计 3 人误报自动移出名单（自愈），之后需 2 人重新上报才回榜。全程不上报推文正文、图片或身份。

扩展与 X Corp. 无关联，也不代表 X 官方产品。X 的页面结构变化可能暂时影响自动屏蔽操作。
```

**分类**：`生产力`
**语言**：`中文（简体）`
**主页 / 支持 / 隐私政策**：同 1A 三个 URL。

---

## 2. 隐私实践（Privacy practices）— 后台「隐私实践」步骤逐项填写

> 以下内容与已链接的 `PRIVACY.md` 一致，照填即可。

**Single purpose（单一用途声明）**
```
Identify adult-solicitation spam on X, hide matching content, and help users block the associated accounts through X's visible interface.
```

**Permission justifications（权限说明）**
- `storage`：保存用户设置、本地统计、保护名单、同步进度、远程名单缓存，以及可选的待上报社区 handle。
- `https://x.com/*`、`https://twitter.com/*` 及移动版：读取可见的推文/账号元素，并操作 X 可见的「屏蔽」与「已隐藏字词」界面。
- `https://raw.githubusercontent.com/*`：下载公开的屏蔽词与账号数据文件，不下载可执行代码。
- `https://*.workers.dev/*`：向 Cloudflare Worker 发送匿名社区上报（仅 @handle + 检测分），不上传推文正文、图片或用户身份。

**Data declarations（数据使用披露）**
- Website content：本地处理以检测垃圾内容，不作为推文内容传输或留存。
- User identifiers：X handle 在屏蔽成功后保存在本地。开启社区贡献时，被屏蔽的 handle 会匿名上报到 Cloudflare Worker（无用户身份、无推文内容），并立即发布到公开 GitHub 共享名单（1 人同步）。任意用户可对共享 handle 发起误报；3 位不同用户误报即移出共享名单（自愈），之后需 2 位不同用户重新上报才回榜。
- Web history：不收集。
- Authentication information：不收集。
- Personal communications：不收集、不传输。

**Certifications（认证）**
- 数据不出售或转移用于无关目的。
- 数据不用于广告、信用、借贷或其他被禁止的用途。
- 人工审核仅限于用户提交的公开 GitHub 上报，用于防滥用与名单纠错。
- 所有远程传输均使用 HTTPS。

---

## 3. 提交前自检清单

- [ ] 已注册 Chrome Web Store 开发者账号（一次性 $5）
- [ ] 已上传 `x-yellow-blocker-v0.6.0.zip`（manifest 在压缩包根目录）
- [ ] 英文（默认）+ 中文（简体）两版详情都已填写
- [ ] 已上传 128×128 图标（zip 内已含 16/32/48/128）
- [ ] 至少 1 张 1280×800 截图（当前为示意稿，建议换真实截图）
- [ ] 隐私政策 URL 可公开访问（GitHub 上的 `PRIVACY.md`）
- [ ] 「隐私实践」各项披露与 `PRIVACY.md` 一致
- [ ] 首次建议选 **Unlisted（不公开）** 自测，再提交审核

---

## 4. 字段→文件对照速查

| 后台字段 | 填什么 | 来源 |
|----------|--------|------|
| 名称 Name | `X Yellow Blocker` | manifest / 本节 1 |
| 摘要 Summary | 见 1A / 1B | 本节 1 |
| 详细说明 Description | 见 1A / 1B | 本节 1 |
| 分类 Category | Productivity / 生产力 | 本节 1 |
| 语言 Language | English（默认）+ 中文（简体） | 本节 1 |
| 主页 Homepage | github 仓库地址 | 本节 1 |
| 支持 Support | github issues 地址 | 本节 1 |
| 隐私政策 Privacy policy | github PRIVACY.md 链接 | 本节 1 / PRIVACY.md |
| 图标 Icon | icon128.png | assets/icons/ |
| 截图 Screenshots | screenshot-1280x800.png | store-assets/ |
| 推广小图 Promo small | promo-440x280.png | store-assets/ |
| 隐私实践 Privacy practices | 见本节 2 | privacy-practices.md / PRIVACY.md |
