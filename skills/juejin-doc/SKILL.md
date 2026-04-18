---
name: juejin-doc
description: Use when user wants to publish articles to Juejin (掘金), save drafts, update published articles, or list their Juejin articles. Triggers on "发布到掘金", "保存草稿到掘金", "juejin publish", or Juejin article URLs in conversation.
---

# Juejin Doc

将 AI 生成的文章一键发布到掘金（juejin.cn），支持草稿保存、文章更新、列表查看，自动推断分类/标签。

## 触发命令

- `/juejin-doc publish` — 提取当前对话内容，自动推断分类/标签/封面，确认后发布
- `/juejin-doc publish <描述>` — 只发布对话中匹配描述的部分
- `/juejin-doc draft` — 同 publish，但只保存为草稿（不发布）
- `/juejin-doc update` — 更新最近发布的文章
- `/juejin-doc update <url>` — 更新指定文章（非 skill 发布的需确认）
- `/juejin-doc list` — 列出已发布文章
- `/juejin-doc auth <token>` — 设置掘金 token
- `/juejin-doc help` — 显示帮助信息

隐式触发：
- 用户说"发布到掘金"、"保存草稿到掘金"时，等同于 `/juejin-doc publish` / `/juejin-doc draft`

## Workflow

### Route（内部路由，不对用户宣告）

根据参数静默判断意图并直接执行：
- `/juejin-doc publish` / "发布到掘金" → publish 流程
- `draft` / "保存草稿" → draft 流程
- `update` → update 流程
- `list` → list 流程
- `auth <token>` → 调用 juejin_set_token
- 无参数 / `help` → 显示帮助表格

---

### 0) 首次配置检查

如有任何 MCP 工具调用失败，按以下顺序检查，遇到问题立即停止并引导用户：

1. **MCP Server 已构建？**
   ```bash
   ls ~/.claude/skills/juejin-doc/dist/index.js
   ```
   未构建则运行安装脚本：
   ```bash
   node ~/path/to/kaolaqi-skills/install-skills.js juejin-doc
   ```
   或手动：
   ```bash
   cd ~/.claude/skills/juejin-doc && npm install && npm run build
   ```

2. **MCP Server 已注册？**
   ```bash
   claude mcp list
   ```
   若无 `juejin-doc`，提示用户执行（需替换真实 token）：
   ```bash
   claude mcp add \
     -e JUEJIN_TOKEN=<your_sessionid> \
     -s user juejin-doc -- node ~/.claude/skills/juejin-doc/dist/index.js
   ```
   注册后必须重启 Claude Code。

3. **Token 有效？**
   调用 `juejin_auth` 验证。失败则提示用户重新配置 token。

---

### 1) 提取内容（publish / draft 命令）

- 若无描述参数：从整个对话提取核心内容
- 若有描述参数：只提取匹配描述的部分
- 生成：
  - **标题**（简洁，中文，不超过 40 字）
  - **正文**（完整 Markdown，保留代码块、标题层级）
  - **摘要**（前 100 字，去除 Markdown 符号）

### 2) 推断分类与标签

- 调用 `juejin_get_categories` 获取全量分类/标签列表
- AI 根据文章内容选择：
  - 最匹配的 **1 个分类**（category_id）
  - 最匹配的 **1-3 个标签**（tag_ids）
- 优先选择具体标签（如 `Vue.js`）而非泛化标签（如 `前端`）

### 3) 用户确认

展示预览，格式如下：

```
📝 标题：<title>
🏷️ 分类：<category_name>
🔖 标签：<tag1>, <tag2>, <tag3>
📄 摘要：<前 200 字>
```

等待用户确认。用户可要求修改标题、分类、标签，修改后重新展示，直到确认。

### 4) 发布或保存

- **publish**：调用 `juejin_publish`，成功后返回文章链接
- **draft**：调用 `juejin_save_draft`，成功后提示草稿已保存

---

### 1b) 定位文章（update 命令）

- `/juejin-doc update`（无参数）：调用 `juejin_list_articles` 找最近发布的文章
- `/juejin-doc update <url>`：从 URL 提取 article_id（URL 格式：`https://juejin.cn/post/<article_id>`）
- 若文章不在本地记录中（非 skill 发布），告知用户："这篇文章不是通过 skill 发布的，确认要更新吗？"确认后使用 `force=true`

### 2b) 更新内容

展示当前文章信息，询问用户要修改哪些字段（标题、正文、分类、标签）。

收集修改内容后调用 `juejin_update_article`，返回更新后的文章链接。

---

### List 流程

调用 `juejin_list_articles`，以表格形式展示：

| 序号 | 标题 | 阅读 | 点赞 | 发布时间 | 链接 |
|---|---|---|---|---|---|
| 1 | ... | ... | ... | ... | ... |

---

### Auth 流程

`/juejin-doc auth <token>`：
1. 调用 `juejin_set_token` 保存 token
2. 调用 `juejin_auth` 验证
3. 成功则显示账号信息；失败则提示 token 无效

**Token 获取方式**：
1. 打开 [juejin.cn](https://juejin.cn) 并登录
2. F12 → Application → Cookies → `juejin.cn`
3. 复制 `sessionid` 的值

---

## 帮助信息（help 命令）

| 命令 | 说明 |
|---|---|
| `/juejin-doc publish` | 提取对话内容，自动推断分类/标签/封面后发布 |
| `/juejin-doc publish <描述>` | 只发布匹配描述的部分内容 |
| `/juejin-doc draft` | 同 publish，只保存草稿不发布 |
| `/juejin-doc update` | 更新最近发布的文章 |
| `/juejin-doc update <url>` | 更新指定文章 |
| `/juejin-doc list` | 列出已发布文章 |
| `/juejin-doc auth <token>` | 设置掘金 sessionid token |
| `/juejin-doc help` | 显示本帮助信息 |

MCP 工具：`juejin_auth`、`juejin_set_token`、`juejin_get_categories`、`juejin_save_draft`、`juejin_publish`、`juejin_update_article`、`juejin_list_articles`
