const FEISHU_TENANT_TOKEN_URL =
  'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';

interface TokenResponse {
  code: number;
  msg: string;
  tenant_access_token: string;
  expire: number;
}

let cachedToken = '';
let cachedExpiresAt = 0;

function getAppCredentials(): { appId: string; appSecret: string } {
  const appId = process.env['FEISHU_APP_ID'] ?? '';
  const appSecret = process.env['FEISHU_APP_SECRET'] ?? '';
  if (!appId || !appSecret) {
    throw new Error(
      'FEISHU_APP_ID and FEISHU_APP_SECRET environment variables are required. ' +
        'Create a Feishu app at https://open.feishu.cn/app and set these variables.',
    );
  }
  return { appId, appSecret };
}

export async function getTenantAccessToken(): Promise<string> {
  if (cachedToken && Date.now() / 1000 < cachedExpiresAt - 60) {
    return cachedToken;
  }

  const { appId, appSecret } = getAppCredentials();
  const resp = await fetch(FEISHU_TENANT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
  const data = (await resp.json()) as TokenResponse;
  if (data.code !== 0) throw new Error(`Failed to get tenant_access_token: ${data.msg}`);

  cachedToken = data.tenant_access_token;
  cachedExpiresAt = Date.now() / 1000 + (data.expire || 7200);
  return cachedToken;
}

export async function requireAuth(): Promise<string> {
  return getTenantAccessToken();
}

export async function checkConnection(): Promise<{ status: string; message: string }> {
  await getTenantAccessToken();
  return { status: 'connected', message: 'App credentials are valid.' };
}
