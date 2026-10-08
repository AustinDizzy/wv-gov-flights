import { sql } from "drizzle-orm";
import { useDatabase, type DatabaseInput } from "../db/client";
import { publicSlug, documentSourceName } from "./public-routes";
import { r2ContentRange, r2ResponseLength } from "./security";

export interface SourceDocumentRecord {
  id?: string;
  r2_key: string;
  original_filename: string;
  publication_state: string;
  source_agency?: string | null;
}

export async function findSourceDocumentByRoute(
  input: DatabaseInput,
  sourceParam: string,
  filenameParam: string,
): Promise<SourceDocumentRecord | null> {
  const db = useDatabase(input);
  if (sourceParam === "pending") {
    const [sha256, originalFilename, extra] = filenameParam.split("/");
    if (extra || !/^[a-f0-9]{64}$/i.test(sha256) || !originalFilename) return null;
    return db.get<SourceDocumentRecord>(sql`
      SELECT d.id, d.r2_key, d.original_filename, d.publication_state, NULL AS source_agency
       FROM source_documents d
       WHERE d.publication_state = 'draft'
         AND d.sha256 = ${sha256}
         AND d.original_filename = ${originalFilename}
       ORDER BY d.created_at DESC, d.id DESC LIMIT 1
    `);
  }

  if (filenameParam.includes("/")) return null;
  const candidates = await db.all<SourceDocumentRecord>(sql`
    SELECT d.id, d.r2_key, d.original_filename, d.publication_state, c.source_agency
     FROM source_documents d LEFT JOIN source_collections c ON c.id = d.collection_id
     WHERE d.original_filename = ${filenameParam}
     ORDER BY d.published_at DESC, d.id DESC
  `);
  return candidates.find((document) =>
    (publicSlug(documentSourceName(document.source_agency)) || "source") === sourceParam
  ) ?? null;
}

function responseHeaders(
  document: SourceDocumentRecord,
  object: R2Object,
  contentLength: number,
): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", "application/pdf");
  headers.set(
    "content-disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(document.original_filename)}`,
  );
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("content-length", String(contentLength));
  headers.set(
    "cache-control",
    document.publication_state === "published"
      ? "public, max-age=3600, must-revalidate"
      : "private, no-store",
  );
  return headers;
}

export async function sourceDocumentHead(
  bucket: R2Bucket,
  document: SourceDocumentRecord,
): Promise<Response> {
  const object = await bucket.head(document.r2_key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(null, {
    status: 200,
    headers: responseHeaders(document, object, object.size),
  });
}

export async function sourceDocumentGet(
  bucket: R2Bucket,
  document: SourceDocumentRecord,
  request: Request,
): Promise<Response> {
  const hasRangeRequest = request.headers.has("range");
  const object = await bucket.get(document.r2_key, {
    ...(hasRangeRequest ? { range: request.headers } : {}),
    onlyIf: request.headers,
  });
  if (!object) return new Response("Not found", { status: 404 });
  if (!("body" in object)) {
    return new Response(null, { status: 304, headers: { etag: object.httpEtag } });
  }
  const headers = responseHeaders(document, object, r2ResponseLength(object));
  const contentRange = hasRangeRequest ? r2ContentRange(object) : null;
  if (contentRange) headers.set("content-range", contentRange);
  return new Response(object.body, {
    status: contentRange ? 206 : 200,
    headers,
  });
}
