import { getAuthHeaders, getToken } from './auth.js';
import {
  isOwnArticle,
  loadPublishedArticles,
  savePublishedArticle,
} from './dataDir.js';

const JUEJIN_API = 'https://api.juejin.cn';

interface JuejinResponse<T = unknown> {
  err_no: number;
  err_msg?: string;
  data?: T;
}

function requireToken(): string {
  const token = getToken();
  if (!token) {
    throw new Error('No token configured. Use juejin_set_token or set JUEJIN_TOKEN env var.');
  }
  return token;
}

function buildHeaders(token: string): Record<string, string> {
  return getAuthHeaders(token);
}

export async function saveDraft(params: {
  title: string;
  content: string;
  category_id: string;
  tag_ids: string[];
  cover_image?: string;
  brief_content?: string;
}): Promise<{ draft_id: string; title: string }> {
  const token = requireToken();
  const brief = params.brief_content ?? params.content.replace(/\n/g, ' ').slice(0, 100);

  const resp = await fetch(`${JUEJIN_API}/content_api/v1/article_draft/create`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({
      title: params.title,
      brief_content: brief,
      edit_type: 10,
      html_content: '',
      mark_content: params.content,
      category_id: params.category_id,
      tag_ids: params.tag_ids,
      cover_image: params.cover_image ?? '',
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await resp.json()) as JuejinResponse<{ id: string }>;
  if (data.err_no !== 0) {
    throw new Error(`Failed to create draft: ${data.err_msg}`);
  }
  return { draft_id: data.data!.id, title: params.title };
}

export async function publishArticle(params: {
  title: string;
  content: string;
  category_id: string;
  tag_ids: string[];
  cover_image?: string;
  brief_content?: string;
}): Promise<{ article_id: string; title: string; url: string }> {
  const token = requireToken();

  const draftResult = await saveDraft(params);
  const draft_id = draftResult.draft_id;

  const resp = await fetch(`${JUEJIN_API}/content_api/v1/article/publish`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({
      draft_id,
      column_ids: [],
      theme_ids: [],
      is_global_tmp: 0,
      is_paid: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await resp.json()) as JuejinResponse<{ article_id: string }>;
  if (data.err_no !== 0) {
    throw new Error(`Failed to publish: ${data.err_msg}`);
  }

  const article_id = data.data!.article_id;
  const url = `https://juejin.cn/post/${article_id}`;

  savePublishedArticle({
    article_id,
    draft_id,
    title: params.title,
    url,
    created_at: new Date().toISOString(),
  });

  return { article_id, title: params.title, url };
}

interface UserBasic {
  user_id?: string;
  user_name?: string;
  [key: string]: unknown;
}

interface ArticleInfo {
  article_id?: string;
  draft_id?: string;
  title?: string;
  view_count?: number;
  digg_count?: number;
  ctime?: string;
  [key: string]: unknown;
}

async function fetchDraftId(token: string, articleId: string): Promise<string | null> {
  const headers = buildHeaders(token);

  const userResp = await fetch(`${JUEJIN_API}/user_api/v1/user/get`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  const userData = (await userResp.json()) as JuejinResponse<{ user_basic?: UserBasic; user?: UserBasic; user_id?: string }>;
  if (userData.err_no !== 0) return null;

  const raw = userData.data ?? {};
  const user: UserBasic = raw.user_basic ?? raw.user ?? raw;
  const userId = user.user_id;
  if (!userId) return null;

  const listResp = await fetch(`${JUEJIN_API}/content_api/v1/article/query_list`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ user_id: userId, sort_type: 2, cursor: '0', limit: 100 }),
    signal: AbortSignal.timeout(15000),
  });
  const listData = (await listResp.json()) as JuejinResponse<Array<{ article_info?: ArticleInfo }>>;
  if (listData.err_no === 0) {
    for (const item of listData.data ?? []) {
      const info = item.article_info ?? {};
      if (info.article_id === articleId && info.draft_id) {
        return info.draft_id;
      }
    }
  }
  return null;
}

export async function updateArticle(params: {
  article_id: string;
  title?: string;
  content?: string;
  category_id?: string;
  tag_ids?: string[];
  cover_image?: string;
  force?: boolean;
}): Promise<{ article_id: string; title: string; url: string }> {
  const { article_id, force = false } = params;

  if (!force && !isOwnArticle(article_id)) {
    throw new Error(
      `Article ${article_id} was not published by this skill. Use force=true to override.`
    );
  }

  const token = requireToken();
  const articles = loadPublishedArticles();
  const record = articles.find((a) => a.article_id === article_id) ?? null;

  let draft_id: string;
  if (record) {
    draft_id = record.draft_id;
  } else {
    const fetched = await fetchDraftId(token, article_id);
    draft_id = fetched ?? article_id;
  }

  const payload: Record<string, unknown> = { id: draft_id };
  if (params.title) payload['title'] = params.title;
  if (params.content) {
    payload['mark_content'] = params.content;
    payload['brief_content'] = params.content.replace(/\n/g, ' ').slice(0, 100);
  }
  if (params.category_id) payload['category_id'] = params.category_id;
  if (params.tag_ids != null) payload['tag_ids'] = params.tag_ids;
  if (params.cover_image) payload['cover_image'] = params.cover_image;

  const headers = buildHeaders(token);

  const updResp = await fetch(`${JUEJIN_API}/content_api/v1/article_draft/update`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const updData = (await updResp.json()) as JuejinResponse;
  if (updData.err_no !== 0) {
    throw new Error(`Failed to update draft: ${updData.err_msg}`);
  }

  const pubResp = await fetch(`${JUEJIN_API}/content_api/v1/article/publish`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      draft_id,
      column_ids: [],
      theme_ids: [],
      is_global_tmp: 0,
      is_paid: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const pubData = (await pubResp.json()) as JuejinResponse;
  if (pubData.err_no !== 0) {
    throw new Error(`Failed to re-publish: ${pubData.err_msg}`);
  }

  const url = `https://juejin.cn/post/${article_id}`;
  return {
    article_id,
    title: params.title ?? (record?.title ?? ''),
    url,
  };
}

export async function listArticles(limit = 20): Promise<{ articles: Array<{ id: string; title: string; url: string; view_count: number; like_count: number; created_at: string | undefined }>; total: number }> {
  const token = requireToken();
  const headers = buildHeaders(token);

  const userResp = await fetch(`${JUEJIN_API}/user_api/v1/user/get`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  const userData = (await userResp.json()) as JuejinResponse<{ user_basic?: UserBasic; user?: UserBasic; user_id?: string }>;
  if (userData.err_no !== 0) {
    throw new Error('Failed to get user info');
  }

  const raw = userData.data ?? {};
  const user: UserBasic = raw.user_basic ?? raw.user ?? raw;
  const userId = user.user_id;
  if (!userId) {
    throw new Error('Could not determine user_id');
  }

  const resp = await fetch(`${JUEJIN_API}/content_api/v1/article/query_list`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ user_id: userId, sort_type: 2, cursor: '0', limit }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await resp.json()) as JuejinResponse<Array<{ article_info?: ArticleInfo }>>;
  if (data.err_no !== 0) {
    throw new Error(`Failed to list articles: ${data.err_msg}`);
  }

  const articles = (data.data ?? []).map((item) => {
    const info = item.article_info ?? {};
    return {
      id: info.article_id ?? '',
      title: info.title ?? '',
      url: `https://juejin.cn/post/${info.article_id}`,
      view_count: info.view_count ?? 0,
      like_count: info.digg_count ?? 0,
      created_at: info.ctime,
    };
  });

  return { articles, total: articles.length };
}
