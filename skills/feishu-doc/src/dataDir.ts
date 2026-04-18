import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync, chmodSync } from 'fs';

const dataHome = process.env['XDG_DATA_HOME'] ?? join(homedir(), '.local', 'share');
const DATA_DIR = join(dataHome, 'feishu-doc');

export function getDataPath(filename: string): string {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    try {
      chmodSync(DATA_DIR, 0o700);
    } catch {
      // Ignore chmod errors on non-POSIX systems
    }
  }
  return join(DATA_DIR, filename);
}
