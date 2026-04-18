import { getAuthHeaders, getToken } from './auth.js';

const JUEJIN_API = 'https://api.juejin.cn';

interface CategoryBrief {
  category_id: string;
  category_name: string;
  [key: string]: unknown;
}

interface TagItem {
  tag_id: string;
  tag_name: string;
  [key: string]: unknown;
}

interface JuejinResponse<T> {
  err_no: number;
  err_msg?: string;
  data?: T;
}

export async function getCategories(): Promise<{ categories: Array<{ id: string; name: string; tags: Array<{ id: string; name: string }> }> }> {
  const token = getToken();
  if (!token) {
    throw new Error('No token configured. Use juejin_set_token first.');
  }
  const headers = getAuthHeaders(token);

  const resp = await fetch(`${JUEJIN_API}/tag_api/v1/query_category_briefs`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  const data = (await resp.json()) as JuejinResponse<CategoryBrief[]>;
  if (data.err_no !== 0) {
    throw new Error(`Failed to get categories: ${data.err_msg}`);
  }

  const categories = [];
  for (const cat of data.data ?? []) {
    const tagsResp = await fetch(`${JUEJIN_API}/tag_api/v1/query_tag_list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ category_id: cat.category_id, cursor: '0', limit: 50, key_word: '' }),
      signal: AbortSignal.timeout(10000),
    });
    const tagsData = (await tagsResp.json()) as JuejinResponse<TagItem[]>;
    const tags = (tagsData.data ?? []).map((t) => ({ id: t.tag_id, name: t.tag_name }));
    categories.push({ id: cat.category_id, name: cat.category_name, tags });
  }

  return { categories };
}
