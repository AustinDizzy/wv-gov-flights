import { sql, type SQL } from "drizzle-orm";
import { useDatabase, type DatabaseInput } from "../../db/client";
import { tripSort } from "../trip-table";

export const publishedTripPredicate = sql`
  t.publication_state = 'published'
  AND (
    t.ingestion_batch_id IS NULL OR EXISTS (
      SELECT 1 FROM ingestion_batches b
      WHERE b.id = t.ingestion_batch_id AND b.state = 'published'
    )
  )
`;

export interface PublicTrip {
  id: string;
  record_kind: "reported";
  report_date: string;
  tail_no: string | null;
  aircraft_name: string | null;
  manufacturer?: string | null;
  model?: string | null;
  icao_no?: string | null;
  hourly_cost_cents?: number | null;
  raw_route: string;
  department: string;
  division: string | null;
  printed_passengers: string | null;
  flight_hours: number;
  comments: string | null;
  justification: string | null;
  invoiced_amount_cents: number | null;
  estimated_cost_cents: number | null;
  effective_cost_cents: number | null;
  passenger_count: number;
  distance_nmi: number;
  observed_flight_count: number;
}

export interface TripScope {
  aircraftId?: string;
  personId?: string;
}

export interface TripFilterOptions {
  aircraft: string[];
  agencies: Array<{
    department: string;
    divisions: string[];
  }>;
  dateBounds: {
    min: string | null;
    max: string | null;
  };
}

function ftsQuery(input: string): string {
  return input
    .normalize("NFKC")
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}'’-]/gu, ""))
    .filter(Boolean)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(" AND ");
}

function repeatedParam(searchParams: URLSearchParams, key: string): string[] {
  return [...new Set(searchParams.getAll(key).map((value) => value.trim()).filter(Boolean))];
}

function inValues(values: string[]): SQL {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

function pageSize(value: string | null, fallback = 25): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, 100)
    : fallback;
}

