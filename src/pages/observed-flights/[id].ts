import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { appPath } from "../../lib/config";

export const GET: APIRoute = ({ params, redirect }) =>
  redirect(
    appPath(`/trips/observed/${encodeURIComponent(params.id ?? "")}`, env),
    301,
  );
