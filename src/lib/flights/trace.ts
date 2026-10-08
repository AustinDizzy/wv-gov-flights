import simplify from "simplify-js";
import type { Feature, LineString } from "geojson";

export interface TracePoint {
  timestampMs: number;
  latitude: number;
  longitude: number;
  altitude: number | "ground" | null;
  barometricAltitudeFt: number | null;
  geometricAltitudeFt: number | null;
  groundSpeedKt: number | null;
  trackDegrees: number | null;
  barometricVerticalRateFpm: number | null;
  geometricVerticalRateFpm: number | null;
  indicatedAirspeedKt: number | null;
  rollDegrees: number | null;
  source: string | null;
  rawFlags: number;
  legStart: boolean;
  stale: boolean;
}

export interface FlightSegment {
  startedAtUtc: string;
  endedAtUtc: string;
  points: TracePoint[];
}

export interface GlobeTraceResponse {
  timestamp: number;
  icao?: string;
  hex?: string;
  trace: Array<[number, number, number, number | "ground" | null, ...unknown[]]>;
}

export interface CanonicalTelemetryArtifact {
  schemaVersion: 1;
  provider: string;
  aircraftIcao: string;
  sourceDate: string;
  startedAtUtc: string;
  endedAtUtc: string;
  points: TracePoint[];
}

function validCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function absoluteTracePoints(response: GlobeTraceResponse): TracePoint[] {
  return response.trace
    .map((entry) => {
      const [offset, latitude, longitude, altitude] = entry;
      const rawFlags = Math.max(0, Math.trunc(finiteNumber(entry[6]) ?? 0));
      const verticalRateFpm = finiteNumber(entry[7]);
      const altitudeIsGeometric = (rawFlags & 8) !== 0;
      const verticalRateIsGeometric = (rawFlags & 4) !== 0;
      const numericAltitude = typeof altitude === "number" ? altitude : null;
      return {
        timestampMs: Math.round((response.timestamp + offset) * 1000),
        latitude,
        longitude,
        altitude,
        barometricAltitudeFt:
          numericAltitude != null && !altitudeIsGeometric ? numericAltitude : null,
        geometricAltitudeFt:
          finiteNumber(entry[10])
          ?? (numericAltitude != null && altitudeIsGeometric ? numericAltitude : null),
        groundSpeedKt: finiteNumber(entry[4]),
        trackDegrees: finiteNumber(entry[5]),
        barometricVerticalRateFpm:
          verticalRateFpm != null && !verticalRateIsGeometric ? verticalRateFpm : null,
        geometricVerticalRateFpm:
          finiteNumber(entry[11])
          ?? (verticalRateFpm != null && verticalRateIsGeometric ? verticalRateFpm : null),
        indicatedAirspeedKt: finiteNumber(entry[12]),
        rollDegrees: finiteNumber(entry[13]),
        source: typeof entry[9] === "string" ? entry[9] : null,
        rawFlags,
        legStart: (rawFlags & 2) !== 0,
        stale: (rawFlags & 1) !== 0,
      };
    })
    .filter(
      (point) =>
        Number.isFinite(point.timestampMs) &&
        validCoordinate(point.latitude, point.longitude),
    )
    .sort((left, right) => left.timestampMs - right.timestampMs)
    .filter(
      (point, index, points) =>
        index === 0 ||
        point.timestampMs !== points[index - 1].timestampMs ||
        point.latitude !== points[index - 1].latitude ||
        point.longitude !== points[index - 1].longitude,
    );
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isGround(point: TracePoint): boolean {
  return point.altitude === "ground";
}

function hasAirbornePoint(points: TracePoint[]): boolean {
  return points.some((point) => !isGround(point));
}

export function splitTrace(
  points: TracePoint[],
  groundedIntervalMs = 120_000,
  telemetryGapMs = 30 * 60_000,
): FlightSegment[] {
  if (points.length < 2) return [];
  const segments: TracePoint[][] = [];
  let current: TracePoint[] = [];
  let groundStartedAt: number | null = null;
  let groundStartedIndex: number | null = null;

  const commit = () => {
    if (current.length >= 2 && hasAirbornePoint(current)) {
      segments.push(current);
    }
    current = [];
    groundStartedAt = null;
    groundStartedIndex = null;
  };

  for (const point of points) {
    const previous = current.at(-1);
    const telemetryGap =
      previous != null && point.timestampMs - previous.timestampMs >= telemetryGapMs;
    if (previous && (point.legStart || telemetryGap)) {
      commit();
    }

    if (isGround(point)) {
      groundStartedAt ??= point.timestampMs;
      groundStartedIndex ??= current.length;
      current.push(point);
      if (point.timestampMs - groundStartedAt >= groundedIntervalMs) {
        const landingEnd = Math.min(
          current.length,
          Math.max(1, (groundStartedIndex ?? current.length - 1) + 1),
        );
        current = current.slice(0, landingEnd);
        commit();
        current = [point];
        groundStartedAt = point.timestampMs;
        groundStartedIndex = 0;
      }
    } else {
      current.push(point);
      groundStartedAt = null;
      groundStartedIndex = null;
    }
  }
  commit();

  return segments.map((segment) => ({
    startedAtUtc: new Date(segment[0].timestampMs).toISOString(),
    endedAtUtc: new Date(segment.at(-1)!.timestampMs).toISOString(),
    points: segment,
  }));
}

type CoordinatePoint = Pick<TracePoint, "latitude" | "longitude">;

export function haversineMetres(left: CoordinatePoint, right: CoordinatePoint): number {
  const radians = Math.PI / 180;
  const lat1 = left.latitude * radians;
  const lat2 = right.latitude * radians;
  const deltaLat = (right.latitude - left.latitude) * radians;
  const deltaLon = (right.longitude - left.longitude) * radians;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function mergeCrossDateSegments(
  segments: FlightSegment[],
  maxGapMs = 30 * 60_000,
  maxEndpointDistanceMetres = 10_000,
): FlightSegment[] {
  const sorted = [...segments].sort(
    (left, right) => Date.parse(left.startedAtUtc) - Date.parse(right.startedAtUtc),
  );
  const merged: FlightSegment[] = [];
  for (const segment of sorted) {
    const previous = merged.at(-1);
    if (!previous) {
      merged.push(segment);
      continue;
    }
    const gap = Date.parse(segment.startedAtUtc) - Date.parse(previous.endedAtUtc);
    const distance = haversineMetres(previous.points.at(-1)!, segment.points[0]);
    if (gap >= 0 && gap <= maxGapMs && distance <= maxEndpointDistanceMetres) {
      previous.points.push(...segment.points.slice(1));
      previous.endedAtUtc = segment.endedAtUtc;
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

interface ProjectedPoint {
  x: number;
  y: number;
  original: TracePoint;
}

function project(point: TracePoint, referenceLatitude: number): ProjectedPoint {
  const metresPerDegree = 111_320;
  return {
    x: point.longitude * metresPerDegree * Math.cos((referenceLatitude * Math.PI) / 180),
    y: point.latitude * metresPerDegree,
    original: point,
  };
}

export function simplifySegment(
  segment: FlightSegment,
  initialToleranceMetres = 75,
  maxPoints = 500,
): Feature<LineString> {
  const referenceLatitude =
    segment.points.reduce((sum, point) => sum + point.latitude, 0) / segment.points.length;
  const projected = segment.points.map((point) => project(point, referenceLatitude));
  let tolerance = initialToleranceMetres;
  let reduced = simplify(projected, tolerance, true);
  while (reduced.length > maxPoints) {
    tolerance *= 1.35;
    reduced = simplify(projected, tolerance, true);
  }
  if (reduced[0] !== projected[0]) reduced.unshift(projected[0]);
  if (reduced.at(-1) !== projected.at(-1)) reduced.push(projected.at(-1)!);
  const retained = reduced.map((point) => point.original);
  const altitude = (point: TracePoint) =>
    point.barometricAltitudeFt ?? point.geometricAltitudeFt;
  return {
    type: "Feature",
    properties: {
      started_at_utc: segment.startedAtUtc,
      ended_at_utc: segment.endedAtUtc,
      tolerance_metres: Math.round(tolerance),
      telemetry_schema_version: 1,
      timestamps_ms: retained.map((point) => point.timestampMs),
      altitudes_ft: retained.map(altitude),
      barometric_altitudes_ft: retained.map((point) => point.barometricAltitudeFt),
      geometric_altitudes_ft: retained.map((point) => point.geometricAltitudeFt),
      ground_speeds_kt: retained.map((point) => point.groundSpeedKt),
      vertical_rates_fpm: retained.map((point) =>
        point.barometricVerticalRateFpm ?? point.geometricVerticalRateFpm
      ),
      ground: retained.map(isGround),
      stale: retained.map((point) => point.stale),
      sources: retained.map((point) => point.source),
    },
    geometry: {
      type: "LineString",
      coordinates: retained.map((point) => [point.longitude, point.latitude]),
    },
  };
}

export function canonicalTelemetryArtifact(
  segment: FlightSegment,
  {
    provider,
    aircraftIcao,
    sourceDate,
  }: {
    provider: string;
    aircraftIcao: string;
    sourceDate: string;
  },
): CanonicalTelemetryArtifact {
  return {
    schemaVersion: 1,
    provider,
    aircraftIcao,
    sourceDate,
    startedAtUtc: segment.startedAtUtc,
    endedAtUtc: segment.endedAtUtc,
    points: segment.points,
  };
}

export function telemetryAltitudeBounds(segment: FlightSegment): {
  minAltitudeFt: number | null;
  maxAltitudeFt: number | null;
} {
  const values = segment.points
    .map((point) => point.barometricAltitudeFt ?? point.geometricAltitudeFt)
    .filter((value): value is number => value != null && Number.isFinite(value));
  return {
    minAltitudeFt: values.length > 0 ? Math.min(...values) : null,
    maxAltitudeFt: values.length > 0 ? Math.max(...values) : null,
  };
}
