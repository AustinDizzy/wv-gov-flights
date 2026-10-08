import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDatabase } from "../../../db/client";
import { appPath } from "../../../lib/config";
import { findPublishedTripIdsByTailAndDate } from "../../../lib/db/public-queries";

export const GET: APIRoute = async ({ params, redirect, rewrite }) => {
  const result = await findPublishedTripIdsByTailAndDate(
    createDatabase(env.DB),
    params.tail,
    params.date,
  );
  if (result.length === 1) {
    return rewrite(appPath(`/trips/${result[0].id}`, env));
  }
  const query = new URLSearchParams({
    aircraft: params.tail ?? "",
    startDate: params.date ?? "",
    endDate: params.date ?? "",
  });
  return redirect(`${appPath("/trips", env)}?${query}`, 301);
};
