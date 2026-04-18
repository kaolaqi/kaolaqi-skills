# juejin-doc

将 AI 生成的文章一键发布到[掘金（juejin.cn）](https://juejin.cn)，支持草稿保存、已发布文章更新、文章列表查看，并自动推断分类与标签。

## 功能

| 功能 | 说明 |
|------|------|
| 发布文章 | 提取对话内容，自动推断分类/标签，确认后直接发布 |
| 保存草稿 | 同发布流程，但只保存为草稿不公开 |
| 更新文章 | 修改已发布文章的标题、正文、分类、标签 |
| 文章列表 | 查看账号下全部已发布文章（阅读量、点赞数、链接） |
| Token 管理 | 安全存储掘金 sessionid，支持随时更新 |

## 安装

```bash
# 从项目根目录
npm run install-skills -- juejin-doc
```

安装完成后注册 MCP Server：

```bash
claude mcp add \
  -e JUEJIN_TOKEN=<your_sessionid> \
  -s user juejin-doc \
  -- node ~/.claude/skills/juejin-doc/dist/index.js
```

注册后重启 Claude Code 生效。

### 获取掘金 Token

1. 打开 [juejin.cn](https://juejin.cn) 并登录账号
2. 按 `F12` 打开开发者工具 → `Application` → `Cookies` → `juejin.cn`
3. 找到名为 `sessionid` 的 Cookie，复制其值
4. 执行 `/juejin-doc auth <sessionid>` 或在安装时通过 `JUEJIN_TOKEN` 环境变量传入

Token 会持久化存储在本地，无需每次配置。

## 使用方法

### 命令

```
/juejin-doc publish             # 提取整个对话，自动推断分类/标签，确认后发布
/juejin-doc publish <描述>       # 只发布对话中匹配描述的部分
/juejin-doc draft               # 同 publish，但只保存为草稿
/juejin-doc draft <描述>         # 只将匹配部分保存为草稿
/juejin-doc update              # 更新最近发布的文章
/juejin-doc update <url>        # 更新指定文章（URL 格式：https://juejin.cn/post/<id>）
/juejin-doc list                # 列出已发布文章
/juejin-doc auth <token>        # 设置/更新掘金 sessionid
/juejin-doc help                # 显示帮助信息
```

### 隐式触发

- 说"发布到掘金"、"掘金发一下" → 等同于 `/juejin-doc publish`
- 说"保存草稿到掘金"、"先存个草稿" → 等同于 `/juejin-doc draft`

## 工作流

### 发布 / 草稿流程

```
1. 提取内容
   ├─ 无描述参数 → 从整个对话提取核心内容
   └─ 有描述参数 → 只提取匹配部分
   生成：标题（≤40字）、正文（完整 Markdown）、摘要（前100字）

2. 推断分类与标签
   └─ 调用 juejin_get_categories 获取全量分类/标签
   └─ AI 选择最匹配的 1 个分类 + 1~3 个标签（优先具体标签）

3. 用户确认预览
   📝 标题：...
   🏷️ 分类：...
   🔖 标签：...
   📄 摘要：...
   （可要求修改后重新展示，直到确认）

4. 发布 / 保存
   ├─ publish → 调用 juejin_publish，返回文章链接
   └─ draft   → 调用 juejin_save_draft，提示草稿已保存
```

### 更新流程

```
1. 定位文章
   ├─ 无参数 → 从 juejin_list_articles 找最近发布的文章
   └─ 传 URL → 从 URL 中解析 article_id

2. 展示当前文章信息，询问要修改哪些字段

3. 调用 juejin_update_article 提交修改，返回更新后的文章链接
```

> 若文章不是通过 skill 发布的，会提示"这篇文章不是通过 skill 发布的，确认要更新吗？"，确认后使用 `force=true` 继续。

## MCP 工具

| 工具 | 说明 |
|------|------|
| `juejin_auth` | 验证当前 token 是否有效，返回账号信息 |
| `juejin_set_token` | 保存掘金 sessionid 到本地 |
| `juejin_get_categories` | 获取掘金全量分类与标签列表 |
| `juejin_publish` | 发布文章（标题、正文、category_id、tag_ids） |
| `juejin_save_draft` | 保存草稿 |
| `juejin_update_article` | 更新已发布文章（`force=true` 可更新非 skill 发布的文章） |
| `juejin_list_articles` | 列出当前账号已发布的文章 |

## 数据存储

运行时数据存储在 `~/.local/share/juejin-doc/`（遵循 XDG 规范）：

- `config.json` — 存储 sessionid token
- `published_articles.json` — skill 发布的文章记录（用于 update 安全校验）

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| MCP 工具调用失败 | 运行 `npm run install-skills -- juejin-doc` 后重启 Claude Code |
| Token 无效 / 鉴权失败 | 重新获取 `sessionid` 并执行 `/juejin-doc auth <token>` |
| 发布后无法在掘金看到文章 | 检查是否被平台审核；草稿可在掘金创作中心查看 |
| 分类/标签推断不准确 | 在确认步骤直接告知 AI 要使用哪个分类/标签 |
| 更新提示"非 skill 发布" | 正常提示，确认后即可更新 |
| sessionid 过期 | 重新登录掘金后获取新的 `sessionid` 并更新 |
