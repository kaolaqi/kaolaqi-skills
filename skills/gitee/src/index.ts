#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { apiCall, decodeBase64, encodeBase64 } from './api.js';

const server = new Server({ name: 'gitee', version: '0.1.0' }, { capabilities: { tools: {} } });

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'gitee_auth',
      description: '验证 Gitee Token 是否有效，返回当前登录用户的基本信息。',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'gitee_list_repos',
      description: '列出当前登录用户的仓库列表，支持按类型、排序方式过滤，支持分页。',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['all', 'owner', 'personal', 'member', 'public', 'private'],
            description: '仓库类型，默认 all',
          },
          sort: {
            type: 'string',
            enum: ['created', 'updated', 'pushed', 'full_name'],
            description: '排序字段，默认 full_name',
          },
          page: { type: 'number', description: '页码，默认 1' },
          per_page: { type: 'number', description: '每页数量，最大 100，默认 20' },
        },
      },
    },
    {
      name: 'gitee_get_repo',
      description: '获取指定仓库的详细信息（描述、Stars、Forks、语言、默认分支等）。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者用户名' },
          repo: { type: 'string', description: '仓库名称' },
        },
        required: ['owner', 'repo'],
      },
    },
    {
      name: 'gitee_search_repos',
      description: '按关键词搜索 Gitee 上的公开仓库。',
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: '搜索关键词' },
          page: { type: 'number', description: '页码，默认 1' },
          per_page: { type: 'number', description: '每页数量，默认 20' },
        },
        required: ['q'],
      },
    },
    {
      name: 'gitee_list_branches',
      description: '列出仓库的所有分支。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者' },
          repo: { type: 'string', description: '仓库名称' },
        },
        required: ['owner', 'repo'],
      },
    },
    {
      name: 'gitee_list_commits',
      description: '列出仓库的提交历史，可按分支/文件路径过滤。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者' },
          repo: { type: 'string', description: '仓库名称' },
          sha: { type: 'string', description: '分支名或 commit SHA，默认为默认分支' },
          path: { type: 'string', description: '只返回影响该文件路径的提交' },
          page: { type: 'number', description: '页码，默认 1' },
          per_page: { type: 'number', description: '每页数量，默认 20' },
        },
        required: ['owner', 'repo'],
      },
    },
    {
      name: 'gitee_get_file',
      description: '获取仓库中指定文件的内容（自动 Base64 解码，返回文本内容）。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者' },
          repo: { type: 'string', description: '仓库名称' },
          path: { type: 'string', description: '文件路径，如 src/index.ts' },
          ref: { type: 'string', description: '分支、Tag 或 commit SHA，默认为默认分支' },
        },
        required: ['owner', 'repo', 'path'],
      },
    },
    {
      name: 'gitee_list_dir',
      description: '列出仓库中指定目录下的文件和子目录。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者' },
          repo: { type: 'string', description: '仓库名称' },
          path: { type: 'string', description: '目录路径，根目录填空字符串或 /' },
          ref: { type: 'string', description: '分支、Tag 或 commit SHA，默认为默认分支' },
        },
        required: ['owner', 'repo', 'path'],
      },
    },
    {
      name: 'gitee_create_file',
      description: '在仓库中创建新文件。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者' },
          repo: { type: 'string', description: '仓库名称' },
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容（纯文本，工具内部自动 Base64 编码）' },
          message: { type: 'string', description: 'Commit 消息' },
          branch: { type: 'string', description: '目标分支，默认为仓库默认分支' },
        },
        required: ['owner', 'repo', 'path', 'content', 'message'],
      },
    },
    {
      name: 'gitee_update_file',
      description: '更新仓库中已有文件（需要提供文件当前的 SHA）。先用 gitee_get_file 获取 sha 字段。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者' },
          repo: { type: 'string', description: '仓库名称' },
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '新的文件内容（纯文本）' },
          message: { type: 'string', description: 'Commit 消息' },
          sha: { type: 'string', description: '当前文件的 SHA（由 gitee_get_file 返回）' },
          branch: { type: 'string', description: '目标分支，默认为仓库默认分支' },
        },
        required: ['owner', 'repo', 'path', 'content', 'message', 'sha'],
      },
    },
    {
      name: 'gitee_list_issues',
      description: '列出仓库的 Issues，支持按状态过滤和分页。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者' },
          repo: { type: 'string', description: '仓库名称' },
          state: {
            type: 'string',
            enum: ['open', 'closed', 'progressing', 'rejected', 'all'],
            description: 'Issue 状态，默认 open',
          },
          page: { type: 'number', description: '页码，默认 1' },
          per_page: { type: 'number', description: '每页数量，默认 20' },
        },
        required: ['owner', 'repo'],
      },
    },
    {
      name: 'gitee_get_issue',
      description: '获取指定 Issue 的详情（标题、内容、状态、评论数等）。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者' },
          repo: { type: 'string', description: '仓库名称' },
          number: { type: 'string', description: 'Issue 编号（如 I1ABC2）或序号' },
        },
        required: ['owner', 'repo', 'number'],
      },
    },
    {
      name: 'gitee_create_issue',
      description: '在仓库中创建新 Issue。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者' },
          repo: { type: 'string', description: '仓库名称' },
          title: { type: 'string', description: 'Issue 标题' },
          body: { type: 'string', description: 'Issue 正文（支持 Markdown）' },
          assignee: { type: 'string', description: '指派给的用户名（可选）' },
        },
        required: ['owner', 'repo', 'title'],
      },
    },
    {
      name: 'gitee_comment_issue',
      description: '对指定 Issue 添加评论。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者' },
          repo: { type: 'string', description: '仓库名称' },
          number: { type: 'string', description: 'Issue 编号' },
          body: { type: 'string', description: '评论内容（支持 Markdown）' },
        },
        required: ['owner', 'repo', 'number', 'body'],
      },
    },
    {
      name: 'gitee_list_pulls',
      description: '列出仓库的 Pull Requests，支持按状态过滤和分页。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者' },
          repo: { type: 'string', description: '仓库名称' },
          state: {
            type: 'string',
            enum: ['open', 'closed', 'merged', 'all'],
            description: 'PR 状态，默认 open',
          },
          page: { type: 'number', description: '页码，默认 1' },
          per_page: { type: 'number', description: '每页数量，默认 20' },
        },
        required: ['owner', 'repo'],
      },
    },
    {
      name: 'gitee_get_pull',
      description: '获取指定 Pull Request 的详情（标题、描述、源分支、目标分支、状态等）。',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: '仓库所有者' },
          repo: { type: 'string', description: '仓库名称' },
          number: { type: 'number', description: 'PR 序号' },
        },
        required: ['owner', 'repo', 'number'],
      },
    },
  ],
}));

