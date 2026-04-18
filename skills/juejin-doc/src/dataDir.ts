import fs from 'fs';
import os from 'os';
import path from 'path';

function getDataDir(): string {
  const dir = process.env['JUEJIN_DOC_DATA_DIR'] ?? path.join(os.homedir(), '.local', 'share', 'juejin-doc');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

interface Config {
  token?: string;
  unsplash_access_key?: string;
  [key: string]: unknown;
}

export function loadConfig(): Config {
  const file = path.join(getDataDir(), 'config.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): void {
  const file = path.join(getDataDir(), 'config.json');
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf-8');
}

export interface PublishedArticle {
  article_id: string;
  draft_id: string;
  title: string;
  url: string;
  created_at: string;
  saved_at?: string;
}

export function loadPublishedArticles(): PublishedArticle[] {
  const file = path.join(getDataDir(), 'published_articles.json');
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as PublishedArticle[];
  } catch {
    return [];
  }
}

export function savePublishedArticle(article: Omit<PublishedArticle, 'saved_at'>): void {
  const articles = loadPublishedArticles();
  if (articles.some((a) => a.article_id === article.article_id)) return;
  const record: PublishedArticle = { ...article, saved_at: new Date().toISOString() };
  articles.push(record);
  const file = path.join(getDataDir(), 'published_articles.json');
  fs.writeFileSync(file, JSON.stringify(articles, null, 2), 'utf-8');
}

export function isOwnArticle(articleId: string): boolean {
  return loadPublishedArticles().some((a) => a.article_id === articleId);
}

export function getLatestArticle(): PublishedArticle | null {
  const articles = loadPublishedArticles();
  return articles.length > 0 ? articles[articles.length - 1]! : null;
}
