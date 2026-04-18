import { readFileSync, writeFileSync, existsSync } from 'fs';
import { requireAuth } from './auth.js';
import { getDataPath } from './dataDir.js';
import { getTargetFolder, extractToken } from './folder.js';

const FEISHU_CREATE_DOC_URL = 'https://open.feishu.cn/open-apis/docx/v1/documents';
const FEISHU_BLOCK_CHILDREN_URL =
  'https://open.feishu.cn/open-apis/docx/v1/documents/{document_id}/blocks/{block_id}/children';
const FEISHU_GET_BLOCK_URL =
  'https://open.feishu.cn/open-apis/docx/v1/documents/{document_id}/blocks/{block_id}';

const MAX_TABLE_CREATE_ROWS = 9;

// --- Types ---

interface TextElementStyle {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  inline_code?: boolean;
  link?: { url: string };
}

interface TextRun {
  content: string;
  text_element_style?: TextElementStyle;
}

interface BlockElement {
  text_run: TextRun;
}

interface FeishuBlock {
  block_type: number;
  [key: string]: unknown;
}

type BlockDescriptor =
  | { type: 'block'; block: FeishuBlock }
  | { type: 'table'; rows: string[][] }
  | { type: 'quote'; text: string };

interface CreatedDoc {
  doc_id: string;
  title: string;
  url: string;
  created_at: string;
  updated_at: string;
}

interface ApiResponse {
  code: number;
  msg: string;
  data: Record<string, unknown>;
}

// --- Created docs tracking ---

function loadCreatedDocs(): CreatedDoc[] {
  const docsFile = getDataPath('created_docs.json');
  if (!existsSync(docsFile)) return [];
  try {
    return JSON.parse(readFileSync(docsFile, 'utf-8')) as CreatedDoc[];
  } catch {
    return [];
  }
}

function saveCreatedDocs(docs: CreatedDoc[]): void {
  writeFileSync(getDataPath('created_docs.json'), JSON.stringify(docs, null, 2), 'utf-8');
}

function recordDoc(docId: string, title: string, url: string): void {
  const now = new Date().toISOString().slice(0, 19);
  let docs = loadCreatedDocs();
  docs = [
    ...docs.filter(d => d.doc_id !== docId),
    { doc_id: docId, title, url, created_at: now, updated_at: now },
  ];
  saveCreatedDocs(docs);
}

function isOwnedDoc(docId: string): boolean {
  return loadCreatedDocs().some(d => d.doc_id === docId);
}

// --- Inline text parsing ---

