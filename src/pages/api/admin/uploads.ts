import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDatabase } from "../../../db/client";
import { requireAdmin } from "../../../lib/auth";
import {
  attachWorkflowToBatch,
  createUploadedDocument,
  findSourceDocumentBySha,
  markBatchFailed,
} from "../../../lib/db/admin-queries";
import { appPath } from "../../../lib/config";
import { reportIngestionWorkflowId } from "../../../lib/ingestion/workflow-id";
import { pendingDocumentStorageKey } from "../../../lib/public-routes";
import { sha256Bytes } from "../../../lib/security";
import { json, newId } from "../../../lib/utils";

const MAX_PDF_BYTES = 50 * 1024 * 1024;

async function hasPdfHeader(stream: ReadableStream<Uint8Array>): Promise<boolean> {
  const reader = stream.getReader();
  const header: number[] = [];
  try {
    while (header.length < 5) {
      const { done, value } = await reader.read();
      if (done) break;
      header.push(...value.slice(0, 5 - header.length));
    }
  } finally {
    await reader.cancel();
  }
  return new TextDecoder().decode(new Uint8Array(header)) === "%PDF-";
}

export const POST: APIRoute = async ({ request }) => {
  const requestId = crypto.randomUUID();
  let stage = "authenticate";
  try {
    const session = await requireAdmin(request, env);
    const db = createDatabase(env.DB);
    stage = "validate";
    if (request.headers.get("content-type")?.split(";")[0] !== "application/pdf") {
      return json({ error: "Only application/pdf uploads are accepted." }, { status: 415 });
    }
    const declaredLength = Number.parseInt(
      request.headers.get("x-file-size") || request.headers.get("content-length") || "",
      10,
    );
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength <= 0 ||
      declaredLength > MAX_PDF_BYTES
    ) {
      return json({ error: "PDF size must be known and no larger than 50 MiB." }, { status: 413 });
    }
    const sha = request.headers.get("x-file-sha256")?.toLocaleLowerCase() ?? "";
    const checksum = sha256Bytes(sha);
    if (!checksum) return json({ error: "A valid browser-computed SHA-256 is required." }, { status: 400 });
    const encodedName = request.headers.get("x-file-name") ?? "report.pdf";
    const originalFilename = decodeURIComponent(encodedName)
      .split(/[\\/]/)
      .at(-1)!
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 240);
    if (!originalFilename.toLocaleLowerCase().endsWith(".pdf")) {
      return json({ error: "The filename must end in .pdf." }, { status: 400 });
    }
    if (!request.body) return json({ error: "Upload body is missing." }, { status: 400 });
    const duplicate = await findSourceDocumentBySha(db, sha);
    if (duplicate) return json({ error: "These exact PDF bytes were already uploaded.", document_id: duplicate.id }, { status: 409 });

    const [peek, upload] = request.body.tee();
    if (!(await hasPdfHeader(peek))) {
      await upload.cancel("Malformed PDF header");
      return json({ error: "The upload does not begin with a valid PDF header." }, { status: 400 });
    }
    const r2Key = pendingDocumentStorageKey(sha, originalFilename);
    stage = "check-r2";
    if (await env.FILES.head(r2Key)) {
      await upload.cancel("Duplicate R2 object");
      return json({ error: "These exact PDF bytes already exist." }, { status: 409 });
    }
    let actualLength = 0;
    const boundedUpload = upload.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          actualLength += chunk.byteLength;
          if (actualLength > MAX_PDF_BYTES) {
            controller.error(new Error("PDF exceeded the 50 MiB upload limit."));
            return;
          }
          controller.enqueue(chunk);
        },
      }),
    );
    // R2 requires a streaming upload to retain a known length. Passing the
    // TransformStream output directly loses the request body's fixed-length
    // metadata and is rejected by the production runtime.
    stage = "write-r2";
    const fixedLengthUpload = new FixedLengthStream(declaredLength);
    await Promise.all([
      boundedUpload.pipeTo(fixedLengthUpload.writable),
      env.FILES.put(r2Key, fixedLengthUpload.readable, {
        sha256: checksum.buffer as ArrayBuffer,
        httpMetadata: {
          contentType: "application/pdf",
          contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(originalFilename)}`,
        },
        customMetadata: {
          sha256: sha,
          uploadedBy: session.user.id,
        },
      }),
    ]);
    if (actualLength !== declaredLength) {
      await env.FILES.delete(r2Key);
      return json({ error: "The uploaded byte count did not match the declared file size." }, { status: 400 });
    }

    const documentId = newId("document");
    const batchId = newId("batch");
    stage = "write-d1";
    try {
      await createUploadedDocument(db, {
        documentId,
        batchId,
        sha256: sha,
        originalFilename,
        byteSize: actualLength,
        r2Key,
        actorUserId: session.user.id,
      });
    } catch (error) {
      await env.FILES.delete(r2Key);
      throw error;
    }
    const workflowId = reportIngestionWorkflowId(batchId);
    const reviewUrl = appPath(`/admin/reports/${batchId}`, env);
    stage = "start-workflow";
    try {
      await env.REPORT_INGESTION.create({
        id: workflowId,
        params: { batchId, documentId },
      });
      await attachWorkflowToBatch(db, batchId, workflowId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 1000) : "Workflow creation failed.";
      console.error(JSON.stringify({
        event: "report_upload_workflow_start_failed",
        request_id: requestId,
        batch_id: batchId,
        document_id: documentId,
        stage,
        error: message,
      }));
      await markBatchFailed(
        db,
        batchId,
        `OCR Workflow could not start: ${message}`,
      );
      return json(
        {
          batch_id: batchId,
          document_id: documentId,
          review_url: reviewUrl,
          warning: "The PDF was saved, but OCR could not start. Open the batch to retry.",
          request_id: requestId,
        },
        { status: 202 },
      );
    }
    return json(
      {
        batch_id: batchId,
        document_id: documentId,
        workflow_instance_id: workflowId,
        review_url: reviewUrl,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Unknown upload error.";
    console.error(JSON.stringify({
      event: "report_upload_failed",
      request_id: requestId,
      stage,
      error: message.slice(0, 1000),
    }));
    return json(
      {
        error: `The upload could not be completed. Reference: ${requestId}`,
        request_id: requestId,
      },
      { status: 500 },
    );
  }
};
