import { afterEach, describe, expect, it, vi } from "vitest";
import oldLayout from "../fixtures/ocr-old-layout.json";
import newLayout from "../fixtures/ocr-new-layout.json";
import coverLetter from "../fixtures/ocr-cover-letter.json";
import {
  parseDocumentAnnotation,
  requestMistralOcr,
  type MistralOcrResponse,
} from "../../src/lib/ocr/mistral";
import {
  westVirginiaFlightLogJsonSchema,
} from "../../src/lib/ocr/schema";
import { validateOcrDraft } from "../../src/lib/ocr/validation";

const response = (value: unknown) => value as MistralOcrResponse;

afterEach(() => vi.unstubAllGlobals());

describe("Mistral OCR normalization", () => {
  it("accepts the old per-aircraft layout", () => {
    const result = validateOcrDraft(parseDocumentAnnotation(response(oldLayout)), response(oldLayout));
    expect(result.issues).toEqual([]);
    expect(result.document?.trips[0].tail_no).toBe("N1WV");
    expect(result.document?.trips[0].passengers).toBe("Jane Doe, John Doe");
    expect(result.document?.report.source_agency).toBe("WV Aviation Division");
  });

  it("preserves invoice values and agency continuation in the multi-aircraft layout", () => {
    const result = validateOcrDraft(parseDocumentAnnotation(response(newLayout)), response(newLayout));
    expect(result.document?.trips[0]).toMatchObject({
      department: "Commerce",
      division: "Development",
      invoiced_amount: 3220,
    });
  });

  it("derives page and row provenance from the HTML table counts", () => {
    const combined = {
      ...structuredClone(oldLayout),
      pages: [
        structuredClone(oldLayout.pages[0]),
        { ...structuredClone(newLayout.pages[0]), index: 1 },
      ],
      document_annotation: JSON.stringify([
        ...JSON.parse(oldLayout.document_annotation),
        ...JSON.parse(newLayout.document_annotation),
      ]),
    } as MistralOcrResponse;
    const result = validateOcrDraft(parseDocumentAnnotation(combined), combined);
    expect(result.document?.trips.map(({ source_page, source_row }) => ({
      source_page,
      source_row,
    }))).toEqual([
      { source_page: 1, source_row: 1 },
      { source_page: 2, source_row: 1 },
    ]);
  });

  it("returns no trips for a cover letter", () => {
    const result = validateOcrDraft(
      parseDocumentAnnotation(response(coverLetter)),
      response(coverLetter),
    );
    expect(result.document?.document_type).toBe("other");
    expect(result.document?.trips).toEqual([]);
  });

  it("rejects an annotation when its count disagrees with visible table rows", () => {
    const broken = structuredClone(oldLayout) as unknown as MistralOcrResponse;
    broken.pages[0].tables![0].content = "<table><tr><th>Date</th></tr><tr><td>A</td></tr><tr><td>B</td></tr></table>";
    const result = validateOcrDraft(parseDocumentAnnotation(broken), broken);
    expect(result.document).toBeNull();
    expect(result.issues[0]).toContain("2 visible rows");
  });

  it("uses the Mistral SDK with the Worker-stored API key", async () => {
    const sdkResponse = {
      model: "mistral-ocr-latest",
      pages: [
        {
          index: 0,
          markdown: "N1WV Flight Report",
          images: [],
          tables: [
            {
              id: "table-0",
              content: "<table><tr><th>Date</th></tr><tr><td>07/01/2025</td></tr></table>",
              format: "html",
            },
          ],
          dimensions: null,
          confidence_scores: {
            average_page_confidence_score: 0.98,
            minimum_page_confidence_score: 0.95,
          },
        },
      ],
      document_annotation: oldLayout.document_annotation,
      usage_info: { pages_processed: 1 },
    };
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(sdkResponse), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await requestMistralOcr(
      {
        documentUrl: "https://example.test/document.pdf",
      },
      {
        MISTRAL_API_KEY: "mistral-key",
      },
    );
    const [input, init] = fetchMock.mock.calls[0];
    const request = new Request(input, init);
    expect(request.url).toBe("https://api.mistral.ai/v1/ocr");
    expect(request.headers.get("authorization")).toBe("Bearer mistral-key");
    expect(request.headers.has("cf-aig-authorization")).toBe(false);
    const body = await request.clone().json() as {
      document: { document_url: string };
      include_image_base64: boolean;
      include_blocks: boolean;
      document_annotation_format: {
        type: string;
        json_schema: { name: string; strict: boolean; schema: unknown };
      };
    };
    expect(body.document.document_url).toBe("https://example.test/document.pdf");
    expect(body.include_image_base64).toBe(false);
    expect(body.include_blocks).toBe(false);
    expect(body.document_annotation_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "west_virginia_aircraft_flight_log",
        strict: true,
        schema: westVirginiaFlightLogJsonSchema,
      },
    });
  });

  it("surfaces a bounded provider error without exposing request headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify({ error: { message: "Invalid provider key" } }), {
          status: 401,
          headers: { "cf-ray": "test-ray" },
        }),
      ),
    );
    await expect(
      requestMistralOcr(
        {
          documentUrl: "https://example.test/document.pdf",
        },
        {
          MISTRAL_API_KEY: "mistral-key",
        },
      ),
    ).rejects.toThrow("Mistral OCR failed (401): Invalid provider key");
  });
});