const INLINE_PATTERN =
  /(`[^`]+`)|(\[([^\]]+)\]\(([^)]+)\))|(~~[^~]+~~)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;

function parseInlineElements(text: string): BlockElement[] {
  const elements: BlockElement[] = [];
  let lastEnd = 0;

  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;

    if (start > lastEnd) {
      elements.push({ text_run: { content: text.slice(lastEnd, start) } });
    }

    const [, code, , linkText, linkUrl, strikethrough, bold, italic] = match;

    if (code) {
      elements.push({
        text_run: { content: code.slice(1, -1), text_element_style: { inline_code: true } },
      });
    } else if (linkText !== undefined) {
      elements.push({
        text_run: { content: linkText, text_element_style: { link: { url: linkUrl! } } },
      });
    } else if (strikethrough) {
      elements.push({
        text_run: {
          content: strikethrough.slice(2, -2),
          text_element_style: { strikethrough: true },
        },
      });
    } else if (bold) {
      elements.push({
        text_run: { content: bold.slice(2, -2), text_element_style: { bold: true } },
      });
    } else if (italic) {
      elements.push({
        text_run: { content: italic.slice(1, -1), text_element_style: { italic: true } },
      });
    }

    lastEnd = end;
  }

  if (lastEnd < text.length) {
    elements.push({ text_run: { content: text.slice(lastEnd) } });
  }

  if (elements.length === 0) {
    elements.push({ text_run: { content: text } });
  }

  return elements;
}

// --- Markdown to block descriptors ---

function parseMarkdown(content: string): BlockDescriptor[] {
  const descriptors: BlockDescriptor[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Divider
    if (/^(---|\*\*\*|___)$/.test(line.trim()) && line.trim().length >= 3) {
      descriptors.push({ type: 'block', block: { block_type: 22, divider: {} } });
      i++;
      continue;
    }

    // Code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      if (lang.toLowerCase() === 'mermaid') {
        descriptors.push({
          type: 'block',
          block: {
            block_type: 2,
            text: {
              elements: [
                {
                  text_run: {
                    content:
                      '💡 以下为 Mermaid 流程图源码，可在飞书中选中代码块转为「文本绘图」查看',
                    text_element_style: { italic: true },
                  },
                },
              ],
            },
          },
        });
      }
      const codeText = codeLines.join('\n');
      const MAX_TEXT_RUN = 1500;
      const codeElements: BlockElement[] = [];
      for (
        let offset = 0;
        offset < Math.max(codeText.length, 1);
        offset += MAX_TEXT_RUN
      ) {
        codeElements.push({
          text_run: { content: codeText.slice(offset, offset + MAX_TEXT_RUN) },
        });
      }
      descriptors.push({
        type: 'block',
        block: {
          block_type: 14,
          code: { elements: codeElements, language: mapCodeLanguage(lang) },
        },
      });
      i++;
      continue;
    }

    // Table (markdown pipe table)
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim().startsWith('|')) {
        tableLines.push(lines[i]!);
        i++;
      }
      const rows = parseMarkdownTable(tableLines);
      if (rows.length > 0) {
        descriptors.push({ type: 'table', rows });
      }
      continue;
    }

    // Quote block
    if (line.trim().startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('> ')) {
        quoteLines.push(lines[i]!.trim().slice(2));
        i++;
      }
      descriptors.push({ type: 'quote', text: quoteLines.join('\n') });
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      descriptors.push({ type: 'block', block: headingBlock(line.slice(4).trim(), 4) });
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      descriptors.push({ type: 'block', block: headingBlock(line.slice(3).trim(), 3) });
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      descriptors.push({ type: 'block', block: headingBlock(line.slice(2).trim(), 2) });
      i++;
      continue;
    }

    // Bullet list
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const text = line.trim().slice(2).trim();
      descriptors.push({
        type: 'block',
        block: { block_type: 2, text: { elements: parseInlineElements(`• ${text}`) } },
      });
      i++;
      continue;
    }

    // Ordered list
    const stripped = line.trim();
    if (stripped.length > 2 && /^\d/.test(stripped) && stripped.includes('. ')) {
      const dotPos = stripped.indexOf('. ');
      if (dotPos <= 4) {
        const idx = stripped.slice(0, dotPos);
        const text = stripped.slice(dotPos + 2).trim();
        descriptors.push({
          type: 'block',
          block: { block_type: 2, text: { elements: parseInlineElements(`${idx}. ${text}`) } },
        });
        i++;
        continue;
      }
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    descriptors.push({
      type: 'block',
      block: { block_type: 2, text: { elements: parseInlineElements(line) } },
    });
    i++;
  }

  return descriptors;
}

function parseMarkdownTable(lines: string[]): string[][] {
  const rows: string[][] = [];
  for (const line of lines) {
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map(c => c.trim());
    if (cells.every(c => /^[-:]+$/.test(c))) continue; // separator row
    rows.push(cells);
  }
  return rows;
}

function headingBlock(text: string, level: number): FeishuBlock {
  const blockTypeMap: Record<number, number> = { 2: 3, 3: 4, 4: 5 };
  const blockType = blockTypeMap[level] ?? 4;
  const keyMap: Record<number, string> = { 3: 'heading1', 4: 'heading2', 5: 'heading3' };
  const key = keyMap[blockType] ?? 'heading2';
  return { block_type: blockType, [key]: { elements: parseInlineElements(text) } };
}

function mapCodeLanguage(lang: string): number {
  const langMap: Record<string, number> = {
    python: 49,
    java: 28,
    javascript: 29,
    typescript: 64,
    go: 21,
    rust: 54,
    c: 6,
    cpp: 9,
    sql: 59,
    bash: 3,
    shell: 56,
    json: 30,
    yaml: 71,
    html: 24,
    css: 10,
    markdown: 37,
    mermaid: 37,
  };
  return langMap[lang.toLowerCase()] ?? 49;
}

// --- Block writing ---

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function addBlocks(
  accessToken: string,
  docId: string,
  parentId: string,
  blocks: FeishuBlock[],
  index = -1,
): Promise<ApiResponse> {
  const url = FEISHU_BLOCK_CHILDREN_URL.replace('{document_id}', docId).replace(
    '{block_id}',
    parentId,
  );
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ children: blocks, index }),
      signal: AbortSignal.timeout(30000),
    });

    if (resp.status === 429) {
      await sleep(1000 * (attempt + 1));
      continue;
    }

    const text = await resp.text();
    if (!text) {
      if (resp.status >= 400) {
        throw new Error(
          `Failed to add blocks: HTTP ${resp.status} empty response, parent=${parentId}`,
        );
      }
      return { code: 0, msg: '', data: { children: [] } };
    }

    const data = JSON.parse(text) as ApiResponse;
    if (resp.status >= 400 || data.code !== 0) {
      process.stderr.write(
        `[feishu-doc] Block insert failed: status=${resp.status}, code=${data.code}, msg=${data.msg}, ` +
          `parent=${parentId}, blocks=${JSON.stringify(blocks).slice(0, 500)}\n`,
      );
      throw new Error(`Failed to add blocks: ${data.msg} (code=${data.code})`);
    }
    return data;
  }

  throw new Error(`Rate limited after 4 retries, parent=${parentId}`);
}

async function fillTableCells(
  accessToken: string,
  docId: string,
  cellIds: string[],
  rows: string[][],
  colCount: number,
  rowOffset = 0,
): Promise<void> {
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const absRowIdx = rowOffset + rowIdx;
    const row = rows[rowIdx]!;
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cellIndex = rowIdx * colCount + colIdx;
      if (cellIndex >= cellIds.length) break;
      const cellId = cellIds[cellIndex]!;
      const cellText = row[colIdx]!;

      const elements =
        absRowIdx === 0
          ? [{ text_run: { content: cellText, text_element_style: { bold: true } } }]
          : parseInlineElements(cellText);

      const cellBlock: FeishuBlock = { block_type: 2, text: { elements } };
      await addBlocks(accessToken, docId, cellId, [cellBlock], 0);
      await sleep(50);
    }
  }
}

async function insertTableRows(
  accessToken: string,
  docId: string,
  tableBlockId: string,
  rowIndex: number,
  count: number,
): Promise<void> {
  const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/batch_update`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  for (let i = 0; i < count; i++) {
    const payload = {
      requests: [{ block_id: tableBlockId, insert_table_row: { row_index: rowIndex + i } }],
    };

    for (let attempt = 0; attempt < 4; attempt++) {
      const resp = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (resp.status === 429) {
        await sleep(1000 * (attempt + 1));
        continue;
      }

      const text = await resp.text();
      const data = (text ? JSON.parse(text) : {}) as ApiResponse;
      if (resp.status >= 400 || data.code !== 0) {
        process.stderr.write(
          `[feishu-doc] insert_table_row failed: ${data.msg} (code=${data.code})\n`,
        );
        throw new Error(`Failed to insert table row: ${data.msg} (code=${data.code})`);
      }
      break;
    }

    await sleep(50);
  }
}

