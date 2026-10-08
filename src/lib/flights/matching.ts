export interface MatchableTrip {
  reportDate: string;
  aircraftId: string | null;
  routeStopCount?: number;
  flightHours: number;
}

export interface MatchableFlight {
  id: string;
  aircraftId: string;
  startedAtUtc: string;
  endedAtUtc: string;
  durationSeconds?: number;
}

export interface MatchableFlightBundle {
  flights: MatchableFlight[];
  startedAtUtc: string;
  endedAtUtc: string;
  durationSeconds: number;
}

export interface FlightBundleCandidateScore {
  score: number;
  breakdown: {
    aircraft: number;
    dateOverlap: number;
    duration: number;
    legCount: number;
  };
}

export interface RankedFlightBundleCandidate extends FlightBundleCandidateScore {
  tripId: string;
  bundleId: string;
  flightIds: string[];
}

export interface FlightCandidateScore {
  score: number;
  breakdown: {
    aircraft: number;
    dateOverlap: number;
    duration: number;
  };
}

export interface RankedFlightCandidate extends FlightCandidateScore {
  tripId: string;
}

export function scoreFlightCandidate(
  trip: MatchableTrip,
  flight: MatchableFlight,
): FlightCandidateScore {
  const dateStart = Date.parse(`${trip.reportDate}T00:00:00Z`);
  const dateEnd = dateStart + 48 * 60 * 60 * 1000;
  const start = Date.parse(flight.startedAtUtc);
  const end = Date.parse(flight.endedAtUtc);
  const aircraft = trip.aircraftId === flight.aircraftId ? 1 : 0;
  const dateOverlap = start <= dateEnd && end >= dateStart ? 1 : 0;
  const actualHours = Math.max(0, end - start) / 3_600_000;
  const duration = Math.max(
    0,
    1 - Math.abs(actualHours - trip.flightHours) / Math.max(1, trip.flightHours),
  );
  const score = aircraft * 0.45 + dateOverlap * 0.3 + duration * 0.25;
  return {
    score,
    breakdown: { aircraft, dateOverlap, duration },
  };
}

export function autoAttachCandidate(
  candidates: RankedFlightCandidate[],
  minimumScore = 0.85,
  minimumLead = 0.1,
): RankedFlightCandidate | null {
  const ranked = [...candidates].sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best) return null;
  if (
    best.score < minimumScore ||
    best.breakdown.aircraft !== 1 ||
    best.breakdown.dateOverlap !== 1
  ) {
    return null;
  }
  const runnerUp = ranked[1];
  if (runnerUp && best.score - runnerUp.score < minimumLead) return null;
  return best;
}

function localDate(isoTimestamp: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoTimestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function enumerateConsecutiveFlightBundles(
  flights: MatchableFlight[],
  maxSegments = 8,
  maxInterSegmentGapMs = 12 * 60 * 60_000,
): MatchableFlightBundle[] {
  const sorted = [...flights].sort(
    (left, right) =>
      Date.parse(left.startedAtUtc) - Date.parse(right.startedAtUtc)
      || left.id.localeCompare(right.id),
  );
  const bundles: MatchableFlightBundle[] = [];
  for (let start = 0; start < sorted.length; start++) {
    let durationSeconds = 0;
    for (
      let end = start;
      end < sorted.length && end - start < maxSegments;
      end++
    ) {
      const flight = sorted[end];
      const previous = end > start ? sorted[end - 1] : null;
      if (previous) {
        const gap = Date.parse(flight.startedAtUtc) - Date.parse(previous.endedAtUtc);
        if (
          flight.aircraftId !== previous.aircraftId
          || gap < 0
          || gap > maxInterSegmentGapMs
        ) {
          break;
        }
      }
      durationSeconds += flight.durationSeconds
        ?? Math.max(
          0,
          Math.round(
            (Date.parse(flight.endedAtUtc) - Date.parse(flight.startedAtUtc)) / 1000,
          ),
        );
      bundles.push({
        flights: sorted.slice(start, end + 1),
        startedAtUtc: sorted[start].startedAtUtc,
        endedAtUtc: flight.endedAtUtc,
        durationSeconds,
      });
    }
  }
  return bundles;
}

export function scoreFlightBundleCandidate(
  trip: MatchableTrip,
  bundle: MatchableFlightBundle,
): FlightBundleCandidateScore {
  const aircraft =
    bundle.flights.length > 0
    && bundle.flights.every((flight) => flight.aircraftId === trip.aircraftId)
      ? 1
      : 0;
  const dateOverlap = bundle.flights.some(
    (flight) =>
      localDate(flight.startedAtUtc) === trip.reportDate
      || localDate(flight.endedAtUtc) === trip.reportDate,
  )
    ? 1
    : 0;
  const actualHours = bundle.durationSeconds / 3_600;
  const duration = Math.max(
    0,
    1 - Math.abs(actualHours - trip.flightHours) / Math.max(1, trip.flightHours),
  );
  const expectedLegs = Math.max(1, (trip.routeStopCount ?? 2) - 1);
  const observedLegs = bundle.flights.length;
  const legCount = Math.max(
    0,
    1 - Math.abs(observedLegs - expectedLegs) / Math.max(expectedLegs, observedLegs),
  );
  const score =
    aircraft * 0.4
    + dateOverlap * 0.25
    + duration * 0.3
    + legCount * 0.05;
  return {
    score,
    breakdown: {
      aircraft,
      dateOverlap,
      duration,
      legCount,
    },
  };
}

export function autoAttachBundleCandidate(
  candidates: RankedFlightBundleCandidate[],
  minimumScore = 0.9,
  minimumLead = 0.05,
): RankedFlightBundleCandidate | null {
  const ranked = [...candidates].sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best) return null;
  if (
    best.score < minimumScore
    || best.breakdown.aircraft !== 1
    || best.breakdown.dateOverlap !== 1
  ) {
    return null;
  }
  const runnerUp = ranked[1];
  if (runnerUp && best.score - runnerUp.score < minimumLead) return null;
  return best;
}
