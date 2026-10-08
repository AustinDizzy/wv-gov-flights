import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDatabase } from "../../../../../../db/client";
import { z } from "zod";
import { requireAdmin } from "../../../../../../lib/auth";
import {
  insertAuditEvent,
  updateIngestionRow,
} from "../../../../../../lib/db/admin-queries";
import { extractedTripSchema } from "../../../../../../lib/ocr/schema";
import { json } from "../../../../../../lib/utils";

const updateSchema = z.object({
  trip: z.unknown(),
  action: z.enum(["create", "link_existing", "exclude"]).nullable(),
  existing_trip_id: z.string().min(1).nullable(),
}).strict();

export const PUT: APIRoute = async ({ request, params }) => {
  try {
    const session = await requireAdmin(request, env);
    const body = updateSchema.parse(await request.json());
    const parsed = extractedTripSchema.safeParse(body.trip);
    const errors = parsed.success
      ? []
      : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    if (body.action === "link_existing" && !body.existing_trip_id) {
      errors.push("Select the existing trip to link.");
    }
    const db = createDatabase(env.DB);
    const updated = await updateIngestionRow(db, {
      batchId: String(params.id),
      rowId: String(params.rowId),
      editedJson: JSON.stringify(body.trip),
      validationErrorsJson: JSON.stringify(errors),
      action: body.action,
      existingTripId: body.existing_trip_id,
      actorUserId: session.user.id,
    });
    if (!updated) return json({ error: "Staged row not found." }, { status: 404 });
    await insertAuditEvent(db, {
      actorUserId: session.user.id,
      action: "review",
      entityType: "ingestion_row",
      entityId: String(params.rowId),
      afterJson: JSON.stringify({
        action: body.action,
        existing_trip_id: body.existing_trip_id,
        errors,
      }),
    });
    return errors.length > 0 && body.action !== "exclude"
      ? json({ errors }, { status: 422 })
      : json({ ok: true, errors: [] });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return json({ error: "Invalid review payload." }, { status: 400 });
    return json({ error: "Could not save the row." }, { status: 500 });
  }
};
