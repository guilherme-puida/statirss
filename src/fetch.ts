import { join } from "@std/path";
import { parseFeed } from "@mikaelporttila/rss";
import {
  type FeedItem,
  type FeedMeta,
  FEEDS_DIR,
  getMetaPath,
  hash,
} from "./utils.ts";

async function fetchFeed(meta: FeedMeta, feedDir: string) {
  console.log(`${meta.url}: fetching...`);
  try {
    const headers = new Headers();
    if (meta.etag) {
      headers.set("If-None-Match", meta.etag);
    }
    if (meta.lastModified) {
      headers.set("If-Modified-Since", meta.lastModified);
    }

    const response = await fetch(meta.url, { headers });

    if (response.status === 304) {
      console.log(`${meta.url}: not modified`);
      return;
    }

    if (!response.ok) {
      console.error(`${meta.url}: failed to fetch: ${response.statusText}`);
      return;
    }

    meta.etag = response.headers.get("etag") ?? undefined;
    meta.lastModified = response.headers.get("last-modified") ?? undefined;

    const xml = await response.text();
    const feed = await parseFeed(xml);

    meta.title = feed.title?.value || meta.title || "untitled";
    meta.lastFetchedAt = new Date().toISOString();

    const metaPath = getMetaPath(feedDir);
    await Deno.writeTextFile(metaPath, JSON.stringify(meta, null, 2));

    for (const entry of feed.entries) {
      const guid = entry.id || entry.links[0]?.href || entry.title?.value;
      if (!guid) continue;

      const itemHash = await hash(guid);
      const itemPath = join(feedDir, itemHash + ".json");

      const item: FeedItem = {
        guid,
        title: entry.title?.value || "untitled",
        url: entry.links[0]?.href || "",
        pubDate: (entry.published || entry.updated || new Date()).toISOString(),
        updateDate: entry.updated?.toISOString(),
        feedTitle: meta.title,
        feedUrl: meta.url,
      };

      await Deno.writeTextFile(itemPath, JSON.stringify(item, null, 2));
    }

    console.log(`${meta.url}: fetched ${feed.entries.length} entries`);
  } catch (error) {
    console.error(`${meta.url}: something went wrong`, error);
  }
}

async function main() {
  try {
    await Deno.stat(FEEDS_DIR);
  } catch {
    console.log("no feeds found");
    return;
  }

  const feeds: { meta: FeedMeta; feedDir: string }[] = [];

  for await (const entry of Deno.readDir(FEEDS_DIR)) {
    if (!entry.isDirectory) continue;
    const feedDir = join(FEEDS_DIR, entry.name);
    const metaPath = getMetaPath(feedDir);
    const metaText = await Deno.readTextFile(metaPath);
    const meta = JSON.parse(metaText) as FeedMeta;
    feeds.push({ meta, feedDir });
  }

  const queue = feeds[Symbol.iterator]();
  const worker = async () => {
    for (const { meta, feedDir } of queue) {
      await fetchFeed(meta, feedDir);
    }
  };

  const concurrency = 5;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, feeds.length) }, worker),
  );
}

if (import.meta.main) {
  await main();
}
