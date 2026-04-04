import { join } from "@std/path";

export const FEEDS_DIR = "feeds";
export const DIST_DIR = "dist";

export async function hash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getFeedDir(url: string): Promise<string> {
  const h = await hash(url);
  return join(FEEDS_DIR, h);
}

export function getMetaPath(feedDir: string): string {
  return join(feedDir, "meta.json");
}

export interface FeedMeta {
  url: string;
  title?: string;
  etag?: string;
  lastModified?: string;
  lastFetchedAt?: string;
}

export interface FeedItem {
  guid: string;
  title: string;
  url: string;
  pubDate: string;

  updateDate?: string;
  feedTitle?: string;
  feedUrl?: string;
}
