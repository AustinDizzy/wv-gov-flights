import { HTTPClient, Mistral } from "@mistralai/mistralai";
import { westVirginiaFlightLogJsonSchema, DOCUMENT_ANNOTATION_PROMPT } from "./schema";

const MAX_OCR_RESPONSE_BYTES = 32 * 1024 * 1024;

export interface MistralOcrPage {
  index: number;
  markdown?: string;
  tables?: Array<{ id?: string; content?: string; html?: string }>;
  confidence_scores?: {
    average_page_confidence_score?: number;
    minimum_page_confidence_score?: number;
  } | null;
}

export interface MistralOcrResponse {
  pages: MistralOcrPage[];
  model: string;
  document_annotation: unknown;
  usage_info?: Record<string, unknown>;
}

function isOcrResponse(value: unknown): value is MistralOcrResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.model === "string" &&
    Array.isArray(candidate.pages) &&
    "document_annotation" in candidate
  );
}

async function readBounded(response: Response): Promise<ArrayBuffer> {
  if (!response.body) return new ArrayBuffer(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_OCR_RESPONSE_BYTES) {
      await reader.cancel("OCR response exceeded application limit");
      throw new Error("Mistral OCR response exceeded 32 MiB.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined.buffer;
}

function errorDetail(value: unknown): string | null {
  const text =
    typeof value === "string"
      ? value.trim()
      : value == null
        ? ""
        : JSON.stringify(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as {
      message?: unknown;
      detail?: unknown;
      error?: { message?: unknown } | string;
    };
    const detail =
      (typeof parsed.error === "object" && typeof parsed.error?.message === "string"
        ? parsed.error.message
        : null) ??
      (typeof parsed.error === "string" ? parsed.error : null) ??
      (typeof parsed.message === "string" ? parsed.message : null) ??
      (typeof parsed.detail === "string" ? parsed.detail : null);
    return detail?.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, 500) || null;
  } catch {
    return text.replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, 500);
  }
}

export interface OcrRequest {
  documentUrl: string;
}

export async function requestMistralOcr(
  input: OcrRequest,
  env: {
    MISTRAL_API_KEY: string;
  },
): Promise<{ response: MistralOcrResponse; bytes: ArrayBuffer }> {
  const httpClient = new HTTPClient({
    fetcher: async (request, init) => {
      const upstream = await fetch(request, init);
      const bytes = await readBounded(upstream);
      return new Response(bytes, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers,
      });
    },
  });
  const client = new Mistral({
    apiKey: env.MISTRAL_API_KEY,
    httpClient,
    retryConfig: { strategy: "none" },
    timeoutMs: 14 * 60 * 1000,
  });

  try {
    const result = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl: input.documentUrl,
      },
      includeImageBase64: false,
      tableFormat: "html",
      confidenceScoresGranularity: "page",
      includeBlocks: false,
      documentAnnotationPrompt: DOCUMENT_ANNOTATION_PROMPT,
      documentAnnotationFormat: {
        type: "json_schema",
        jsonSchema: {
          name: "west_virginia_aircraft_flight_log",
          strict: true,
          schemaDefinition: westVirginiaFlightLogJsonSchema,
        },
      },
    });
    const response: MistralOcrResponse = {
      ...result,
      pages: result.pages.map((page) => ({
        ...page,
        tables: page.tables?.map((table) => ({
          ...table,
          ...(table.format === "html" ? { html: table.content } : {}),
        })),
        confidence_scores: page.confidenceScores
          ? {
              average_page_confidence_score:
                page.confidenceScores.averagePageConfidenceScore,
              minimum_page_confidence_score:
                page.confidenceScores.minimumPageConfidenceScore,
            }
          : null,
      })),
      document_annotation: result.documentAnnotation ?? null,
      usage_info: {
        pages_processed: result.usageInfo.pagesProcessed,
        doc_size_bytes: result.usageInfo.docSizeBytes ?? null,
      },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(response)).buffer;
    if (bytes.byteLength > MAX_OCR_RESPONSE_BYTES) {
      throw new Error("Mistral OCR response exceeded 32 MiB.");
    }
    if (!isOcrResponse(response)) {
      throw new Error("Mistral returned an invalid OCR response.");
    }
    return { response, bytes };
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith("Mistral OCR")) throw cause;
    const candidate =
      cause && typeof cause === "object"
        ? (cause as {
            statusCode?: unknown;
            body?: unknown;
            headers?: unknown;
            message?: unknown;
          })
        : null;
    const status =
      typeof candidate?.statusCode === "number" ? ` (${candidate.statusCode})` : "";
    const headers = candidate?.headers instanceof Headers ? candidate.headers : null;
    const requestId = headers?.get("x-request-id");
    const detail =
      errorDetail(candidate?.body) ??
      (typeof candidate?.message === "string" ? candidate.message.slice(0, 500) : null);
    throw new Error(
      `Mistral OCR failed${status}${requestId ? ` [${requestId}]` : ""}${detail ? `: ${detail}` : "."}`,
    );
  }
}

export function parseDocumentAnnotation(response: MistralOcrResponse): unknown {
  if (typeof response.document_annotation === "string") {
    return JSON.parse(response.document_annotation);
  }
  return response.document_annotation;
}