async function getTableCellIds(
  accessToken: string,
  docId: string,
  tableBlockId: string,
): Promise<string[]> {
  const url = FEISHU_GET_BLOCK_URL.replace('{document_id}', docId).replace(
    '{block_id}',
    tableBlockId,
  );
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });
  const text = await resp.text();
  const data = (text ? JSON.parse(text) : {}) as ApiResponse;
  if (resp.status >= 400 || data.code !== 0) {
    throw new Error(`Failed to get table block: ${data.msg} (code=${data.code})`);
  }
  const block = (data.data as Record<string, unknown>)?.['block'] as
    | Record<string, unknown>
    | undefined;
  const table = block?.['table'] as Record<string, unknown> | undefined;
  return (table?.['cells'] as string[]) ?? [];
}

async function createTable(
  accessToken: string,
  docId: string,
  parentId: string,
  rows: string[][],
  index = -1,
): Promise<void> {
  const rowCount = rows.length;
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 1);

  const colMaxLen = new Array<number>(colCount).fill(0);
  for (const row of rows) {
    row.forEach((cell, ci) => {
      if (ci < colCount) colMaxLen[ci] = Math.max(colMaxLen[ci]!, cell.length);
    });
  }
  const totalChars = Math.max(colMaxLen.reduce((a, b) => a + b, 0), 1);
  const TABLE_WIDTH = 700;
  const MIN_COL_WIDTH = 80;
  const colWidths = colMaxLen.map(c =>
    Math.max(MIN_COL_WIDTH, Math.floor((c / totalChars) * TABLE_WIDTH)),
  );

  const initialRowCount = Math.min(rowCount, MAX_TABLE_CREATE_ROWS);
  const tableBlock: FeishuBlock = {
    block_type: 31,
    table: {
      property: {
        row_size: initialRowCount,
        column_size: colCount,
        column_width: colWidths,
      },
    },
  };

  const data = await addBlocks(accessToken, docId, parentId, [tableBlock], index);
  const children = (data.data['children'] as Array<Record<string, unknown>>) ?? [];
  const tableInfo = children[0] ?? {};
  const tableBlockId = tableInfo['block_id'] as string;
  const cellIds = (
    (tableInfo['table'] as Record<string, unknown> | undefined)?.['cells'] as
      | string[]
      | undefined
  ) ?? [];

  await fillTableCells(accessToken, docId, cellIds, rows.slice(0, initialRowCount), colCount, 0);

  if (rowCount > MAX_TABLE_CREATE_ROWS) {
    const remainingRows = rows.slice(MAX_TABLE_CREATE_ROWS);
    await insertTableRows(
      accessToken,
      docId,
      tableBlockId,
      initialRowCount,
      remainingRows.length,
    );
    const allCellIds = await getTableCellIds(accessToken, docId, tableBlockId);
    const newCellIds = allCellIds.slice(initialRowCount * colCount);
    await fillTableCells(
      accessToken,
      docId,
      newCellIds,
      remainingRows,
      colCount,
      initialRowCount,
    );
  }
}

