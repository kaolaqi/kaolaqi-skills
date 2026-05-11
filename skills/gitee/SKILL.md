# gitee — Gitee MCP Skill

Connects Claude Code to Gitee via the Gitee API v5, enabling repository browsing, issue and PR management, and file operations.

## Trigger phrases

- "查看我的 Gitee 仓库"
- "列出 {owner}/{repo} 的 issues"
- "在 Gitee 上创建 issue"
- "查看 Gitee PR"
- "读取 {owner}/{repo} 的文件"
- "Gitee 仓库搜索"

## Tools

| Tool | Description |
|---|---|
| `gitee_auth` | 验证 Token，返回当前用户信息 |
| `gitee_list_repos` | 列出当前用户的仓库 |
| `gitee_get_repo` | 获取指定仓库的详细信息 |
| `gitee_search_repos` | 按关键词搜索公开仓库 |
| `gitee_list_branches` | 列出仓库的所有分支 |
| `gitee_list_commits` | 列出仓库的提交历史 |
| `gitee_get_file` | 获取仓库中指定文件的内容 |
| `gitee_list_dir` | 列出仓库中指定目录的内容 |
| `gitee_create_file` | 在仓库中创建新文件 |
| `gitee_update_file` | 更新仓库中已有文件 |
| `gitee_list_issues` | 列出仓库的 Issues |
| `gitee_get_issue` | 获取指定 Issue 详情 |
| `gitee_create_issue` | 创建新 Issue |
| `gitee_comment_issue` | 对 Issue 添加评论 |
| `gitee_list_pulls` | 列出仓库的 Pull Requests |
| `gitee_get_pull` | 获取指定 PR 详情 |

## Setup

1. 在 Gitee 创建个人访问令牌：https://gitee.com/profile/personal_access_tokens
2. 勾选权限：`projects`、`issues`、`pull_requests`
3. 设置环境变量 `GITEE_TOKEN`
4. 运行 `npm run install-skills -- gitee`
