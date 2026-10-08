import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDatabase } from "../../../../../db/client";
import { requireAdmin } from "../../../../../lib/auth";
import {
  getBatchRetryInfo,
  markBatchOcrStarted,
} from "../../../../../lib/db/admin-queries";
import { reportIngestionWorkflowId } from "../../../../../lib/ingestion/workflow-id";
import { json } from "../../../../../lib/utils";

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const session = await requireAdmin(request, env);
    const db = createDatabase(env.DB);
    const batch = await getBatchRetryInfo(db, params.id);
    if (!batch) {
      return json({ error: "Ingestion batch not found." }, { status: 404 });
    }

    if (!batch.workflow_instance_id) {
      const workflowId = reportIngestionWorkflowId(String(params.id));
      await env.REPORT_INGESTION.create({
        id: workflowId,
        params: {
          batchId: String(params.id),
          documentId: batch.source_document_id,
        },
      });
      await markBatchOcrStarted(db, {
        batchId: String(params.id),
        workflowId,
        actorUserId: session.user.id,
        action: "start_ocr",
      });
      return json({ state: "ocr_running" }, { status: 202 });
    }

    const instance = await env.REPORT_INGESTION.get(batch.workflow_instance_id);
    const status = await instance.status();
    if (status.status !== "errored" && status.status !== "terminated") {
      return json(
        { error: `OCR cannot be retried while the Workflow is ${status.status}.` },
        { status: 409 },
      );
    }

    await instance.restart({
      from: { name: "ocr-document", count: 1, type: "do" },
    });
    await markBatchOcrStarted(db, {
      batchId: String(params.id),
      workflowId: batch.workflow_instance_id,
      actorUserId: session.user.id,
      action: "retry_ocr",
    });
    return json({ state: "ocr_running" }, { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "The OCR retry could not be started." }, { status: 500 });
  }
};
