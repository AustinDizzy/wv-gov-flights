import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDatabase } from "../../../../../db/client";
import { z } from "zod";
import { requireAdmin } from "../../../../../lib/auth";
import {
  bulkReviewRows,
  insertAuditEvent,
} from "../../../../../lib/db/admin-queries";
import { json } from "../../../../../lib/utils";

const bulkReviewSchema = z
  .object({
    row_ids: z.array(z.string().min(1)).min(1).max(500),
    action: z.enum(["create", "exclude"]),
  })
  .strict();

export const PATCH: APIRoute = async ({ request, params }) => {
  try {
    const session = await requireAdmin(request, env);
    const db = createDatabase(env.DB);
    const body = bulkReviewSchema.parse(await request.json());
    const rowIds = [...new Set(body.row_ids)];
    const result = await bulkReviewRows(db, {
      batchId: String(params.id),
      rowIds,
      action: body.action,
      actorUserId: session.user.id,
    });
    if (result.state === "missing") {
      return json({ error: "Batch not found." }, { status: 404 });
    }
    if (result.state === "unavailable") {
      return json({ error: "Batch is not available for review." }, { status: 409 });
    }
    await insertAuditEvent(db, {
      actorUserId: session.user.id,
      action: "bulk_review",
      entityType: "ingestion_batch",
      entityId: String(params.id),
      afterJson: JSON.stringify({
        action: body.action,
        updated_row_ids: result.updatedIds,
        skipped_row_ids: result.skippedIds,
      }),
    });
    return json({ updatedIds: result.updatedIds, skippedIds: result.skippedIds });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return json({ error: "Invalid bulk review payload." }, { status: 400 });
    }
    return json({ error: "Rows could not be reviewed." }, { status: 500 });
  }
};
