import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDatabase } from "../db/client";
import { absoluteAppUrl } from "../lib/config";
import { listDataSourcesPage } from "../lib/db/public-queries";
import {
  documentRoute,
  documentSourceName,
} from "../lib/public-routes";
import { rssResponse } from "../lib/rss";

export const GET: APIRoute = async () => {
  const siteUrl = absoluteAppUrl("/data-sources", env);
  const feedUrl = absoluteAppUrl("/data-sources.rss", env);
  const documents = await listDataSourcesPage(createDatabase(env.DB));
  const newestDocuments = [...documents.results]
    .sort((left, right) =>
      String(right.published_at ?? right.response_date ?? right.criteria_end ?? "")
        .localeCompare(String(left.published_at ?? left.response_date ?? left.criteria_end ?? ""))
      || right.id.localeCompare(left.id)
    )
    .slice(0, 25);

  return rssResponse({
    title: "Golden Dome Airways — New data sources",
    description: "The newest public-record source documents published by Golden Dome Airways.",
    siteUrl,
    feedUrl,
    items: newestDocuments.map((document) => ({
      title: document.title ?? document.original_filename,
      link: absoluteAppUrl(
        documentRoute({
          sourceAgency: document.source_agency,
          originalFilename: document.original_filename,
        }),
        env,
      ),
      description: `${documentSourceName(document.source_agency)} · ${document.original_filename}${document.trip_count > 0 ? ` · ${document.trip_count} trips` : ""}`,
      publishedAt: document.published_at
        ?? document.response_date
        ?? document.criteria_end,
    })),
  });
};
