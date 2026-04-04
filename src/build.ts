import { join } from "@std/path";
import { escape } from "@std/html";
import { copy, ensureDir } from "@std/fs";
import {
  DIST_DIR,
  type FeedItem,
  type FeedMeta,
  FEEDS_DIR,
  getMetaPath,
} from "./utils.ts";

interface FeedWithItems {
  id: string;
  meta: FeedMeta;
  items: FeedItem[];
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function dateValue(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortItems(items: FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => {
    const dateDiff = dateValue(b.pubDate) - dateValue(a.pubDate);
    if (dateDiff !== 0) return dateDiff;
    return a.title.localeCompare(b.title);
  });
}

function feedTitle(feed: FeedWithItems): string {
  return feed.meta.title || feed.meta.url;
}

function renderEntry(item: FeedItem, feedPath?: string): string {
  const title = escape(item.title || "untitled");
  const feedName = item.feedTitle ? escape(item.feedTitle) : "Unknown feed";
  const published = escape(formatDate(item.pubDate));
  const updated = item.updateDate && item.updateDate !== item.pubDate
    ? `<span>Updated ${escape(formatDate(item.updateDate))}</span>`
    : "";

  const itemTitle = item.url
    ? `<a href="${escape(item.url)}">${title}</a>`
    : title;
  const feedLabel = feedPath
    ? `<a class="feed-pill" href="${feedPath}">${feedName}</a>`
    : `<span class="feed-pill">${feedName}</span>`;

  return `
    <article class="entry">
      <h2>${itemTitle}</h2>
      <p class="meta">
        <span>Published ${published}</span>
        ${updated}
        ${feedLabel}
      </p>
    </article>
  `;
}

function renderFeedNav(
  feeds: FeedWithItems[],
  currentFeedId?: string,
  renderedAt: Date,
): string {
  const allEntriesCurrent = currentFeedId ? "" : ' aria-current="page"';

  const items = feeds
    .map((feed) => {
      const href = currentFeedId ? `${feed.id}.html` : `feeds/${feed.id}.html`;
      const current = currentFeedId === feed.id ? ' aria-current="page"' : "";
      return `<li><a${current} href="${href}">${
        escape(feedTitle(feed))
      }</a> <span>${feed.items.length}</span></li>`;
    })
    .join("");

  return `
    <section class="feeds">
      <h2>Feeds</h2>
      <ul>
        <li><a${allEntriesCurrent} href="/">All entries</a> <span>${
    feeds.reduce((sum, feed) => sum + feed.items.length, 0)
  }</span></li>
        ${items}
      </ul>
      <p><small>${formatDate(renderedAt.toISOString())}</small></p>
    </section>
  `;
}

function renderPage(args: {
  title: string;
  heading: string;
  intro: string;
  content: string;
  feeds: FeedWithItems[];
  renderedAt: Date;
  currentFeedId?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/style.css" />
    <title>${escape(args.title)}</title>
  </head>
  <body>
    <div class="shell">
      <header>
        <h1>${escape(args.heading)}</h1>
        <p class="lede">${escape(args.intro)}</p>
      </header>
      <main class="layout">
        ${renderFeedNav(args.feeds, args.currentFeedId, args.renderedAt)}
        <section class="entries">
          ${args.content}
        </section>
      </main>
    </div>
  </body>
</html>`;
}

async function readFeeds(): Promise<FeedWithItems[]> {
  try {
    await Deno.stat(FEEDS_DIR);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return [];
    }
    throw error;
  }

  const feeds: FeedWithItems[] = [];

  for await (const entry of Deno.readDir(FEEDS_DIR)) {
    if (!entry.isDirectory) continue;

    const feedDir = join(FEEDS_DIR, entry.name);
    const meta = JSON.parse(
      await Deno.readTextFile(getMetaPath(feedDir)),
    ) as FeedMeta;
    const items: FeedItem[] = [];

    for await (const child of Deno.readDir(feedDir)) {
      if (
        !child.isFile || !child.name.endsWith(".json") ||
        child.name === "meta.json"
      ) {
        continue;
      }

      const itemPath = join(feedDir, child.name);
      const item = JSON.parse(await Deno.readTextFile(itemPath)) as FeedItem;
      items.push(item);
    }

    feeds.push({
      id: entry.name,
      meta,
      items: sortItems(items),
    });
  }

  return feeds.sort((a, b) => feedTitle(a).localeCompare(feedTitle(b)));
}

async function writeSite(feeds: FeedWithItems[]) {
  await Deno.remove(DIST_DIR, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });

  await ensureDir(join(DIST_DIR, "feeds"));
  await copy("src/style.css", join(DIST_DIR, "style.css"));

  const allEntries = sortItems(
    feeds.flatMap((feed) =>
      feed.items.map((item) => ({
        ...item,
        feedTitle: item.feedTitle || feedTitle(feed),
      }))
    ),
  );

  const renderedAt = new Date();

  const indexContent = allEntries.length
    ? allEntries
      .map((item) => {
        const feed = feeds.find((candidate) =>
          candidate.meta.url === item.feedUrl
        );
        const path = feed ? `feeds/${feed.id}.html` : undefined;
        return renderEntry(item, path);
      })
      .join("")
    : `<p class="empty">No feed entries yet. Run the fetch step first.</p>`;

  const indexHtml = renderPage({
    title: "statirss",
    heading: "statirss",
    intro: `${allEntries.length} entries across ${feeds.length} feeds.`,
    content: indexContent,
    feeds,
    renderedAt,
  });
  await Deno.writeTextFile(join(DIST_DIR, "index.html"), indexHtml);

  for (const feed of feeds) {
    const content = feed.items.length
      ? feed.items.map((item) => renderEntry(item)).join("")
      : `<p class="empty">This feed has no stored entries yet.</p>`;

    const html = renderPage({
      title: feedTitle(feed),
      heading: feedTitle(feed),
      intro: feed.meta.url,
      content,
      feeds,
      renderedAt,
      currentFeedId: feed.id,
    });

    await Deno.writeTextFile(join(DIST_DIR, "feeds", `${feed.id}.html`), html);
  }
}

async function main() {
  const feeds = await readFeeds();
  await writeSite(feeds);
  console.log(`site built: ${feeds.length} feeds -> ${DIST_DIR}/`);
}

if (import.meta.main) {
  await main();
}
