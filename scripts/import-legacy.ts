#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { observedDistanceMetres } from "../src/lib/flights/distance";
import { documentStorageKey } from "../src/lib/public-routes";

interface Args {
  database: string;
  datasources?: string;
  flightPaths: string[];
  output: string;
  applyLocal: boolean;
}

interface LegacyAircraft {
  tail_no: string;
  name: string;
  status: string;
  rate: number;
  icao_no: string;
}

interface LegacyTrip {
  id: number;
  date: string;
  tail_no: string;
  route: string;
  passengers: string | null;
  department: string;
  division: string | null;
  flight_hours: number;
  comments: string | null;
  justification_lwb: string | null;
  flight_path: string | null;
}

interface LegacyPath {
  id: number;
  date: string;
  tail_no: string;
  route: string | null;
  flight_hours: number;
  flight_path: string;
}

interface LegacySource {
  id: number;
  name: string;
  source: string;
  date: string;
  path: string;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const database = get("--database");
  if (!database) {
    throw new Error(
      "Usage: npm run import:legacy -- --database /path/data.db [--datasources /path/public] [--flight-paths /path/flights.sql ...] [--output legacy-import] [--apply-local]",
    );
  }
  const flightPaths = argv.flatMap((value, index) =>
    value === "--flight-paths" && argv[index + 1]
      ? [resolve(argv[index + 1])]
      : [],
  );
  return {
    database: resolve(database),
    datasources: get("--datasources") ? resolve(get("--datasources")!) : undefined,
    flightPaths,
    output: resolve(get("--output") || "legacy-import"),
    applyLocal: argv.includes("--apply-local"),
  };
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function sql(value: string | number | null): string {
  if (value == null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${value.replaceAll("'", "''")}'`;
}

function wktToFeature(wkt: string, properties: Record<string, unknown>) {
  const match = wkt.trim().match(/^LINESTRING\s*\((.+)\)$/i);
  if (!match) throw new Error(`Unsupported WKT: ${wkt.slice(0, 80)}`);
  const coordinates = match[1].split(",").map((pair) => {
    const [longitude, latitude] = pair.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new Error(`Invalid WKT coordinate: ${pair}`);
    }
    return [longitude, latitude];
  });
  if (coordinates.length === 1) {
    coordinates.push([...coordinates[0]]);
    properties = { ...properties, legacy_single_point: true };
  }
  return {
    type: "Feature",
    properties,
    geometry: { type: "LineString", coordinates },
  };
}

function passengerNames(value: string | null): string[] {
  if (!value) return [];
  return value.split(/,|;|\||\n/).map((item) => item.trim()).filter(Boolean);
}

function routeStops(value: string): string[] {
  return value.split(/\s*(?:-|→|\bto\b|\/)\s*/i).map((item) => item.trim()).filter(Boolean);
}

function openLegacy(path: string): { db: DatabaseSync; temporary: boolean } {
  if (extname(path).toLocaleLowerCase() !== ".sql") {
    return { db: new DatabaseSync(path, { readOnly: true }), temporary: false };
  }
  const contents = readFileSync(path, "utf8").replace(
    /CREATE VIRTUAL TABLE IF NOT EXISTS trips_fts USING fts5\([\s\S]*?\);\s*INSERT INTO trips_fts\([\s\S]*?;\s*/i,
    "",
  );
  const db = new DatabaseSync(":memory:");
  db.exec(contents);
  return { db, temporary: true };
}

function readLegacyPaths(path: string): LegacyPath[] {
  const { db } = openLegacy(path);
  try {
    return db.prepare("SELECT * FROM flight_paths ORDER BY id").all() as unknown as LegacyPath[];
  } finally {
    db.close();
  }
}

function uniquePaths(paths: LegacyPath[]): LegacyPath[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = `${path.tail_no}\u0000${path.date}\u0000${path.flight_path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.output, { recursive: true });
  const { db } = openLegacy(args.database);
  const aircraft = db.prepare("SELECT * FROM aircraft ORDER BY tail_no").all() as unknown as LegacyAircraft[];
  const trips = db.prepare("SELECT * FROM trips ORDER BY id").all() as unknown as LegacyTrip[];
  const canonicalPaths = db.prepare("SELECT * FROM flight_paths ORDER BY id").all() as unknown as LegacyPath[];
  const sources = db.prepare("SELECT * FROM datasources ORDER BY id").all() as unknown as LegacySource[];
  const sourceLinks = db.prepare("SELECT * FROM datasource_trips ORDER BY datasource_id, trip_id").all() as unknown as Array<{ datasource_id: number; trip_id: number }>;
  db.close();
  const supplementalPaths = args.flightPaths.flatMap(readLegacyPaths);
  const paths = uniquePaths([...canonicalPaths, ...supplementalPaths]);

  const statements = ["PRAGMA foreign_keys = ON;"];
  const aircraftIds = new Map<string, string>();
  for (const item of aircraft) {
    const id = stableId("aircraft", item.tail_no.toLocaleLowerCase());
    aircraftIds.set(item.tail_no.toLocaleLowerCase(), id);
    statements.push(
      `INSERT OR REPLACE INTO aircraft (id, tail_no, display_name, icao_no, active, hourly_cost_cents)
       VALUES (${sql(id)}, ${sql(item.tail_no)}, ${sql(item.name)}, ${sql(item.icao_no)}, ${item.status === "active" ? 1 : 0}, ${Math.round(item.rate * 100)});`,
    );
  }

  const uploadManifest: Array<{
    source: string;
    r2_key: string;
    sha256: string;
    byte_size: number;
  }> = [];
  const sourceDocumentIds = new Map<number, string>();
  const missingDocuments: LegacySource[] = [];
  for (const source of sources) {
    const localPath = args.datasources ? resolve(args.datasources, source.path) : "";
    const available = Boolean(localPath && existsSync(localPath));
    if (!available) missingDocuments.push(source);
    const bytes = available ? readFileSync(localPath) : Buffer.from(`missing:${source.path}`);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const collectionId = stableId("collection", `legacy:${source.id}`);
    const documentId = stableId("document", `legacy:${source.id}:${sha256}`);
    sourceDocumentIds.set(source.id, documentId);
    const originalFilename = basename(source.path);
    const r2Key = documentStorageKey({
      sourceAgency: source.source,
      originalFilename,
    });
    statements.push(
      `INSERT OR REPLACE INTO source_collections
       (id, title, source_agency, response_date, notes)
       VALUES (${sql(collectionId)}, ${sql(source.name)}, ${sql(source.source)}, ${sql(source.date)}, 'Imported from legacy source metadata');`,
      `INSERT OR REPLACE INTO source_documents
       (id, collection_id, sha256, original_filename, byte_size, r2_key, publication_state, published_at)
       VALUES (${sql(documentId)}, ${sql(collectionId)}, ${sql(sha256)}, ${sql(originalFilename)},
         ${available ? statSync(localPath).size : 0}, ${sql(r2Key)}, 'published', CURRENT_TIMESTAMP);`,
    );
    if (available) uploadManifest.push({ source: localPath, r2_key: r2Key, sha256, byte_size: statSync(localPath).size });
  }

  const tripIds = new Map<number, string>();
  const observedGeometryKeys = new Set<string>();
  let linkedPathCount = 0;
  for (const trip of trips) {
    const tripId = stableId("trip", `legacy:${trip.id}`);
    tripIds.set(trip.id, tripId);
    const aircraftId = aircraftIds.get(trip.tail_no.toLocaleLowerCase()) ?? null;
    statements.push(
      `INSERT OR REPLACE INTO trips
       (id, legacy_id, report_date, aircraft_id, raw_route, department, division,
        printed_passengers, flight_hours, comments, justification,
        estimated_cost_cents, publication_state, published_at)
       VALUES (${sql(tripId)}, ${trip.id}, ${sql(trip.date)}, ${sql(aircraftId)}, ${sql(trip.route)},
         ${sql(trip.department)}, ${sql(trip.division || null)}, ${sql(trip.passengers)},
         ${trip.flight_hours}, ${sql(trip.comments || null)}, ${sql(trip.justification_lwb)},
         ${aircraftId ? `(SELECT CAST(ROUND(hourly_cost_cents * ${trip.flight_hours}) AS INTEGER) FROM aircraft WHERE id = ${sql(aircraftId)})` : "NULL"},
         'published', CURRENT_TIMESTAMP);`,
    );
    for (const [position, stop] of routeStops(trip.route).entries()) {
      statements.push(
        `INSERT OR IGNORE INTO trip_route_stops (id, trip_id, position, raw_label)
         VALUES (${sql(stableId("stop", `${tripId}:${position}:${stop}`))}, ${sql(tripId)}, ${position}, ${sql(stop)});`,
      );
    }
    for (const [position, printedName] of passengerNames(trip.passengers).entries()) {
      const normalized = printedName.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
      const personId = stableId("person", normalized);
      statements.push(
        `INSERT OR IGNORE INTO people (id, canonical_name, normalized_name)
         VALUES (${sql(personId)}, ${sql(printedName)}, ${sql(normalized)});`,
        `INSERT OR IGNORE INTO trip_people (trip_id, person_id, position, printed_name)
         VALUES (${sql(tripId)}, ${sql(personId)}, ${position}, ${sql(printedName)});`,
      );
    }
    statements.push(
      `INSERT OR REPLACE INTO trip_search
       (id, trip_id, route, passengers, department, division, comments, justification)
       VALUES ((SELECT id FROM trip_search WHERE trip_id = ${sql(tripId)}), ${sql(tripId)},
         ${sql(trip.route)}, ${sql(trip.passengers || "")}, ${sql(trip.department)},
         ${sql(trip.division || "")}, ${sql(trip.comments || "")}, ${sql(trip.justification_lwb || "")});`,
    );
    if (trip.flight_path && aircraftId) {
      const feature = wktToFeature(trip.flight_path, { legacy_trip_id: trip.id });
      const geometry = JSON.stringify(feature);
      const key = `${trip.tail_no}:${trip.date}:${trip.flight_path}`;
      observedGeometryKeys.add(key);
      const flightId = stableId("flight", `legacy-trip:${trip.id}`);
      const start = `${trip.date}T12:00:00.000Z`;
      const end = new Date(Date.parse(start) + trip.flight_hours * 3_600_000).toISOString();
      statements.push(
        `INSERT OR IGNORE INTO observed_flights
         (id, aircraft_id, provider, provider_flight_id, started_at_utc, ended_at_utc,
          duration_seconds, geometry_json, point_count, distance_metres, geometry_source, state)
         VALUES (${sql(flightId)}, ${sql(aircraftId)}, 'legacy', ${sql(`trip:${trip.id}`)}, ${sql(start)}, ${sql(end)},
          ${Math.round(trip.flight_hours * 3600)}, ${sql(geometry)}, ${feature.geometry.coordinates.length},
          ${observedDistanceMetres(geometry)}, 'provider', 'linked');`,
        `INSERT OR IGNORE INTO trip_flight_links
         (id, trip_id, observed_flight_id, note)
         VALUES (${sql(stableId("link", `${tripId}:${flightId}`))}, ${sql(tripId)}, ${sql(flightId)}, 'Legacy association');`,
      );
      linkedPathCount += 1;
    }
  }

  for (const link of sourceLinks) {
    const tripId = tripIds.get(link.trip_id);
    const documentId = sourceDocumentIds.get(link.datasource_id);
    if (!tripId || !documentId) continue;
    statements.push(
      `INSERT OR IGNORE INTO trip_sources
       (id, trip_id, source_document_id)
       VALUES (${sql(stableId("source", `${tripId}:${documentId}`))}, ${sql(tripId)}, ${sql(documentId)});`,
    );
  }

  let unmatchedPathCount = 0;
  for (const path of paths) {
    const aircraftId = aircraftIds.get(path.tail_no.toLocaleLowerCase());
    if (!aircraftId) continue;
    const key = `${path.tail_no}:${path.date}:${path.flight_path}`;
    if (observedGeometryKeys.has(key)) continue;
    const feature = wktToFeature(path.flight_path, { legacy_flight_path_id: path.id, route: path.route });
    const geometry = JSON.stringify(feature);
    const pathSignature = `${path.tail_no}:${path.date}:${path.flight_path}`;
    const flightId = stableId("flight", `legacy-unmatched:${pathSignature}`);
    const start = `${path.date}T12:00:00.000Z`;
    const end = new Date(Date.parse(start) + path.flight_hours * 3_600_000).toISOString();
    statements.push(
      `INSERT OR IGNORE INTO observed_flights
       (id, aircraft_id, provider, provider_flight_id, started_at_utc, ended_at_utc,
        duration_seconds, geometry_json, point_count, distance_metres, geometry_source, state)
       VALUES (${sql(flightId)}, ${sql(aircraftId)}, 'legacy', ${sql(`flight-path:${stableId("path", pathSignature)}`)},
        ${sql(start)}, ${sql(end)}, ${Math.round(path.flight_hours * 3600)}, ${sql(geometry)},
        ${feature.geometry.coordinates.length}, ${observedDistanceMetres(geometry)}, 'provider', 'unmatched');`,
    );
    unmatchedPathCount += 1;
  }
  const orphanTrips = trips.filter((trip) => !aircraftIds.has(trip.tail_no.toLocaleLowerCase())).map((trip) => trip.id);
  const orphanLinks = sourceLinks.filter((link) => !tripIds.has(link.trip_id) || !sourceDocumentIds.has(link.datasource_id));
  const duplicateGroups = dbSafeDuplicates(trips);
  const report = {
    source_database: args.database,
    counts: {
      aircraft: aircraft.length,
      trips: trips.length,
      source_documents: sources.length,
      source_links: sourceLinks.length,
      linked_trip_paths: linkedPathCount,
      unmatched_observed_flights: unmatchedPathCount,
      canonical_flight_paths: canonicalPaths.length,
      supplemental_flight_paths: supplementalPaths.length,
      unique_flight_paths: paths.length,
    },
    totals: {
      flight_hours: Number(trips.reduce((sum, trip) => sum + trip.flight_hours, 0).toFixed(4)),
      invoices_cents: 0,
      legacy_trip_paths: trips.filter((trip) => trip.flight_path).length,
      legacy_flight_paths: paths.length,
    },
    reconciliation: {
      orphan_trip_ids: orphanTrips,
      orphan_source_links: orphanLinks,
      missing_documents: missingDocuments,
      ambiguous_duplicate_groups: duplicateGroups,
    },
  };
  const sqlPath = join(args.output, "legacy-import.sql");
  writeFileSync(sqlPath, `${statements.join("\n")}\n`);
  writeFileSync(join(args.output, "r2-upload-manifest.json"), `${JSON.stringify(uploadManifest, null, 2)}\n`);
  writeFileSync(join(args.output, "reconciliation.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (args.applyLocal) {
    execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", `--file=${sqlPath}`], {
      stdio: "inherit",
    });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function dbSafeDuplicates(trips: LegacyTrip[]) {
  const groups = new Map<string, number[]>();
  for (const trip of trips) {
    const key = [trip.date, trip.tail_no, trip.route, trip.department, trip.flight_hours].join("|").toLocaleLowerCase();
    const ids = groups.get(key) ?? [];
    ids.push(trip.id);
    groups.set(key, ids);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([signature, trip_ids]) => ({ signature, trip_ids }));
}

main();