async function createQuote(
  accessToken: string,
  docId: string,
  parentId: string,
  text: string,
  index = -1,
): Promise<void> {
  const quoteBlock: FeishuBlock = { block_type: 34, quote_container: {} };
  const data = await addBlocks(accessToken, docId, parentId, [quoteBlock], index);
  const children = (data.data['children'] as Array<Record<string, unknown>>) ?? [];
  const containerId = (children[0]?.['block_id'] as string) ?? '';

  const childrenUrl = FEISHU_BLOCK_CHILDREN_URL.replace('{document_id}', docId).replace(
    '{block_id}',
    containerId,
  );
  const childrenResp = await fetch(childrenUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30000),
  });

  const mergedText = text.replace(/\n/g, ' ').trim();
  const elements = parseInlineElements(mergedText);
  let patched = false;

  if (childrenResp.status === 200) {
    const childrenData = (await childrenResp.json()) as {
      data?: { items?: Array<{ block_id: string }> };
    };
    const items = childrenData.data?.items ?? [];
    if (items.length > 0) {
      const firstChildId = items[0]!.block_id;
      if (firstChildId) {
        const patchUrl = FEISHU_GET_BLOCK_URL.replace('{document_id}', docId).replace(
          '{block_id}',
          firstChildId,
        );
        const patchBody = {
          update_text_elements: {
            elements: elements.map(e => ({
              text_run: {
                content: e.text_run.content,
                text_element_style: e.text_run.text_element_style ?? {},
              },
            })),
          },
        };
        const patchResp = await fetch(`${patchUrl}?document_revision_id=-1`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patchBody),
          signal: AbortSignal.timeout(30000),
        });
        if (patchResp.status === 200) {
          const patchData = (await patchResp.json()) as { code: number };
          if (patchData.code === 0) patched = true;
        }
      }
    }
  }

  if (!patched) {
    const childBlock: FeishuBlock = { block_type: 2, text: { elements } };
    await addBlocks(accessToken, docId, containerId, [childBlock]);
  }
}

async function flushBatch(
  accessToken: string,
  docId: string,
  batch: FeishuBlock[],
): Promise<void> {
  const MAX_BATCH_SIZE = 50;
  for (let start = 0; start < batch.length; start += MAX_BATCH_SIZE) {
    await addBlocks(accessToken, docId, docId, batch.slice(start, start + MAX_BATCH_SIZE));
  }
}

