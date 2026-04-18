import { requireAuth } from './auth.js';

const FEISHU_DOC_BLOCKS_URL =
  'https://open.feishu.cn/open-apis/docx/v1/documents/{document_id}/blocks';
const FEISHU_DOC_INFO_URL =
  'https://open.feishu.cn/open-apis/docx/v1/documents/{document_id}';
const FEISHU_WIKI_NODE_URL =
  'https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node';
const FEISHU_MEDIA_URL =
  'https://open.feishu.cn/open-apis/drive/v1/medias/{file_token}/download';

const SHORT_DOC_LIMIT = 5000;

const DOCX_URL_RE = /https?:\/\/[^/]+\/docx\/([A-Za-z0-9]+)/;
const WIKI_URL_RE = /https?:\/\/[^/]+\/wiki\/([A-Za-z0-9]+)/;

// --- Types ---

interface FeishuBlock {
  block_id: string;
  block_type: number;
  parent_id?: string;
  children?: string[];
  [key: string]: unknown;
}

interface TextRun {
  content?: string;
  text_element_style?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    inline_code?: boolean;
    link?: { url: string };
  };
}

interface BlockElement {
  text_run?: TextRun;
}

interface ImageInfo {
  file_token: string;
  data: string;
  mime_type: string;
}

interface OutlineEntry {
  heading: string;
  block_id: string;
  level: number;
}

interface ReadResult {
  title: string;
  mode: 'full' | 'section' | 'outline';
  content?: string;
  images?: ImageInfo[];
  total_chars: number;
  outline?: OutlineEntry[];
  hint?: string;
}

// --- URL parsing ---

function parseUrl(url: string): { docType: 'docx' | 'wiki'; token: string } {
  let m = DOCX_URL_RE.exec(url);
  if (m) return { docType: 'docx', token: m[1]! };
  m = WIKI_URL_RE.exec(url);
  if (m) return { docType: 'wiki', token: m[1]! };
  throw new Error(
    `Unsupported URL format: ${url}. ` +
      'Expected https://xxx.feishu.cn/docx/ID or https://xxx.feishu.cn/wiki/ID',
  );
}

async function resolveWikiToDocx(accessToken: string, nodeToken: string): Promise<string> {
  const resp = await fetch(`${FEISHU_WIKI_NODE_URL}?token=${nodeToken}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
  const data = (await resp.json()) as { code: number; msg: string; data: { node: { obj_token: string } } };
  if (data.code !== 0) throw new Error(`Failed to resolve wiki node: ${data.msg}`);
  return data.data.node.obj_token;
}

// --- Fetch blocks ---

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllBlocks(accessToken: string, documentId: string): Promise<FeishuBlock[]> {
  const blocks: FeishuBlock[] = [];
  let pageToken: string | null = null;

  while (true) {
    const params = new URLSearchParams({ page_size: '500' });
    if (pageToken) params.set('page_token', pageToken);

    const url = FEISHU_DOC_BLOCKS_URL.replace('{document_id}', documentId);
    const resp = await fetch(`${url}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
    const data = (await resp.json()) as {
      code: number;
      msg: string;
      data: { items?: FeishuBlock[]; has_more: boolean; page_token?: string };
    };
    if (data.code !== 0) throw new Error(`Failed to fetch blocks: ${data.msg}`);

    blocks.push(...(data.data.items ?? []));
    if (!data.data.has_more) break;
    pageToken = data.data.page_token ?? null;
    await sleep(200);
  }

  return blocks;
}

async function fetchDocTitle(accessToken: string, documentId: string): Promise<string> {
  const url = FEISHU_DOC_INFO_URL.replace('{document_id}', documentId);
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) return '';
  const data = (await resp.json()) as {
    code: number;
    data?: { document?: { title?: string } };
  };
  if (data.code !== 0) return '';
  return data.data?.document?.title ?? '';
}

// --- Image download ---

