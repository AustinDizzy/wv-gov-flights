export interface RssItem {
  title: string;
  link: string;
  description: string;
  publishedAt?: string | Date | null;
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    })[character]!,
  );
}

function rssDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00Z`
    : typeof value === "string" && !value.includes("T")
      ? `${value.replace(" ", "T")}Z`
      : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toUTCString();
}

export function rssResponse({
  title,
  description,
  siteUrl,
  feedUrl,
  items,
}: {
  title: string;
  description: string;
  siteUrl: string;
  feedUrl: string;
  items: RssItem[];
}): Response {
  const itemXml = items.map((item) => {
    const publishedAt = rssDate(item.publishedAt);
    return [
      "<item>",
      `<title>${escapeXml(item.title)}</title>`,
      `<link>${escapeXml(item.link)}</link>`,
      `<guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
      `<description>${escapeXml(item.description)}</description>`,
      publishedAt ? `<pubDate>${publishedAt}</pubDate>` : "",
      "</item>",
    ].join("");
  }).join("");
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(title)}</title>`,
    `<link>${escapeXml(siteUrl)}</link>`,
    `<description>${escapeXml(description)}</description>`,
    '<language>en-us</language>',
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    itemXml,
    "</channel>",
    "</rss>",
  ].join("");

  return new Response(body, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=900",
    },
  });
}
