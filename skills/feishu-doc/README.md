# feishu-doc

将 AI 对话内容一键导出为结构化的飞书云文档，或将飞书文档/Wiki 读取到对话中进行分析、总结、作为编码参考。

## 功能

| 功能 | 说明 |
|------|------|
| 导出文档 | 提取对话内容，自动结构化并创建飞书文档 |
| 读取文档 | 将任意飞书文档/Wiki 读入对话上下文 |
| 更新文档 | 基于对话反馈修改已创建的文档 |
| 模板支持 | 通过 `reference/` 目录自定义文档结构 |
| 文件夹管理 | 设置默认输出文件夹，支持单次覆盖 |

## 安装

```bash
# 从项目根目录
npm run install-skills -- feishu-doc
```

安装完成后注册 MCP Server（需先从[飞书开放平台](https://open.feishu.cn/app)获取 App 凭证）：

```bash
claude mcp add \
  -e FEISHU_APP_ID=cli_xxxxx \
  -e FEISHU_APP_SECRET=xxxxx \
  -s user feishu-doc \
  -- node ~/.claude/skills/feishu-doc/dist/index.js
```

注册后重启 Claude Code 生效。

### 飞书应用权限配置

在飞书开放平台为应用开启以下权限：

| 权限 | 用途 |
|------|------|
| `docx:document` | 创建、更新文档 |
| `docx:document:readonly` | 读取文档 |
| `wiki:wiki:readonly` | 读取 Wiki 页面 |
| `drive:drive:readonly` | 读取文档内图片（可选） |

### 为应用开通文档权限

应用默认无法访问用户的云文档，需要将应用添加为文档协作者。有两种方式：

**方式一：直接添加应用为文档协作者**

由文档所有者或拥有管理权限的协作者操作：云文档页面右上方「...」→「...更多」→「添加文档应用」。

前提条件：
- 应用的发布版本可用范围需包含文档所有者
- 应用至少开通了任意一个云文档 API 权限

**方式二：通过群组间接授权**

1. 在开发者后台为应用添加「机器人」能力，发布应用
2. 在飞书客户端创建群组，将应用添加为群机器人（注意：不是「自定义机器人」）
3. 在目标文档的「分享」入口，邀请该群组为协作者并设置权限

建议对输出文件夹使用方式一或方式二授权，这样应用创建的文档会自动继承文件夹权限。

详见：https://open.feishu.cn/document/server-docs/docs/faq（问题 3）

## 使用方法

### 命令

```
/feishu-doc write              # 提取整个对话，自动结构化并创建文档
/feishu-doc write <描述>        # 只提取对话中匹配描述的部分
/feishu-doc read <url>         # 读取飞书文档/wiki 到对话
/feishu-doc update             # 更新最近创建的文档
/feishu-doc update <url>       # 更新指定文档
/feishu-doc folder             # 查看当前默认输出文件夹
/feishu-doc folder <链接>       # 设置默认输出文件夹
/feishu-doc help               # 显示帮助信息
```

### 导出对话内容

```
/feishu-doc write              # 提取整个对话，结构化后创建文档
/feishu-doc write 架构设计部分   # 只提取匹配描述的内容
```

### 读取飞书文档

```
/feishu-doc read https://xxx.feishu.cn/docx/ABC123
```

也可以直接在对话中粘贴飞书链接并要求分析，会自动触发读取。

### 更新文档

```
/feishu-doc update                                    # 更新最近创建的文档
/feishu-doc update https://xxx.feishu.cn/docx/ABC123  # 更新指定文档
```

### 切换输出文件夹

```
/feishu-doc folder                                              # 查看当前文件夹
/feishu-doc folder https://xxx.feishu.cn/drive/folder/TOKEN     # 切换文件夹
```

### 隐式触发

- 粘贴飞书文档/Wiki URL 并说"读一下"、"总结一下" → 等同于 `/feishu-doc read <url>`
- 说"写到飞书"、"导出为飞书文档" → 等同于 `/feishu-doc write`
- 说"输出到这个文件夹 <url>" → 切换输出目录并写入

### 自动内容结构化

若无匹配模板，AI 会根据内容类型自动选择结构：

| 内容类型 | 默认结构 |
|----------|----------|
| 设计文档 | 背景 → 目标 → 方案选项 → 决策 → 实施计划 |
| 技术调研 | 问题 → 方案对比 → 建议 |
| 会议记录 | 参会人 → 议题 → 讨论内容 → 行动项 |
| 通用 | 摘要 → 详细内容 → 下一步 |

## 自定义模板

在 `reference/` 目录放置 `.md` 文件，skill 会以其标题层级作为骨架：

```
skills/feishu-doc/reference/
├── design-proposal.md    # 设计方案模板
├── tech-investigation.md # 技术调研模板
└── meeting-notes.md      # 会议记录模板
```

模板优先级高于自动检测。模板只需保留标题结构（`#`、`##`、`###`），内容由 AI 填充。

## 工作流

```
用户请求
  └─ 0. 首次配置检查（构建、注册、凭证、文件夹）
  └─ 1. 提取/读取内容
  └─ 2. 结构化（匹配模板或自动推断）
  └─ 3. 展示预览，等待用户确认
  └─ 4. 调用 API 创建/更新文档，返回链接
```

## MCP 工具

| 工具 | 说明 |
|------|------|
| `feishu_auth` | 验证应用凭证 |
| `feishu_create_doc` | 创建新文档 |
| `feishu_update_doc` | 更新已有文档（`force=true` 可更新非 skill 创建的文档） |
| `feishu_read_doc` | 读取文档内容（支持 `section_id` 分段读取） |
| `feishu_set_folder` | 设置默认输出文件夹 |
| `feishu_get_folder` | 查看当前默认文件夹 |
| `feishu_list_docs` | 列出 skill 创建的文档记录 |
| `feishu_list_templates` | 列出 `reference/` 中的模板文件 |

## 数据存储

运行时数据存储在 `~/.local/share/feishu-doc/`（遵循 XDG 规范），不写入 skill 目录：

- `config.json` — 默认文件夹配置
- `created_docs.json` — skill 创建的文档记录（用于 update 安全校验）

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| MCP 工具调用失败 | 运行 `npm run install-skills -- feishu-doc` 后重启 Claude Code |
| 凭证无效 | 检查 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 是否正确 |
| 创建文档权限不足 | 在飞书开放平台确认 `docx:document` 权限已审批 |
| 读取 Wiki 失败 | 确认应用有 `wiki:wiki:readonly` 权限 |
| 长文档只返回目录 | 正常行为，使用 `section_id` 参数读取具体章节 |
| 创建后无法编辑 | 打开文档后手动设置密级 |
| 表格内容 429 限流 | 内置自动重试，若仍持续请减小表格行数 |
