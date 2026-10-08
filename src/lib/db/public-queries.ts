import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { publishedTripPredicate } from "./public";

const wrapped = <T>(results: T[]) => ({ results });

export const passengerSortValues = ["trips", "hours", "distance"] as const;
export type PassengerSort = (typeof passengerSortValues)[number];

export function passengerSort(value: string | null | undefined): PassengerSort {
  return passengerSortValues.includes(value as PassengerSort)
    ? value as PassengerSort
    : "trips";
}

export const dataSourceSortValues = ["oldest", "newest", "data"] as const;
export type DataSourceSort = (typeof dataSourceSortValues)[number];

export function dataSourceSort(value: string | null | undefined): DataSourceSort {
  return dataSourceSortValues.includes(value as DataSourceSort)
    ? value as DataSourceSort
    : "oldest";
}

export async function findPublishedTripIdsByTailAndDate(
  db: Database,
  tailNo: string | undefined,
  reportDate: string | undefined,
) {
  return db.all<{ id: string }>(sql`
    SELECT t.id FROM trips t JOIN aircraft a ON a.id = t.aircraft_id
    WHERE a.tail_no = ${tailNo} COLLATE NOCASE
      AND t.report_date = ${reportDate}
      AND ${publishedTripPredicate}
    ORDER BY t.id LIMIT 2
  `);
}

export async function listAircraftPage(db: Database) {
  return wrapped(await db.all<{
    id: string;
    tail_no: string;
    display_name: string;
    manufacturer: string | null;
    model: string | null;
    active: number;
    hourly_cost_cents: number | null;
    trip_count: number;
    flight_hours: number;
    total_cost: number;
    first_trip: string | null;
    latest_trip: string | null;
  }>(sql`
    SELECT a.id, a.tail_no, a.display_name, a.manufacturer, a.model, a.active,
           a.hourly_cost_cents, COUNT(t.id) AS trip_count,
           COALESCE(SUM(t.flight_hours), 0) AS flight_hours,
           COALESCE(
             SUM(COALESCE(t.invoiced_amount_cents, t.estimated_cost_cents)),
             0
           ) AS total_cost,
           MIN(t.report_date) AS first_trip, MAX(t.report_date) AS latest_trip
    FROM aircraft a LEFT JOIN trips t ON t.aircraft_id = a.id AND ${publishedTripPredicate}
    GROUP BY a.id ORDER BY a.tail_no COLLATE NOCASE
  `));
}