async function downloadImage(
  accessToken: string,
  fileToken: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const url = FEISHU_MEDIA_URL.replace('{file_token}', fileToken);
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
    });
    if (resp.status !== 200) return null;
    let contentType = resp.headers.get('content-type') ?? 'image/png';
    if (contentType.includes(';')) contentType = contentType.split(';')[0]!.trim();
    const buffer = await resp.arrayBuffer();
    const data = Buffer.from(buffer).toString('base64');
    return { data, mimeType: contentType };
  } catch {
    return null;
  }
}

// --- Block to markdown ---

function inlineElementsToMd(elements: BlockElement[]): string {
  const parts: string[] = [];
  for (const el of elements) {
    const tr = el.text_run;
    if (!tr) continue;
    let content = tr.content ?? '';
    const style = tr.text_element_style ?? {};
    if (style.inline_code) {
      content = `\`${content}\``;
    } else if (style.bold && style.italic) {
      content = `***${content}***`;
    } else if (style.bold) {
      content = `**${content}**`;
    } else if (style.italic) {
      content = `*${content}*`;
    }
    if (style.strikethrough) content = `~~${content}~~`;
    if (style.link?.url) content = `[${content}](${style.link.url})`;
    parts.push(content);
  }
  return parts.join('');
}

function blockToMd(block: FeishuBlock): { md: string | null; img: string | null } {
  const bt = block.block_type;

  if (bt === 1) return { md: null, img: null }; // page root

  if (bt === 2) {
    const text = block['text'] as { elements?: BlockElement[] } | undefined;
    const elements = text?.elements ?? [];
    return { md: inlineElementsToMd(elements), img: null };
  }

  const headingMap: Record<number, string> = {
    3: 'heading1',
    4: 'heading2',
    5: 'heading3',
    6: 'heading4',
    7: 'heading5',
    8: 'heading6',
    9: 'heading7',
  };
  if (bt in headingMap) {
    const key = headingMap[bt]!;
    const heading = block[key] as { elements?: BlockElement[] } | undefined;
    const elements = heading?.elements ?? [];
    const level = bt - 2;
    const prefix = '#'.repeat(Math.min(level, 6));
    return { md: `${prefix} ${inlineElementsToMd(elements)}`, img: null };
  }

  if (bt === 12) {
    const bullet = block['bullet'] as { elements?: BlockElement[] } | undefined;
    const elements = bullet?.elements ?? [];
    return { md: `- ${inlineElementsToMd(elements)}`, img: null };
  }

  if (bt === 13) {
    const ordered = block['ordered'] as { elements?: BlockElement[] } | undefined;
    const elements = ordered?.elements ?? [];
    return { md: `1. ${inlineElementsToMd(elements)}`, img: null };
  }

  if (bt === 14) {
    const code = block['code'] as { elements?: BlockElement[] } | undefined;
    const elements = code?.elements ?? [];
    const codeText = elements
      .filter(e => e.text_run)
      .map(e => e.text_run!.content ?? '')
      .join('');
    return { md: `\`\`\`\n${codeText}\n\`\`\``, img: null };
  }

  if (bt === 22) return { md: '---', img: null };

  if (bt === 27) {
    const image = block['image'] as { token?: string } | undefined;
    const fileToken = image?.token ?? '';
    if (fileToken) return { md: null, img: fileToken };
    return { md: '[图片]', img: null };
  }

  if (bt === 31) return { md: '[表格]', img: null };

  if (bt === 34) return { md: null, img: null }; // quote container, handled separately

  if (bt === 17) {
    const todo = block['todo'] as { elements?: BlockElement[]; style?: { done?: boolean } } | undefined;
    const elements = todo?.elements ?? [];
    const done = todo?.style?.done ?? false;
    const checkbox = done ? '[x]' : '[ ]';
    return { md: `- ${checkbox} ${inlineElementsToMd(elements)}`, img: null };
  }

  return { md: null, img: null };
}

