import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createAuth } from "../../../lib/auth";

export const ALL: APIRoute = async ({ request }) => createAuth(env).handler(request);
