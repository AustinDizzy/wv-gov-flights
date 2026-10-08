import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import { createDatabase, runBatch } from "../db/client";
import {
  auditEvents,
  flightMatchCandidates,
  observedFlights,
  tripFlightLinks,
} from "../db/schema";
import { observedDistanceMetres } from "../lib/flights/distance";
import {
  globeHistoryProvider,
  parseGlobeHistoryDay,
  type TrackProviderResult,
} from "../lib/flights/provider";
import {
  canonicalTelemetryArtifact,
  simplifySegment,
  telemetryAltitudeBounds,
  type FlightSegment,
} from "../lib/flights/trace";
import {
  autoAttachBundleCandidate,
  enumerateConsecutiveFlightBundles,
  scoreFlightBundleCandidate,
  scoreFlightCandidate,
  type MatchableFlight,
  type RankedFlightBundleCandidate,
} from "../lib/flights/matching";
import {
  reconcileFlightSegments,
  type CanonicalFlightSegment,
} from "../lib/flights/reconciliation";
import {
  gunzipBytes,
  gzipJson,
  sha256Hex,
  telemetryArtifactKey,
} from "../lib/flights/telemetry";
import { stableId } from "../lib/utils";

export interface TrackCollectionParams {
  startDate?: string;
  endDate?: string;
  dates?: string[];
  aircraftIds?: string[];
  triggeredBy?: string;
  mode?: "collect" | "repair";
  dryRun?: boolean;
  allowProviderFetch?: boolean;
  providerRequestBudget?: number;
  autoAttachMatches?: boolean;
}

interface AircraftRecord {
  id: string;
  tail_no: string;
  icao_no: string;
}

interface ExistingFlight {
  id: string;
  provider_flight_id: string | null;
  started_at_utc: string;
  ended_at_utc: string;
  duration_seconds: number;
  geometry_json: string;
  telemetry_r2_key: string | null;
  source_hash: string | null;
  geometry_source: "provider" | "manual";
}