function validDateParam(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function currentWestVirginiaDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function listTrips(input: DatabaseInput, url: URL, scope: TripScope = {}) {
  const db = useDatabase(input);
  const sort = tripSort(url.searchParams.get("sort"));
  const limit = pageSize(url.searchParams.get("limit"));
  const pageParam = url.searchParams.get("page") ?? "1";
  const requestedPage = Number(pageParam);
  const page = /^[1-9]\d*$/.test(pageParam) && Number.isSafeInteger(requestedPage) ? requestedPage : 1;
  const search =
    url.searchParams.get("search")?.trim() || url.searchParams.get("q")?.trim() || "";
  const aircraft = repeatedParam(url.searchParams, "aircraft");
  const departments = repeatedParam(url.searchParams, "department");
  const divisions = repeatedParam(url.searchParams, "division");
  const agency = url.searchParams.get("agency")?.trim();
  const passenger = url.searchParams.get("passenger")?.trim();
  const startDate = url.searchParams.get("startDate")?.trim();
  const endDate = url.searchParams.get("endDate")?.trim();

  const clauses: SQL[] = [publishedTripPredicate];
  const normalizedFtsQuery = search ? ftsQuery(search) : "";
  const ftsJoin = normalizedFtsQuery
    ? sql`JOIN trip_search search ON search.trip_id = t.id
          JOIN trips_fts ON trips_fts.rowid = search.id`
    : sql.empty();
  if (normalizedFtsQuery) clauses.push(sql`trips_fts MATCH ${normalizedFtsQuery}`);
  if (aircraft.length > 0) {
    clauses.push(
      sql`(a.id IN (${inValues(aircraft)}) OR a.tail_no COLLATE NOCASE IN (${inValues(aircraft)}))`,
    );
  }
  if (departments.length > 0 || divisions.length > 0) {
    const agencyClauses: SQL[] = [];
    if (departments.length > 0) {
      agencyClauses.push(sql`t.department COLLATE NOCASE IN (${inValues(departments)})`);
    }
    if (divisions.length > 0) {
      agencyClauses.push(sql`t.division COLLATE NOCASE IN (${inValues(divisions)})`);
    }
    clauses.push(sql`(${sql.join(agencyClauses, sql` OR `)})`);
  }
  if (agency) {
    const like = `%${agency.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    clauses.push(sql`(t.department LIKE ${like} ESCAPE '\' OR t.division LIKE ${like} ESCAPE '\')`);
  }
  if (passenger) {
    clauses.push(sql`
      EXISTS (
        SELECT 1 FROM trip_people tp JOIN people p ON p.id = tp.person_id
        WHERE tp.trip_id = t.id AND p.normalized_name LIKE ${`%${passenger.toLocaleLowerCase()}%`}
      )
    `);
  }
  if (validDateParam(startDate)) {
    clauses.push(sql`t.report_date >= ${startDate}`);
  }
  const rangeEnd = validDateParam(endDate)
    ? endDate
    : validDateParam(startDate)
      ? currentWestVirginiaDate()
      : undefined;
  if (rangeEnd) {
    clauses.push(sql`t.report_date <= ${rangeEnd}`);
  }
  if (scope.aircraftId) clauses.push(sql`t.aircraft_id = ${scope.aircraftId}`);
  if (scope.personId) {
    clauses.push(sql`
      EXISTS (
        SELECT 1 FROM trip_people scoped_tp
        WHERE scoped_tp.trip_id = t.id AND scoped_tp.person_id = ${scope.personId}
      )
    `);
  }
  const where = sql.join(clauses, sql` AND `);

  const aggregate = await db.get<{
    total: number | string;
    total_flight_hours: number | string;
    total_cost_cents: number | string;
  }>(sql`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(t.flight_hours), 0) AS total_flight_hours,
           COALESCE(
             SUM(COALESCE(t.invoiced_amount_cents, t.estimated_cost_cents)),
             0
           ) AS total_cost_cents
    FROM trips t
    LEFT JOIN aircraft a ON a.id = t.aircraft_id
    ${ftsJoin}
    WHERE ${where}
  `);
  const total = Number(aggregate?.total ?? 0);
  const totalPages = Math.ceil(total / limit);
  const resolvedPage = totalPages > 0 ? Math.min(page, totalPages) : 1;

  const selectTrips = (orderBy: SQL) => db.all<PublicTrip>(sql`
    SELECT 'reported' AS record_kind, t.id, t.report_date,
           a.tail_no, a.display_name AS aircraft_name,
           t.raw_route, t.department, t.division, t.printed_passengers,
           t.flight_hours, t.comments, t.justification, t.invoiced_amount_cents,
           t.estimated_cost_cents,
           COALESCE(t.invoiced_amount_cents, t.estimated_cost_cents)
             AS effective_cost_cents,
           (SELECT COUNT(*) FROM trip_people tp WHERE tp.trip_id = t.id)
             AS passenger_count,
           (SELECT COUNT(*) FROM trip_flight_links l WHERE l.trip_id = t.id)
             AS observed_flight_count,
           COALESCE((
             SELECT SUM(f.distance_metres) / 1852.0
             FROM trip_flight_links l
             JOIN observed_flights f ON f.id = l.observed_flight_id
             WHERE l.trip_id = t.id
           ), 0) AS distance_nmi
    FROM trips t
    LEFT JOIN aircraft a ON a.id = t.aircraft_id
    ${ftsJoin}
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${(resolvedPage - 1) * limit}
  `);

  const orderBy = {
    date: sql`t.report_date DESC, t.id DESC`,
    time: sql`t.flight_hours DESC, t.report_date DESC, t.id DESC`,
    amount: sql`
      COALESCE(t.invoiced_amount_cents, t.estimated_cost_cents, -1) DESC,
      t.report_date DESC,
      t.id DESC
    `,
    passengers: sql`passenger_count DESC, t.report_date DESC, t.id DESC`,
    distance: sql`distance_nmi DESC, t.report_date DESC, t.id DESC`,
  }[sort];
  const items = await selectTrips(orderBy);

  return {
    items,
    page: resolvedPage,
    limit,
    total,
    total_pages: totalPages,
    has_more: resolvedPage < totalPages,
    total_flight_hours: Number(aggregate?.total_flight_hours ?? 0),
    total_cost_cents: Number(aggregate?.total_cost_cents ?? 0),
  };
}

export async function listTripFilterOptions(
  input: DatabaseInput,
  scope: TripScope = {},
): Promise<TripFilterOptions> {
  const db = useDatabase(input);
  const clauses: SQL[] = [publishedTripPredicate];
  if (scope.aircraftId) clauses.push(sql`t.aircraft_id = ${scope.aircraftId}`);
  if (scope.personId) {
    clauses.push(sql`
      EXISTS (
        SELECT 1 FROM trip_people scoped_tp
        WHERE scoped_tp.trip_id = t.id AND scoped_tp.person_id = ${scope.personId}
      )
    `);
  }
  const where = sql.join(clauses, sql` AND `);
  const [rows, dateBounds] = await Promise.all([
    db.all<{
      tail_no: string | null;
      department: string;
      division: string | null;
    }>(sql`
      SELECT DISTINCT a.tail_no, t.department, t.division
      FROM trips t
      LEFT JOIN aircraft a ON a.id = t.aircraft_id
      WHERE ${where}
    `),
    db.get<{ min_date: string | null; max_date: string | null }>(sql`
      SELECT MIN(t.report_date) AS min_date, MAX(t.report_date) AS max_date
      FROM trips t
      WHERE ${where}
    `),
  ]);
  const sort = (values: Set<string>) =>
    [...values].sort((left, right) => left.localeCompare(right, "en-US"));

  const divisionsByDepartment = new Map<string, Set<string>>();
  for (const row of rows) {
    const department = row.department.trim();
    if (!department) continue;
    const divisions = divisionsByDepartment.get(department) ?? new Set<string>();
    const division = row.division?.trim();
    if (division) divisions.add(division);
    divisionsByDepartment.set(department, divisions);
  }

  return {
    aircraft: sort(new Set(rows.map((row) => row.tail_no?.trim()).filter(Boolean) as string[])),
    agencies: sort(new Set(divisionsByDepartment.keys())).map((department) => ({
      department,
      divisions: sort(divisionsByDepartment.get(department) ?? new Set()),
    })),
    dateBounds: {
      min: dateBounds?.min_date ?? null,
      max: dateBounds?.max_date ?? null,
    },
  };
}

export async function getTrip(input: DatabaseInput, id: string) {
  const db = useDatabase(input);
  const trip = await db.get<PublicTrip & Record<string, string | number | null>>(sql`
    SELECT t.id, 'reported' AS record_kind, t.report_date, t.aircraft_id,
           t.raw_route, t.department, t.division, t.printed_passengers,
           t.flight_hours, t.comments, t.justification,
           t.invoiced_amount_cents, t.estimated_cost_cents,
           COALESCE(t.invoiced_amount_cents, t.estimated_cost_cents)
             AS effective_cost_cents,
           a.tail_no, a.display_name AS aircraft_name, a.manufacturer,
           a.model, a.icao_no, a.hourly_cost_cents
    FROM trips t LEFT JOIN aircraft a ON a.id = t.aircraft_id
    WHERE t.id = ${id} AND ${publishedTripPredicate}
  `);
  if (!trip) return null;
  const [people, stops, sources, flights] = await Promise.all([
    db.all(sql`
      SELECT p.id, p.canonical_name, tp.printed_name, tp.position
      FROM trip_people tp JOIN people p ON p.id = tp.person_id
      WHERE tp.trip_id = ${id} ORDER BY tp.position
    `),
    db.all(sql`
      SELECT s.*
      FROM trip_route_stops s
      WHERE s.trip_id = ${id} ORDER BY s.position
    `),
    db.all(sql`
      SELECT d.id, d.original_filename, c.source_agency
      FROM trip_sources ts JOIN source_documents d ON d.id = ts.source_document_id
      LEFT JOIN source_collections c ON c.id = d.collection_id
      WHERE ts.trip_id = ${id} AND d.publication_state = 'published'
      ORDER BY d.created_at, d.id
    `),
    db.all(sql`
      SELECT f.id, f.started_at_utc, f.ended_at_utc, f.duration_seconds,
             f.geometry_json, f.distance_metres / 1852.0 AS distance_nmi, l.position
      FROM trip_flight_links l JOIN observed_flights f ON f.id = l.observed_flight_id
      WHERE l.trip_id = ${id} ORDER BY f.started_at_utc, l.position
    `),
  ]);
  return {
    ...trip,
    people,
    stops,
    sources,
    observed_flights: flights,
  };
}
