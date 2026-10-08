import { sql } from "drizzle-orm";
import { useDatabase, type DatabaseInput } from "../db/client";

export function publicSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

// Retain recognition of links emitted by the first Astro version while the
// canonical route returns to the legacy Next.js slug format above.
function previousPublicSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function aircraftRoute(tailNo: string): string {
  return `/aircraft/${encodeURIComponent(tailNo.toLocaleUpperCase("en-US"))}`;
}

export function passengerRoute(name: string): string {
  return `/passengers/${publicSlug(name)}`;
}

export function normalizeSourceAgency(
  sourceAgency: string | null | undefined,
): string | null {
  const normalized = sourceAgency?.trim().replace(/\bWest Virginia\b/gi, "WV");
  return normalized || null;
}

export function documentSourceName(sourceAgency: string | null | undefined): string {
  return normalizeSourceAgency(sourceAgency) || "WV Public Records";
}

export function documentRoute({
  sourceAgency,
  originalFilename,
}: {
  sourceAgency: string | null | undefined;
  originalFilename: string;
}): string {
  const source = publicSlug(documentSourceName(sourceAgency)) || "source";
  return `/datasources/${source}/${encodeURIComponent(originalFilename)}`;
}

export function documentStorageKey({
  sourceAgency,
  originalFilename,
}: {
  sourceAgency: string | null | undefined;
  originalFilename: string;
}): string {
  const source = publicSlug(documentSourceName(sourceAgency)) || "source";
  return `datasources/${source}/${originalFilename}`;
}

export function pendingDocumentStorageKey(sha256: string, originalFilename: string): string {
  return `datasources/pending/${sha256}/${originalFilename}`;
}

export function pendingDocumentRoute(
  sha256: string,
  originalFilename: string,
): string {
  return `/datasources/pending/${encodeURIComponent(sha256)}/${encodeURIComponent(originalFilename)}`;
}

export function tripRoute({
  id,
  tailNo,
  reportDate,
}: {
  id: string;
  tailNo: string | null | undefined;
  reportDate: string;
}): string {
  if (tailNo && /^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return `/trips/${encodeURIComponent(tailNo.toLocaleUpperCase("en-US"))}/${reportDate}`;
  }
  return `/trips/${encodeURIComponent(id)}`;
}

export async function findPersonByPublicParam(
  input: DatabaseInput,
  param: string,
): Promise<{ id: string; canonical_name: string; normalized_name: string } | null> {
  const db = useDatabase(input);
  const byId = await db.get<{
    id: string;
    canonical_name: string;
    normalized_name: string;
  }>(sql`
    SELECT id, canonical_name, normalized_name FROM people WHERE id = ${param}
  `);
  if (byId) return byId;

  const people = await db.all<{
    id: string;
    canonical_name: string;
    normalized_name: string;
  }>(sql`
    SELECT id, canonical_name, normalized_name FROM people ORDER BY canonical_name, id
  `);
  return people.find((person) => publicSlug(person.canonical_name) === param) ??
    people.find((person) => previousPublicSlug(person.canonical_name) === param) ??
    null;
}
