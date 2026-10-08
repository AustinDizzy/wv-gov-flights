import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDatabase } from "../../../db/client";
import { getAuthSession, isAllowedSession } from "../../../lib/auth";
import {
  findSourceDocumentByRoute,
  sourceDocumentGet,
  sourceDocumentHead,
} from "../../../lib/source-documents";

function routeSegment(value: string | undefined): string | null {
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Astro adapters may already decode a literal percent sign in a route
    // parameter. The database lookup below still requires an exact filename.
  }
  return decoded.includes("/") || decoded.includes("\\") ? null : decoded;
}

function routePath(value: string | undefined): string | null {
  if (!value) return null;
  const segments = value.split("/").map((segment) => routeSegment(segment));
  return segments.some((segment) => segment === null)
    ? null
    : segments.join("/");
}

async function sourceDocument(
  params: Record<string, string | undefined>,
  request: Request,
) {
  const source = routeSegment(params.source);
  const filename = routePath(params.filename);
  if (!source || !filename) return null;
  const document = await findSourceDocumentByRoute(
    createDatabase(env.DB),
    source,
    filename,
  );
  if (!document || document.publication_state === "published" || source === "pending") {
    return document;
  }
  const session = await getAuthSession(request, env);
  return isAllowedSession(session, env) ? document : null;
}

export const HEAD: APIRoute = async ({ params, request }) => {
  const document = await sourceDocument(params, request);
  return document
    ? sourceDocumentHead(env.FILES, document)
    : new Response("Not found", { status: 404 });
};

export const GET: APIRoute = async ({ params, request }) => {
  const document = await sourceDocument(params, request);
  return document
    ? sourceDocumentGet(env.FILES, document, request)
    : new Response("Not found", { status: 404 });
};
