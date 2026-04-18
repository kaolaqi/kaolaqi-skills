import { loadConfig, saveConfig } from './dataDir.js';

const JUEJIN_API = 'https://api.juejin.cn';

export function getToken(): string | undefined {
  return process.env['JUEJIN_TOKEN'] ?? loadConfig().token;
}

export function getAuthHeaders(token: string): Record<string, string> {
  return {
    Cookie: `sessionid=${token}`,
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://juejin.cn/',
    Origin: 'https://juejin.cn',
    'Content-Type': 'application/json',
  };
}

export function setToken(token: string): { success: boolean; message: string } {
  const config = loadConfig();
  config.token = token;
  saveConfig(config);
  return { success: true, message: 'Token saved. Run juejin_auth to verify.' };
}

interface UserBasic {
  user_name?: string;
  user_id?: string;
  [key: string]: unknown;
}

interface UserData {
  user_basic?: UserBasic;
  user?: UserBasic;
  user_id?: string;
  user_name?: string;
  stat?: { post_article_count?: number };
  [key: string]: unknown;
}

interface JuejinResponse {
  err_no: number;
  err_msg?: string;
  data?: UserData;
  [key: string]: unknown;
}

export async function checkConnection(): Promise<Record<string, unknown>> {
  const token = getToken();
  if (!token) {
    return {
      valid: false,
      error: 'No token configured. Use juejin_set_token or set JUEJIN_TOKEN env var.',
    };
  }
  try {
    const resp = await fetch(`${JUEJIN_API}/user_api/v1/user/get`, {
      headers: getAuthHeaders(token),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await resp.json()) as JuejinResponse;
    if (data.err_no === 0) {
      const userData = data.data ?? {};
      const user = userData.user_basic ?? userData.user ?? userData;
      const stat = userData.stat ?? {};
      return {
        valid: true,
        user_name: (user as UserBasic).user_name ?? null,
        user_id: (user as UserBasic).user_id ?? null,
        article_count: stat.post_article_count ?? 0,
        _debug_keys: Object.keys(userData),
      };
    }
    return { valid: false, error: data.err_msg ?? 'Invalid token', _debug: data };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}
