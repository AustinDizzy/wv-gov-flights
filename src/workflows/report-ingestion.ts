import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { createDatabase, runBatch } from "../db/client";
import {
  ingestionBatches,
  ingestionRows,
  sourceCollections,
  sourceDocuments,
} from "../db/schema";
import { absoluteAppUrl } from "../lib/config";
import {
  parseDocumentAnnotation,
  requestMistralOcr,
} from "../lib/ocr/mistral";
import {
  validateOcrDraft,
} from "../lib/ocr/validation";
import {
  documentStorageKey,
  normalizeSourceAgency,
  pendingDocumentRoute,
} from "../lib/public-routes";
import { sha256Bytes } from "../lib/security";
import { stableId } from "../lib/utils";
import { publishIngestionBatch } from "../lib/ingestion/publish";

export interface ReportIngestionParams {
  batchId: string;
  documentId: string;
}

interface ReviewEvent {
  action: "publish" | "cancel";
  actorUserId: string;
}

interface DocumentRecord {
  r2_key: string;
  original_filename: string;
  sha256: string;
  byte_size: number;
}

function surroundingUtcDates(date: string): string[] {
  const center = new Date(`${date}T00:00:00Z`);
  return [-1, 0, 1].map((offset) => {
    const value = new Date(center);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  });
}

export class ReportIngestionWorkflow extends WorkflowEntrypoint<
  Env,
  ReportIngestionParams
