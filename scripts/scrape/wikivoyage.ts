import { politeFetchText } from "./http";

export type WikivoyagePage = { title: string; url: string; html: string };

export async function fetchWikivoyagePage(page: string): Promise<WikivoyagePage> {
  const params = new URLSearchParams({
    action: "parse",
    page,
    prop: "text",
    format: "json",
    formatversion: "2",
    redirects: "1",
  });
  const body = JSON.parse(await politeFetchText(`https://en.wikivoyage.org/w/api.php?${params}`));
  if (body.error) throw new Error(`Wikivoyage: ${body.error.info} (${page})`);
  const title: string = body.parse.title;
  return {
    title,
    url: `https://en.wikivoyage.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
    html: body.parse.text,
  };
}
