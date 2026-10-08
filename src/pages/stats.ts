import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { absoluteAppUrl } from "../lib/config";

export const GET: APIRoute = () => Response.redirect(absoluteAppUrl("/statistics", env), 301);