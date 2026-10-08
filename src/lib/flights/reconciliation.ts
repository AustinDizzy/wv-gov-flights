import type { Feature, LineString } from "geojson";
import { haversineMetres, type FlightSegment } from "./trace";

export interface CanonicalFlightSegment {
  index: number;
  providerFlightId: string;
  expectedFlightId: string;
  segment: FlightSegment;
}

export interface ExistingPhysicalFlight {
  id: string;
  provider_flight_id: string | null;
  started_at_utc: string;
  ended_at_utc: string;
  geometry_json: string;
}

interface ReconciliationPair {
  segmentIndex: number;
  flight: ExistingPhysicalFlight;
  score: number;
}

function proximity(distanceMetres: number, limitMetres: number): number {
  return Math.max(0, 1 - distanceMetres / limitMetres);
}

function timeOverlap(
  segment: Pick<FlightSegment, "startedAtUtc" | "endedAtUtc">,
  flight: Pick<ExistingPhysicalFlight, "started_at_utc" | "ended_at_utc">,
): number {
  const segmentStart = Date.parse(segment.startedAtUtc);
  const segmentEnd = Date.parse(segment.endedAtUtc);
  const flightStart = Date.parse(flight.started_at_utc);
  const flightEnd = Date.parse(flight.ended_at_utc);
  const overlap = Math.max(0, Math.min(segmentEnd, flightEnd) - Math.max(segmentStart, flightStart));
  return overlap / Math.max(1, segmentEnd - segmentStart);
}

export function physicalLegSimilarity(
  identity: CanonicalFlightSegment,
  flight: ExistingPhysicalFlight,
): number | null {
  let geometry: Feature<LineString>;
  try {
    geometry = JSON.parse(flight.geometry_json) as Feature<LineString>;
  } catch {
    return null;
  }
  const first = geometry.geometry?.coordinates[0];
  const last = geometry.geometry?.coordinates.at(-1);
  const segmentFirst = identity.segment.points[0];
  const segmentLast = identity.segment.points.at(-1);
  if (!first || !last || !segmentFirst || !segmentLast) return null;

  const startDistance = haversineMetres(
    { latitude: segmentFirst.latitude, longitude: segmentFirst.longitude },
    { latitude: first[1], longitude: first[0] },
  );
  const endDistance = haversineMetres(
    { latitude: segmentLast.latitude, longitude: segmentLast.longitude },
    { latitude: last[1], longitude: last[0] },
  );
  const endpointScore =
    (proximity(startDistance, 75_000) + proximity(endDistance, 75_000)) / 2;
  const overlapScore = timeOverlap(identity.segment, flight);

  const segmentMidpoint =
    (Date.parse(identity.segment.startedAtUtc) + Date.parse(identity.segment.endedAtUtc)) / 2;
  const flightMidpoint =
    (Date.parse(flight.started_at_utc) + Date.parse(flight.ended_at_utc)) / 2;
  const midpointScore = proximity(Math.abs(segmentMidpoint - flightMidpoint), 6 * 60 * 60_000);

  if (
    endpointScore < 0.55
    && !(overlapScore >= 0.8 && endpointScore >= 0.25)
  ) {
    return null;
  }

  const identityBonus =
    flight.provider_flight_id === identity.providerFlightId
    || flight.id === identity.expectedFlightId
      ? 0.05
      : 0;
  return endpointScore * 0.65 + overlapScore * 0.25 + midpointScore * 0.1
    + identityBonus;
}

export function reconcileFlightSegments<T extends ExistingPhysicalFlight>(
  identities: CanonicalFlightSegment[],
  flights: T[],
): Map<number, T> {
  const pairs: ReconciliationPair[] = [];
  for (const identity of identities) {
    for (const flight of flights) {
      const score = physicalLegSimilarity(identity, flight);
      if (score != null) {
        pairs.push({ segmentIndex: identity.index, flight, score });
      }
    }
  }
  pairs.sort(
    (left, right) =>
      right.score - left.score
      || left.segmentIndex - right.segmentIndex
      || left.flight.id.localeCompare(right.flight.id),
  );

  const assignments = new Map<number, T>();
  const claimedFlights = new Set<string>();
  for (const pair of pairs) {
    if (
      assignments.has(pair.segmentIndex)
      || claimedFlights.has(pair.flight.id)
    ) {
      continue;
    }
    assignments.set(pair.segmentIndex, pair.flight as T);
    claimedFlights.add(pair.flight.id);
  }
  return assignments;
}
