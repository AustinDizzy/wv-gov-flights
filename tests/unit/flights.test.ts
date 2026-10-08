import { describe, expect, it } from "vitest";
import {
  absoluteTracePoints,
  mergeCrossDateSegments,
  simplifySegment,
  splitTrace,
  type FlightSegment,
  type TracePoint,
} from "../../src/lib/flights/trace";
import {
  autoAttachBundleCandidate,
  autoAttachCandidate,
  enumerateConsecutiveFlightBundles,
  scoreFlightBundleCandidate,
  scoreFlightCandidate,
} from "../../src/lib/flights/matching";
import {
  reconcileFlightSegments,
  type CanonicalFlightSegment,
  type ExistingPhysicalFlight,
} from "../../src/lib/flights/reconciliation";
import { observedDistanceMetres } from "../../src/lib/flights/distance";

function point(
  timestampMs: number,
  latitude: number,
  longitude: number,
  altitude: number | "ground" | null,
): TracePoint {
  return {
    timestampMs,
    latitude,
    longitude,
    altitude,
    barometricAltitudeFt: typeof altitude === "number" ? altitude : null,
    geometricAltitudeFt: null,
    groundSpeedKt: null,
    trackDegrees: null,
    barometricVerticalRateFpm: null,
    geometricVerticalRateFpm: null,
    indicatedAirspeedKt: null,
    rollDegrees: null,
    source: null,
    rawFlags: 0,
    legStart: false,
    stale: false,
  };
}

