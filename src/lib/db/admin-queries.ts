import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "../../db/client";
import { runBatch } from "../../db/client";
import {
  auditEvents,
  flightMatchCandidates,
  ingestionBatches,
  ingestionRows,
  observedFlights,
  sourceDocuments,
  tripFlightLinks,
} from "../../db/schema";
import { observedDistanceMetres } from "../flights/distance";

export interface AuditEventInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: string | null;
  afterJson?: string | null;
  requestId?: string | null;
}

export function auditEvent(input: AuditEventInput) {
  return {
    id: crypto.randomUUID(),
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    beforeJson: input.beforeJson,
    afterJson: input.afterJson,
    requestId: input.requestId,
  };
}

export async function insertAuditEvent(db: Database, input: AuditEventInput) {
  await db.insert(auditEvents).values(auditEvent(input));
}

export async function listRecentIngestionBatches(db: Database) {
  return {
    results: await db.all<{
      id: string;
      state: string;
      created_at: string;
      original_filename: string;
      row_count: number;
    }>(sql`
      SELECT b.id, b.state, b.created_at, d.original_filename,
             (SELECT COUNT(*) FROM ingestion_rows r WHERE r.batch_id = b.id) AS row_count
      FROM ingestion_batches b JOIN source_documents d ON d.id = b.source_document_id
      ORDER BY b.created_at DESC LIMIT 20
    `),
  };
}

export async function getObservedFlightReviewPageData(db: Database) {
  const [aircraft, candidates] = await Promise.all([
    db.all<{ id: string; tail_no: string }>(sql`
      SELECT id, tail_no FROM aircraft WHERE active = 1 ORDER BY tail_no
    `),
    db.all<{
      id: string;
      score: number;
      ai_rank: number | null;
      ai_explanation: string | null;
      trip_id: string;
      report_date: string;
      raw_route: string;
      flight_id: string;
      started_at_utc: string;
      tail_no: string;
    }>(sql`
      SELECT c.id, c.score, c.ai_rank, c.ai_explanation, t.id AS trip_id,
             t.report_date, t.raw_route, f.id AS flight_id, f.started_at_utc, a.tail_no
      FROM flight_match_candidates c JOIN trips t ON t.id = c.trip_id
      JOIN observed_flights f ON f.id = c.observed_flight_id
      JOIN aircraft a ON a.id = f.aircraft_id
      WHERE c.state = 'suggested'
      ORDER BY t.report_date DESC, c.ai_rank IS NULL, c.ai_rank, c.score DESC LIMIT 100
    `),
  ]);
  return { aircraft: { results: aircraft }, candidates: { results: candidates } };
}

export async function getBatchPublicationStatus(
  db: Database,
  batchId: string | undefined,
) {
  return db.get<{ state: string; workflow_instance_id: string | null; unresolved: number }>(sql`
    SELECT state, workflow_instance_id,
           (
             SELECT COUNT(*) FROM ingestion_rows r
             WHERE r.batch_id = b.id AND (
               r.review_action IS NULL OR
               (r.review_action != 'exclude'
                AND json_array_length(r.validation_errors_json) > 0) OR
               (r.review_action = 'link_existing' AND r.existing_trip_id IS NULL)
             )
           ) AS unresolved
    FROM ingestion_batches b WHERE id = ${batchId}
  `);
}

export async function getObservedFlightEditor(
  db: Database,
  flightId: string | undefined,
) {
  return db.get<{
    id: string;
    started_at_utc: string;
    ended_at_utc: string;
    tail_no: string;
    geometry_json: string;
    geometry_source: "provider" | "manual";
    distance_metres: number;
  }>(sql`
    SELECT f.id, f.started_at_utc, f.ended_at_utc, a.tail_no,
           f.geometry_json, f.geometry_source, f.distance_metres
    FROM observed_flights f
    JOIN aircraft a ON a.id = f.aircraft_id
    WHERE f.id = ${flightId}
  `);
}

export async function getBatchReviewPageData(
  db: Database,
  batchId: string | undefined,
) {
  const batch = await db.get<Record<string, string | null>>(sql`
    SELECT b.*, d.id AS document_id, d.original_filename, d.sha256, c.source_agency
    FROM ingestion_batches b JOIN source_documents d ON d.id = b.source_document_id
    LEFT JOIN source_collections c ON c.id = d.collection_id
    WHERE b.id = ${batchId}
  `);
  if (!batch) return null;
  const rows = await db.all<{
    id: string;
    extracted_json: string;
    edited_json: string | null;
    validation_errors_json: string;
    warnings_json: string;
    review_action: "create" | "link_existing" | "exclude" | null;
    existing_trip_id: string | null;
    duplicate_candidates_json: string;
    flight_candidate_ids_json: string;
  }>(sql`
    SELECT id, extracted_json, edited_json, validation_errors_json, warnings_json,
           review_action, existing_trip_id, duplicate_candidates_json,
           flight_candidate_ids_json
    FROM ingestion_rows WHERE batch_id = ${batchId} ORDER BY position
  `);
  return { batch, rows: { results: rows } };
}

