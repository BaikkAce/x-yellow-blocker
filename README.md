# X Yellow Blocker

本地 Chrome/Chromium MV3 扩展，用来在 X 上识别疑似黄色评论区回复/推文引流账号，折叠命中的内容，并自动通过 X 页面菜单把作者加入屏蔽。

## 功能

- 本地规则识别中文/英文色情引流、主页/私信诱导、成人平台链接、短链和 NSFW emoji 模板。
- 评论区回复同样会扫描；昵称里的约炮、裸聊、私房资源、OnlyFans/Fansly、少妇、同城无偿约、找主人等明确引流词会触发屏蔽。
- 识别用零散竖排字母/符号规避正文检测的评论区批量号，例如昵称涉黄、正文只有 `q/s/:` 这类碎字符。
- 识别评论正文里的软色情导流话术，例如重复 `骚/sao`、`第一骚`、`线下sao货`、`30+体制内老师反差/花样多`、`太涩顶不住`、`主页能打✈` 并 @ 引流账号。
- 自动屏蔽默认开启；命中识别阈值后会排队调用 X 自带的 Block 菜单。
- 白名单和关注保护优先，命中保护名单的账号不会被隐藏或自动屏蔽；关注保护可在 popup 里粘贴 handle。
- 不接 AI API。共享贡献关闭时，所有检测和屏蔽记录只保存在本地。
- 不调用 X 私有 GraphQL 接口；屏蔽动作走页面里的可见 Block 菜单。
- 弹窗内置“同步到当前 X 账号”：逐条调用 X 原生“已隐藏的字词”页面保存 40 个高命中词；已存在或失败的词会自动跳过并继续。
- 启动时从本仓库读取 `blocklists/keywords.txt` 和 `blocklists/accounts.txt`，成功后缓存到本地；GitHub 暂时不可用时继续使用上次缓存和内置规则。
- 可选择贡献共享名单：成功屏蔽后仅把规范化的 `@handle` 加入本地待提交队列，不收集推文正文、显示名或浏览记录。

## 安装

1. 打开 `chrome://extensions`。
2. 开启 Developer mode。
3. 点 Load unpacked。
4. 选择解压后的 `x-yellow-blocker` 目录。
5. 打开 `https://x.com`。

如果已经安装过旧版：在 `chrome://extensions` 找到 `X Yellow Blocker`，点卡片上的刷新按钮，然后刷新所有 X 标签页。

## 自动同步 X 屏蔽词

1. 登录要配置的 X 账号。
2. 点击浏览器工具栏里的 `X Yellow Blocker`。
3. 点击“同步到当前 X 账号”。
4. 保持新打开的 X 设置标签页开启，直到右下角显示同步完成。

同步状态保存在浏览器本地；重新打开插件弹窗可以查看新增和跳过数量，也可以中途停止。切换到另一个 X 账号后再次点击即可配置该账号。不同 Chrome 用户资料需要分别安装扩展。

## 远程屏蔽名单

- 屏蔽词：[`blocklists/keywords.txt`](blocklists/keywords.txt)
- 屏蔽账号：[`blocklists/accounts.txt`](blocklists/accounts.txt)

插件后台从公开的 GitHub Raw 地址更新这两份列表。每次必须同时成功下载两份文件才会替换缓存，避免只更新一半。弹窗中的“更新名单”可手动刷新。

编辑规则：每行一个项目；空行和以 `#` 开头的注释会被忽略。账号可写成 `@handle`、裸用户名或完整的 X/Twitter 个人主页 URL。

## 共享贡献

共享贡献默认关闭。开启后，插件会在 X 确认屏蔽成功时把账号加入本地队列。点击“提交到 GitHub”会把账号复制到剪贴板并打开公开 Issue 表单，用户粘贴、检查名单并确认提交。账号不会写入 URL 查询参数。

仓库 Action 按不同 GitHub 提交者聚合报告。同一个 X 账号至少需要 3 位不同提交者报告，并且不在 [`blocklists/protected-accounts.txt`](blocklists/protected-accounts.txt) 中，才会自动追加到公共账号名单。插件内不包含 GitHub 写入令牌。

注意：GitHub Issue 及其提交者身份是公开的。贡献内容只应包含 X handle，不要添加推文正文或个人信息。

## 开发命令

```bash
npm test
npm run check
npm run package
```

隐私政策：[`PRIVACY.md`](PRIVACY.md)。Chrome Web Store 文案和隐私披露草稿位于 [`store-assets/`](store-assets/)。

## GitHub 调研结论

- `viewer12/tweetguard`: 最贴近目标，MIT，MV3，本地规则和 X DOM 扫描思路值得参考，但它主要隐藏/折叠，不负责加入 X 屏蔽。
- `BlueLiteBlocker/BlueLiteBlocker`: 可参考设置存储和跨浏览器扩展结构，目标是过滤 Blue 用户，不贴合黄色引流识别。
- `insin/control-panel-for-twitter`: 很成熟，但功能面太大，直接改造会带入大量无关复杂度。

本项目采用更小的本地实现，没有复制这些项目的代码。

## 限制

X 的 DOM selector 和菜单文案会变化；如果自动屏蔽失败，折叠条会显示失败原因，例如“找不到屏蔽菜单项”或“找不到确认屏蔽按钮”。建议先用白名单/关注保护填入不想误伤的账号。
