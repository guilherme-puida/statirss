import { ensureDir } from "@std/fs";
import { getFeedDir, getMetaPath, type FeedMeta } from "./utils.ts";

async function main() {
  const url = Deno.args[0];
  if (!url) {
    console.error("usage: deno task add <url>");
    Deno.exit(1);
  }

  const feedDir = await getFeedDir(url);
  await ensureDir(feedDir);

  const metaPath = getMetaPath(feedDir);
  const meta: FeedMeta = { url };

  await Deno.writeTextFile(metaPath, JSON.stringify(meta, null, 2));
  console.log(`feed added: ${url} -> ${feedDir}`);
}

if (import.meta.main) {
  await main()
}