function blocksToContent(blocks: FeishuBlock[]): { content: string; imageTokens: string[] } {
  const lines: string[] = [];
  const imageTokens: string[] = [];
  const blockMap: Record<string, FeishuBlock> = {};
  for (const b of blocks) blockMap[b.block_id] = b;
  const quoteParents = new Set<string>();

  for (const block of blocks) {
    const bt = block.block_type;
    const blockId = block.block_id ?? '';

    if (bt === 34) {
      quoteParents.add(blockId);
      for (const cid of block.children ?? []) {
        const child = blockMap[cid];
        if (child) {
          const { md, img } = blockToMd(child);
          if (md) lines.push(`> ${md}`);
          if (img) {
            imageTokens.push(img);
            lines.push(`> [图片:${img}]`);
          }
        }
      }
      continue;
    }

    const parentId = block.parent_id ?? '';
    if (quoteParents.has(parentId)) continue;

    const { md, img } = blockToMd(block);
    if (md !== null) lines.push(md);
    if (img) {
      imageTokens.push(img);
      lines.push(`[图片:${img}]`);
    }
  }

  return { content: lines.join('\n\n'), imageTokens };
}

// --- Outline extraction ---

function extractOutline(blocks: FeishuBlock[]): OutlineEntry[] {
  const headingTypes = new Set([3, 4, 5, 6, 7, 8, 9]);
  const headingKeyMap: Record<number, string> = {
    3: 'heading1',
    4: 'heading2',
    5: 'heading3',
    6: 'heading4',
    7: 'heading5',
    8: 'heading6',
    9: 'heading7',
  };
  const outline: OutlineEntry[] = [];
  for (const block of blocks) {
    const bt = block.block_type;
    if (headingTypes.has(bt)) {
      const key = headingKeyMap[bt]!;
      const heading = block[key] as { elements?: Array<{ text_run?: TextRun }> } | undefined;
      const elements = (heading?.elements ?? []).map(e => ({ text_run: e.text_run }));
      outline.push({
        heading: inlineElementsToMd(elements),
        block_id: block.block_id,
        level: bt - 2,
      });
    }
  }
  return outline;
}

function extractSection(blocks: FeishuBlock[], sectionId: string): FeishuBlock[] {
  let startIdx: number | null = null;
  let startLevel: number | null = null;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.block_id === sectionId) {
      startIdx = i;
      startLevel = (blocks[i]!.block_type ?? 3) - 2;
      break;
    }
  }
  if (startIdx === null) throw new Error(`Section ${sectionId} not found in document`);

  const sectionBlocks: FeishuBlock[] = [blocks[startIdx]!];
  const headingTypes = new Set([3, 4, 5, 6, 7, 8, 9]);
  for (let i = startIdx + 1; i < blocks.length; i++) {
    const bt = blocks[i]!.block_type;
    if (headingTypes.has(bt) && bt - 2 <= startLevel!) break;
    sectionBlocks.push(blocks[i]!);
  }
  return sectionBlocks;
}

// --- Public API ---

async function downloadImages(accessToken: string, imageTokens: string[]): Promise<ImageInfo[]> {
  const images: ImageInfo[] = [];
  for (const ft of imageTokens) {
    const result = await downloadImage(accessToken, ft);
    if (result) {
      images.push({ file_token: ft, data: result.data, mime_type: result.mimeType });
    }
  }
  return images;
}

export async function readDocument(url: string, sectionId: string | null = null): Promise<ReadResult> {
  const accessToken = await requireAuth();
  const { docType, token } = parseUrl(url);

  const documentId =
    docType === 'wiki' ? await resolveWikiToDocx(accessToken, token) : token;

  const [title, blocks] = await Promise.all([
    fetchDocTitle(accessToken, documentId),
    fetchAllBlocks(accessToken, documentId),
  ]);

  if (sectionId) {
    const sectionBlocks = extractSection(blocks, sectionId);
    const { content, imageTokens } = blocksToContent(sectionBlocks);
    const images = await downloadImages(accessToken, imageTokens);
    return { title, mode: 'section', content, images, total_chars: content.length };
  }

  const { content: fullContent, imageTokens } = blocksToContent(blocks);

  if (fullContent.length <= SHORT_DOC_LIMIT) {
    const images = await downloadImages(accessToken, imageTokens);
    return { title, mode: 'full', content: fullContent, images, total_chars: fullContent.length };
  }

  const outline = extractOutline(blocks);
  return {
    title,
    mode: 'outline',
    outline,
    total_chars: fullContent.length,
    hint: 'Document is long. Use feishu_read_doc with section_id to read specific sections.',
  };
}
