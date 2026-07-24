# X Yellow Blocker — 安全配置指南

本文档涵盖从扩展端到后端的完整安全加固方案。所有项均为**必须配置**。

---

## 1. GitHub Token 权限控制（最小权限原则）

### 已完成

Worker 使用 Fine-grained PAT，权限如下：

| 权限 | 范围 | 说明 |
|------|------|------|
| Contents | Read and write | 仅此一项，用于读写 `blocklists/accounts.txt` |

**不包含的权限**（确保 Token 即使泄露也无法造成严重破坏）：

- ❌ Administration（不能改仓库设置）
- ❌ Actions / Workflows（不能注入恶意 CI）
- ❌ Secrets（不能读取仓库 Secrets）
- ❌ Members（不能添加协作者）
- ❌ Issues / Pull requests（不能改 Issue/PR）
- ❌ Metadata（仅自动包含，无操作能力）

### 定期轮换

- Token 有效期设为 **90 天**
- 到期前在 GitHub Settings → Personal Access Tokens 中续期
- 如怀疑泄露，立即 revoke 并创建新 Token，然后 `wrangler secret put GITHUB_TOKEN` 更新

---

## 2. GitHub 仓库保护（代码修改权限）

### 配置步骤

进入 GitHub 仓库 → **Settings → Branches → Add branch protection rule**

#### Branch name pattern: `main`

| 规则 | 设置 | 作用 |
|------|------|------|
| Require a pull request before merging | ✅ On | 不能直接 push 到 main |
| Required approvals | 1 | 需要至少 1 人审批 |
| Require status checks to pass | ✅ On | CI 通过才能合并 |
| Require branches to be up to date | ✅ On | 合并前必须 rebase |
| Require signed commits | ✅ On | 只接受 GPG 签名的提交 |
| Restrict who can push | ✅ 只选自己 | 其他人不能 push |
| Allow force pushes | ❌ Off | 禁止 force push |
| Allow deletions | ❌ Off | 禁止删除分支 |

#### 额外设置

- **Settings → General → Features**：
  - 关闭 Issues（如不需要用户反馈）
  - 关闭 Wiki
  - 关闭 Projects
  - 保留 Discussions（可选）

- **Settings → Collaborators**：
  - 确认没有不需要的协作者
  - 如需接受社区贡献，通过 Fork + PR 方式

### 效果

- **只有你**能修改代码（通过签名提交 + PR 审批）
- 其他人只能 Fork 后提 PR，你审批通过才能合并
- Worker 的 GitHub Token 只有 Contents 权限，无法修改仓库设置或分支保护规则
- 即使 Token 泄露，攻击者也只能修改 `blocklists/accounts.txt` 的内容

---

## 3. 恶意内容识别与防护

### 3.1 Worker 端（写入前校验 + 自愈）

```
用户上报 → normalizeHandle() → verification 校验 → 1 个 clientId 即同步
→ commitToGitHub() → isStrictValidHandle() 正则校验
→ 文件大小检查（≤50000 行）
→ 重写整个文件（剥离非 handle 内容）
→ 写入 GitHub

用户异议（误报）→ 1 clientId 提交 dispute → 累计 3 个不同 clientId 异议
→ 从 approved_accounts 删除 → removeHandlesFromGitHub() 移出共享名单
→ 标记 demoted_accounts（再回榜需 2 个不同 clientId 重新确认，防抖动）
→ 清空该 handle 的 reports/disputes（重新计入需全新信号）
```

> **同步策略说明**：为让共享名单快速生效，现采用「1 人上报即同步」——任何人屏蔽的账号都会立即进入共享名单。代价是去掉了多确认门槛，理论上单个被篡改的客户端可能把任意账号注入名单。作为补偿，引入**自愈机制**：任一账号累计 3 个不同用户的异议即自动移出名单，且移出后需 2 人重新确认才会再次加入，防止抖动。用户可在扩展弹窗的「共享屏蔽名单」中对每个账号一键「误报」。

**写入前的严格校验**：

- 每个 handle 必须匹配 `^@[a-z0-9_]{1,20}$`，否则拒绝
- 单次提交最多 100 个 handle
- 文件总行数不超过 50000
- **每次写入都重写整个文件**：只保留通过校验的 @handle 和注释行，自动剥离任何注入的恶意内容（脚本、HTML、长字符串等）

