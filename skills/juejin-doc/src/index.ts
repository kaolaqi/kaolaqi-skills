import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { listArticles, publishArticle, saveDraft, updateArticle } from './articles.js';
import { checkConnection, setToken } from './auth.js';
import { getCategories } from './categories.js';

const server = new Server(
  { name: 'juejin-doc', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'juejin_auth',
      description: 'Verify Juejin token and return account info (user name, article count).',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'juejin_set_token',
      description: 'Save Juejin sessionid token to local config.',
      inputSchema: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Juejin sessionid cookie value' },
        },
        required: ['token'],
      },
    },
    {
      name: 'juejin_get_categories',
      description:
        'Fetch all Juejin article categories and their tags. Use this to infer category/tags from article content.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'juejin_save_draft',
      description: 'Create a Juejin article draft without publishing.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Article title' },
          content: { type: 'string', description: 'Article body in Markdown' },
          category_id: { type: 'string', description: 'Juejin category ID' },
          tag_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of Juejin tag IDs (max 3)',
          },
          cover_image: { type: 'string', description: 'Cover image URL (optional)' },
          brief_content: {
            type: 'string',
            description: 'Article summary, max 100 chars (optional, auto-generated if omitted)',
          },
        },
        required: ['title', 'content', 'category_id', 'tag_ids'],
      },
    },
    {
      name: 'juejin_publish',
      description: 'Create a draft and immediately publish it as a Juejin article.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Article title' },
          content: { type: 'string', description: 'Article body in Markdown' },
          category_id: { type: 'string', description: 'Juejin category ID' },
          tag_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of Juejin tag IDs (max 3)',
          },
          cover_image: { type: 'string', description: 'Cover image URL (optional)' },
          brief_content: {
            type: 'string',
            description: 'Article summary, max 100 chars (optional)',
          },
        },
        required: ['title', 'content', 'category_id', 'tag_ids'],
      },
    },
    {
      name: 'juejin_update_article',
      description:
        'Update a published Juejin article. By default only articles published by this skill can be updated. Set force=true to update any article.',
      inputSchema: {
        type: 'object',
        properties: {
          article_id: { type: 'string', description: 'Juejin article ID' },
          title: { type: 'string', description: 'New title (optional)' },
          content: { type: 'string', description: 'New Markdown content (optional)' },
          category_id: { type: 'string', description: 'New category ID (optional)' },
          tag_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'New tag IDs (optional)',
          },
          cover_image: { type: 'string', description: 'New cover image URL (optional)' },
          force: {
            type: 'boolean',
            description: 'Allow updating articles not published by this skill',
            default: false,
          },
        },
        required: ['article_id'],
      },
    },
    {
      name: 'juejin_list_articles',
      description: "List the current user's published Juejin articles.",
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Number of articles to return (default 20)',
            default: 20,
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    const result = await handleTool(name, args as Record<string, unknown>);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    const type = e instanceof Error && e.message.startsWith('Article') ? 'permission' : 'error';
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: String(e instanceof Error ? e.message : e), type }) },
      ],
    };
  }
});

async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'juejin_auth':
      return checkConnection();

    case 'juejin_set_token':
      return setToken(args['token'] as string);

    case 'juejin_get_categories':
      return getCategories();

    case 'juejin_save_draft':
      return saveDraft({
        title: args['title'] as string,
        content: args['content'] as string,
        category_id: args['category_id'] as string,
        tag_ids: args['tag_ids'] as string[],
        cover_image: (args['cover_image'] as string | undefined) ?? '',
        brief_content: (args['brief_content'] as string | undefined) ?? '',
      });

    case 'juejin_publish':
      return publishArticle({
        title: args['title'] as string,
        content: args['content'] as string,
        category_id: args['category_id'] as string,
        tag_ids: args['tag_ids'] as string[],
        cover_image: (args['cover_image'] as string | undefined) ?? '',
        brief_content: (args['brief_content'] as string | undefined) ?? '',
      });

    case 'juejin_update_article':
      return updateArticle({
        article_id: args['article_id'] as string,
        title: (args['title'] as string | undefined) ?? '',
        content: (args['content'] as string | undefined) ?? '',
        category_id: (args['category_id'] as string | undefined) ?? '',
        tag_ids: args['tag_ids'] as string[] | undefined,
        cover_image: (args['cover_image'] as string | undefined) ?? '',
        force: (args['force'] as boolean | undefined) ?? false,
      });

    case 'juejin_list_articles':
      return listArticles((args['limit'] as number | undefined) ?? 20);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${String(e)}\n`);
  process.exit(1);
});