export async function listPassengerPage(
  db: Database,
  {
    search = "",
    sort = "trips",
    department = "",
    division = "",
    page = 1,
    limit = 25,
  }: {
    search?: string;
    sort?: PassengerSort;
    department?: string;
    division?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const resolvedLimit = Number.isSafeInteger(limit) && limit > 0
    ? Math.min(limit, 100)
    : 25;
  const requestedPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const [passengers, flightPaths, agencyRows] = await Promise.all([
    db.all<{
      id: string;
      canonical_name: string;
      trip_count: number;
      flight_hours: number;
      latest_trip: string | null;
    }>(sql`
      SELECT p.id, p.canonical_name, COUNT(DISTINCT tp.trip_id) AS trip_count,
             COALESCE(SUM(t.flight_hours), 0) AS flight_hours,
             MAX(t.report_date) AS latest_trip
      FROM people p JOIN trip_people tp ON tp.person_id = p.id
      JOIN trips t ON t.id = tp.trip_id
      WHERE ${publishedTripPredicate}
        AND (${search} = '' OR p.normalized_name LIKE ${`%${search}%`})
        AND (${department} = '' OR t.department = ${department} COLLATE NOCASE)
        AND (${division} = '' OR t.division = ${division} COLLATE NOCASE)
      GROUP BY p.id
    `),
    db.all<{
      person_id: string;
      flight_id: string;
      distance_nmi: number;
    }>(sql`
      SELECT DISTINCT p.id AS person_id, f.id AS flight_id,
             f.distance_metres / 1852.0 AS distance_nmi
      FROM people p
      JOIN trip_people tp ON tp.person_id = p.id
      JOIN trips t ON t.id = tp.trip_id
      JOIN trip_flight_links l ON l.trip_id = t.id
      JOIN observed_flights f ON f.id = l.observed_flight_id
      WHERE ${publishedTripPredicate}
        AND (${search} = '' OR p.normalized_name LIKE ${`%${search}%`})
        AND (${department} = '' OR t.department = ${department} COLLATE NOCASE)
        AND (${division} = '' OR t.division = ${division} COLLATE NOCASE)
    `),
    db.all<{ department: string; division: string | null }>(sql`
      SELECT DISTINCT t.department, t.division
      FROM trips t
      WHERE ${publishedTripPredicate} AND trim(t.department) <> ''
      ORDER BY t.department COLLATE NOCASE, t.division COLLATE NOCASE
    `),
  ]);
  const distanceByPassenger = new Map<string, number>();
  for (const path of flightPaths) {
    distanceByPassenger.set(
      path.person_id,
      (distanceByPassenger.get(path.person_id) ?? 0)
        + Number(path.distance_nmi),
    );
  }
  const value = (passenger: {
    trip_count: number;
    flight_hours: number;
    distance_nmi: number;
  }) => ({
    trips: passenger.trip_count,
    hours: passenger.flight_hours,
    distance: passenger.distance_nmi,
  })[sort];

  const sortedPassengers = passengers
    .map((passenger) => ({
      ...passenger,
      distance_nmi: distanceByPassenger.get(passenger.id) ?? 0,
    }))
    .sort((left, right) =>
      value(right) - value(left)
      || right.trip_count - left.trip_count
      || left.canonical_name.localeCompare(right.canonical_name, "en-US")
    );
  const total = sortedPassengers.length;
  const totalPages = Math.ceil(total / resolvedLimit);
  const resolvedPage = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;
  const divisionsByDepartment = new Map<string, Set<string>>();
  for (const row of agencyRows) {
    const department = row.department.trim();
    if (!department) continue;
    const divisions = divisionsByDepartment.get(department) ?? new Set<string>();
    const division = row.division?.trim();
    if (division) divisions.add(division);
    divisionsByDepartment.set(department, divisions);
  }
  const sortLabels = (values: Iterable<string>) =>
    [...values].sort((left, right) => left.localeCompare(right, "en-US"));

  return {
    results: sortedPassengers.slice(
      (resolvedPage - 1) * resolvedLimit,
      resolvedPage * resolvedLimit,
    ),
    agencies: sortLabels(divisionsByDepartment.keys()).map((department) => ({
      department,
      divisions: sortLabels(divisionsByDepartment.get(department) ?? []),
    })),
    page: resolvedPage,
    limit: resolvedLimit,
    total,
    total_pages: totalPages,
    has_more: resolvedPage < totalPages,
  };
}

export async function listDataSourcesPage(
  db: Database,
  sort: DataSourceSort = "oldest",
) {
  const orderBy = {
    oldest: sql`COALESCE(c.response_date, d.published_at) ASC, d.id ASC`,
    newest: sql`COALESCE(c.response_date, d.published_at) DESC, d.id DESC`,
    data: sql`trip_count DESC, COALESCE(c.response_date, d.published_at) ASC, d.id ASC`,
  }[sort];
  return wrapped(await db.all<{
    id: string;
    original_filename: string;
    byte_size: number;
    sha256: string;
    page_count: number | null;
    title: string | null;
    source_agency: string | null;
    criteria_start: string | null;
    criteria_end: string | null;
    response_date: string | null;
    published_at: string | null;
    trip_count: number;
  }>(sql`
    SELECT d.id, d.original_filename, d.byte_size, d.sha256, d.page_count,
           c.title, c.source_agency, c.criteria_start, c.criteria_end,
           c.response_date, d.published_at,
           (SELECT COUNT(*) FROM trip_sources ts WHERE ts.source_document_id = d.id) AS trip_count
    FROM source_documents d LEFT JOIN source_collections c ON c.id = d.collection_id
    WHERE d.publication_state = 'published'
    ORDER BY ${orderBy}
  `));
}

export async function getHomePageData(db: Database) {
  const [stats, recent, fleet] = await Promise.all([
    db.get<{
      trips: number;
      flights: number;
      people: number;
      hours: number;
      cost: number;
      observed_distance_nmi: number;
    }>(sql`
      SELECT
        (SELECT COUNT(*) FROM trips t WHERE ${publishedTripPredicate}) AS trips,
        (SELECT COALESCE(SUM(leg_count), 0) FROM (
          SELECT CASE WHEN COUNT(s.id) > 1 THEN COUNT(s.id) - 1 ELSE 0 END AS leg_count
          FROM trips t LEFT JOIN trip_route_stops s ON s.trip_id = t.id
          WHERE ${publishedTripPredicate}
          GROUP BY t.id
        )) AS flights,
        (SELECT COUNT(*) FROM people) AS people,
        (SELECT COALESCE(SUM(flight_hours), 0) FROM trips t
         WHERE ${publishedTripPredicate}) AS hours,
        (SELECT COALESCE(
           SUM(COALESCE(t.invoiced_amount_cents, t.estimated_cost_cents)),
           0
         ) FROM trips t
         WHERE ${publishedTripPredicate}) AS cost,
        (SELECT COALESCE(SUM(distance_metres), 0) / 1852.0
         FROM observed_flights) AS observed_distance_nmi
    `),
    db.all<{
      id: string;
      report_date: string;
      raw_route: string;
      department: string;
      division: string | null;
      printed_passengers: string | null;
      flight_hours: number;
      effective_cost_cents: number | null;
      tail_no: string | null;
    }>(sql`
      SELECT t.id, t.report_date, t.raw_route, t.department, t.division,
             t.printed_passengers, t.flight_hours,
             COALESCE(t.invoiced_amount_cents, t.estimated_cost_cents)
               AS effective_cost_cents,
             a.tail_no
      FROM trips t LEFT JOIN aircraft a ON a.id = t.aircraft_id
      WHERE ${publishedTripPredicate}
      ORDER BY t.report_date DESC, t.id DESC LIMIT 6
    `),
    db.all<{
      tail_no: string;
      display_name: string;
      manufacturer: string | null;
      active: number;
      hourly_cost_cents: number | null;
      trip_count: number;
      flight_hours: number;
    }>(sql`
      SELECT a.tail_no, a.display_name, a.manufacturer, a.active, a.hourly_cost_cents,
             COUNT(t.id) AS trip_count, COALESCE(SUM(t.flight_hours), 0) AS flight_hours
      FROM aircraft a
      LEFT JOIN trips t ON t.aircraft_id = a.id AND ${publishedTripPredicate}
      GROUP BY a.id ORDER BY a.tail_no COLLATE NOCASE LIMIT 8
    `),
  ]);
  return {
    stats,
    recent: wrapped(recent),
    fleet: wrapped(fleet),
  };
}

export async function getStatisticsPageData(db: Database) {
  const [
    overview,
    agencies,
    yearly,
    aircraft,
    passengers,
    observedFlights,
    passengerFlightPaths,
  ] =
    await Promise.all([
      db.get<{
        trips: number;
        hours: number;
        cost: number;
        passengers: number;
        first_trip: string | null;
        latest_trip: string | null;
      }>(sql`
        SELECT COUNT(*) AS trips, COALESCE(SUM(t.flight_hours), 0) AS hours,
               COALESCE(
                 SUM(COALESCE(t.invoiced_amount_cents, t.estimated_cost_cents)),
                 0
               ) AS cost,
               (SELECT COUNT(*) FROM people) AS passengers,
               MIN(t.report_date) AS first_trip, MAX(t.report_date) AS latest_trip
        FROM trips t WHERE ${publishedTripPredicate}
      `),
      db.all<{ department: string; trips: number; hours: number; cost: number; passenger_count: number }>(sql`
        SELECT department, COUNT(*) AS trips, COALESCE(SUM(flight_hours), 0) AS hours,
               COALESCE(
                 SUM(COALESCE(invoiced_amount_cents, estimated_cost_cents)),
                 0
               ) AS cost,
               COALESCE(SUM((SELECT COUNT(*) FROM trip_people tp WHERE tp.trip_id = t.id)), 0)
                 AS passenger_count
        FROM trips t WHERE ${publishedTripPredicate}
        GROUP BY department ORDER BY hours DESC LIMIT 50
      `),
      db.all<{ year: string; trips: number; hours: number }>(sql`
        SELECT substr(t.report_date, 1, 4) AS year, COUNT(*) AS trips,
               COALESCE(SUM(t.flight_hours), 0) AS hours
        FROM trips t WHERE ${publishedTripPredicate}
        GROUP BY year ORDER BY year
      `),
      db.all<{ id: string; tail_no: string; display_name: string; trips: number; hours: number; cost: number }>(sql`
        SELECT a.id, a.tail_no, a.display_name, COUNT(t.id) AS trips,
               COALESCE(SUM(t.flight_hours), 0) AS hours,
               COALESCE(
                 SUM(COALESCE(t.invoiced_amount_cents, t.estimated_cost_cents)),
                 0
               ) AS cost
        FROM aircraft a LEFT JOIN trips t ON t.aircraft_id = a.id
          AND ${publishedTripPredicate}
        GROUP BY a.id ORDER BY hours DESC
      `),
      db.all<{ id: string; canonical_name: string; trips: number; hours: number }>(sql`
        SELECT p.id, p.canonical_name, COUNT(DISTINCT t.id) AS trips,
               COALESCE(SUM(t.flight_hours), 0) AS hours
        FROM people p JOIN trip_people tp ON tp.person_id = p.id
        JOIN trips t ON t.id = tp.trip_id
        WHERE ${publishedTripPredicate}
        GROUP BY p.id ORDER BY trips DESC, hours DESC LIMIT 10
      `),
      db.all<{ aircraft_id: string; started_at_utc: string; distance_nmi: number }>(sql`
        SELECT f.aircraft_id, f.started_at_utc,
               f.distance_metres / 1852.0 AS distance_nmi
        FROM observed_flights f
      `),
      db.all<{ person_id: string; flight_id: string; distance_nmi: number }>(sql`
        SELECT DISTINCT tp.person_id, f.id AS flight_id,
               f.distance_metres / 1852.0 AS distance_nmi
        FROM trip_people tp
        JOIN trips t ON t.id = tp.trip_id
        JOIN trip_flight_links l ON l.trip_id = t.id
        JOIN observed_flights f ON f.id = l.observed_flight_id
        WHERE ${publishedTripPredicate}
      `),
    ]);
  const distanceByAircraft = new Map<string, number>();
  for (const flight of observedFlights) {
    distanceByAircraft.set(
      flight.aircraft_id,
      (distanceByAircraft.get(flight.aircraft_id) ?? 0)
        + Number(flight.distance_nmi),
    );
  }
  const distanceByPassenger = new Map<string, number>();
  for (const flight of passengerFlightPaths) {
    distanceByPassenger.set(
      flight.person_id,
      (distanceByPassenger.get(flight.person_id) ?? 0)
        + Number(flight.distance_nmi),
    );
  }
  return {
    overview,
    agencies: wrapped(agencies),
    yearly: wrapped(yearly),
    aircraft: wrapped(aircraft.map((item) => ({
      ...item,
      distance_nmi: distanceByAircraft.get(item.id) ?? 0,
    }))),
    passengers: wrapped(passengers.map((item) => ({
      ...item,
      distance_nmi: distanceByPassenger.get(item.id) ?? 0,
    }))),
    observedFlights: wrapped(observedFlights),
  };
}

export async function getPublicObservedFlight(db: Database, id: string | undefined) {
  const flight = await db.get<Record<string, string | number | null>>(sql`
    SELECT f.*, a.tail_no, a.manufacturer, a.icao_no
    FROM observed_flights f
    JOIN aircraft a ON a.id = f.aircraft_id
    WHERE f.id = ${id} AND f.state <> 'ignored'
  `);
  if (!flight) return null;
  const links = await db.all<{ id: string; report_date: string; raw_route: string }>(sql`
    SELECT t.id, t.report_date, t.raw_route
    FROM trip_flight_links l JOIN trips t ON t.id = l.trip_id
    WHERE l.observed_flight_id = ${id} AND ${publishedTripPredicate}
    ORDER BY t.report_date, t.id
  `);
  return { flight, links: wrapped(links) };
}

export async function getPassengerProfileData(db: Database, personId: string) {
  const [metrics, yearly, aircraft, agencies, flightPaths] = await Promise.all([
    db.get<{
      trip_count: number;
      flight_hours: number;
      total_cost: number;
      passenger_cost: number;
      first_trip: string | null;
      latest_trip: string | null;
    }>(sql`
      WITH person_trips AS (
        SELECT DISTINCT t.id, t.report_date, t.aircraft_id, t.department,
               t.flight_hours,
               COALESCE(t.invoiced_amount_cents, t.estimated_cost_cents)
                 AS effective_cost_cents,
               (
                 SELECT COUNT(DISTINCT trip_passenger.person_id)
                 FROM trip_people trip_passenger
                 WHERE trip_passenger.trip_id = t.id
               ) AS passenger_count
        FROM trip_people tp JOIN trips t ON t.id = tp.trip_id
        WHERE tp.person_id = ${personId} AND ${publishedTripPredicate}
      )
      SELECT COUNT(*) AS trip_count, COALESCE(SUM(flight_hours), 0) AS flight_hours,
             COALESCE(SUM(effective_cost_cents), 0) AS total_cost,
             COALESCE(SUM(
               CASE
                 WHEN passenger_count > 0
                   THEN effective_cost_cents * 1.0 / passenger_count
                 ELSE 0
               END
             ), 0) AS passenger_cost,
             MIN(report_date) AS first_trip, MAX(report_date) AS latest_trip
      FROM person_trips
    `),
    db.all<{ year: string; trip_count: number; flight_hours: number }>(sql`
      SELECT substr(t.report_date, 1, 4) AS year, COUNT(DISTINCT t.id) AS trip_count,
             COALESCE(SUM(t.flight_hours), 0) AS flight_hours
      FROM trip_people tp JOIN trips t ON t.id = tp.trip_id
      WHERE tp.person_id = ${personId} AND ${publishedTripPredicate}
      GROUP BY year ORDER BY year
    `),
    db.all<{ aircraft_id: string; tail_no: string; display_name: string; trip_count: number; flight_hours: number }>(sql`
      SELECT a.id AS aircraft_id, a.tail_no, a.display_name,
             COUNT(DISTINCT t.id) AS trip_count,
             COALESCE(SUM(t.flight_hours), 0) AS flight_hours
      FROM trip_people tp JOIN trips t ON t.id = tp.trip_id
      JOIN aircraft a ON a.id = t.aircraft_id
      WHERE tp.person_id = ${personId} AND ${publishedTripPredicate}
      GROUP BY a.id ORDER BY flight_hours DESC
    `),
    db.all<{ department: string; trip_count: number; flight_hours: number }>(sql`
      SELECT t.department, COUNT(DISTINCT t.id) AS trip_count,
             COALESCE(SUM(t.flight_hours), 0) AS flight_hours
      FROM trip_people tp JOIN trips t ON t.id = tp.trip_id
      WHERE tp.person_id = ${personId} AND ${publishedTripPredicate}
      GROUP BY t.department ORDER BY flight_hours DESC LIMIT 7
    `),
    db.all<{
      id: string;
      year: string;
      aircraft_id: string;
      department: string;
      distance_nmi: number;
    }>(sql`
      SELECT DISTINCT f.id, substr(t.report_date, 1, 4) AS year,
             f.aircraft_id, t.department, f.distance_metres / 1852.0 AS distance_nmi
      FROM trip_people tp
      JOIN trips t ON t.id = tp.trip_id
      JOIN trip_flight_links l ON l.trip_id = t.id
      JOIN observed_flights f ON f.id = l.observed_flight_id
      WHERE tp.person_id = ${personId} AND ${publishedTripPredicate}
    `),
  ]);
  const totalFlightIds = new Set<string>();
  const yearlyFlightIds = new Set<string>();
  const aircraftFlightIds = new Set<string>();
  const agencyFlightIds = new Set<string>();
  const yearlyDistance = new Map<string, number>();
  const aircraftDistance = new Map<string, number>();
  const agencyDistance = new Map<string, number>();
  let totalDistance = 0;
  for (const path of flightPaths) {
    const distance = Number(path.distance_nmi);
    if (!totalFlightIds.has(path.id)) {
      totalFlightIds.add(path.id);
      totalDistance += distance;
    }
    const yearKey = `${path.year}:${path.id}`;
    if (!yearlyFlightIds.has(yearKey)) {
      yearlyFlightIds.add(yearKey);
      yearlyDistance.set(path.year, (yearlyDistance.get(path.year) ?? 0) + distance);
    }
    const aircraftKey = `${path.aircraft_id}:${path.id}`;
    if (!aircraftFlightIds.has(aircraftKey)) {
      aircraftFlightIds.add(aircraftKey);
      aircraftDistance.set(
        path.aircraft_id,
        (aircraftDistance.get(path.aircraft_id) ?? 0) + distance,
      );
    }
    const agencyKey = `${path.department}:${path.id}`;
    if (!agencyFlightIds.has(agencyKey)) {
      agencyFlightIds.add(agencyKey);
      agencyDistance.set(
        path.department,
        (agencyDistance.get(path.department) ?? 0) + distance,
      );
    }
  }
  return {
    metrics: metrics
      ? {
          ...metrics,
          distance_nmi: totalDistance,
        }
      : metrics,
    yearly: wrapped(yearly.map((item) => ({
      ...item,
      distance_nmi: yearlyDistance.get(item.year) ?? 0,
    }))),
    aircraft: wrapped(aircraft.map((item) => ({
      ...item,
      distance_nmi: aircraftDistance.get(item.aircraft_id) ?? 0,
    }))),
    agencies: wrapped(agencies.map((item) => ({
      ...item,
      distance_nmi: agencyDistance.get(item.department) ?? 0,
    }))),
  };
}

export async function findAircraftByPublicParam(db: Database, param: string) {
  return db.get<Record<string, string | number | null>>(sql`
    SELECT * FROM aircraft WHERE id = ${param} OR tail_no = ${param} COLLATE NOCASE
  `);
}

export async function findAircraftByTailNo(db: Database, tailNo: string) {
  return db.get<{ tail_no: string }>(sql`
    SELECT tail_no FROM aircraft WHERE tail_no = ${tailNo} COLLATE NOCASE
  `);
}

export async function getAircraftProfileData(db: Database, aircraftId: string) {
  const [
    metrics,
    yearly,
    departments,
    observedFlights,
    recordedFlights,
    departmentFlightPaths,
  ] =
    await Promise.all([
      db.get<{
        trip_count: number;
        flight_hours: number;
        total_cost: number;
        first_trip: string | null;
        latest_trip: string | null;
        agency_count: number;
        passenger_count: number;
      }>(sql`
        SELECT COUNT(*) AS trip_count,
               COALESCE(SUM(t.flight_hours), 0) AS flight_hours,
               COALESCE(
                 SUM(COALESCE(t.invoiced_amount_cents, t.estimated_cost_cents)),
                 0
               ) AS total_cost,
               MIN(t.report_date) AS first_trip, MAX(t.report_date) AS latest_trip,
               COUNT(DISTINCT t.department) AS agency_count,
               (
                 SELECT COUNT(DISTINCT tp.person_id)
                 FROM trip_people tp
                 JOIN trips passenger_trip ON passenger_trip.id = tp.trip_id
                 WHERE passenger_trip.aircraft_id = ${aircraftId}
                   AND passenger_trip.publication_state = 'published'
                   AND (
                     passenger_trip.ingestion_batch_id IS NULL OR EXISTS (
                       SELECT 1 FROM ingestion_batches b
                       WHERE b.id = passenger_trip.ingestion_batch_id
                         AND b.state = 'published'
                     )
                   )
               ) AS passenger_count
        FROM trips t
        WHERE t.aircraft_id = ${aircraftId} AND ${publishedTripPredicate}
      `),
      db.all<{ year: string; trip_count: number; flight_hours: number }>(sql`
        SELECT substr(t.report_date, 1, 4) AS year, COUNT(*) AS trip_count,
               COALESCE(SUM(t.flight_hours), 0) AS flight_hours
        FROM trips t
        WHERE t.aircraft_id = ${aircraftId} AND ${publishedTripPredicate}
        GROUP BY year ORDER BY year
      `),
      db.all<{ department: string; trip_count: number; flight_hours: number }>(sql`
        SELECT t.department, COUNT(*) AS trip_count,
               COALESCE(SUM(t.flight_hours), 0) AS flight_hours
        FROM trips t
        WHERE t.aircraft_id = ${aircraftId} AND ${publishedTripPredicate}
        GROUP BY t.department ORDER BY flight_hours DESC LIMIT 7
      `),
      db.all<{
        id: string;
        started_at_utc: string;
        ended_at_utc: string;
        duration_seconds: number;
        geometry_json: string;
      }>(sql`
        SELECT f.id, f.started_at_utc, f.ended_at_utc, f.duration_seconds,
               f.geometry_json
        FROM observed_flights f
        WHERE f.aircraft_id = ${aircraftId}
        ORDER BY f.started_at_utc DESC LIMIT 120
      `),
      db.all<{ started_at_utc: string; distance_nmi: number }>(sql`
        SELECT f.started_at_utc, f.distance_metres / 1852.0 AS distance_nmi
        FROM observed_flights f
        WHERE f.aircraft_id = ${aircraftId}
      `),
      db.all<{ id: string; department: string; distance_nmi: number }>(sql`
        SELECT DISTINCT f.id, t.department,
               f.distance_metres / 1852.0 AS distance_nmi
        FROM trips t
        JOIN trip_flight_links l ON l.trip_id = t.id
        JOIN observed_flights f ON f.id = l.observed_flight_id
        WHERE t.aircraft_id = ${aircraftId} AND ${publishedTripPredicate}
      `),
    ]);
  const departmentDistance = new Map<string, number>();
  for (const path of departmentFlightPaths) {
    departmentDistance.set(
      path.department,
      (departmentDistance.get(path.department) ?? 0)
        + Number(path.distance_nmi),
    );
  }
  return {
    metrics,
    yearly: wrapped(yearly),
    departments: wrapped(departments.map((item) => ({
      ...item,
      distance_nmi: departmentDistance.get(item.department) ?? 0,
    }))),
    observedFlights: wrapped(observedFlights),
    recordedFlights: wrapped(recordedFlights),
  };
}
