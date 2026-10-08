import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDatabase } from "../../../../../db/client";
import { requireAdmin } from "../../../../../lib/auth";
import { getBatchPublicationStatus } from "../../../../../lib/db/admin-queries";
import { json } from "../../../../../lib/utils";

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const session = await requireAdmin(request, env);
    const batch = await getBatchPublicationStatus(
      createDatabase(env.DB),
      params.id,
    );
    if (!batch) return json({ error: "Batch not found." }, { status: 404 });
    if (batch.state === "published") return json({ state: "published" });
    if (batch.state !== "review_required" || !batch.workflow_instance_id) {
      return json({ error: "Batch is not waiting for review." }, { status: 409 });
    }
    if (batch.unresolved > 0) {
      return json({ error: `${batch.unresolved} rows are unresolved.` }, { status: 422 });
    }
    const instance = await env.REPORT_INGESTION.get(batch.workflow_instance_id);
    await instance.sendEvent({
      type: "review_complete",
      payload: { action: "publish", actorUserId: session.user.id },
    });
    return json({ state: "publishing" }, { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Publication could not be started." }, { status: 500 });
  }
};
