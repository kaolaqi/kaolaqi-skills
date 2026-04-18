#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { checkConnection } from './auth.js';
import { createDocument, updateDocument, listCreatedDocs } from './docs.js';
import { getTargetFolder, setTargetFolder } from './folder.js';
import { readDocument } from './reader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFERENCE_DIR = join(__dirname, '..', '..', 'reference');

const server = new Server(
  { name: 'feishu-doc', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

// --- Tool definitions ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'feishu_auth',
      description: 'Check Feishu app credentials connectivity. Verifies APP_ID and APP_SECRET are valid.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'feishu_create_doc',
      description:
        'Create a new Feishu document in the configured target folder. A folder must be configured via feishu_set_folder first. Optionally pass folder_token to override the default folder for this request only.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Document title' },
          content: { type: 'string', description: 'Document content in markdown format' },
          folder_token: {
            type: 'string',
            description:
              'Optional folder token or URL to override the default folder for this request only.',
          },
        },
        required: ['title', 'content'],
      },
    },
    {
      name: 'feishu_update_doc',
      description:
        'Update a Feishu document. By default only skill-created docs can be updated. Set force=true to update any document within app permission scope.',
      inputSchema: {
        type: 'object',
        properties: {
          doc_id: { type: 'string', description: 'Document ID to update. Use feishu_list_docs to find it.' },
          content: { type: 'string', description: 'New content in markdown format' },
          mode: {
            type: 'string',
            enum: ['full'],
            description: "Update mode: 'full' replaces entire content",
            default: 'full',
          },
          force: {
            type: 'boolean',
            description: 'Set true to update documents not created by this skill',
            default: false,
          },
        },
        required: ['doc_id', 'content'],
      },
    },
    {
      name: 'feishu_set_folder',
      description: 'Set the target folder for document output. Accepts a folder URL or token.',
      inputSchema: {
        type: 'object',
        properties: {
          folder_token: {
            type: 'string',
            description: 'Feishu folder token or full URL (https://xxx.feishu.cn/drive/folder/TOKEN)',
          },
          folder_name: { type: 'string', description: 'Folder name for display', default: '' },
        },
        required: ['folder_token'],
      },
    },
    {
      name: 'feishu_list_docs',
      description: 'List all documents created by this skill.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'feishu_get_folder',
      description: 'Get the currently configured target folder.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'feishu_list_templates',
      description: 'List available reference templates in the reference/ directory.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'feishu_read_doc',
      description:
        'Read a Feishu document or wiki page by URL. Returns content as markdown with images. For long documents, returns outline first — use section_id to read specific sections.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'Full Feishu URL, e.g. https://xxx.feishu.cn/docx/ABC or https://xxx.feishu.cn/wiki/XYZ',
          },
          section_id: {
            type: 'string',
            description: 'Optional block_id of a heading to read only that section. Get from outline mode.',
          },
        },
        required: ['url'],
      },
    },
  ],
}));

// --- Tool call handler ---

interface ToolArgs {
  title?: string;
  content?: string;
  folder_token?: string;
  folder_name?: string;
  doc_id?: string;
  mode?: string;
  force?: boolean;
  url?: string;
  section_id?: string;
}

interface PermissionError extends Error {
  isPermissionError?: boolean;
}

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;
  const toolArgs = (args ?? {}) as ToolArgs;
  try {
    if (name === 'feishu_read_doc') {
      return handleReadDoc(toolArgs);
    }
    const result = await dispatchTool(name, toolArgs);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const e = err as PermissionError;
    const errType = e.isPermissionError ? 'permission' : 'error';
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: e.message, type: errType }, null, 2) },
      ],
    };
  }
});

async function handleReadDoc(args: ToolArgs) {
  if (!args.url) throw new Error('url is required');
  const result = await readDocument(args.url, args.section_id ?? null);
  const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];

  if (result.mode === 'outline') {
    content.push({ type: 'text', text: JSON.stringify(result, null, 2) });
    return { content };
  }

  const header = result.title ? `# ${result.title}\n\n` : '';
  const markdown = result.content ?? '';
  const imageMap: Record<string, { file_token: string; data: string; mime_type: string }> = {};
  for (const img of result.images ?? []) {
    if (img) imageMap[img.file_token] = img;
  }

  const parts = (header + markdown).split(/\[图片:([A-Za-z0-9_-]+)\]/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      const text = parts[i]!.trim();
      if (text) content.push({ type: 'text', text });
    } else {
      const img = imageMap[parts[i]!];
      if (img) {
        content.push({ type: 'image', data: img.data, mimeType: img.mime_type });
      } else {
        content.push({ type: 'text', text: '[图片加载失败]' });
      }
    }
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: '(空文档)' });
  }

  return { content };
}

async function dispatchTool(name: string, args: ToolArgs) {
  switch (name) {
    case 'feishu_auth':
      return checkConnection();

    case 'feishu_create_doc':
      return createDocument(args.title!, args.content!, args.folder_token ?? null);

    case 'feishu_update_doc':
      return updateDocument(args.doc_id!, args.content!, args.mode ?? 'full', args.force ?? false);

    case 'feishu_set_folder':
      return setTargetFolder(args.folder_token!, args.folder_name ?? '');

    case 'feishu_list_docs':
      return { documents: listCreatedDocs() };

    case 'feishu_get_folder': {
      const folder = getTargetFolder();
      if (!folder) {
        return {
          status: 'not_configured',
          message: 'No target folder set. Use feishu_set_folder to configure.',
        };
      }
      return { status: 'configured', ...folder };
    }

    case 'feishu_list_templates':
      return { templates: listReferenceTemplates() };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

interface TemplateEntry {
  filename: string;
  title: string;
  path: string;
}

function listReferenceTemplates(): TemplateEntry[] {
  if (!existsSync(REFERENCE_DIR)) return [];
  const templates: TemplateEntry[] = [];
  try {
    const files = readdirSync(REFERENCE_DIR)
      .filter(f => f.endsWith('.md'))
      .sort();
    for (const f of files) {
      const filePath = join(REFERENCE_DIR, f);
      const content = readFileSync(filePath, 'utf-8');
      const firstLine = content.trim().split('\n')[0] ?? '';
      const title = firstLine.startsWith('#')
        ? firstLine.replace(/^#+\s*/, '').trim()
        : f.replace(/\.md$/, '');
      templates.push({ filename: f, title, path: filePath });
    }
  } catch {
    // Ignore read errors
  }
  return templates;
}

// --- Start server ---

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${(err as Error).message}\n`);
  process.exit(1);
});