// ---------------------------------------------------------------------------
// Tool call handler
// ---------------------------------------------------------------------------

interface Args {
  [key: string]: unknown;
}

function str(args: Args, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v) throw new Error(`参数 "${key}" 是必填字符串`);
  return v;
}

function num(args: Args, key: string, fallback?: number): number {
  const v = args[key];
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback;
    throw new Error(`参数 "${key}" 是必填数字`);
  }
  return Number(v);
}

function optStr(args: Args, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' && v ? v : undefined;
}

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Args;

  try {
    const result = await dispatch(name, args);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: JSON.stringify({ error: msg }, null, 2) }] };
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dispatch(name: string, args: Args): Promise<unknown> {
  switch (name) {
    case 'gitee_auth': {
      const user = await apiCall<Record<string, unknown>>('GET', '/user');
      return {
        login: user.login,
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
        public_repos: user.public_repos,
        followers: user.followers,
        following: user.following,
      };
    }

    case 'gitee_list_repos': {
      const params: Args = {
        type: optStr(args, 'type') ?? 'all',
        sort: optStr(args, 'sort') ?? 'full_name',
        page: num(args, 'page', 1),
        per_page: num(args, 'per_page', 20),
      };
      const repos = await apiCall<Record<string, unknown>[]>('GET', '/user/repos', { params: params as Record<string, string | number | boolean> });
      return repos.map(r => ({
        full_name: r.full_name,
        description: r.description,
        private: r.private,
        fork: r.fork,
        default_branch: r.default_branch,
        language: r.language,
        stargazers_count: r.stargazers_count,
        forks_count: r.forks_count,
        open_issues_count: r.open_issues_count,
        html_url: r.html_url,
        updated_at: r.updated_at,
      }));
    }

    case 'gitee_get_repo': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const r = await apiCall<Record<string, unknown>>('GET', `/repos/${owner}/${repo}`);
      return {
        full_name: r.full_name,
        description: r.description,
        private: r.private,
        fork: r.fork,
        default_branch: r.default_branch,
        language: r.language,
        stargazers_count: r.stargazers_count,
        forks_count: r.forks_count,
        watchers_count: r.watchers_count,
        open_issues_count: r.open_issues_count,
        license: r.license,
        html_url: r.html_url,
        clone_url: r.clone_url,
        ssh_url: r.ssh_url,
        created_at: r.created_at,
        updated_at: r.updated_at,
        pushed_at: r.pushed_at,
      };
    }

    case 'gitee_search_repos': {
      const q = str(args, 'q');
      const params = {
        q,
        page: num(args, 'page', 1),
        per_page: num(args, 'per_page', 20),
      };
      const result = await apiCall<Record<string, unknown>>('GET', '/repos/search', { params });
      const repos = (result.data ?? result) as Record<string, unknown>[];
      return Array.isArray(repos)
        ? repos.map(r => ({
            full_name: r.full_name,
            description: r.description,
            language: r.language,
            stargazers_count: r.stargazers_count,
            forks_count: r.forks_count,
            html_url: r.html_url,
          }))
        : result;
    }

    case 'gitee_list_branches': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const branches = await apiCall<Record<string, unknown>[]>('GET', `/repos/${owner}/${repo}/branches`);
      return branches.map(b => ({
        name: b.name,
        protected: b.protected,
        commit_sha: (b.commit as Record<string, unknown>)?.sha,
      }));
    }

    case 'gitee_list_commits': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const params: Record<string, string | number | boolean> = {
        page: num(args, 'page', 1),
        per_page: num(args, 'per_page', 20),
      };
      const sha = optStr(args, 'sha');
      const path = optStr(args, 'path');
      if (sha) params.sha = sha;
      if (path) params.path = path;
      const commits = await apiCall<Record<string, unknown>[]>('GET', `/repos/${owner}/${repo}/commits`, { params });
      return commits.map(c => {
        const commit = c.commit as Record<string, unknown>;
        const author = commit?.author as Record<string, unknown>;
        return {
          sha: c.sha,
          message: (commit?.message as string)?.split('\n')[0],
          author_name: author?.name,
          author_date: author?.date,
          html_url: c.html_url,
        };
      });
    }

    case 'gitee_get_file': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const path = str(args, 'path');
      const params: Record<string, string | number | boolean> = {};
      const ref = optStr(args, 'ref');
      if (ref) params.ref = ref;
      const file = await apiCall<Record<string, unknown>>('GET', `/repos/${owner}/${repo}/contents/${path}`, { params });
      if (file.type === 'dir') throw new Error(`路径 "${path}" 是目录，请使用 gitee_list_dir`);
      const content = typeof file.content === 'string' ? decodeBase64(file.content) : null;
      return {
        name: file.name,
        path: file.path,
        sha: file.sha,
        size: file.size,
        encoding: file.encoding,
        content,
        html_url: file.html_url,
      };
    }

    case 'gitee_list_dir': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const path = str(args, 'path');
      const params: Record<string, string | number | boolean> = {};
      const ref = optStr(args, 'ref');
      if (ref) params.ref = ref;
      const normalizedPath = path === '/' ? '' : path;
      const entries = await apiCall<Record<string, unknown>[]>('GET', `/repos/${owner}/${repo}/contents/${normalizedPath}`, { params });
      return entries.map(e => ({
        name: e.name,
        path: e.path,
        type: e.type,
        size: e.size,
        sha: e.sha,
      }));
    }

    case 'gitee_create_file': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const path = str(args, 'path');
      const content = str(args, 'content');
      const message = str(args, 'message');
      const body: Record<string, string> = {
        message,
        content: encodeBase64(content),
      };
      const branch = optStr(args, 'branch');
      if (branch) body.branch = branch;
      const result = await apiCall<Record<string, unknown>>('POST', `/repos/${owner}/${repo}/contents/${path}`, { body });
      const commit = result.commit as Record<string, unknown>;
      return {
        message: '文件创建成功',
        commit_sha: commit?.sha,
        commit_message: commit?.message,
        content_sha: (result.content as Record<string, unknown>)?.sha,
        html_url: (result.content as Record<string, unknown>)?.html_url,
      };
    }

    case 'gitee_update_file': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const path = str(args, 'path');
      const content = str(args, 'content');
      const message = str(args, 'message');
      const sha = str(args, 'sha');
      const body: Record<string, string> = {
        message,
        content: encodeBase64(content),
        sha,
      };
      const branch = optStr(args, 'branch');
      if (branch) body.branch = branch;
      const result = await apiCall<Record<string, unknown>>('PUT', `/repos/${owner}/${repo}/contents/${path}`, { body });
      const commit = result.commit as Record<string, unknown>;
      return {
        message: '文件更新成功',
        commit_sha: commit?.sha,
        commit_message: commit?.message,
        content_sha: (result.content as Record<string, unknown>)?.sha,
        html_url: (result.content as Record<string, unknown>)?.html_url,
      };
    }

    case 'gitee_list_issues': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const params: Record<string, string | number | boolean> = {
        state: optStr(args, 'state') ?? 'open',
        page: num(args, 'page', 1),
        per_page: num(args, 'per_page', 20),
      };
      const issues = await apiCall<Record<string, unknown>[]>('GET', `/repos/${owner}/${repo}/issues`, { params });
      return issues.map(i => ({
        number: i.number,
        title: i.title,
        state: i.state,
        comments: i.comments,
        created_at: i.created_at,
        updated_at: i.updated_at,
        user_login: (i.user as Record<string, unknown>)?.login,
        html_url: i.html_url,
      }));
    }

    case 'gitee_get_issue': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const number = str(args, 'number');
      const issue = await apiCall<Record<string, unknown>>('GET', `/repos/${owner}/${repo}/issues/${number}`);
      return {
        number: issue.number,
        title: issue.title,
        state: issue.state,
        body: issue.body,
        comments: issue.comments,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        user_login: (issue.user as Record<string, unknown>)?.login,
        assignee_login: (issue.assignee as Record<string, unknown>)?.login,
        html_url: issue.html_url,
      };
    }

    case 'gitee_create_issue': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const title = str(args, 'title');
      const body: Record<string, string> = { repo, title };
      const issueBody = optStr(args, 'body');
      const assignee = optStr(args, 'assignee');
      if (issueBody) body.body = issueBody;
      if (assignee) body.assignee = assignee;
      const issue = await apiCall<Record<string, unknown>>('POST', `/repos/${owner}/issues`, { body });
      return {
        message: 'Issue 创建成功',
        number: issue.number,
        title: issue.title,
        state: issue.state,
        html_url: issue.html_url,
      };
    }

    case 'gitee_comment_issue': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const number = str(args, 'number');
      const body = str(args, 'body');
      const comment = await apiCall<Record<string, unknown>>('POST', `/repos/${owner}/${repo}/issues/${number}/comments`, { body: { body } });
      return {
        message: '评论已发布',
        id: comment.id,
        created_at: comment.created_at,
        html_url: comment.html_url,
      };
    }

    case 'gitee_list_pulls': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const params: Record<string, string | number | boolean> = {
        state: optStr(args, 'state') ?? 'open',
        page: num(args, 'page', 1),
        per_page: num(args, 'per_page', 20),
      };
      const pulls = await apiCall<Record<string, unknown>[]>('GET', `/repos/${owner}/${repo}/pulls`, { params });
      return pulls.map(p => ({
        number: p.number,
        title: p.title,
        state: p.state,
        head: (p.head as Record<string, unknown>)?.label,
        base: (p.base as Record<string, unknown>)?.label,
        created_at: p.created_at,
        updated_at: p.updated_at,
        user_login: (p.user as Record<string, unknown>)?.login,
        html_url: p.html_url,
      }));
    }

    case 'gitee_get_pull': {
      const owner = str(args, 'owner');
      const repo = str(args, 'repo');
      const number = num(args, 'number');
      const pr = await apiCall<Record<string, unknown>>('GET', `/repos/${owner}/${repo}/pulls/${number}`);
      return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        body: pr.body,
        head: (pr.head as Record<string, unknown>)?.label,
        base: (pr.base as Record<string, unknown>)?.label,
        merged: pr.merged,
        mergeable: pr.mergeable,
        commits: pr.commits,
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        merged_at: pr.merged_at,
        user_login: (pr.user as Record<string, unknown>)?.login,
        html_url: pr.html_url,
      };
    }

    default:
      throw new Error(`未知工具: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${(err as Error).message}\n`);
  process.exit(1);
});
