import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CACHE_DIR, REQUEST_DELAY_MS, USER_AGENT } from "./config";

let lastRequestAt = 0;

async function waitTurn() {
  const wait = lastRequestAt + REQUEST_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

// One request at a time, at most one per REQUEST_DELAY_MS, and each response is cached on disk
// so a rerun never fetches the same URL twice. Responses that fail `isUsable` throw and are not
// cached, so a rerun tries them again.
export async function politeFetchText(
  url: string,
  init: RequestInit = {},
  isUsable: (text: string) => boolean = () => true,
): Promise<string> {
  const key = createHash("sha256").update(url + String(init.body ?? "")).digest("hex");
  const cacheFile = path.join(CACHE_DIR, `${key}.txt`);
  try {
    return await readFile(cacheFile, "utf8");
  } catch {
    // Not cached yet.
  }

  await waitTurn();
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, ...init.headers },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const text = await response.text();
  if (!isUsable(text)) throw new Error(`Unusable response for ${url}: ${text.slice(0, 200)}`);
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cacheFile, text, "utf8");
  return text;
}