export async function getMatchCandidate(db: Database, candidateId: string | undefined) {
  return db.get<{
    trip_id: string;
    observed_flight_id: string;
    score_breakdown_json: string;
  }>(sql`
    SELECT trip_id, observed_flight_id, score_breakdown_json
    FROM flight_match_candidates WHERE id = ${candidateId}
  `);
}

export async function confirmMatchCandidate(
  db: Database,
  input: {
    tripId: string;
    observedFlightIds: string[];
    linkIds: string[];
    actorUserId: string;
  },
) {
  const currentPosition = await db.get<{ position: number }>(sql`
    SELECT COALESCE(MAX(position) + 1, 0) AS position
    FROM trip_flight_links WHERE trip_id = ${input.tripId}
  `);
  const statements: BatchItem<"sqlite">[] = [];
  for (const [offset, observedFlightId] of input.observedFlightIds.entries()) {
    statements.push(
      db.insert(tripFlightLinks).values({
        id: input.linkIds[offset],
        tripId: input.tripId,
        observedFlightId,
        confirmedByUserId: input.actorUserId,
        position: (currentPosition?.position ?? 0) + offset,
        note:
          input.observedFlightIds.length > 1
            ? "Contributor-confirmed flight bundle"
            : "Contributor-confirmed flight match",
      }).onConflictDoNothing(),
      db.update(observedFlights)
        .set({ state: "linked", updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(observedFlights.id, observedFlightId)),
    );
  }
  statements.push(
    db.update(flightMatchCandidates)
      .set({ state: "accepted" })
      .where(and(
        eq(flightMatchCandidates.tripId, input.tripId),
        inArray(flightMatchCandidates.observedFlightId, input.observedFlightIds),
      )),
  );
  await runBatch(db, statements);
}

export async function rejectMatchCandidate(
  db: Database,
  input: {
    tripId: string;
    observedFlightIds: string[];
  },
) {
  await db.update(flightMatchCandidates)
    .set({ state: "rejected" })
    .where(and(
      eq(flightMatchCandidates.tripId, input.tripId),
      inArray(flightMatchCandidates.observedFlightId, input.observedFlightIds),
    ));
}

export async function updateObservedFlightGeometry(
  db: Database,
  input: {
    flightId: string;
    geometryJson: string;
    pointCount: number;
    operation: "merge" | "trim" | "split" | "correct";
    note: string | null;
    actorUserId: string;
  },
) {
  const current = await db
    .select({
      pointCount: observedFlights.pointCount,
      distanceMetres: observedFlights.distanceMetres,
      geometrySource: observedFlights.geometrySource,
    })
    .from(observedFlights)
    .where(eq(observedFlights.id, input.flightId))
    .get();
  if (!current) return false;
  const distanceMetres = observedDistanceMetres(input.geometryJson);
  await db.batch([
    db.update(observedFlights).set({
      geometryJson: input.geometryJson,
      pointCount: input.pointCount,
      distanceMetres,
      geometrySource: "manual",
      geometryUpdatedByUserId: input.actorUserId,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(eq(observedFlights.id, input.flightId)),
    db.insert(auditEvents).values(auditEvent({
      actorUserId: input.actorUserId,
      action: "correct_geometry",
      entityType: "observed_flight",
      entityId: input.flightId,
      beforeJson: JSON.stringify({
        pointCount: current.pointCount,
        distanceMetres: current.distanceMetres,
        geometrySource: current.geometrySource,
      }),
      afterJson: JSON.stringify({
        pointCount: input.pointCount,
        distanceMetres,
        geometrySource: "manual",
        operation: input.operation,
        note: input.note,
      }),
    })),
  ]);
  return true;
}

export async function updateIngestionRow(
  db: Database,
  input: {
    batchId: string;
    rowId: string;
    editedJson: string;
    validationErrorsJson: string;
    action: "create" | "link_existing" | "exclude" | null;
    existingTripId: string | null;
    actorUserId: string;
  },
) {
  const result = await db.update(ingestionRows)
    .set({
      editedJson: input.editedJson,
      validationErrorsJson: input.validationErrorsJson,
      reviewAction: input.action,
      existingTripId: input.existingTripId,
      reviewedByUserId: input.actorUserId,
      reviewedAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(and(
      eq(ingestionRows.id, input.rowId),
      eq(ingestionRows.batchId, input.batchId),
    ))
    .run();
  return result.meta.changes > 0;
}

export async function bulkReviewRows(
  db: Database,
  input: {
    batchId: string;
    rowIds: string[];
    action: "create" | "exclude";
    actorUserId: string;
  },
) {
  const batch = await db
    .select({ state: ingestionBatches.state })
    .from(ingestionBatches)
    .where(eq(ingestionBatches.id, input.batchId))
    .get();
  if (!batch) return { state: "missing" as const, updatedIds: [], skippedIds: [] };
  if (batch.state !== "review_required") {
    return { state: "unavailable" as const, updatedIds: [], skippedIds: [] };
  }

  const updatedIds: string[] = [];
  const skippedIds: string[] = [];
  for (let index = 0; index < input.rowIds.length; index += 50) {
    const group = input.rowIds.slice(index, index + 50);
    const eligible = await db
      .select({ id: ingestionRows.id })
      .from(ingestionRows)
      .where(and(
        eq(ingestionRows.batchId, input.batchId),
        inArray(ingestionRows.id, group),
        input.action === "exclude"
          ? sql`1 = 1`
          : sql`json_array_length(${ingestionRows.validationErrorsJson}) = 0`,
      ))
      .all();
    const eligibleIds = eligible.map((row) => row.id);
    const eligibleSet = new Set(eligibleIds);
    updatedIds.push(...eligibleIds);
    skippedIds.push(...group.filter((id) => !eligibleSet.has(id)));
    if (eligibleIds.length === 0) continue;
    await db.update(ingestionRows)
      .set({
        reviewAction: input.action,
        existingTripId: null,
        reviewedByUserId: input.actorUserId,
        reviewedAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(and(
        eq(ingestionRows.batchId, input.batchId),
        inArray(ingestionRows.id, eligibleIds),
      ));
  }
  return { state: "updated" as const, updatedIds, skippedIds };
}

export async function getBatchRetryInfo(db: Database, batchId: string | undefined) {
  return db.get<{ source_document_id: string; workflow_instance_id: string | null }>(sql`
    SELECT source_document_id, workflow_instance_id
    FROM ingestion_batches WHERE id = ${batchId}
  `);
}

export async function markBatchOcrStarted(
  db: Database,
  input: {
    batchId: string;
    workflowId?: string;
    actorUserId: string;
    action: "start_ocr" | "retry_ocr";
  },
) {
  await db.batch([
    db.update(ingestionBatches).set({
      state: "ocr_running",
      ...(input.workflowId ? { workflowInstanceId: input.workflowId } : {}),
      errorMessage: null,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    }).where(eq(ingestionBatches.id, input.batchId)),
    db.insert(auditEvents).values(auditEvent({
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: "ingestion_batch",
      entityId: input.batchId,
      afterJson: JSON.stringify({ workflow_instance_id: input.workflowId }),
    })),
  ]);
}

export async function findSourceDocumentBySha(db: Database, sha256: string) {
  return db
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(eq(sourceDocuments.sha256, sha256))
    .get();
}

export async function createUploadedDocument(
  db: Database,
  input: {
    documentId: string;
    batchId: string;
    sha256: string;
    originalFilename: string;
    byteSize: number;
    r2Key: string;
    actorUserId: string;
  },
) {
  await db.batch([
    db.insert(sourceDocuments).values({
      id: input.documentId,
      sha256: input.sha256,
      originalFilename: input.originalFilename,
      mediaType: "application/pdf",
      byteSize: input.byteSize,
      r2Key: input.r2Key,
      publicationState: "draft",
    }),
    db.insert(ingestionBatches).values({
      id: input.batchId,
      sourceDocumentId: input.documentId,
      state: "uploaded",
      createdByUserId: input.actorUserId,
    }),
    db.insert(auditEvents).values(auditEvent({
      actorUserId: input.actorUserId,
      action: "upload",
      entityType: "source_document",
      entityId: input.documentId,
      afterJson: JSON.stringify({
        sha256: input.sha256,
        byte_size: input.byteSize,
        filename: input.originalFilename,
      }),
    })),
  ]);
}

export async function attachWorkflowToBatch(
  db: Database,
  batchId: string,
  workflowId: string,
) {
  await db.update(ingestionBatches)
    .set({ workflowInstanceId: workflowId })
    .where(eq(ingestionBatches.id, batchId));
}

export async function markBatchFailed(db: Database, batchId: string, message: string) {
  await db.update(ingestionBatches)
    .set({
      state: "failed",
      errorMessage: message,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(ingestionBatches.id, batchId));
}
