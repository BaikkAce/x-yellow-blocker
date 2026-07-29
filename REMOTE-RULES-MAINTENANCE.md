# 远程识别数据维护

## 添加新屏蔽词

编辑 `blocklists/keywords.txt`，每行一个词。优先添加能明确代表引流行为的短语，避免“你好”“主页”等正常内容中大量出现的单词。

## 添加新语言套路

编辑 `blocklists/lure-samples.json`：

1. 给样本填写稳定的 `id`。
2. `displayName` 只保留有辨识度的昵称套路，可留空。
3. `text` 使用典型评论模板，不写账号 ID、链接、手机号或其他个人信息。
4. 选择允许的 `category`。
5. 更新顶层 `updatedAt`。

## 发布前检查

```powershell
node tests/test-remote-samples.js
```

确认：

- JSON 能解析；
- 正常时间线帖子不会因样本被处理；
- 新样本能命中预期的评论区回复；
- 没有账号 ID、Token、HTML 或脚本内容；
- 新关键词不会误伤常见正常表达。

通过 PR 合并到 `main` 后，GitHub Raw 会更新。已安装用户会在一小时内或手动点击“更新识别数据”后收到数据。
