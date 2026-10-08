import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { appPath } from "../../lib/config";

export const GET: APIRoute = ({ redirect }) =>
  redirect(appPath("/trips", env), 301);
