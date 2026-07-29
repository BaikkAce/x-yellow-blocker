# X Yellow Blocker

Chrome/Chromium MV3 扩展，用来识别 X 帖子详情页评论区中的成人引流垃圾回复，折叠命中的内容，并通过 X 页面可见菜单屏蔽作者。

## v0.11.0 数据策略

- 不下载共享账号名单，不根据云端账号 ID 屏蔽任何人。
- 不上传账号、头像、评论、浏览记录或其他用户数据。
- 每小时从 GitHub 读取 `blocklists/keywords.txt` 和 `blocklists/lure-samples.json`。
- GitHub 文件只能提供普通文本数据；检测算法、评论区范围、相似度和阈值固定在扩展代码中。
- GitHub 不可用时继续使用内置规则和最近一次成功缓存。

## 功能

- 只处理打开帖子后的评论区回复；主帖、首页、推荐流、搜索结果和用户主页不参与检测。
- 本地识别中英文成人引流、主页/私信诱导、成人平台链接、短链和 NSFW emoji 模板。
- 自动屏蔽默认开启，使用 X 自己的可见 Block 菜单。
- 本地白名单优先；本机屏蔽成功后保存账号显示名和头像，供插件弹窗展示。
- “同步到当前 X 账号”会先读取已有屏蔽词，只添加缺少的内置词和 GitHub 新词。
- 不调用 X 私有 GraphQL 接口，不使用 AI API。

## 安装

1. 解压安装包。
2. 打开 `chrome://extensions`。
3. 开启开发者模式。
4. 点击“加载已解压的扩展程序”，选择解压目录。
5. 刷新所有 X 标签页。

## 自动同步 X 屏蔽词

1. 登录要配置的 X 账号。
2. 打开扩展弹窗。
3. 点击“同步到当前 X 账号”。
4. 保持 X 设置标签页开启，等待右下角显示完成。

插件先扫描当前账号已有屏蔽词，再从内置列表和 GitHub 列表中筛出缺少的词，因此不会故意重复提交已经存在的词。

## 维护远程识别数据

- 屏蔽词：[`blocklists/keywords.txt`](blocklists/keywords.txt)
- 引流语言样本：[`blocklists/lure-samples.json`](blocklists/lure-samples.json)
- 格式及安全要求：[`REMOTE-DATA.md`](REMOTE-DATA.md)
- 上传操作说明：[`REMOTE-RULES-MAINTENANCE.md`](REMOTE-RULES-MAINTENANCE.md)

修改这两份数据后，已安装用户会在浏览器启动、扩展安装、每小时定时任务或手动点击“更新识别数据”时收到更新，不需要重新上传 Chrome Web Store。

## 限制

X 的 DOM 和菜单文案可能变化。若自动屏蔽失败，弹窗运行日志会显示原因。远端语言样本只提供相似度信号，不能修改本地算法，也不能让时间线普通帖子进入检测范围。

隐私政策：[`PRIVACY.md`](PRIVACY.md)
