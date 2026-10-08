import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDatabase } from "../db/client";
import { absoluteAppUrl } from "../lib/config";
import { listTrips } from "../lib/db/public";
import { tripRoute } from "../lib/public-routes";
import { rssResponse } from "../lib/rss";

export const GET: APIRoute = async () => {
  const siteUrl = absoluteAppUrl("/", env);
  const feedUrl = absoluteAppUrl("/trips.rss", env);
  const result = await listTrips(
    createDatabase(env.DB),
    new URL(absoluteAppUrl("/trips", env)),
  );

  return rssResponse({
    title: "Golden Dome Airways — New trips",
    description: "The newest published West Virginia state aircraft trip records.",
    siteUrl,
    feedUrl,
    items: result.items.map((trip) => ({
      title: `${trip.tail_no ?? "State aircraft"} on ${trip.report_date}: ${trip.raw_route}`,
      link: absoluteAppUrl(
        tripRoute({
          id: trip.id,
          tailNo: trip.tail_no,
          reportDate: trip.report_date,
        }),
        env,
      ),
      description: [
        trip.department,
        trip.division,
        trip.printed_passengers,
      ].filter(Boolean).join(" · "),
      publishedAt: trip.report_date,
    })),
  });
};
