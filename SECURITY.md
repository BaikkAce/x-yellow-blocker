# X Yellow Blocker 安全说明

## 当前网络边界

v0.12.0 只从固定 GitHub 仓库读取：

- `blocklists/keywords.txt`
- `blocklists/lure-samples.json`

扩展不连接社区上报 Worker，不上传账号或评论，也不包含 GitHub Token。

## 远端数据防护

- 每个文件最大读取 512 KB。
- 关键词最多 500 个、每个最多 60 字，并拒绝脚本样式字符。
- 语言样本最多 2000 条，正文最多 320 字，昵称最多 80 字，且至少提供一个足够长的字段。
- 只接受固定 JSON 版本、字段和类别。
- 去除控制字符、双向文本控制符及 `< > { } \`。
- 不接收远端正则、HTML、JavaScript、WebAssembly、CSS selector、阈值或算法。
- 数据只在本地固定的评论区范围和相似度门槛内生效。
- 独立长话术和纯昵称模板均要求至少 94% 相似度；纯昵称还必须搭配低信息回复。
- 两份文件必须同时下载成功才替换缓存；失败时保留上次缓存。

## GitHub 维护安全

- `main` 分支应要求 PR、状态检查和至少一次批准。
- 限制可直接推送的账号，关闭 force push 和分支删除。
- GitHub 账号开启双因素认证。
- 维护远端数据不需要任何 Token 放入扩展。
- 若使用自动化维护数据，Token 只授权目标仓库 `Contents`，并放在服务端 Secret 中。

## 扩展权限

```json
"permissions": ["storage", "alarms"],
"host_permissions": [
  "https://raw.githubusercontent.com/BaikkAce/x-yellow-blocker/*",
  "https://pbs.twimg.com/*"
]
```

- `storage`：保存本地设置、缓存、屏蔽记录和日志。
- `alarms`：每小时更新识别数据。
- `raw.githubusercontent.com`：读取固定仓库的两份数据。
- `pbs.twimg.com`：展示本机实际屏蔽时捕获的公开头像。

## 事件处理

如果 GitHub 数据被误改：

1. 立即恢复上一版本文件；
2. 提交修复并检查提交历史；
3. 已安装扩展会在下一次定时或手动更新时恢复；
4. 若文件无法解析，客户端不会替换已有缓存。
