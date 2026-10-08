import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { publishIngestionBatch } from "../../src/lib/ingestion/publish";
import { createAuth } from "../../src/lib/auth";
import { createDatabase } from "../../src/db/client";
import {
  getTrip,
  listTripFilterOptions,
  listTrips,
} from "../../src/lib/db/public";
import {
  getPassengerProfileData,
  listPassengerPage,
} from "../../src/lib/db/public-queries";
import { updateObservedFlightGeometry } from "../../src/lib/db/admin-queries";
import { findPersonByPublicParam } from "../../src/lib/public-routes";
import {
  findSourceDocumentByRoute,
  sourceDocumentGet,
} from "../../src/lib/source-documents";
import { GET as statsRedirect } from "../../src/pages/stats";
import { GET as tripsRss } from "../../src/pages/trips.rss";
import { GET as dataSourcesRss } from "../../src/pages/data-sources.rss";

describe("Cloudflare platform integration", () => {
  it("applies the D1 migration with FTS and auth tables", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results.map((row) => row.name)).toContain("trips_fts");
    expect(tables.results.map((row) => row.name)).toContain("session");
    expect(tables.results.map((row) => row.name)).not.toContain("places");
    const sourceColumns = await env.DB.prepare(
      "PRAGMA table_info(trip_sources)",
    ).all<{ name: string }>();
    expect(sourceColumns.results.map((column) => column.name)).toEqual([
      "id",
      "trip_id",
      "source_document_id",
      "created_at",
    ]);
    const tripColumns = await env.DB.prepare(
      "PRAGMA table_info(trips)",
    ).all<{ name: string }>();
    expect(tripColumns.results.map((column) => column.name))
      .toContain("estimated_cost_cents");
    expect(tripColumns.results.map((column) => column.name))
      .not.toContain("cost_cents");
    const routeStopColumns = await env.DB.prepare(
      "PRAGMA table_info(trip_route_stops)",
    ).all<{ name: string }>();
    expect(routeStopColumns.results.map((column) => column.name))
      .toEqual(["id", "trip_id", "position", "raw_label"]);
    const observedColumns = await env.DB.prepare(
      "PRAGMA table_info(observed_flights)",
    ).all<{ name: string }>();
    expect(observedColumns.results.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "source_date",
        "segment_index",
        "geometry_json",
        "telemetry_r2_key",
        "telemetry_point_count",
        "min_altitude_ft",
        "max_altitude_ft",
        "source_hash",
        "distance_metres",
        "geometry_source",
        "geometry_updated_by_user_id",
      ]),
    );
    expect(observedColumns.results.map((column) => column.name))
      .not.toContain("imported_geometry_json");
    const tablesAfterMigration = await env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table'",
    ).all<{ name: string }>();
    expect(tablesAfterMigration.results.map((row) => row.name))
      .not.toContain("observed_flight_revisions");
    const linkColumns = await env.DB.prepare(
      "PRAGMA table_info(trip_flight_links)",
    ).all<{ name: string }>();
    expect(linkColumns.results.map((column) => column.name))
      .not.toContain("revision_id");
  });

  it("preserves the baseline constraints, indexes, and custom FTS objects", async () => {
    const expectedForeignKeys = [
      ["source_documents", "collection_id", "source_collections", "SET NULL"],
      ["ingestion_batches", "source_document_id", "source_documents", "RESTRICT"],
      ["trips", "ingestion_batch_id", "ingestion_batches", "SET NULL"],
      ["trips", "aircraft_id", "aircraft", "SET NULL"],
      ["trip_route_stops", "trip_id", "trips", "CASCADE"],
      ["trip_people", "trip_id", "trips", "CASCADE"],
      ["trip_people", "person_id", "people", "RESTRICT"],
      ["trip_sources", "trip_id", "trips", "CASCADE"],
      ["trip_sources", "source_document_id", "source_documents", "RESTRICT"],
      ["ingestion_rows", "batch_id", "ingestion_batches", "CASCADE"],
      ["ingestion_rows", "existing_trip_id", "trips", "SET NULL"],
      ["ingestion_rows", "published_trip_id", "trips", "SET NULL"],
      ["observed_flights", "aircraft_id", "aircraft", "RESTRICT"],
      ["trip_flight_links", "trip_id", "trips", "CASCADE"],
      ["trip_flight_links", "observed_flight_id", "observed_flights", "RESTRICT"],
      ["flight_match_candidates", "ingestion_row_id", "ingestion_rows", "CASCADE"],
      ["flight_match_candidates", "trip_id", "trips", "CASCADE"],
      ["flight_match_candidates", "observed_flight_id", "observed_flights", "CASCADE"],
      ["trip_search", "trip_id", "trips", "CASCADE"],
      ["session", "userId", "user", "CASCADE"],
      ["account", "userId", "user", "CASCADE"],
    ] as const;

    for (const [table, column, parent, onDelete] of expectedForeignKeys) {
      const foreignKeys = await env.DB.prepare(
        `PRAGMA foreign_key_list("${table}")`,
      ).all<{ from: string; table: string; on_delete: string }>();
      expect(foreignKeys.results).toContainEqual(
        expect.objectContaining({
          from: column,
          table: parent,
          on_delete: onDelete,
        }),
      );
    }

    const indexes = await env.DB.prepare(
      `SELECT name
       FROM sqlite_schema
       WHERE type = 'index'
         AND name NOT LIKE 'sqlite_autoindex_%'
       ORDER BY name`,
    ).all<{ name: string }>();
    expect(indexes.results.map((row) => row.name)).toEqual([
      "account_provider_unique",
      "account_user_idx",
      "audit_events_entity_idx",
      "ingestion_rows_review_idx",
      "observed_flights_aircraft_time_idx",
      "observed_flights_source_hash_idx",
      "observed_flights_source_segment_idx",
      "observed_flights_state_time_idx",
      "people_normalized_name_unique",
      "session_user_idx",
      "trip_flight_links_flight_idx",
      "trip_people_person_idx",
      "trip_sources_document_idx",
      "trips_agency_idx",
      "trips_aircraft_date_idx",
      "trips_batch_idx",
      "trips_public_date_idx",
      "verification_identifier_idx",
    ]);

    const customObjects = await env.DB.prepare(
      `SELECT type, name
       FROM sqlite_schema
       WHERE name = 'trips_fts'
          OR name IN ('trip_search_ai', 'trip_search_ad', 'trip_search_au')
       ORDER BY type, name`,
    ).all<{ type: string; name: string }>();
    expect(customObjects.results).toEqual([
      { type: "table", name: "trips_fts" },
      { type: "trigger", name: "trip_search_ad" },
      { type: "trigger", name: "trip_search_ai" },
      { type: "trigger", name: "trip_search_au" },
    ]);
  });

  it("starts Google sign-in and stores OAuth state with D1-compatible timestamps", async () => {
    const response = await createAuth(env).handler(
      new Request(
        "https://l.abs.codes/wv-gov-flights/api/auth/sign-in/social",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://l.abs.codes",
          },
          body: JSON.stringify({
            provider: "google",
            callbackURL: "https://l.abs.codes/wv-gov-flights/admin",
            disableRedirect: true,
          }),
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      redirect: false,
      url: expect.stringContaining("accounts.google.com"),
    });
    await expect(
      env.DB.prepare(
        `SELECT typeof(expiresAt) AS expires_at_type,
                typeof(createdAt) AS created_at_type,
                typeof(updatedAt) AS updated_at_type
         FROM verification
         LIMIT 1`,
      ).first(),
    ).resolves.toEqual({
      expires_at_type: "integer",
      created_at_type: "integer",
      updated_at_type: "integer",
    });
  });

  it("publishes reviewed rows atomically while allowing explicit exclusions", async () => {
    const trip = {
      source_page: 1,
      source_row: 1,
      date: "2026-07-01",
      tail_no: "NINVOICE",
      department: "Department of Test",
      division: "Test Division",
      flight_hours: 1.2,
      route: "CRW → HTS → CRW",
      passengers: "Jane Doe; John Doe",
      comments: null,
      invoiced_amount: 100.25,
      warnings: [],
    };
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO aircraft (id, tail_no, display_name, hourly_cost_cents)
         VALUES ('aircraft_invoice', 'NINVOICE', 'Invoice Test Aircraft', 5000)`,
      ),
      env.DB.prepare(
         `INSERT INTO source_documents
         (id, sha256, original_filename, byte_size, r2_key)
         VALUES ('document_publish', ?, 'test.pdf', 10, 'datasources/test-agency/test.pdf')`,
      ).bind("a".repeat(64)),
      env.DB.prepare(
        `INSERT INTO ingestion_batches (id, source_document_id, state)
         VALUES ('batch_publish', 'document_publish', 'review_required')`,
      ),
      env.DB.prepare(
        `INSERT INTO ingestion_rows
         (id, batch_id, position, source_page, source_row, extracted_json,
          validation_errors_json, review_action)
         VALUES ('row_publish', 'batch_publish', 0, 1, 1, ?, '[]', 'create')`,
      ).bind(JSON.stringify(trip)),
      env.DB.prepare(
        `INSERT INTO ingestion_rows
         (id, batch_id, position, source_page, source_row, extracted_json,
          validation_errors_json, review_action)
         VALUES ('row_excluded', 'batch_publish', 1, 2, 1, '{}', '["invalid"]', 'exclude')`,
      ),
    ]);

    expect(
      (await listTrips(env.DB, new URL("https://example.test/trips"))).items,
    ).toHaveLength(0);
    await publishIngestionBatch(env.DB, "batch_publish", "test-user");
    const published = await listTrips(
      env.DB,
      new URL("https://example.test/trips"),
    );
    expect(published.items).toHaveLength(1);
    expect(published.items[0].record_kind).toBe("reported");
    expect(published.items[0].invoiced_amount_cents).toBe(10025);
    expect(published.items[0].estimated_cost_cents).toBe(6000);
    expect(published.items[0].effective_cost_cents).toBe(10025);
    expect(published.total_flight_hours).toBe(1.2);
    expect(published.total_cost_cents).toBe(10025);
    for (const sort of ["time", "amount", "passengers", "distance"]) {
      expect(
        (
          await listTrips(
            env.DB,
            new URL(`https://example.test/trips?department=Department%20of%20Test&sort=${sort}`),
          )
        ).items.map((item) => item.id),
      ).toEqual([published.items[0].id]);
    }
    const passengerPage = await listPassengerPage(
      createDatabase(env.DB),
      { search: "jane doe", sort: "distance", limit: 1 },
    );
    expect(passengerPage.results).toMatchObject([
      { canonical_name: "Jane Doe", trip_count: 1, distance_nmi: 0 },
    ]);
    expect(passengerPage).toMatchObject({
      page: 1,
      limit: 1,
      total: 1,
      total_pages: 1,
      agencies: [{
        department: "Department of Test",
        divisions: ["Test Division"],
      }],
    });
    expect(
      (
        await getPassengerProfileData(
          createDatabase(env.DB),
          passengerPage.results[0].id,
        )
      ).metrics,
    ).toMatchObject({
      flight_hours: 1.2,
      total_cost: 10025,
      passenger_cost: 5012.5,
      distance_nmi: 0,
    });
    const departmentPassengers = await listPassengerPage(
      createDatabase(env.DB),
      { department: "Department of Test" },
    );
    expect(departmentPassengers.results.map((person) => person.canonical_name))
      .toEqual(["Jane Doe", "John Doe"]);
    const divisionPassengers = await listPassengerPage(
      createDatabase(env.DB),
      { division: "Test Division" },
    );
    expect(divisionPassengers.results.map((person) => person.canonical_name))
      .toEqual(["Jane Doe", "John Doe"]);
    const secondPassengerPage = await listPassengerPage(
      createDatabase(env.DB),
      { department: "Department of Test", page: 2, limit: 1 },
    );
    expect(secondPassengerPage).toMatchObject({
      page: 2,
      limit: 1,
      total: 2,
      total_pages: 2,
    });
    expect(secondPassengerPage.results.map((person) => person.canonical_name))
      .toEqual(["John Doe"]);
    expect(
      (
        await listPassengerPage(
          createDatabase(env.DB),
          { department: "Not a department" },
        )
      ).total,
    ).toBe(0);
    expect(
      (
        await listPassengerPage(
          createDatabase(env.DB),
          { division: "Not a division" },
        )
      ).total,
    ).toBe(0);

    const statsResponse = await statsRedirect({} as never);
    expect(statsResponse.status).toBe(301);
    expect(statsResponse.headers.get("location")).toBe(
      "https://l.abs.codes/wv-gov-flights/statistics",
    );

    const tripFeed = await tripsRss({} as never);
    expect(tripFeed.headers.get("content-type")).toContain("application/rss+xml");
    expect(await tripFeed.text()).toContain("<title>Golden Dome Airways — New trips</title>");
    const sourceFeed = await dataSourcesRss({} as never);
    expect(sourceFeed.headers.get("content-type")).toContain("application/rss+xml");
    expect(await sourceFeed.text()).toContain("New data sources");
    expect(
      (await listTrips(
        env.DB,
        new URL("https://example.test/trips?department=Nope&department=Department%20of%20Test"),
      )).items,
    ).toHaveLength(1);
    expect(
      (await listTrips(
        env.DB,
        new URL("https://example.test/trips?division=Nope&division=Test%20Division"),
      )).items,
    ).toHaveLength(1);
    expect(
      (await listTrips(
        env.DB,
        new URL("https://example.test/trips?department=Nope&division=Test%20Division"),
      )).items,
    ).toHaveLength(1);
    expect(
      (await listTrips(
        env.DB,
        new URL("https://example.test/trips?startDate=2026-07-01&endDate=2026-07-01"),
      )).items,
    ).toHaveLength(1);
    expect(
      (await listTrips(
        env.DB,
        new URL("https://example.test/trips?endDate=2026-06-30"),
      )).items,
    ).toHaveLength(0);
    expect(
      await env.DB.prepare(
        "SELECT source_document_id FROM trip_sources WHERE trip_id = ?",
      )
        .bind(published.items[0].id)
        .first<{ source_document_id: string }>(),
    ).toEqual({ source_document_id: "document_publish" });
    expect(
      await env.DB.prepare(
        "SELECT state FROM ingestion_batches WHERE id = 'batch_publish'",
      ).first<{ state: string }>(),
    ).toEqual({ state: "published" });
  });

  it("calculates a trip cost from flight hours and the aircraft rate", async () => {
    const trip = {
      source_page: 1,
      source_row: 1,
      date: "2026-07-02",
      tail_no: "NPRICE",
      department: "Department of Test",
      division: null,
      flight_hours: 1.25,
      route: "CRW → HTS → CRW",
      passengers: null,
      comments: null,
      invoiced_amount: null,
      warnings: [],
    };
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO aircraft (id, tail_no, display_name, hourly_cost_cents)
         VALUES ('aircraft_cost', 'NPRICE', 'Cost Test Aircraft', 12345)`,
      ),
      env.DB.prepare(
        `INSERT INTO source_documents
         (id, sha256, original_filename, byte_size, r2_key)
         VALUES ('document_cost', ?, 'cost.pdf', 10, 'datasources/test-agency/cost.pdf')`,
      ).bind("d".repeat(64)),
      env.DB.prepare(
        `INSERT INTO ingestion_batches (id, source_document_id, state)
         VALUES ('batch_cost', 'document_cost', 'review_required')`,
      ),
      env.DB.prepare(
        `INSERT INTO ingestion_rows
         (id, batch_id, position, source_page, source_row, extracted_json,
          validation_errors_json, review_action)
         VALUES ('row_cost', 'batch_cost', 0, 1, 1, ?, '[]', 'create')`,
      ).bind(JSON.stringify(trip)),
    ]);

    await publishIngestionBatch(env.DB, "batch_cost", "test-user");
    const published = await listTrips(
      env.DB,
      new URL("https://example.test/trips?aircraft=NPRICE"),
    );
    expect(published.items).toHaveLength(1);
    expect(published.items[0].invoiced_amount_cents).toBeNull();
    expect(published.items[0].estimated_cost_cents).toBe(15431);
    expect(published.items[0].effective_cost_cents).toBe(15431);
    expect(published.total_cost_cents).toBe(15431);
    expect(
      (
        await listTrips(
          env.DB,
          new URL("https://example.test/aircraft/NPRICE?search=Department"),
          { aircraftId: "aircraft_cost" },
        )
      ).items.map((item) => item.id),
    ).toEqual([published.items[0].id]);
    expect(await listTripFilterOptions(env.DB, { aircraftId: "aircraft_cost" }))
      .toEqual({
        aircraft: ["NPRICE"],
        agencies: [{
          department: "Department of Test",
          divisions: [],
        }],
        dateBounds: {
          min: "2026-07-02",
          max: "2026-07-02",
        },
      });
  });

  it("resolves readable source URLs independently from legacy R2 keys", async () => {
    const bytes = new TextEncoder().encode("%PDF-readable-route-test");
    await env.FILES.put("documents/legacy/original.pdf", bytes, {
      httpMetadata: { contentType: "application/pdf" },
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO source_collections (id, title, source_agency)
         VALUES ('collection_readable_route', 'Readable route test', 'WV Governor''s Office')`,
      ),
      env.DB.prepare(
        `INSERT INTO source_documents
         (id, collection_id, sha256, original_filename, byte_size, r2_key,
          publication_state, published_at)
         VALUES ('document_readable_route', 'collection_readable_route', ?,
                 'FOIA Response.pdf', ?, 'documents/legacy/original.pdf',
                 'published', CURRENT_TIMESTAMP)`,
      ).bind("b".repeat(64), bytes.byteLength),
    ]);

    const document = await findSourceDocumentByRoute(
      env.DB,
      "wv-governors-office",
      "FOIA Response.pdf",
    );
    expect(document?.id).toBe("document_readable_route");
    const response = await sourceDocumentGet(
      env.FILES,
      document!,
      new Request("https://example.test/datasources/wv-governors-office/FOIA%20Response.pdf"),
    );
    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(
      "%PDF-readable-route-test",
    );

    const pendingBytes = new TextEncoder().encode("%PDF-pending-route-test");
    const pendingSha = "c".repeat(64);
    await env.FILES.put("documents/legacy/pending.pdf", pendingBytes);
    await env.DB.prepare(
      `INSERT INTO source_documents
       (id, sha256, original_filename, byte_size, r2_key, publication_state)
       VALUES ('document_pending_route', ?, 'Pending Report.pdf', ?,
               'documents/legacy/pending.pdf', 'draft')`,
    ).bind(pendingSha, pendingBytes.byteLength).run();
    const pendingDocument = await findSourceDocumentByRoute(
      env.DB,
      "pending",
      `${pendingSha}/Pending Report.pdf`,
    );
    expect(pendingDocument?.id).toBe("document_pending_route");
  });

  it("recognizes both legacy and first-generation Astro passenger slugs", async () => {
    await env.DB.prepare(
      `INSERT INTO people (id, canonical_name, normalized_name)
       VALUES ('person_slug_compatibility', 'Jane Foo-Bar', 'jane foo-bar')`,
    ).run();
    expect((await findPersonByPublicParam(env.DB, "jane-foobar"))?.id).toBe(
      "person_slug_compatibility",
    );
    expect((await findPersonByPublicParam(env.DB, "jane-foo-bar"))?.id).toBe(
      "person_slug_compatibility",
    );
  });

  it("keeps observation-only flights out of the public trip feed", async () => {
    const geometry = JSON.stringify({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [-81.59, 38.36],
          [-81.58, 38.37],
        ],
      },
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO aircraft (id, tail_no, display_name)
         VALUES ('aircraft_unified_feed', 'NTEST', 'Unified Feed Test Aircraft')`,
      ),
      env.DB.prepare(
        `INSERT INTO trips
         (id, report_date, aircraft_id, raw_route, department, flight_hours,
          publication_state)
         VALUES ('trip_unified_feed', '2026-07-02', 'aircraft_unified_feed',
                 'CRW-HTS-CRW', 'Test Agency', 1.5, 'published')`,
      ),
      env.DB.prepare(
         `INSERT INTO observed_flights
         (id, aircraft_id, provider, provider_flight_id, started_at_utc,
          ended_at_utc, duration_seconds, geometry_json, point_count, distance_metres)
         VALUES ('flight_unified_unmatched', 'aircraft_unified_feed', 'test',
                 'unmatched', '2026-07-03T12:00:00.000Z',
                 '2026-07-03T13:00:00.000Z', 3600, ?, 2, 1000)`,
      ).bind(geometry),
      env.DB.prepare(
         `INSERT INTO observed_flights
         (id, aircraft_id, provider, provider_flight_id, started_at_utc,
          ended_at_utc, duration_seconds, geometry_json, point_count, distance_metres, state)
         VALUES ('flight_unified_linked', 'aircraft_unified_feed', 'test',
                 'linked', '2026-07-02T12:00:00.000Z',
                 '2026-07-02T13:30:00.000Z', 5400, ?, 2, 1000, 'linked')`,
      ).bind(geometry),
      env.DB.prepare(
         `INSERT INTO observed_flights
         (id, aircraft_id, provider, provider_flight_id, started_at_utc,
          ended_at_utc, duration_seconds, geometry_json, point_count, distance_metres, state)
         VALUES ('flight_unified_ignored', 'aircraft_unified_feed', 'test',
                 'ignored', '2026-07-04T12:00:00.000Z',
                 '2026-07-04T12:30:00.000Z', 1800, ?, 2, 1000, 'ignored')`,
      ).bind(geometry),
      env.DB.prepare(
        `INSERT INTO trip_flight_links
         (id, trip_id, observed_flight_id)
         VALUES ('link_unified_feed', 'trip_unified_feed', 'flight_unified_linked')`,
      ),
    ]);

    const all = await listTrips(
      env.DB,
      new URL("https://example.test/trips?aircraft=NTEST"),
    );
    expect(all.items.map((item) => [item.id, item.record_kind])).toEqual([
      ["trip_unified_feed", "reported"],
    ]);
    expect(all.items[0].distance_nmi).toBeCloseTo(1000 / 1852);
    expect(all.total).toBe(1);
    expect(
      (
        await listTrips(
          env.DB,
          new URL("https://example.test/trips?aircraft=NTEST&source=observed"),
        )
      ).items.map((item) => item.id),
    ).toEqual(["trip_unified_feed"]);
    expect(
      (
        await listTrips(
          env.DB,
          new URL("https://example.test/trips?aircraft=NTEST&source=reported"),
        )
      ).items.map((item) => item.id),
    ).toEqual(["trip_unified_feed"]);
  });

  it("renders linked flight paths in chronological order instead of append order", async () => {
    const geometry = JSON.stringify({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [[-81.59, 38.36], [-81.58, 38.37]],
      },
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO aircraft (id, tail_no, display_name)
         VALUES ('aircraft_path_order', 'NORDER', 'Path Order Test Aircraft')`,
      ),
      env.DB.prepare(
        `INSERT INTO trips
         (id, report_date, aircraft_id, raw_route, department, flight_hours,
          publication_state)
         VALUES ('trip_path_order', '2026-06-14', 'aircraft_path_order',
                 'A-B-C', 'Test Agency', 2, 'published')`,
      ),
      env.DB.prepare(
         `INSERT INTO observed_flights
         (id, aircraft_id, provider, provider_flight_id, started_at_utc,
          ended_at_utc, duration_seconds, geometry_json, point_count, distance_metres, state)
         VALUES ('flight_path_order_late', 'aircraft_path_order', 'test',
                 'path-order-late', '2026-06-15T02:49:00.000Z',
                 '2026-06-15T05:07:00.000Z', 8280, ?, 2, 1000, 'linked')`,
      ).bind(geometry),
      env.DB.prepare(
         `INSERT INTO observed_flights
         (id, aircraft_id, provider, provider_flight_id, started_at_utc,
          ended_at_utc, duration_seconds, geometry_json, point_count, distance_metres, state)
         VALUES ('flight_path_order_early', 'aircraft_path_order', 'test',
                 'path-order-early', '2026-06-15T00:34:00.000Z',
                 '2026-06-15T01:12:00.000Z', 2280, ?, 2, 1000, 'linked')`,
      ).bind(geometry),
      env.DB.prepare(
        `INSERT INTO trip_flight_links
         (id, trip_id, observed_flight_id, position)
         VALUES ('link_path_order_late', 'trip_path_order',
                 'flight_path_order_late', 0)`,
      ),
      env.DB.prepare(
        `INSERT INTO trip_flight_links
         (id, trip_id, observed_flight_id, position)
         VALUES ('link_path_order_early', 'trip_path_order',
                 'flight_path_order_early', 1)`,
      ),
    ]);

    const trip = await getTrip(env.DB, "trip_path_order");
    expect(
      (trip?.observed_flights as Array<{ id: string }>).map((flight) => flight.id),
    ).toEqual(["flight_path_order_early", "flight_path_order_late"]);
    for (const flight of trip?.observed_flights as Array<{ distance_nmi: number }>) {
      expect(flight.distance_nmi).toBeCloseTo(1000 / 1852);
    }

    const correctedGeometry = JSON.stringify({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [[0, 0], [1, 0]],
      },
    });
    await expect(updateObservedFlightGeometry(createDatabase(env.DB), {
      flightId: "flight_path_order_early",
      geometryJson: correctedGeometry,
      pointCount: 2,
      operation: "correct",
      note: "Regression test",
      actorUserId: "test-user",
    })).resolves.toBe(true);
    await expect(env.DB.prepare(
      `SELECT geometry_source, geometry_updated_by_user_id,
              round(distance_metres) AS distance_metres
       FROM observed_flights WHERE id = 'flight_path_order_early'`,
    ).first()).resolves.toEqual({
      geometry_source: "manual",
      geometry_updated_by_user_id: "test-user",
      distance_metres: 111195,
    });
  });

});
