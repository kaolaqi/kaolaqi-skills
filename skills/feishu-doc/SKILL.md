---
name: feishu-doc
description: Use when needing to export conversation content into Feishu documents, or read Feishu documents/wiki pages into context for summarization, analysis, or as coding reference. Triggers on "write to feishu", "read this feishu doc", "summarize this document", or Feishu URLs in conversation.
---

# Feishu Doc

Export conversation content into structured Feishu cloud documents, and read Feishu documents/wiki pages into context for analysis.

## Triggering

- `/feishu-doc` — 显示帮助信息（同 help）
- `/feishu-doc write` — 提取当前对话，自动结构化并创建文档
- `/feishu-doc write <描述>` — 只提取对话中匹配描述的部分
- `/feishu-doc read <url>` — 读取飞书文档/wiki 到对话中
- `/feishu-doc update` — 修改最近创建的文档
- `/feishu-doc update <url>` — 修改指定文档（非 skill 创建的文档需确认后用 force）
- `/feishu-doc folder` — 查看当前输出文件夹
- `/feishu-doc folder <链接>` — 切换输出文件夹
- `/feishu-doc help` — 显示帮助信息

隐式触发：
- 用户粘贴飞书文档/wiki URL 并要求读取/总结/分析时，等同于 `/feishu-doc read <url>`
- 用户在对话中要求变更输出文件夹（如"换个文件夹"、"输出到这个目录"）时，等同于 `/feishu-doc folder <链接>`

## Workflow

### Route — determine intent from arguments (internal, do NOT announce to user)

Silently determine intent and proceed directly. Never tell the user "routing to X command" or similar — just do it.

If arguments match a known subcommand (`read`, `write`, `update`, `folder`, `help`), use that command directly.

Otherwise, infer intent from the natural language arguments:
- Contains a Feishu URL → `read <url>`
- Describes exporting/writing/summarizing conversation content → `write <描述>`
- Describes modifying/updating a previously created doc → `update`
- Describes setting/changing output folder (without write intent) → `folder`
- Combines folder + write intent (e.g. "把讨论总结写到这个文件夹 <url>") → `write` with per-request folder override (see Step 3 folder logic)
- No arguments or asks for help → `help`

After routing, proceed to the matching step below.

---

### Help — if invoked as `/feishu-doc` or `/feishu-doc help`:

Display the following command reference and stop:

| 命令 | 说明 |
|------|------|
| `/feishu-doc write` | 提取当前对话内容，自动结构化并创建飞书文档 |
| `/feishu-doc write <描述>` | 只提取对话中匹配描述的部分内容 |
| `/feishu-doc read <url>` | 读取飞书文档/wiki 到对话中进行分析 |
| `/feishu-doc update` | 根据对话反馈修改最近创建的文档 |
| `/feishu-doc update <url>` | 修改指定文档（非 skill 创建的需确认，使用 force） |
| `/feishu-doc folder` | 查看当前输出文件夹 |
| `/feishu-doc folder <链接>` | 切换输出文件夹 |
| `/feishu-doc help` | 显示本帮助信息 |

MCP 工具：`feishu_auth`、`feishu_create_doc`、`feishu_update_doc`（支持 force=true）、`feishu_read_doc`、`feishu_set_folder`、`feishu_get_folder`、`feishu_list_docs`、`feishu_list_templates`

### 0) First-time setup — if any MCP tool call fails or feishu-doc MCP is not connected:

Check prerequisites in order. Stop at the first missing item and guide the user.
Once a prerequisite is configured and persisted, skip it in future invocations.

1. **MCP Server built?**
   - Check: `ls ~/.claude/skills/feishu-doc/dist/index.js`
   - If not built, run the install script:
     ```bash
     bash ~/path/to/kaolaqi-skills/scripts/install.sh feishu-doc
     ```
   - Or manually:
     ```bash
     cd ~/.claude/skills/feishu-doc && npm install && npm run build
     ```

2. **MCP Server registered?**
   - Check: `claude mcp list` — look for `feishu-doc`
   - If not registered, ask user for APP_ID and APP_SECRET (get from team admin), then:
     ```bash
     claude mcp add \
       -e FEISHU_APP_ID=cli_xxxxx \
       -e FEISHU_APP_SECRET=xxxxx \
       -s user feishu-doc \
       -- node ~/.claude/skills/feishu-doc/dist/index.js
     ```
   - After registration, user MUST restart Claude Code and re-invoke `/feishu-doc`.

3. **App credentials valid?**
   - Call `feishu_auth` to verify connectivity. If it fails, check APP_ID and APP_SECRET.

4. **Target folder configured?** (for `write` command only)
   - Call `feishu_get_folder` to check if a default folder is set.
   - **If user's request already specifies a target folder** (e.g. "输出到 https://xxx/drive/folder/TOKEN"):
     - Skip this check entirely — the per-request folder will be used via `folder_token` parameter.
     - If no default folder is saved yet, after document creation ask: "要把这个文件夹设为默认输出目录吗？"
     - If user already has a different default folder, do NOT ask — this is a one-time override.
   - **If user's request does NOT specify a target folder and no default is configured**:
     - Ask user: "请先配置一个默认输出文件夹。使用应用身份时，不指定文件夹会导致文档创建到应用内部空间，你将无法访问。请粘贴一个飞书文件夹链接。"
     - User MUST provide a folder link or token. Call `feishu_set_folder` to save as default.
   - Once a default is configured, this step is skipped in future invocations (unless user specifies a different folder).
   - Tip: mention that `.md` template files can be placed in `reference/` to customize output structure.