> {
  async run(
    event: Readonly<WorkflowEvent<ReportIngestionParams>>,
    step: WorkflowStep,
  ): Promise<{ state: string }> {
    const document = await step.do("load-document", async () => {
      const db = createDatabase(this.env.DB);
      const record = await db.get<DocumentRecord>(sql`
        SELECT r2_key, original_filename, sha256, byte_size
        FROM source_documents WHERE id = ${event.payload.documentId}
      `);
      if (!record) throw new Error("Source document does not exist.");
      await db.update(ingestionBatches)
        .set({
          state: "ocr_running",
          workflowInstanceId: event.instanceId,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(ingestionBatches.id, event.payload.batchId));
      return record;
    });

    let initial: { key: string; model: string };
    try {
      initial = await step.do(
        "ocr-document",
        {
          retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
          timeout: "15 minutes",
        },
        async () => {
          const result = await requestMistralOcr(
            {
              documentUrl: absoluteAppUrl(
                pendingDocumentRoute(document.sha256, document.original_filename),
                this.env,
              ),
            },
            this.env,
          );
          const key = `ocr/${event.payload.batchId}/initial.json`;
          await this.env.FILES.put(key, result.bytes, {
            httpMetadata: { contentType: "application/json" },
            customMetadata: {
              batchId: event.payload.batchId,
              model: result.response.model,
            },
          });
          return { key, model: result.response.model };
        },
      );
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message.slice(0, 1000) : "OCR request failed.";
      await step.do("mark-ocr-request-failed", async () => {
        const db = createDatabase(this.env.DB);
        await db.batch([
          db.update(sourceDocuments)
            .set({ ocrStatus: "failed" })
            .where(eq(sourceDocuments.id, event.payload.documentId)),
          db.update(ingestionBatches)
            .set({
              state: "failed",
              errorMessage: message,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(ingestionBatches.id, event.payload.batchId)),
        ]);
      });
      return { state: "failed" };
    }

    const checked = await step.do("cross-check-ocr", async () => {
      const object = await this.env.FILES.get(initial.key);
      if (!object) throw new Error("Stored OCR response is missing.");
      const response = await object.json<import("../lib/ocr/mistral").MistralOcrResponse>();
      return {
        ...validateOcrDraft(parseDocumentAnnotation(response), response),
        pageCount: response.pages.length,
        usageJson: JSON.stringify(response.usage_info ?? null),
      };
    });

    const finalDocument = checked.document;
    if (!finalDocument) {
      await step.do("mark-invalid-ocr", async () => {
        const db = createDatabase(this.env.DB);
        await db.batch([
          db.update(sourceDocuments)
            .set({
              ocrR2Key: initial.key,
              ocrModel: initial.model,
              ocrUsageJson: checked.usageJson,
              pageCount: checked.pageCount,
              ocrStatus: "invalid",
            })
            .where(eq(sourceDocuments.id, event.payload.documentId)),
          db.update(ingestionBatches)
            .set({
              state: "failed",
              ocrR2Key: initial.key,
              validationSummaryJson: JSON.stringify(checked),
              errorMessage: "Structured OCR validation failed",
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(ingestionBatches.id, event.payload.batchId)),
        ]);
      });
      return { state: "failed" };
    }

    const sourceAgency = normalizeSourceAgency(finalDocument.report.source_agency);

    await step.do(
      "organize-source-document",
      { retries: { limit: 2, delay: "5 seconds", backoff: "exponential" } },
      async () => {
        const targetKey = documentStorageKey({
          sourceAgency,
          originalFilename: document.original_filename,
        });
        if (targetKey === document.r2_key) return;

        const db = createDatabase(this.env.DB);
        const owner = await db.get<{ id: string; sha256: string }>(sql`
          SELECT id, sha256 FROM source_documents
          WHERE r2_key = ${targetKey} AND id != ${event.payload.documentId}
        `);
        if (owner) {
          throw new Error(`Document storage path is already used by ${owner.id}.`);
        }

        const existingTarget = await this.env.FILES.head(targetKey);
        if (existingTarget) {
          if (
            existingTarget.size !== document.byte_size ||
            existingTarget.customMetadata?.sha256 !== document.sha256
          ) {
            throw new Error("Document storage path already contains different bytes.");
          }
        } else {
          const original = await this.env.FILES.get(document.r2_key);
          if (!original || !("body" in original)) {
            throw new Error("Uploaded source document is missing from R2.");
          }
          const checksum = sha256Bytes(document.sha256);
          if (!checksum) throw new Error("Source document has an invalid SHA-256 digest.");
          const fixedLengthCopy = new FixedLengthStream(original.size);
          await Promise.all([
            original.body.pipeTo(fixedLengthCopy.writable),
            this.env.FILES.put(targetKey, fixedLengthCopy.readable, {
              sha256: checksum.buffer as ArrayBuffer,
              httpMetadata: original.httpMetadata,
              customMetadata: {
                ...original.customMetadata,
                sha256: document.sha256,
              },
            }),
          ]);
        }

        await db.update(sourceDocuments)
          .set({ r2Key: targetKey })
          .where(eq(sourceDocuments.id, event.payload.documentId));
        await this.env.FILES.delete(document.r2_key);
      },
    );

    await step.do("stage-rows", async () => {
      const db = createDatabase(this.env.DB);
      const report = finalDocument.report;
      const collectionId = await stableId(
        "collection",
        `${event.payload.documentId}:${report.criteria_start}:${report.criteria_end}`,
      );
      await db.batch([
        db.insert(sourceCollections).values({
          id: collectionId,
          title: report.title ?? document.original_filename,
          sourceAgency,
          criteriaStart: report.criteria_start,
          criteriaEnd: report.criteria_end,
          responseDate: report.response_date,
        }).onConflictDoNothing(),
        db.update(sourceDocuments)
          .set({
            collectionId,
            ocrR2Key: initial.key,
            ocrModel: initial.model,
            ocrUsageJson: checked.usageJson,
            pageCount: checked.pageCount,
            ocrStatus: "complete",
          })
          .where(eq(sourceDocuments.id, event.payload.documentId)),
      ]);

      for (let index = 0; index < finalDocument.trips.length; index += 40) {
        const group = finalDocument.trips.slice(index, index + 40);
        const statements: BatchItem<"sqlite">[] = [];
        for (const [offset, trip] of group.entries()) {
              const position = index + offset;
              const rowId = await stableId(
                "row",
                `${event.payload.batchId}:${trip.source_page}:${trip.source_row}`,
              );
              const pageWarnings =
                checked.pages.find((page) => page.page === trip.source_page)?.reasons ?? [];
              const duplicates = await db.all<{ id: string }>(sql`
                SELECT id FROM trips
                WHERE report_date = ${trip.date} AND raw_route = ${trip.route}
                  AND department = ${trip.department}
                  AND ABS(flight_hours - ${trip.flight_hours}) < 0.01
                ORDER BY id LIMIT 10
              `);
              const flights = await db.all<{ id: string }>(sql`
                SELECT f.id FROM observed_flights f
                 LEFT JOIN aircraft a ON a.id = f.aircraft_id
                WHERE date(f.started_at_utc)
                  BETWEEN date(${trip.date}, '-1 day') AND date(${trip.date}, '+1 day')
                  AND (${trip.tail_no} IS NULL OR a.tail_no = ${trip.tail_no} COLLATE NOCASE)
                ORDER BY f.started_at_utc LIMIT 12
              `);
              const values = {
                id: rowId,
                batchId: event.payload.batchId,
                position,
                sourcePage: trip.source_page,
                sourceRow: trip.source_row,
                extractedJson: JSON.stringify(trip),
                validationErrorsJson: "[]",
                warningsJson: JSON.stringify([...trip.warnings, ...pageWarnings]),
                duplicateCandidatesJson: JSON.stringify(
                  duplicates.map((candidate) => candidate.id),
                ),
                flightCandidateIdsJson: JSON.stringify(
                  flights.map((candidate) => candidate.id),
                ),
              };
              statements.push(db.insert(ingestionRows).values(values).onConflictDoUpdate({
                target: ingestionRows.id,
                set: values,
              }));
        }
        await runBatch(db, statements);
      }
      await db.update(ingestionBatches)
        .set({
          state: "review_required",
          ocrR2Key: initial.key,
          validationSummaryJson: JSON.stringify(checked),
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(ingestionBatches.id, event.payload.batchId));
    });

    const review = await step.waitForEvent<ReviewEvent>("wait-for-review", {
      type: "review_complete",
      timeout: "30 days",
    });
    if (review.payload.action === "cancel") {
      await step.do("cancel-batch", async () => {
        await createDatabase(this.env.DB)
          .update(ingestionBatches)
          .set({ state: "cancelled", updatedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(ingestionBatches.id, event.payload.batchId));
      });
      return { state: "cancelled" };
    }

    await step.do("publish-reviewed-rows", async () => {
      await publishIngestionBatch(
        createDatabase(this.env.DB),
        event.payload.batchId,
        review.payload.actorUserId,
      );
    });
    await step.do("fetch-report-flight-paths", async () => {
      const reportTrips = await createDatabase(this.env.DB).all<{
        report_date: string;
        aircraft_id: string;
      }>(sql`
        SELECT DISTINCT t.report_date, t.aircraft_id
         FROM ingestion_rows r
         JOIN trips t ON t.id = r.published_trip_id
         JOIN aircraft a ON a.id = t.aircraft_id
        WHERE r.batch_id = ${event.payload.batchId} AND a.icao_no IS NOT NULL
        ORDER BY t.aircraft_id, t.report_date
      `);
      const datesByAircraft = new Map<string, Set<string>>();
      for (const trip of reportTrips) {
        const dates = datesByAircraft.get(trip.aircraft_id) ?? new Set<string>();
        for (const date of surroundingUtcDates(trip.report_date)) dates.add(date);
        datesByAircraft.set(trip.aircraft_id, dates);
      }
      let requestIndex = 0;
      for (const [aircraftId, dateSet] of datesByAircraft) {
        const dates = [...dateSet].sort();
        for (let index = 0; index < dates.length; index += 60) {
          const id = `tracks-after-${event.instanceId}-${requestIndex}`;
          requestIndex += 1;
          try {
            await this.env.TRACK_COLLECTION.create({
              id,
              params: {
                dates: dates.slice(index, index + 60),
                aircraftIds: [aircraftId],
                triggeredBy: event.payload.batchId,
              },
            });
          } catch {
            const existing = await this.env.TRACK_COLLECTION.get(id);
            await existing.status();
          }
        }
      }
      return { requests: requestIndex };
    });
    return { state: "published" };
  }
}
