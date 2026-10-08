import {
  check,
  customType,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const currentTimestamp = sql`CURRENT_TIMESTAMP`;
const nocaseText = customType<{ data: string }>({
  dataType() {
    return "text COLLATE NOCASE";
  },
});

export const aircraft = sqliteTable(
  "aircraft",
  {
    id: text().primaryKey(),
    tailNo: nocaseText("tail_no").notNull().unique(),
    displayName: text("display_name").notNull(),
    icaoNo: nocaseText("icao_no").unique(),
    manufacturer: text(),
    model: text(),
    serialNumber: text("serial_number"),
    active: integer({ mode: "boolean" }).notNull().default(true),
    hourlyCostCents: integer("hourly_cost_cents"),
    createdAt: text("created_at").notNull().default(currentTimestamp),
    updatedAt: text("updated_at").notNull().default(currentTimestamp),
  },
  (table) => [
    check("aircraft_active_check", sql`${table.active} IN (0, 1)`),
    check(
      "aircraft_hourly_cost_check",
      sql`${table.hourlyCostCents} IS NULL OR ${table.hourlyCostCents} >= 0`,
    ),
  ],
);

export const sourceCollections = sqliteTable("source_collections", {
  id: text().primaryKey(),
  title: text().notNull(),
  sourceAgency: text("source_agency"),
  criteriaStart: text("criteria_start"),
  criteriaEnd: text("criteria_end"),
  responseDate: text("response_date"),
  notes: text(),
  createdAt: text("created_at").notNull().default(currentTimestamp),
  updatedAt: text("updated_at").notNull().default(currentTimestamp),
});

export const sourceDocuments = sqliteTable(
  "source_documents",
  {
    id: text().primaryKey(),
    collectionId: text("collection_id").references(() => sourceCollections.id, {
      onDelete: "set null",
    }),
    sha256: text().notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    mediaType: text("media_type").notNull().default("application/pdf"),
    byteSize: integer("byte_size").notNull(),
    r2Key: text("r2_key").notNull().unique(),
    pageCount: integer("page_count"),
    publicationState: text("publication_state")
      .notNull()
      .$type<"draft" | "published" | "withdrawn">()
      .default("draft"),
    ocrR2Key: text("ocr_r2_key"),
    ocrModel: text("ocr_model"),
    ocrUsageJson: text("ocr_usage_json"),
    ocrStatus: text("ocr_status"),
    createdAt: text("created_at").notNull().default(currentTimestamp),
    publishedAt: text("published_at"),
  },
  (table) => [
    check("source_documents_byte_size_check", sql`${table.byteSize} >= 0`),
    check(
      "source_documents_publication_state_check",
      sql`${table.publicationState} IN ('draft', 'published', 'withdrawn')`,
    ),
  ],
);

export const ingestionBatches = sqliteTable(
  "ingestion_batches",
  {
    id: text().primaryKey(),
    sourceDocumentId: text("source_document_id").notNull().references(
      () => sourceDocuments.id,
      { onDelete: "restrict" },
    ),
    workflowInstanceId: text("workflow_instance_id").unique(),
    state: text()
      .notNull()
      .$type<
        | "uploaded"
        | "ocr_running"
        | "review_required"
        | "publishing"
        | "published"
        | "failed"
        | "cancelled"
      >()
      .default("uploaded"),
    ocrR2Key: text("ocr_r2_key"),
    validationSummaryJson: text("validation_summary_json"),
    errorMessage: text("error_message"),
    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at").notNull().default(currentTimestamp),
    updatedAt: text("updated_at").notNull().default(currentTimestamp),
    publishedAt: text("published_at"),
  },
  (table) => [
    check(
      "ingestion_batches_state_check",
      sql`${table.state} IN ('uploaded', 'ocr_running', 'review_required', 'publishing', 'published', 'failed', 'cancelled')`,
    ),
  ],
);

export const trips = sqliteTable(
  "trips",
  {
    id: text().primaryKey(),
    legacyId: integer("legacy_id").unique(),
    ingestionBatchId: text("ingestion_batch_id").references(
      () => ingestionBatches.id,
      { onDelete: "set null" },
    ),
    reportDate: text("report_date").notNull(),
    aircraftId: text("aircraft_id").references(() => aircraft.id, {
      onDelete: "set null",
    }),
    rawRoute: text("raw_route").notNull(),
    department: text().notNull(),
    division: text(),
    printedPassengers: text("printed_passengers"),
    flightHours: real("flight_hours").notNull(),
    comments: text(),
    justification: text(),
    invoicedAmountCents: integer("invoiced_amount_cents"),
    estimatedCostCents: integer("estimated_cost_cents"),
    publicationState: text("publication_state")
      .notNull()
      .$type<"draft" | "ready" | "published" | "withdrawn">()
      .default("draft"),
    createdAt: text("created_at").notNull().default(currentTimestamp),
    updatedAt: text("updated_at").notNull().default(currentTimestamp),
    publishedAt: text("published_at"),
  },
  (table) => [
    check("trips_flight_hours_check", sql`${table.flightHours} >= 0`),
    check(
      "trips_estimated_cost_check",
      sql`${table.estimatedCostCents} IS NULL OR ${table.estimatedCostCents} >= 0`,
    ),
    check(
      "trips_publication_state_check",
      sql`${table.publicationState} IN ('draft', 'ready', 'published', 'withdrawn')`,
    ),
    index("trips_public_date_idx").on(
      table.publicationState,
      sql`${table.reportDate} DESC`,
      sql`${table.id} DESC`,
    ),
    index("trips_aircraft_date_idx").on(
      table.aircraftId,
      sql`${table.reportDate} DESC`,
      sql`${table.id} DESC`,
    ),
    index("trips_agency_idx").on(
      table.department,
      table.division,
      sql`${table.reportDate} DESC`,
    ),
    index("trips_batch_idx").on(
      table.ingestionBatchId,
      table.publicationState,
    ),
  ],
);

export const tripSources = sqliteTable(
  "trip_sources",
  {
    id: text().primaryKey(),
    tripId: text("trip_id").notNull().references(() => trips.id, {
      onDelete: "cascade",
    }),
    sourceDocumentId: text("source_document_id").notNull().references(
      () => sourceDocuments.id,
      { onDelete: "restrict" },
    ),
    createdAt: text("created_at").notNull().default(currentTimestamp),
  },
  (table) => [
    unique().on(table.tripId, table.sourceDocumentId),
    index("trip_sources_document_idx").on(table.sourceDocumentId, table.tripId),
  ],
);

export const people = sqliteTable(
  "people",
  {
    id: text().primaryKey(),
    canonicalName: text("canonical_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    legacyId: integer("legacy_id").unique(),
    createdAt: text("created_at").notNull().default(currentTimestamp),
    updatedAt: text("updated_at").notNull().default(currentTimestamp),
  },
  (table) => [
    uniqueIndex("people_normalized_name_unique").on(
      sql`${table.normalizedName} COLLATE NOCASE`,
    ),
  ],
);

export const tripPeople = sqliteTable(
  "trip_people",
  {
    tripId: text("trip_id").notNull().references(() => trips.id, {
      onDelete: "cascade",
    }),
    personId: text("person_id").notNull().references(() => people.id, {
      onDelete: "restrict",
    }),
    position: integer().notNull(),
    printedName: text("printed_name").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tripId, table.position] }),
    unique().on(table.tripId, table.personId, table.position),
    index("trip_people_person_idx").on(table.personId, table.tripId),
    check("trip_people_position_check", sql`${table.position} >= 0`),
  ],
);