async function writeContent(accessToken: string, docId: string, content: string): Promise<void> {
  const descriptors = parseMarkdown(content);
  let batch: FeishuBlock[] = [];

  for (const desc of descriptors) {
    if (desc.type === 'block') {
      batch.push(desc.block);
    } else if (desc.type === 'table') {
      if (batch.length > 0) {
        await flushBatch(accessToken, docId, batch);
        batch = [];
      }
      await createTable(accessToken, docId, docId, desc.rows);
    } else if (desc.type === 'quote') {
      if (batch.length > 0) {
        await flushBatch(accessToken, docId, batch);
        batch = [];
      }
      await createQuote(accessToken, docId, docId, desc.text);
    }
  }

  if (batch.length > 0) {
    await flushBatch(accessToken, docId, batch);
  }
}

// --- Public API ---

export async function createDocument(
  title: string,
  content: string,
  folderToken: string | null = null,
): Promise<{ doc_id: string; title: string; url: string }> {
  const accessToken = await requireAuth();

  let effectiveFolderToken: string;
  if (folderToken) {
    effectiveFolderToken = extractToken(folderToken);
  } else {
    const folder = getTargetFolder();
    if (!folder) {
      throw new Error(
        'No target folder configured. ' +
          'Use feishu_set_folder to set a folder, or pass folder_token directly. ' +
          "Without a folder, documents would be created in the app's internal space, " +
          'which is not accessible to users.',
      );
    }
    effectiveFolderToken = folder.folder_token;
  }

  const resp = await fetch(FEISHU_CREATE_DOC_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, folder_token: effectiveFolderToken }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
  const data = (await resp.json()) as ApiResponse;
  if (data.code !== 0) throw new Error(`Failed to create document: ${data.msg}`);

  const docInfo = (data.data['document'] as Record<string, string>) ?? {};
  const docId = docInfo['document_id'] ?? '';
  const docUrl = `https://feishu.cn/docx/${docId}`;

  await writeContent(accessToken, docId, content);
  recordDoc(docId, title, docUrl);

  return { doc_id: docId, title, url: docUrl };
}

interface PermissionError extends Error {
  isPermissionError: boolean;
}

export async function updateDocument(
  docId: string,
  content: string,
  mode = 'full',
  force = false,
): Promise<{ doc_id: string; url: string; mode: string }> {
  if (!force && !isOwnedDoc(docId)) {
    const err = new Error(
      `Document ${docId} was not created by this skill. ` +
        'Set force=true to update any document within app permission scope.',
    ) as PermissionError;
    err.isPermissionError = true;
    throw err;
  }

  const accessToken = await requireAuth();

  if (mode === 'full') {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    const childrenUrl = FEISHU_BLOCK_CHILDREN_URL.replace('{document_id}', docId).replace(
      '{block_id}',
      docId,
    );
    const batchDeleteUrl = `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/${docId}/children/batch_delete`;

    while (true) {
      const resp = await fetch(childrenUrl, { headers, signal: AbortSignal.timeout(30000) });
      if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
      const data = (await resp.json()) as ApiResponse;
      if (data.code !== 0) throw new Error(`Failed to get document children: ${data.msg}`);

      const childCount = ((data.data['items'] as unknown[]) ?? []).length;
      if (childCount === 0) break;

      let deleted = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        const delResp = await fetch(batchDeleteUrl, {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ start_index: 0, end_index: childCount }),
          signal: AbortSignal.timeout(30000),
        });
        if (delResp.status === 429) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        const delText = await delResp.text();
        const delData = (delText ? JSON.parse(delText) : {}) as ApiResponse;
        if (delResp.status >= 400 || delData.code !== 0) {
          throw new Error(`Failed to delete children: ${delData.msg} (code=${delData.code})`);
        }
        deleted = true;
        break;
      }
      if (!deleted) throw new Error('Rate limited after 4 retries on batch_delete');
    }

    await writeContent(accessToken, docId, content);
  }

  const now = new Date().toISOString().slice(0, 19);
  const docs = loadCreatedDocs().map(d =>
    d.doc_id === docId ? { ...d, updated_at: now } : d,
  );
  saveCreatedDocs(docs);

  return { doc_id: docId, url: `https://feishu.cn/docx/${docId}`, mode };
}

export function listCreatedDocs(): CreatedDoc[] {
  return loadCreatedDocs();
}

export function findDocByName(name: string): CreatedDoc | null {
  const nameLower = name.toLowerCase();
  return loadCreatedDocs().find(d => d.title?.toLowerCase().includes(nameLower)) ?? null;
}
