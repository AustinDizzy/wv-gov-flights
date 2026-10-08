import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { runBatch, useDatabase, type DatabaseInput } from "../../db/client";
import {
  aircraft,
  auditEvents,
  ingestionBatches,
  ingestionRows,
  people,
  sourceDocuments,
  tripPeople,
  tripRouteStops,
  tripSearch,
  tripSources,
  trips,
} from "../../db/schema";
import {
  centsFromDollars,
  normalizePersonName,
  parsePassengers,
  parseRouteStops,
  stableId,
} from "../utils";
import { auditEvent } from "../db/admin-queries";
import { extractedTripSchema, type ExtractedTrip } from "../ocr/schema";

interface StagedRow {
  id: string;
  sourcePage: number;
  sourceRow: number;
  extractedJson: string;
  editedJson: string | null;
  validationErrorsJson: string;
  reviewAction: "create" | "link_existing" | "exclude" | null;
  existingTripId: string | null;
}

interface PublicationResult {
  created: number;
  linked: number;
  excluded: number;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function parseTrip(row: StagedRow): ExtractedTrip {
  return extractedTripSchema.parse(
    JSON.parse(row.editedJson || row.extractedJson),
  );
}

export async function publishIngestionBatch(
  input: DatabaseInput,
  batchId: string,
  actorUserId: string,
): Promise<PublicationResult> {
  const db = useDatabase(input);
  const batch = await db
    .select({
      id: ingestionBatches.id,
      sourceDocumentId: ingestionBatches.sourceDocumentId,
      state: ingestionBatches.state,
    })
    .from(ingestionBatches)
    .where(eq(ingestionBatches.id, batchId))
    .get();
  if (!batch) throw new Error("Ingestion batch not found.");
  if (batch.state === "published") {
    const existing = await db.get<PublicationResult>(sql`
      SELECT
        SUM(CASE WHEN review_action = 'create' THEN 1 ELSE 0 END) AS created,
        SUM(CASE WHEN review_action = 'link_existing' THEN 1 ELSE 0 END) AS linked,
        SUM(CASE WHEN review_action = 'exclude' THEN 1 ELSE 0 END) AS excluded
      FROM ingestion_rows WHERE batch_id = ${batchId}
    `);
    return existing ?? { created: 0, linked: 0, excluded: 0 };
  }
  if (batch.state !== "review_required") {
    throw new Error("Batch is not ready to publish.");
  }

  const rows = await db
    .select({
      id: ingestionRows.id,
      sourcePage: ingestionRows.sourcePage,
      sourceRow: ingestionRows.sourceRow,
      extractedJson: ingestionRows.extractedJson,
      editedJson: ingestionRows.editedJson,
      validationErrorsJson: ingestionRows.validationErrorsJson,
      reviewAction: ingestionRows.reviewAction,
      existingTripId: ingestionRows.existingTripId,
    })
    .from(ingestionRows)
    .where(eq(ingestionRows.batchId, batchId))
    .orderBy(ingestionRows.position)
    .all();

  // A reviewed cover letter or other non-table source legitimately has no
  // staged trips; publishing it still makes its source document available.
  for (const row of rows) {
    const errors: unknown = JSON.parse(row.validationErrorsJson);
    if (
      row.reviewAction !== "exclude" &&
      Array.isArray(errors) &&
      errors.length > 0
    ) {
      throw new Error(`Row ${row.sourcePage}:${row.sourceRow} has validation errors.`);
    }
    if (!row.reviewAction) {
      throw new Error(`Row ${row.sourcePage}:${row.sourceRow} has not been reviewed.`);
    }
    if (row.reviewAction === "link_existing" && !row.existingTripId) {
      throw new Error(`Row ${row.sourcePage}:${row.sourceRow} needs an existing trip.`);
    }
    if (row.reviewAction !== "exclude") parseTrip(row);
  }

  await db.update(ingestionBatches)
    .set({ state: "publishing", updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(ingestionBatches.id, batchId));

  let created = 0;
  let linked = 0;
  let excluded = 0;
  for (const group of chunks(rows, 20)) {
    const statements: BatchItem<"sqlite">[] = [];
    for (const row of group) {
      if (row.reviewAction === "exclude") {
        excluded += 1;
        statements.push(
          db.update(ingestionRows)
            .set({
              reviewedByUserId: actorUserId,
              reviewedAt: sql`COALESCE(${ingestionRows.reviewedAt}, CURRENT_TIMESTAMP)`,
            })
            .where(eq(ingestionRows.id, row.id)),
        );
        continue;
      }

      if (row.reviewAction === "link_existing") {
        linked += 1;
        const existingTripId = row.existingTripId!;
        statements.push(
          db.insert(tripSources).values({
            id: await stableId(
              "source",
              `${existingTripId}:${batch.sourceDocumentId}`,
            ),
            tripId: existingTripId,
            sourceDocumentId: batch.sourceDocumentId,
          }).onConflictDoNothing(),
          db.update(ingestionRows)
            .set({
              publishedTripId: existingTripId,
              reviewedByUserId: actorUserId,
              reviewedAt: sql`COALESCE(${ingestionRows.reviewedAt}, CURRENT_TIMESTAMP)`,
            })
            .where(eq(ingestionRows.id, row.id)),
        );
        continue;
      }

      created += 1;
      const trip = parseTrip(row);
      const tripId = await stableId(
        "trip",
        `${batchId}:${row.sourcePage}:${row.sourceRow}`,
      );
      const matchedAircraft = trip.tail_no
        ? await db
            .select({
              id: aircraft.id,
              hourlyCostCents: aircraft.hourlyCostCents,
            })
            .from(aircraft)
            .where(sql`${aircraft.tailNo} = ${trip.tail_no} COLLATE NOCASE`)
            .get()
        : null;
      const invoicedAmountCents = centsFromDollars(trip.invoiced_amount);
      const estimatedCostCents = matchedAircraft?.hourlyCostCents == null
        ? null
        : Math.round(matchedAircraft.hourlyCostCents * trip.flight_hours);

      statements.push(
        db.insert(trips).values({
          id: tripId,
          ingestionBatchId: batchId,
          reportDate: trip.date,
          aircraftId: matchedAircraft?.id ?? null,
          rawRoute: trip.route,
          department: trip.department,
          division: trip.division,
          printedPassengers: trip.passengers,
          flightHours: trip.flight_hours,
          comments: trip.comments,
          invoicedAmountCents,
          estimatedCostCents,
          publicationState: "ready",
        }).onConflictDoNothing(),
        db.insert(tripSources).values({
          id: await stableId(
            "source",
            `${tripId}:${batch.sourceDocumentId}`,
          ),
          tripId,
          sourceDocumentId: batch.sourceDocumentId,
        }).onConflictDoNothing(),
      );

      for (const [position, label] of parseRouteStops(trip.route).entries()) {
        statements.push(
          db.insert(tripRouteStops).values({
            id: await stableId("stop", `${tripId}:${position}:${label}`),
            tripId,
            position,
            rawLabel: label,
          }).onConflictDoNothing(),
        );
      }

      for (const [position, printedName] of parsePassengers(trip.passengers).entries()) {
        const canonical = normalizePersonName(printedName);
        const normalized = canonical.toLocaleLowerCase();
        const personId = await stableId("person", normalized);
        statements.push(
          db.insert(people).values({
            id: personId,
            canonicalName: canonical,
            normalizedName: normalized,
          }).onConflictDoNothing(),
          db.insert(tripPeople).values({
            tripId,
            personId,
            position,
            printedName,
          }).onConflictDoNothing(),
        );
      }

      statements.push(
        db.insert(tripSearch).values({
          tripId,
          route: trip.route,
          passengers: trip.passengers ?? "",
          department: trip.department,
          division: trip.division ?? "",
          comments: trip.comments ?? "",
          justification: "",
        }).onConflictDoUpdate({
          target: tripSearch.tripId,
          set: {
            route: trip.route,
            passengers: trip.passengers ?? "",
            department: trip.department,
            division: trip.division ?? "",
            comments: trip.comments ?? "",
            justification: "",
          },
        }),
        db.update(ingestionRows)
          .set({
            publishedTripId: tripId,
            reviewedByUserId: actorUserId,
            reviewedAt: sql`COALESCE(${ingestionRows.reviewedAt}, CURRENT_TIMESTAMP)`,
          })
          .where(eq(ingestionRows.id, row.id)),
      );
    }
    await runBatch(db, statements);
  }

  const now = new Date().toISOString();
  await db.batch([
    db.update(trips)
      .set({ publicationState: "published", publishedAt: now, updatedAt: now })
      .where(sql`
        ${trips.ingestionBatchId} = ${batchId}
        AND ${trips.publicationState} = 'ready'
      `),
    db.update(sourceDocuments)
      .set({ publicationState: "published", publishedAt: now })
      .where(eq(sourceDocuments.id, batch.sourceDocumentId)),
    db.update(ingestionBatches)
      .set({ state: "published", publishedAt: now, updatedAt: now })
      .where(eq(ingestionBatches.id, batchId)),
    db.insert(auditEvents).values(auditEvent({
      actorUserId,
      action: "publish",
      entityType: "ingestion_batch",
      entityId: batchId,
      afterJson: JSON.stringify({ created, linked, excluded }),
    })),
  ]);

  return { created, linked, excluded };
}