export const tripRouteStops = sqliteTable(
  "trip_route_stops",
  {
    id: text().primaryKey(),
    tripId: text("trip_id").notNull().references(() => trips.id, {
      onDelete: "cascade",
    }),
    position: integer().notNull(),
    rawLabel: text("raw_label").notNull(),
  },
  (table) => [
    unique().on(table.tripId, table.position),
    check("trip_route_stops_position_check", sql`${table.position} >= 0`),
  ],
);

export const observedFlights = sqliteTable(
  "observed_flights",
  {
    id: text().primaryKey(),
    aircraftId: text("aircraft_id").notNull().references(() => aircraft.id, {
      onDelete: "restrict",
    }),
    provider: text().notNull(),
    providerFlightId: text("provider_flight_id"),
    sourceDate: text("source_date"),
    segmentIndex: integer("segment_index"),
    startedAtUtc: text("started_at_utc").notNull(),
    endedAtUtc: text("ended_at_utc").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    rawR2Key: text("raw_r2_key"),
    rawExpiresAt: text("raw_expires_at"),
    geometryJson: text("geometry_json").notNull(),
    pointCount: integer("point_count").notNull(),
    telemetryR2Key: text("telemetry_r2_key"),
    telemetryPointCount: integer("telemetry_point_count"),
    minAltitudeFt: real("min_altitude_ft"),
    maxAltitudeFt: real("max_altitude_ft"),
    sourceHash: text("source_hash"),
    distanceMetres: real("distance_metres").notNull(),
    geometrySource: text("geometry_source")
      .notNull()
      .$type<"provider" | "manual">()
      .default("provider"),
    geometryUpdatedByUserId: text("geometry_updated_by_user_id"),
    state: text()
      .notNull()
      .$type<"unmatched" | "suggested" | "linked" | "ignored">()
      .default("unmatched"),
    legacyId: integer("legacy_id").unique(),
    createdAt: text("created_at").notNull().default(currentTimestamp),
    updatedAt: text("updated_at").notNull().default(currentTimestamp),
  },
  (table) => [
    unique().on(table.provider, table.providerFlightId),
    check(
      "observed_flights_duration_check",
      sql`${table.durationSeconds} >= 0`,
    ),
    check("observed_flights_point_count_check", sql`${table.pointCount} >= 2`),
    check(
      "observed_flights_distance_check",
      sql`${table.distanceMetres} >= 0`,
    ),
    check(
      "observed_flights_geometry_source_check",
      sql`${table.geometrySource} IN ('provider', 'manual')`,
    ),
    check(
      "observed_flights_state_check",
      sql`${table.state} IN ('unmatched', 'suggested', 'linked', 'ignored')`,
    ),
    index("observed_flights_aircraft_time_idx").on(
      table.aircraftId,
      table.startedAtUtc,
      table.endedAtUtc,
    ),
    index("observed_flights_state_time_idx").on(
      table.state,
      sql`${table.startedAtUtc} DESC`,
    ),
    index("observed_flights_source_segment_idx").on(
      table.provider,
      table.aircraftId,
      table.sourceDate,
      table.segmentIndex,
    ),
    index("observed_flights_source_hash_idx")
      .on(table.sourceHash)
      .where(sql`source_hash IS NOT NULL`),
  ],
);

