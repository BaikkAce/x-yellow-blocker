# GitHub 远程识别数据

v0.11.0 只同步屏蔽词和引流语言样本，不同步账号名单。

## `blocklists/keywords.txt`

- 每行一个纯文本关键词或短语。
- 空行和以 `#` 开头的行会被忽略。
- 最多 500 个词，每个最多 60 个字符。
- 含 `< > { } \` 的行会被拒绝。
- 不支持正则表达式、HTML、JavaScript 或其他可执行内容。

示例：

```text
# 2026-08 新出现的引流话术
主页领取
今晚开播
```

## `blocklists/lure-samples.json`

用于描述新出现的引流语言和昵称套路，不包含账号 ID。格式：

```json
{
  "version": 2,
  "updatedAt": "2026-08-01T00:00:00Z",
  "samples": [
    {
      "id": "2026-08-homepage-lure-1",
      "displayName": "同城搭子",
      "text": "哥哥看看主页，今晚可以见面",
      "category": "cn_adult_solicitation",
      "note": "主页引流新变体"
    }
  ]
}
```

规则：

- `id`：可选，3–64 位小写字母、数字、`_`、`-`。
- `displayName`：可选，最多 80 字。
- `text`：必填，6–320 字。
- `category`：仅允许 `cn_adult_solicitation`、`adult_solicitation`、`remote_sample`。
- `enabled: false` 可临时停用某条样本。
- 最多读取 2000 条，重复文本会去重。
- 控制字符、双向文本控制符和 `< > { } \` 会被清洗。

样本只在帖子详情页评论区参与相似度判断。单纯相似不会绕过本地上下文和阈值。

## 明确不再使用

下列旧文件可保留作历史记录，但 v0.11.0 不会请求或读取：

- `accounts.txt`
- `protected-accounts.txt`
- `profiles.json`

## 同步时机

- 扩展安装时；
- 浏览器启动时；
- 每 60 分钟；
- 用户点击“更新识别数据”时。

只有 `keywords.txt` 和 `lure-samples.json` 同时成功下载并通过解析，才会替换本地缓存。

## Chrome Web Store 安全边界

远端文件只能包含数据。不得通过 GitHub 下发 JavaScript、动态正则、HTML、WebAssembly、CSS 选择器、阈值或检测代码。需要改变算法或页面场景判断时，必须发布新的扩展版本。