Once authenticated, proceed to Step 1.

### 1) Extract content (for `write` command)
- If invoked as `/feishu-doc write`, extract key content from the entire current conversation.
- If invoked with a description (e.g. `/feishu-doc write 只导出关于架构设计的部分`), filter and extract only matching content.

### 1a) Read document (for `read` command)
- If invoked as `/feishu-doc read <url>`, call `feishu_read_doc` with the URL.
- Short docs (< 5000 chars): return full markdown + images inline.
- Long docs: return outline with headings and block_ids first, ask user which section to read, then use `section_id` to fetch specific sections.
- After reading, the document content is in conversation context for summarization, analysis, or as coding reference.

### 1b) Locate document (for `update` command)
- If invoked as `/feishu-doc update`, locate the most recently created doc via `feishu_list_docs`.
- If invoked as `/feishu-doc update <url>`, extract doc_id from the URL. If not in `created_docs.json`, inform user and ask for confirmation before proceeding with `force=true`.

### 2) Structure content (for `write` and `update` commands)
- Call `feishu_list_templates` to scan `reference/` for user-provided `.md` templates.
- If a template matches the content topic, follow its heading hierarchy and section layout.
- If no template matches, auto-detect content type and apply default structure:
  - **Design doc**: Background → Goals → Options → Decision → Implementation
  - **Tech research**: Problem → Approaches → Comparison → Recommendation
  - **Meeting notes**: Attendees → Agenda → Discussion → Action Items
  - **General**: Summary → Details → Next Steps

### 3) Confirm with user
- Show the target folder: "将输出到 [文件夹名或用户指定的文件夹]，内容如下："
- If user specified a per-request folder different from the default, mention it clearly (e.g. "将输出到你指定的文件夹，而非默认文件夹").
- Present the structured content to the user for review BEFORE creating the document.
- Use rich markdown formatting in the preview: tables, **bold**, *italic*, ~~strikethrough~~, `inline code`, [links](url), code blocks, `> quotes`, `---` dividers.
- For flowcharts and diagrams, use ```mermaid code blocks — they will be inserted as code with a hint to convert to 飞书「文本绘图」.
- If user is not satisfied, revise based on their feedback. During revision:
  - Offer structure/format suggestions where appropriate (e.g. "this comparison section might work better as a table", "consider splitting this into sub-sections").
  - Only suggest structural improvements, NOT wording or style changes.
- Repeat until user confirms.

### 4) Create or update document
- For `write`: call `feishu_create_doc`. If user specified a per-request folder, pass it as `folder_token` parameter (this does NOT change the saved default).
- For `update`: call `feishu_update_doc`.
- For updates on documents not created by this skill, inform the user first: "这个文档不是通过 skill 创建的，确认要更新吗？" After user confirms, call `feishu_update_doc` with `force=true`.
- If the call fails with an auth/permission error, check app credentials and permissions, then retry.
- Return the document link to the user.
- After creating a NEW document, always remind: "⚠️ 请打开文档后设置密级，否则后续无法编辑或更新。"
- **Post-create folder prompt**: If user used a per-request folder AND no default folder is saved, ask: "要把这个文件夹设为默认输出目录吗？" If yes, call `feishu_set_folder`.
- If user wants further changes after creation, use `/feishu-doc update` to revise.

## Reference Templates

Place `.md` files in `reference/` directory. Only the heading structure matters — the skill uses it as a skeleton for formatting. Example:

```
reference/
├── design-proposal.md    # Your team's design doc format
├── tech-investigation.md # Tech research template
└── meeting-notes.md      # Meeting notes format
```

Templates take priority over auto-detection. If no template matches, auto-detection kicks in.

## Security Model

- **App identity (tenant_access_token)**: uses app-level credentials, no per-user OAuth needed
- **Scope controlled by app permissions**: only documents within the app's authorized scope can be accessed
- **Update safety**: by default only skill-created documents (tracked in `created_docs.json`) can be updated; `force=true` required for others
- **Read scope**: can read any document the app has been granted access to
- **Runtime data isolation**: config stored in `~/.local/share/feishu-doc/` (XDG), not in skill directory

## Common Issues

| Issue | Fix |
|-------|-----|
| `feishu-doc` MCP not found | Run `bash scripts/install.sh feishu-doc`, restart Claude Code |
| App credentials invalid | Check FEISHU_APP_ID and FEISHU_APP_SECRET environment variables |
| Permission denied on create | Check that app has `docx:document` scope approved |
| Permission denied on read | Check that app has `docx:document:readonly` scope; for wiki pages also need `wiki:wiki:readonly` |
| Doc not found for update | Check `feishu_list_docs`; for non-skill docs use `force=true` |
| Rate limit (429) on large tables | Built-in retry + throttle handles this automatically; if persistent, reduce table size |
| Images not loading | May need `drive:drive:readonly` scope; check app permissions |
| Long doc returns outline | Use `section_id` parameter to read specific sections |