export const tripFlightLinks = sqliteTable(
  "trip_flight_links",
  {
    id: text().primaryKey(),
    tripId: text("trip_id").notNull().references(() => trips.id, {
      onDelete: "cascade",
    }),
    observedFlightId: text("observed_flight_id").notNull().references(
      () => observedFlights.id,
      { onDelete: "restrict" },
    ),
    position: integer().notNull().default(0),
    confirmedByUserId: text("confirmed_by_user_id"),
    confirmedAt: text("confirmed_at").notNull().default(currentTimestamp),
    note: text(),
  },
  (table) => [
    unique().on(table.tripId, table.observedFlightId),
    index("trip_flight_links_flight_idx").on(table.observedFlightId, table.tripId),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text().primaryKey(),
    actorUserId: text("actor_user_id"),
    action: text().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    requestId: text("request_id"),
    createdAt: text("created_at").notNull().default(currentTimestamp),
  },
  (table) => [
    index("audit_events_entity_idx").on(
      table.entityType,
      table.entityId,
      sql`${table.createdAt} DESC`,
    ),
  ],
);

export const ingestionRows = sqliteTable(
  "ingestion_rows",
  {
    id: text().primaryKey(),
    batchId: text("batch_id").notNull().references(() => ingestionBatches.id, {
      onDelete: "cascade",
    }),
    position: integer().notNull(),
    sourcePage: integer("source_page").notNull(),
    sourceRow: integer("source_row").notNull(),
    extractedJson: text("extracted_json").notNull(),
    editedJson: text("edited_json"),
    validationErrorsJson: text("validation_errors_json").notNull().default("[]"),
    warningsJson: text("warnings_json").notNull().default("[]"),
    duplicateCandidatesJson: text("duplicate_candidates_json").notNull().default("[]"),
    flightCandidateIdsJson: text("flight_candidate_ids_json").notNull().default("[]"),
    reviewAction: text("review_action").$type<"create" | "link_existing" | "exclude">(),
    existingTripId: text("existing_trip_id").references(() => trips.id, {
      onDelete: "set null",
    }),
    reviewNote: text("review_note"),
    reviewedByUserId: text("reviewed_by_user_id"),
    reviewedAt: text("reviewed_at"),
    publishedTripId: text("published_trip_id").references(() => trips.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(currentTimestamp),
    updatedAt: text("updated_at").notNull().default(currentTimestamp),
  },
  (table) => [
    unique().on(table.batchId, table.position),
    unique().on(
      table.batchId,
      table.sourcePage,
      table.sourceRow,
    ),
    index("ingestion_rows_review_idx").on(
      table.batchId,
      table.reviewAction,
      table.position,
    ),
    check("ingestion_rows_position_check", sql`${table.position} >= 0`),
    check("ingestion_rows_source_page_check", sql`${table.sourcePage} > 0`),
    check("ingestion_rows_source_row_check", sql`${table.sourceRow} > 0`),
    check(
      "ingestion_rows_review_action_check",
      sql`${table.reviewAction} IS NULL OR ${table.reviewAction} IN ('create', 'link_existing', 'exclude')`,
    ),
  ],
);

export const flightMatchCandidates = sqliteTable(
  "flight_match_candidates",
  {
    id: text().primaryKey(),
    ingestionRowId: text("ingestion_row_id").references(() => ingestionRows.id, {
      onDelete: "cascade",
    }),
    tripId: text("trip_id").references(() => trips.id, {
      onDelete: "cascade",
    }),
    observedFlightId: text("observed_flight_id")
      .notNull()
      .references(() => observedFlights.id, { onDelete: "cascade" }),
    score: real().notNull(),
    scoreBreakdownJson: text("score_breakdown_json").notNull(),
    aiRank: integer("ai_rank"),
    aiExplanation: text("ai_explanation"),
    state: text().notNull().$type<"suggested" | "accepted" | "rejected">().default("suggested"),
    createdAt: text("created_at").notNull().default(currentTimestamp),
  },
  (table) => [
    check(
      "flight_match_candidates_owner_check",
      sql`${table.ingestionRowId} IS NOT NULL OR ${table.tripId} IS NOT NULL`,
    ),
    check(
      "flight_match_candidates_state_check",
      sql`${table.state} IN ('suggested', 'accepted', 'rejected')`,
    ),
  ],
);

export const tripSearch = sqliteTable(
  "trip_search",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    tripId: text("trip_id").notNull().unique().references(() => trips.id, {
      onDelete: "cascade",
    }),
    route: text().notNull().default(""),
    passengers: text().notNull().default(""),
    department: text().notNull().default(""),
    division: text().notNull().default(""),
    comments: text().notNull().default(""),
    justification: text().notNull().default(""),
  },
);

// The external-content FTS5 table and synchronization triggers are deliberately
// maintained as custom SQL in migrations/0001_initial.sql. Drizzle models the
// relational content table; the migration-safety test guards the custom objects.
// Better Auth keeps these camel-case column names in the existing D1 schema.
// They are part of the same Drizzle model so auth does not need a second
// database adapter or a parallel schema definition.
export const user = sqliteTable(
  "user",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: integer({ mode: "boolean" }).notNull().default(false),
    image: text(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    updatedAt: integer({ mode: "timestamp_ms" }).notNull(),
  },
);

export const session = sqliteTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
    token: text().notNull().unique(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    updatedAt: integer({ mode: "timestamp_ms" }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text().notNull().references(() => user.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    index("session_user_idx").on(table.userId),
  ],
);

export const account = sqliteTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull().references(() => user.id, {
      onDelete: "cascade",
    }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: integer({ mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer({ mode: "timestamp_ms" }),
    scope: text(),
    password: text(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    updatedAt: integer({ mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("account_user_idx").on(table.userId),
    uniqueIndex("account_provider_unique").on(table.providerId, table.accountId),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
    createdAt: integer({ mode: "timestamp_ms" }),
    updatedAt: integer({ mode: "timestamp_ms" }),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);