const aiRankingSchema = z
  .object({
    rankings: z.array(
      z
        .object({
          observed_flight_id: z.string(),
          rank: z.number().int().positive(),
          explanation: z.string().max(500),
        })
        .strict(),
    ),
  })
  .strict();

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const final = Date.parse(`${end}T00:00:00Z`);
  while (cursor.getTime() <= final) {
    dates.push(utcDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (dates.length > 60) throw new Error("A single backfill may cover at most 60 UTC dates.");
  return dates;
}

async function gzip(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  return new Response(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
}

async function loadStoredDay(
  env: Env,
  date: string,
  icao: string,
): Promise<TrackProviderResult | null> {
  const normalizedIcao = icao.toLocaleLowerCase();
  const rawKey = `raw/globe/${normalizedIcao}/${date}.json.gz`;
  const object = await env.FILES.get(rawKey);
  if (!object) return null;
  const raw = await gunzipBytes(await object.arrayBuffer());
  return parseGlobeHistoryDay(raw, date, normalizedIcao);
}

async function storeCanonicalTelemetry(
  env: Env,
  segment: FlightSegment,
  result: TrackProviderResult,
  artifactId: string,
): Promise<{
  key: string;
  sourceHash: string;
  minAltitudeFt: number | null;
  maxAltitudeFt: number | null;
}> {
  const artifact = canonicalTelemetryArtifact(segment, {
    provider: "globe",
    aircraftIcao: result.aircraftIcao,
    sourceDate: result.sourceDate,
  });
  const sourceHash = await sha256Hex(JSON.stringify(artifact));
  const key = telemetryArtifactKey({
    provider: "globe",
    aircraftIcao: result.aircraftIcao,
    sourceDate: result.sourceDate,
    artifactId,
  });
  await env.FILES.put(key, await gzipJson(artifact), {
    httpMetadata: {
      contentType: "application/json",
      contentEncoding: "gzip",
    },
    customMetadata: {
      schemaVersion: String(artifact.schemaVersion),
      sourceDate: result.sourceDate,
      sourceHash,
    },
  });
  return { key, sourceHash, ...telemetryAltitudeBounds(segment) };
}

export class TrackCollectionWorkflow extends WorkflowEntrypoint<
  Env,
  TrackCollectionParams
> {
  async run(
    event: Readonly<WorkflowEvent<TrackCollectionParams>>,
    step: WorkflowStep,
  ): Promise<{
    collected: number;
    dates: string[];
    autoLinked: number;
    repair: {
      mode: "collect" | "repair";
      dryRun: boolean;
      storedDays: number;
      providerRequests: number;
      providerDays: number;
      missingDays: number;
      created: number;
      revised: number;
      unchanged: number;
      manualGeometrySkips: number;
    };
  }> {
    const mode = event.payload.mode ?? "collect";
    const dryRun = mode === "repair" && event.payload.dryRun !== false;
    const allowProviderFetch =
      mode === "collect" || event.payload.allowProviderFetch === true;
    const providerRequestBudget =
      mode === "repair"
        ? Math.max(0, Math.min(100, event.payload.providerRequestBudget ?? 25))
        : Number.POSITIVE_INFINITY;
    const autoAttachMatches =
      mode === "collect" || event.payload.autoAttachMatches === true;
    const range = await step.do("resolve-date-range", async () => {
      if (event.payload.dates?.length) {
        const dates = [...new Set(event.payload.dates)].sort();
        if (dates.length > 60) {
          throw new Error("A single collection may include at most 60 UTC dates.");
        }
        if (dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
          throw new Error("Track dates must use YYYY-MM-DD.");
        }
        return { start: dates[0], end: dates.at(-1)!, dates };
      }
      const scheduled = new Date(event.timestamp);
      const defaultEnd = new Date(scheduled);
      defaultEnd.setUTCDate(defaultEnd.getUTCDate() - 1);
      const defaultStart = new Date(defaultEnd);
      defaultStart.setUTCDate(defaultStart.getUTCDate() - 9);
      const start = event.payload.startDate ?? utcDate(defaultStart);
      const end = event.payload.endDate ?? utcDate(defaultEnd);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        throw new Error("Track dates must use YYYY-MM-DD.");
      }
      return { start, end, dates: datesBetween(start, end) };
    });

    const aircraft = await step.do("load-active-aircraft", async () => {
      const result = await createDatabase(this.env.DB).all<AircraftRecord>(sql`
        SELECT id, tail_no, icao_no FROM aircraft
        WHERE active = 1 AND icao_no IS NOT NULL
        ORDER BY tail_no
      `);
      const selected = event.payload.aircraftIds?.length
        ? result.filter((item) => event.payload.aircraftIds!.includes(item.id))
        : result;
      return selected;
    });

    if (mode === "collect") {
      await step.do("expire-raw-responses", async () => {
        const db = createDatabase(this.env.DB);
        const expired = await db.all<{ raw_r2_key: string }>(sql`
          SELECT DISTINCT raw_r2_key FROM observed_flights
          WHERE raw_r2_key IS NOT NULL AND raw_expires_at < CURRENT_TIMESTAMP
          LIMIT 500
        `);
        if (expired.length > 0) {
          const keys = expired.map((item) => item.raw_r2_key);
          await this.env.FILES.delete(keys);
          await db.update(observedFlights)
            .set({ rawR2Key: null })
            .where(inArray(observedFlights.rawR2Key, keys));
        }
      });
    }

    const collectedIds: string[] = [];
    const repairSummary = {
      mode,
      dryRun,
      storedDays: 0,
      providerRequests: 0,
      providerDays: 0,
      missingDays: 0,
      created: 0,
      revised: 0,
      unchanged: 0,
      manualGeometrySkips: 0,
    };
    for (const item of aircraft) {
      for (const date of range.dates) {
        const mayFetchProvider =
          allowProviderFetch
          && repairSummary.providerRequests < providerRequestBudget;
        const result = await step.do(
          `${mode}-${dryRun ? "dry-" : ""}${item.tail_no}-${date}`,
          {
            retries: { limit: 3, delay: "30 seconds", backoff: "exponential" },
            timeout: "10 minutes",
          },
          async () => {
            const db = createDatabase(this.env.DB);
            let providerRequested = false;
            let source: "stored" | "provider" | "missing" =
              mode === "repair" ? "stored" : "provider";
            let fetched =
              mode === "repair"
                ? await loadStoredDay(this.env, date, item.icao_no)
                : null;
            if (!fetched && mayFetchProvider) {
              providerRequested = true;
              source = "provider";
              fetched = await globeHistoryProvider.fetchDay(
                date,
                item.icao_no,
                this.env,
              );
            }
            if (!fetched) {
              return {
                ids: [] as string[],
                source: "missing" as const,
                providerRequested,
                created: 0,
                revised: 0,
                unchanged: 0,
                manualGeometrySkips: 0,
              };
            }
            const rawKey = `raw/globe/${item.icao_no.toLocaleLowerCase()}/${date}.json.gz`;
            const rawExpiresAt = new Date(Date.now() + 90 * 86_400_000).toISOString();
            if (!dryRun && source === "provider") {
              await this.env.FILES.put(rawKey, await gzip(fetched.raw), {
                httpMetadata: {
                  contentType: "application/json",
                  contentEncoding: "gzip",
                },
                customMetadata: {
                  aircraftId: item.id,
                  fetchedDate: date,
                  expiresAt: rawExpiresAt,
                },
              });
            }

            const ids: string[] = [];
            let created = 0;
            let revised = 0;
            let unchanged = 0;
            let manualGeometrySkips = 0;
            const segmentIdentities = await Promise.all(
              fetched.segments.map(async (segment, index) => {
                const providerFlightId =
                  `${fetched.providerFlightIdPrefix}:${segment.startedAtUtc}:${index}`;
                return {
                  index,
                  segment,
                  providerFlightId,
                  expectedFlightId: await stableId("flight", providerFlightId),
                };
              }),
            );
            const existingCandidates =
              segmentIdentities.length > 0
                ? await db.all<ExistingFlight>(sql`
                    SELECT f.id, f.provider_flight_id, f.started_at_utc, f.ended_at_utc,
                           f.duration_seconds, f.geometry_json,
                           f.telemetry_r2_key, f.source_hash, f.geometry_source
                    FROM observed_flights f
                    WHERE f.aircraft_id = ${item.id}
                      AND f.provider = 'globe'
                      AND (
                        f.source_date = ${date}
                        OR f.provider_flight_id LIKE ${`${fetched.providerFlightIdPrefix}:%`}
                        OR f.id IN (${sql.join(
                          segmentIdentities.map(
                            (identity) => sql`${identity.expectedFlightId}`,
                          ),
                          sql`, `,
                        )})
                      )
                    ORDER BY f.started_at_utc, f.id
                    LIMIT 50
                  `)
                : [];
            const reconciled = reconcileFlightSegments(
              segmentIdentities as CanonicalFlightSegment[],
              existingCandidates,
            );
            const providerIdByFlight = new Map(
              [...reconciled.entries()].map(([index, flight]) => [
                flight.id,
                segmentIdentities[index].providerFlightId,
              ]),
            );
            const providerIds = new Set(
              segmentIdentities.map((identity) => identity.providerFlightId),
            );
            const releaseIds = existingCandidates
              .filter(
                (flight) =>
                  flight.provider_flight_id != null
                  && providerIds.has(flight.provider_flight_id)
                  && providerIdByFlight.get(flight.id) !== flight.provider_flight_id,
              )
              .map((flight) => flight.id);
            if (!dryRun && releaseIds.length > 0) {
              await db.update(observedFlights).set({
                providerFlightId: null,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              }).where(inArray(observedFlights.id, releaseIds));
            }
            const occupiedIds = new Set(existingCandidates.map((flight) => flight.id));
            for (const {
              index,
              segment,
              providerFlightId,
              expectedFlightId,
            } of segmentIdentities) {
              const geometry = simplifySegment(segment);
              const geometryJson = JSON.stringify(geometry);
              const distanceMetres = observedDistanceMetres(geometryJson);
              const artifact = canonicalTelemetryArtifact(segment, {
                provider: "globe",
                aircraftIcao: fetched.aircraftIcao,
                sourceDate: fetched.sourceDate,
              });
              const sourceHash = await sha256Hex(JSON.stringify(artifact));
              const existing = reconciled.get(index);
              const durationSeconds = Math.max(
                0,
                Math.round(
                  (Date.parse(segment.endedAtUtc) - Date.parse(segment.startedAtUtc)) / 1000,
                ),
              );
              if (!existing) {
                const newFlightId = occupiedIds.has(expectedFlightId)
                  ? await stableId("flight", `${providerFlightId}:physical`)
                  : expectedFlightId;
                created += 1;
                ids.push(newFlightId);
                if (dryRun) continue;
                const telemetryId = await stableId("telemetry", `${newFlightId}:${sourceHash}`);
                const telemetry = await storeCanonicalTelemetry(
                  this.env,
                  segment,
                  fetched,
                  telemetryId,
                );
                await db.insert(observedFlights).values({
                  id: newFlightId,
                  aircraftId: item.id,
                  provider: "globe",
                  providerFlightId,
                  sourceDate: date,
                  segmentIndex: index,
                  startedAtUtc: segment.startedAtUtc,
                  endedAtUtc: segment.endedAtUtc,
                  durationSeconds,
                  rawR2Key: rawKey,
                  rawExpiresAt,
                  geometryJson,
                  pointCount: geometry.geometry.coordinates.length,
                  telemetryR2Key: telemetry.key,
                  telemetryPointCount: segment.points.length,
                  minAltitudeFt: telemetry.minAltitudeFt,
                  maxAltitudeFt: telemetry.maxAltitudeFt,
                  sourceHash: telemetry.sourceHash,
                  distanceMetres,
                  geometrySource: "provider",
                  state: "unmatched",
                }).onConflictDoNothing();
                continue;
              }

              ids.push(existing.id);
              const changed =
                existing.source_hash !== sourceHash
                || existing.geometry_json !== geometryJson
                || existing.started_at_utc !== segment.startedAtUtc
                || existing.ended_at_utc !== segment.endedAtUtc
                || existing.duration_seconds !== durationSeconds;
              if (!changed && existing.telemetry_r2_key) {
                unchanged += 1;
                if (!dryRun) {
                  await db.update(observedFlights).set({
                    providerFlightId,
                    sourceDate: date,
                    segmentIndex: index,
                    rawR2Key: rawKey,
                    rawExpiresAt,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                  }).where(eq(observedFlights.id, existing.id));
                }
                continue;
              }
              const preserveManualGeometry = existing.geometry_source === "manual";
              if (preserveManualGeometry && existing.geometry_json !== geometryJson) {
                manualGeometrySkips += 1;
              }
              revised += changed ? 1 : 0;
              unchanged += changed ? 0 : 1;
              if (dryRun) continue;
              const telemetryId = await stableId(
                "telemetry",
                `${existing.id}:${sourceHash}`,
              );
              const telemetry = await storeCanonicalTelemetry(
                this.env,
                segment,
                fetched,
                telemetryId,
              );
              await db.update(observedFlights).set({
                providerFlightId,
                sourceDate: date,
                segmentIndex: index,
                startedAtUtc: segment.startedAtUtc,
                endedAtUtc: segment.endedAtUtc,
                durationSeconds,
                rawR2Key: rawKey,
                rawExpiresAt,
                telemetryR2Key: telemetry.key,
                telemetryPointCount: segment.points.length,
                minAltitudeFt: telemetry.minAltitudeFt,
                maxAltitudeFt: telemetry.maxAltitudeFt,
                sourceHash: telemetry.sourceHash,
                ...(preserveManualGeometry
                  ? {}
                  : {
                      geometryJson,
                      pointCount: geometry.geometry.coordinates.length,
                      distanceMetres,
                      geometrySource: "provider" as const,
                      geometryUpdatedByUserId: null,
                    }),
                updatedAt: sql`CURRENT_TIMESTAMP`,
              }).where(eq(observedFlights.id, existing.id));
            }
            return {
              ids,
              source,
              providerRequested,
              created,
              revised,
              unchanged,
              manualGeometrySkips,
            };
          },
        );
        collectedIds.push(...result.ids);
        if (result.providerRequested) repairSummary.providerRequests += 1;
        if (result.source === "stored") repairSummary.storedDays += 1;
        if (result.source === "provider") repairSummary.providerDays += 1;
        if (result.source === "missing") repairSummary.missingDays += 1;
        repairSummary.created += result.created;
        repairSummary.revised += result.revised;
        repairSummary.unchanged += result.unchanged;
        repairSummary.manualGeometrySkips += result.manualGeometrySkips;
        if (mode === "repair" && result.providerRequested) {
          await step.sleep(
            `repair-provider-throttle-${item.tail_no}-${date}`,
            "1 second",
          );
        }
      }
    }

    if (dryRun) {
      return {
        collected: [...new Set(collectedIds)].length,
        dates: range.dates,
        autoLinked: 0,
        repair: repairSummary,
      };
    }

    let existingGroup = 0;
    for (let aircraftIndex = 0; aircraftIndex < aircraft.length; aircraftIndex += 20) {
      const aircraftGroup = aircraft.slice(aircraftIndex, aircraftIndex + 20);
      for (let dateIndex = 0; dateIndex < range.dates.length; dateIndex += 40) {
        const dateGroup = range.dates.slice(dateIndex, dateIndex + 40);
        const result = await step.do(
          `load-existing-paths-${existingGroup}`,
          async () => {
            const db = createDatabase(this.env.DB);
            const aircraftValues = sql.join(
              aircraftGroup.map((item) => sql`${item.id}`),
              sql`, `,
            );
            const dateValues = sql.join(dateGroup.map((date) => sql`${date}`), sql`, `);
            const existing = await db.all<{ id: string }>(sql`
              SELECT id FROM observed_flights
              WHERE aircraft_id IN (${aircraftValues})
                 AND (
                   date(started_at_utc) IN (${dateValues})
                   OR date(ended_at_utc) IN (${dateValues})
                 )
              ORDER BY started_at_utc, id
            `);
            return existing.map((flight) => flight.id);
          },
        );
        collectedIds.push(...result);
        existingGroup += 1;
      }
    }

    const uniqueIds = [...new Set(collectedIds)];
    let autoLinked = 0;
    for (const flightId of uniqueIds) {
      const matchResult = await step.do(`match-${flightId}`, async () => {
        const db = createDatabase(this.env.DB);
        const flight = await db.get<{
          id: string;
          aircraft_id: string;
          started_at_utc: string;
          ended_at_utc: string;
        }>(sql`
          SELECT f.id, f.aircraft_id, f.started_at_utc, f.ended_at_utc
          FROM observed_flights f
          WHERE f.id = ${flightId}
        `);
        if (!flight) return { autoLinked: 0 };
        const trips = await db.all<{
          id: string;
          report_date: string;
          aircraft_id: string | null;
          flight_hours: number;
          route_stop_count: number;
        }>(sql`
          SELECT id, report_date, aircraft_id, flight_hours,
                 (SELECT COUNT(*) FROM trip_route_stops s WHERE s.trip_id = trips.id)
                   AS route_stop_count
          FROM trips
          WHERE publication_state = 'published'
            AND report_date BETWEEN date(${flight.started_at_utc}, '-1 day')
              AND date(${flight.ended_at_utc}, '+1 day')
          ORDER BY report_date, id LIMIT 25
        `);
        const candidates = trips
          .map((trip) => ({
            trip,
            ...scoreFlightCandidate(
              {
                reportDate: trip.report_date,
                aircraftId: trip.aircraft_id,
                flightHours: trip.flight_hours,
                routeStopCount: trip.route_stop_count,
              },
              {
                id: flight.id,
                aircraftId: flight.aircraft_id,
                startedAtUtc: flight.started_at_utc,
                endedAtUtc: flight.ended_at_utc,
              },
            ),
          }))
          .filter((candidate) => candidate.score >= 0.45)
          .sort((left, right) => right.score - left.score)
          .slice(0, 5);
        for (const candidate of candidates) {
          const id = await stableId("match", `${candidate.trip.id}:${flight.id}`);
          await db.insert(flightMatchCandidates).values({
            id,
            tripId: candidate.trip.id,
            observedFlightId: flight.id,
            score: candidate.score,
            scoreBreakdownJson: JSON.stringify(candidate.breakdown),
            state: "suggested",
          }).onConflictDoUpdate({
            target: flightMatchCandidates.id,
            set: {
              tripId: candidate.trip.id,
              observedFlightId: flight.id,
              score: candidate.score,
              scoreBreakdownJson: JSON.stringify(candidate.breakdown),
            },
          });
        }
        return { autoLinked: 0 };
      });
      autoLinked += matchResult.autoLinked;
    }

    const bundleCandidates: RankedFlightBundleCandidate[] = [];
    for (const item of aircraft) {
      for (const date of range.dates) {
        const candidates = await step.do(
          `bundle-match-${item.tail_no}-${date}`,
          async () => {
            const db = createDatabase(this.env.DB);
            const trips = await db.all<{
              id: string;
              report_date: string;
              aircraft_id: string;
              flight_hours: number;
              route_stop_count: number;
            }>(sql`
              SELECT t.id, t.report_date, t.aircraft_id, t.flight_hours,
                     (SELECT COUNT(*) FROM trip_route_stops s WHERE s.trip_id = t.id)
                       AS route_stop_count
              FROM trips t
              WHERE t.publication_state = 'published'
                AND t.aircraft_id = ${item.id}
                AND t.report_date = ${date}
              ORDER BY t.id
            `);
            if (trips.length === 0) return [] as RankedFlightBundleCandidate[];

            const flights = await db.all<{
              id: string;
              aircraft_id: string;
              started_at_utc: string;
              ended_at_utc: string;
              duration_seconds: number;
              linked_trip_ids: string | null;
            }>(sql`
              SELECT f.id, f.aircraft_id, f.started_at_utc, f.ended_at_utc,
                     f.duration_seconds,
                     (
                       SELECT group_concat(l.trip_id)
                       FROM trip_flight_links l
                       WHERE l.observed_flight_id = f.id
                     ) AS linked_trip_ids
              FROM observed_flights f
              WHERE f.aircraft_id = ${item.id}
                AND unixepoch(f.started_at_utc)
                  BETWEEN unixepoch(${date}, '-12 hours')
                    AND unixepoch(${date}, '+36 hours')
              ORDER BY f.started_at_utc, f.id
            `);
            const ranked: RankedFlightBundleCandidate[] = [];
            for (const trip of trips) {
              const available = flights
                .filter((flight) => {
                  const linked = flight.linked_trip_ids?.split(",").filter(Boolean) ?? [];
                  return linked.length === 0 || linked.includes(trip.id);
                })
                .map<MatchableFlight>((flight) => ({
                  id: flight.id,
                  aircraftId: flight.aircraft_id,
                  startedAtUtc: flight.started_at_utc,
                  endedAtUtc: flight.ended_at_utc,
                  durationSeconds: flight.duration_seconds,
                }));
              const expectedLegs = Math.max(1, trip.route_stop_count - 1);
              const bundles = enumerateConsecutiveFlightBundles(
                available,
                Math.min(8, expectedLegs + 2),
              );
              const tripCandidates = await Promise.all(
                bundles.map(async (bundle) => {
                  const scored = scoreFlightBundleCandidate(
                    {
                      reportDate: trip.report_date,
                      aircraftId: trip.aircraft_id,
                      flightHours: trip.flight_hours,
                      routeStopCount: trip.route_stop_count,
                    },
                    bundle,
                  );
                  const flightIds = bundle.flights.map((flight) => flight.id);
                  return {
                    tripId: trip.id,
                    bundleId: await stableId(
                      "bundle",
                      `${trip.id}:${flightIds.join(":")}`,
                    ),
                    flightIds,
                    ...scored,
                  };
                }),
              );
              tripCandidates
                .filter((candidate) => candidate.score >= 0.45)
                .sort((left, right) => right.score - left.score)
                .slice(0, 5)
                .forEach((candidate) => ranked.push(candidate));
            }

            const statements: BatchItem<"sqlite">[] = [];
            for (const trip of trips) {
              const best = ranked
                .filter((candidate) => candidate.tripId === trip.id)
                .sort((left, right) => right.score - left.score)[0];
              if (!best) continue;
              for (const [position, flightId] of best.flightIds.entries()) {
                const id = await stableId("match", `${trip.id}:${flightId}`);
                statements.push(
                  db.insert(flightMatchCandidates).values({
                    id,
                    tripId: trip.id,
                    observedFlightId: flightId,
                    score: best.score,
                    scoreBreakdownJson: JSON.stringify({
                      ...best.breakdown,
                      bundle: {
                        id: best.bundleId,
                        flight_ids: best.flightIds,
                        position,
                      },
                    }),
                    state: "suggested",
                  }).onConflictDoUpdate({
                    target: flightMatchCandidates.id,
                    set: {
                      score: best.score,
                      scoreBreakdownJson: JSON.stringify({
                        ...best.breakdown,
                        bundle: {
                          id: best.bundleId,
                          flight_ids: best.flightIds,
                          position,
                        },
                      }),
                    },
                  }),
                );
              }
            }
            await runBatch(db, statements);
            return ranked;
          },
        );
        bundleCandidates.push(...candidates);
      }
    }

    const bestBundleByTrip = new Map<string, RankedFlightBundleCandidate>();
    for (const candidate of bundleCandidates) {
      const existing = bestBundleByTrip.get(candidate.tripId);
      if (!existing || candidate.score > existing.score) {
        bestBundleByTrip.set(candidate.tripId, candidate);
      }
    }
    if (autoAttachMatches) {
      for (const [tripId] of bestBundleByTrip) {
        const tripCandidates = bundleCandidates.filter(
          (candidate) => candidate.tripId === tripId,
        );
        const automatic = autoAttachBundleCandidate(tripCandidates);
        if (!automatic) continue;
        const memberIds = new Set(automatic.flightIds);
        const competing = bundleCandidates
          .filter(
            (candidate) =>
              candidate.tripId !== automatic.tripId
              && candidate.flightIds.some((flightId) => memberIds.has(flightId)),
          )
          .sort((left, right) => right.score - left.score)[0];
        if (competing && automatic.score - competing.score < 0.05) continue;

        const attached = await step.do(
          `attach-bundle-${automatic.bundleId}`,
          async () => {
            const db = createDatabase(this.env.DB);
            const flightValues = sql.join(
              automatic.flightIds.map((flightId) => sql`${flightId}`),
              sql`, `,
            );
            const conflicting = await db.get<{ count: number }>(sql`
              SELECT COUNT(*) AS count
              FROM trip_flight_links
              WHERE observed_flight_id IN (${flightValues})
                AND trip_id <> ${automatic.tripId}
            `);
            if ((conflicting?.count ?? 0) > 0) return 0;
            const rejected = await db.get<{ count: number }>(sql`
              SELECT COUNT(*) AS count
              FROM flight_match_candidates
              WHERE trip_id = ${automatic.tripId}
                AND observed_flight_id IN (${flightValues})
                AND state = 'rejected'
            `);
            if ((rejected?.count ?? 0) > 0) return 0;
            const currentPosition = await db.get<{ position: number }>(sql`
              SELECT COALESCE(MAX(position) + 1, 0) AS position
              FROM trip_flight_links WHERE trip_id = ${automatic.tripId}
            `);
            const existingLinks = await db.all<{ observed_flight_id: string }>(sql`
              SELECT observed_flight_id FROM trip_flight_links
              WHERE trip_id = ${automatic.tripId}
                AND observed_flight_id IN (${flightValues})
            `);
            const alreadyLinked = new Set(
              existingLinks.map((link) => link.observed_flight_id),
            );
            let nextPosition = currentPosition?.position ?? 0;
            const statements: BatchItem<"sqlite">[] = [];
            for (const flightId of automatic.flightIds) {
              if (!alreadyLinked.has(flightId)) {
                statements.push(db.insert(tripFlightLinks).values({
                  id: await stableId("link", `${automatic.tripId}:${flightId}`),
                  tripId: automatic.tripId,
                  observedFlightId: flightId,
                  position: nextPosition,
                  note: `Automatically attached as bundle ${automatic.bundleId}`,
                }).onConflictDoNothing());
                nextPosition += 1;
              }
              statements.push(
                db.update(flightMatchCandidates)
                  .set({ state: "accepted" })
                  .where(sql`
                    ${flightMatchCandidates.tripId} = ${automatic.tripId}
                    AND ${flightMatchCandidates.observedFlightId} = ${flightId}
                  `),
                db.update(observedFlights)
                  .set({ state: "linked", updatedAt: sql`CURRENT_TIMESTAMP` })
                  .where(eq(observedFlights.id, flightId)),
              );
            }
            statements.push(
              db.insert(auditEvents).values({
                id: crypto.randomUUID(),
                action: "auto_attach_bundle",
                entityType: "trip_flight_bundle",
                entityId: `${automatic.tripId}:${automatic.bundleId}`,
                afterJson: JSON.stringify(automatic),
              }),
            );
            await runBatch(db, statements);
            const chronologicalLinks = await db.all<{
              id: string;
              position: number;
            }>(sql`
              SELECT l.id,
                     ROW_NUMBER() OVER (
                       ORDER BY f.started_at_utc, f.ended_at_utc, f.id
                     ) - 1 AS position
              FROM trip_flight_links l
              JOIN observed_flights f ON f.id = l.observed_flight_id
              WHERE l.trip_id = ${automatic.tripId}
              ORDER BY f.started_at_utc, f.ended_at_utc, f.id
            `);
            if (chronologicalLinks.length > 0) {
              await runBatch(
                db,
                chronologicalLinks.map((link) =>
                  db.update(tripFlightLinks)
                    .set({ position: link.position })
                    .where(eq(tripFlightLinks.id, link.id))
                ),
              );
            }
            return automatic.flightIds.length - alreadyLinked.size;
          },
        );
        autoLinked += attached;
      }
    }

    if (mode === "collect") {
      await step.do("rank-ambiguous-candidates", async () => {
        const db = createDatabase(this.env.DB);
        const ambiguous = await db.all<{ trip_id: string; candidates: string }>(sql`
        SELECT trip_id, json_group_array(json_object(
           'observed_flight_id', observed_flight_id,
           'score', score,
           'score_breakdown', json(score_breakdown_json)
         )) AS candidates
        FROM flight_match_candidates
        WHERE state = 'suggested' AND created_at >= datetime('now', '-1 day')
          AND json_type(score_breakdown_json, '$.bundle') IS NULL
        GROUP BY trip_id HAVING COUNT(*) > 1
        LIMIT 20
      `);
        for (const group of ambiguous) {
          try {
            const candidates = JSON.parse(group.candidates) as Array<Record<string, unknown>>;
            const response = await this.env.AI.run(
            "@cf/zai-org/glm-4.7-flash",
            {
              messages: [
                {
                  role: "system",
                  content:
                    "Rank candidate observed flights for a public-record trip. Return JSON only. You may rank and explain; never claim a link is confirmed.",
                },
                {
                  role: "user",
                  content: JSON.stringify({
                    trip_id: group.trip_id,
                    candidates,
                    schema: {
                      rankings: [
                        {
                          observed_flight_id: "string",
                          rank: "positive integer",
                          explanation: "string",
                        },
                      ],
                    },
                  }),
                },
              ],
              response_format: { type: "json_object" },
            },
            {
              gateway: {
                id: this.env.AI_GATEWAY_ID,
                metadata: { operation: "flight-candidate-ranking" },
              },
            },
          );
            const responseText =
              typeof response === "object" &&
              response &&
              "response" in response &&
              typeof response.response === "string"
                ? response.response
                : null;
            if (!responseText) continue;
            const ranking = aiRankingSchema.safeParse(JSON.parse(responseText));
            if (!ranking.success) continue;
            for (const item of ranking.data.rankings) {
              await db.update(flightMatchCandidates)
                .set({ aiRank: item.rank, aiExplanation: item.explanation })
                .where(sql`
                ${flightMatchCandidates.tripId} = ${group.trip_id}
                AND ${flightMatchCandidates.observedFlightId} = ${item.observed_flight_id}
              `);
            }
          } catch {
            // Heuristic suggestions remain available when optional AI ranking is
            // unavailable or returns malformed JSON.
          }
        }
      });
    }

    return {
      collected: uniqueIds.length,
      dates: range.dates,
      autoLinked,
      repair: repairSummary,
    };
  }
}
