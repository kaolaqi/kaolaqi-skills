const BASE_URL = 'https://gitee.com/api/v5';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function getToken(): string {
  const token = process.env.GITEE_TOKEN;
  if (!token) {
    throw new Error(
      'GITEE_TOKEN 未设置。请在 https://gitee.com/profile/personal_access_tokens 创建令牌并设置环境变量。',
    );
  }
  return token;
}

export async function apiCall<T>(
  method: Method,
  path: string,
  options: {
    params?: Record<string, string | number | boolean>;
    body?: unknown;
  } = {},
): Promise<T> {
  const qs = new URLSearchParams({ access_token: getToken() });
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      qs.set(k, String(v));
    }
  }

  const url = `${BASE_URL}${path}?${qs.toString()}`;
  const fetchOptions: RequestInit = {
    method,
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json' },
  };
  if (options.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `Gitee API 错误 ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) msg += `: ${parsed.message}`;
      else if (text) msg += `: ${text}`;
    } catch {
      if (text) msg += `: ${text}`;
    }
    throw new Error(msg);
  }

  const text = await res.text();
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

export function decodeBase64(content: string): string {
  return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf-8');
}

export function encodeBase64(content: string): string {
  return Buffer.from(content, 'utf-8').toString('base64');
}