### 3.2 扩展端（读取时过滤）

```
GitHub raw → fetch (≤512KB 限制) → parseAccountList()
→ normalizeBlockedAccount() 正则校验 → 最多 10000 个
```

- 账号列表：每个条目通过 `^[a-z0-9_]{1,20}$` 校验，非 handle 内容被丢弃
- 关键词列表：过滤 `< > { } \` 等 HTML/脚本字符，最多 500 个，每个 ≤60 字符
- 响应体限制 512KB，防止内存耗尽攻击
- 所有解析后的数据只用于字符串匹配，**不执行、不渲染、不 eval**

### 3.3 如果 accounts.txt 被篡改

即使有人通过某种方式（如直接编辑 GitHub 文件）在 `accounts.txt` 中注入了恶意内容：

1. **Worker 下次写入时自动清洗**：`commitToGitHub()` 会重新解析整个文件，只保留合法 @handle，恶意内容被静默删除
2. **扩展端二次过滤**：`parseAccountList()` 用正则逐行校验，恶意内容不会进入内存
3. **不影响检测逻辑**：blocklist 只用于 handle 字符串匹配，不会作为代码执行

---

## 4. Cloudflare Worker 防护

### 4.1 部署安全

- Worker 代码从本地部署，不从 GitHub 自动部署
- 只有拥有 Cloudflare 账号访问权限的人才能部署
- `wrangler deploy` 需要 OAuth 登录或 API Token

### 4.2 运行时防护（6 层）

| 层级 | 机制 | 防御目标 |
|------|------|---------|
| L1 | 请求体校验 (≤16KB, ≤50 handles/report) | 大请求体攻击 |
| L2 | 客户端信誉封禁 (>80% 拒绝率 → ban) | 伪造 verification 攻击 |
| L3 | 每 clientId 限流 (report 50/hour, dispute 20/hour) | 单客户端刷量 / 刷异议 |
| L4 | 全局限流 (1000/min) | DDoS 洪流 |
| L5 | verification 校验 (score≥65) | 垃圾数据注入 |
| L6 | Cloudflare WAF (500/min 边缘拦截) | 大规模 DDoS |

### 4.3 Cloudflare 面板配置

1. **Security → WAF → Rate limiting rules**：
   - `URI Path` equals `/api/report` 或 `/api/dispute`
   - 500 requests / 1 minute
   - Action: Block

2. **Security → DDoS Protection**：保持默认（免费套餐已包含）

3. **Workers → Settings → Usage**：
   - 设置消费上限（防止计费意外）

---

## 5. 扩展端安全

### 5.1 最小权限

`manifest.json` 的权限声明：

```json
"permissions": ["storage"],
"host_permissions": [
  "https://raw.githubusercontent.com/*",
  "https://*.workers.dev/*"
]
```

- `storage`：仅用于本地存储设置和缓存，不访问浏览历史
- `raw.githubusercontent.com`：仅读取 blocklist 文件
- `*.workers.dev`：仅向 Worker 上报 handle

### 5.2 数据安全

- 扩展**只上传** `@handle` 字符串 + detector verdict（score/category/reasons）
- **不上传**：推文原文、图片、用户个人信息、浏览历史、Cookie
- clientId 是 22 位随机字符串，不关联任何身份信息
- 所有网络请求通过 background service worker 代理，content script 不直接发跨域请求

### 5.3 Chrome Web Store 审核

上架前需通过 Chrome Web Store 审核：
- Google 会扫描恶意代码
- 审核用户隐私声明
- 确认权限最小化
- 上架后，用户安装的是 Store 签名的版本，无法被篡改

---

## 6. 安全检查清单

- [ ] GitHub PAT 为 Fine-grained，仅 Contents:Read/Write 权限
- [ ] GitHub PAT 有效期 ≤ 90 天
- [ ] main 分支保护已启用（签名提交 + PR 审批 + 限制推送者）
- [ ] Cloudflare WAF 速率限制已配置（500/min for /api/report）
- [ ] Worker 已部署并验证健康检查 `/api/health`
- [ ] 扩展中 `WORKER_URL` 已填入实际地址
- [ ] Chrome Web Store 隐私声明已准备
- [ ] `protected-accounts.txt` 包含你自己的账号和其他需要保护的账号
