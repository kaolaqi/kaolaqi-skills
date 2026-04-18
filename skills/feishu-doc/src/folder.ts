import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getDataPath } from './dataDir.js';

const TOKEN_RE = /(?:https?:\/\/[^/]+\/drive\/folder\/)?([A-Za-z0-9_-]+)$/;

interface FolderConfig {
  folder_token: string;
  folder_name: string;
}

export function extractToken(folderTokenOrUrl: string): string {
  const m = TOKEN_RE.exec(folderTokenOrUrl.trim());
  if (!m) throw new Error(`Invalid folder token or URL: ${folderTokenOrUrl}`);
  return m[1]!;
}

export function getTargetFolder(): FolderConfig | null {
  const configPath = getDataPath('config.json');
  if (!existsSync(configPath)) return null;
  try {
    const data = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    if (!data['folder_token']) return null;
    return data as unknown as FolderConfig;
  } catch {
    return null;
  }
}

export function setTargetFolder(
  folderTokenOrUrl: string,
  folderName = '',
): { status: string; folder_token: string; folder_name: string } {
  const token = extractToken(folderTokenOrUrl);
  const config: FolderConfig = { folder_token: token, folder_name: folderName };
  writeFileSync(getDataPath('config.json'), JSON.stringify(config, null, 2), 'utf-8');
  return { status: 'saved', folder_token: token, folder_name: folderName };
}