describe("flight trace processing", () => {
  it("computes the canonical stored distance in metres", () => {
    expect(observedDistanceMetres(JSON.stringify({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [[0, 0], [1, 0]],
      },
    }))).toBeCloseTo(111_194.927, 2);
  });

  it("converts Globe offsets to absolute UTC and splits sustained ground intervals", () => {
    const points = absoluteTracePoints({
      timestamp: 1_700_000_000,
      trace: [
        [0, 38, -81, "ground"],
        [30, 38.01, -81.01, 2000],
        [90, 38.1, -81.1, 5000],
        [120, 38.2, -81.2, "ground"],
        [250, 38.2, -81.2, "ground"],
        [300, 38.21, -81.21, 2000],
        [360, 38.3, -81.3, "ground"],
      ],
    });
    expect(points[1].timestampMs).toBe(1_700_000_030_000);
    expect(splitTrace(points)).toHaveLength(2);
  });

  it("merges close overnight fragments", () => {
    const first: FlightSegment = {
      startedAtUtc: "2026-07-01T23:40:00.000Z",
      endedAtUtc: "2026-07-01T23:59:00.000Z",
      points: [
        point(0, 38, -81, 1000),
        point(1, 38.1, -81.1, 2000),
      ],
    };
    const second: FlightSegment = {
      startedAtUtc: "2026-07-02T00:05:00.000Z",
      endedAtUtc: "2026-07-02T00:20:00.000Z",
      points: [
        point(2, 38.1001, -81.1001, 2000),
        point(3, 38.2, -81.2, "ground"),
      ],
    };
    expect(mergeCrossDateSegments([first, second])).toHaveLength(1);
  });

  it("caps simplified paths while preserving endpoints", () => {
    const points = Array.from({ length: 2_000 }, (_, index) => ({
      ...point(
        index,
        38 + index / 100_000,
        -81 + Math.sin(index / 4) / 1_000,
        2000,
      ),
    }));
    const feature = simplifySegment({
      startedAtUtc: "2026-01-01T00:00:00Z",
      endedAtUtc: "2026-01-01T01:00:00Z",
      points,
    });
    expect(feature.geometry.coordinates.length).toBeLessThanOrEqual(500);
    expect(feature.geometry.coordinates[0]).toEqual([-81, 38]);
    expect(feature.geometry.coordinates.at(-1)).toEqual([points.at(-1)!.longitude, points.at(-1)!.latitude]);
    expect(feature.properties?.altitudes_ft).toHaveLength(
      feature.geometry.coordinates.length,
    );
  });

  it("uses the provider leg marker and does not carry a pre-gap point forward", () => {
    const points = absoluteTracePoints({
      timestamp: 1_781_308_800,
      trace: [
        [0, 38.37, -81.59, 1_000, 120, 280, 0, 500, null, "adsb_icao"],
        [100, 41.28, -95.87, 1_300, 140, 300, 4, 100, null, "adsb_icao"],
        [4_048, 41.31, -95.9, 1_375, 137, 324, 7, 200, null, "adsb_icao"],
        [4_148, 43.59, -96.74, 1_000, 120, 350, 4, -500, null, "adsb_icao"],
      ],
    });
    const segments = splitTrace(points, 120_000, 2 * 60 * 60_000);
    expect(segments).toHaveLength(2);
    expect(segments[0].endedAtUtc).toBe("2026-06-13T00:01:40.000Z");
    expect(segments[1].startedAtUtc).toBe("2026-06-13T01:07:28.000Z");
    expect(segments[1].points[0].legStart).toBe(true);
    expect(segments[1].points[0]).not.toBe(segments[0].points.at(-1));
    expect(segments[1].points[0]).toMatchObject({
      groundSpeedKt: 137,
      geometricVerticalRateFpm: 200,
      source: "adsb_icao",
      stale: true,
    });
  });

  it("uses a large telemetry gap as a fallback without copying the prior point", () => {
    const points = [
      point(0, 38.37, -81.59, 1_000),
      point(60_000, 39, -85, 10_000),
      point(31 * 60_000, 41.31, -95.9, 1_375),
      point(32 * 60_000, 43.59, -96.74, 1_000),
    ];
    const segments = splitTrace(points);
    expect(segments).toHaveLength(2);
    expect(segments[0].points.at(-1)).toBe(points[1]);
    expect(segments[1].points[0]).toBe(points[2]);
  });

  it("reconciles shifted segment indices by physical leg instead of row identity", () => {
    const segment = (
      index: number,
      start: [number, number],
      end: [number, number],
      startedAtUtc: string,
      endedAtUtc: string,
    ): CanonicalFlightSegment => ({
      index,
      providerFlightId: `provider:${index}`,
      expectedFlightId: `expected-${index}`,
      segment: {
        startedAtUtc,
        endedAtUtc,
        points: [
          point(Date.parse(startedAtUtc), start[1], start[0], 1_000),
          point(Date.parse(endedAtUtc), end[1], end[0], 1_000),
        ],
      },
    });
    const existing = (
      id: string,
      start: [number, number],
      end: [number, number],
      startedAtUtc: string,
      endedAtUtc: string,
    ): ExistingPhysicalFlight => ({
      id,
      provider_flight_id: id === "linked-middle" ? "provider:2" : "provider:3",
      started_at_utc: startedAtUtc,
      ended_at_utc: endedAtUtc,
      geometry_json: JSON.stringify({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [start, end] },
      }),
    });
    const identities = [
      segment(
        2,
        [-77.99, 39.4],
        [-78.1, 39.68],
        "2026-07-04T12:30:00Z",
        "2026-07-04T12:40:00Z",
      ),
      segment(
        3,
        [-78.1, 39.68],
        [-81.78, 38.99],
        "2026-07-04T14:27:00Z",
        "2026-07-04T15:14:00Z",
      ),
    ];
    const flights = [
      existing(
        "linked-middle",
        [-78.1, 39.68],
        [-81.78, 38.99],
        "2026-07-04T12:40:00Z",
        "2026-07-04T15:14:00Z",
      ),
      existing(
        "linked-first",
        [-77.99, 39.4],
        [-78.1, 39.68],
        "2026-07-04T10:29:00Z",
        "2026-07-04T12:40:00Z",
      ),
    ];

    const reconciled = reconcileFlightSegments(identities, flights);
    expect(reconciled.get(2)?.id).toBe("linked-first");
    expect(reconciled.get(3)?.id).toBe("linked-middle");
  });

  it("scores aircraft/date/duration matches above unrelated paths", () => {
    const score = scoreFlightCandidate(
      { reportDate: "2026-07-01", aircraftId: "a1", flightHours: 1 },
      {
        id: "f1",
        aircraftId: "a1",
        startedAtUtc: "2026-07-01T23:30:00Z",
        endedAtUtc: "2026-07-02T00:30:00Z",
      },
    );
    expect(score.score).toBeGreaterThan(0.8);
  });

  it("automatically attaches only a clear high-confidence path match", () => {
    const clear = {
      tripId: "trip-1",
      score: 0.93,
      breakdown: {
        aircraft: 1,
        dateOverlap: 1,
        duration: 0.9,
      },
    };
    expect(autoAttachCandidate([clear])?.tripId).toBe("trip-1");
    expect(
      autoAttachCandidate([
        clear,
        { ...clear, tripId: "trip-2", score: 0.88 },
      ]),
    ).toBeNull();
    expect(
      autoAttachCandidate([
        {
          ...clear,
          score: 0.84,
        },
      ]),
    ).toBeNull();
  });

  it("scores a consecutive multi-leg bundle using summed observed duration", () => {
    const flights = [
      {
        id: "crw-oma",
        aircraftId: "a1",
        startedAtUtc: "2026-06-13T17:39:40.480Z",
        endedAtUtc: "2026-06-13T20:44:28.430Z",
        durationSeconds: 11_088,
        geometry: {
          type: "LineString" as const,
          coordinates: [[-81.59, 38.37], [-95.87, 41.28]],
        },
      },
      {
        id: "oma-fsd",
        aircraftId: "a1",
        startedAtUtc: "2026-06-13T21:50:16.220Z",
        endedAtUtc: "2026-06-13T22:31:37.270Z",
        durationSeconds: 2_481,
        geometry: {
          type: "LineString" as const,
          coordinates: [[-95.9, 41.31], [-96.74, 43.59]],
        },
      },
    ];
    const bundles = enumerateConsecutiveFlightBundles(flights);
    const ranked = bundles.map((bundle, index) => ({
      tripId: "trip-1",
      bundleId: `bundle-${index}`,
      flightIds: bundle.flights.map((flight) => flight.id),
      ...scoreFlightBundleCandidate(
        {
          reportDate: "2026-06-13",
          aircraftId: "a1",
          routeStopCount: 3,
          flightHours: 3.8,
        },
        bundle,
      ),
    }));
    const automatic = autoAttachBundleCandidate(ranked);
    expect(automatic?.flightIds).toEqual(["crw-oma", "oma-fsd"]);
    expect(automatic?.breakdown.duration).toBeGreaterThan(0.99);
  });
});
