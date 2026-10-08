import type { MistralOcrResponse } from "./mistral";
import {
  mistralFlightLogAnnotationSchema,
  type ExtractedFlightDocument,
} from "./schema";

export interface PageCheck {
  page: number;
  reasons: string[];
  visibleTableRows: number;
  extractedRows: number;
  confidence: number | null;
}

export interface OcrValidation {
  document: ExtractedFlightDocument | null;
  issues: string[];
  pages: PageCheck[];
}

function visibleRows(html: string): number {
  const rows = html.match(/<tr\b/gi)?.length ?? 0;
  const headers = html.match(/<th\b/gi)?.length ?? 0;
  return Math.max(0, rows - (headers > 0 ? 1 : 0));
}

function pageTableRows(response: MistralOcrResponse, pageIndex: number): number {
  const page = response.pages.find((candidate) => candidate.index === pageIndex);
  return (page?.tables ?? []).reduce(
    (sum, table) => sum + visibleRows(table.content ?? table.html ?? ""),
    0,
  );
}

export function validateOcrDraft(
  annotation: unknown,
  response: MistralOcrResponse,
  confidenceFloor = 0.78,
): OcrValidation {
  const parsed = mistralFlightLogAnnotationSchema.safeParse(annotation);
  if (!parsed.success) {
    return {
      document: null,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "document"}: ${issue.message}`,
      ),
      pages: [],
    };
  }

  const totalVisibleRows = response.pages.reduce(
    (sum, page) => sum + pageTableRows(response, page.index),
    0,
  );
  const rowCountMatches = totalVisibleRows === parsed.data.length;
  const pages = response.pages.map((page) => {
    const pageNumber = page.index + 1;
    const visibleTableRows = pageTableRows(response, page.index);
    const extractedRows = rowCountMatches ? visibleTableRows : 0;
    const confidence =
      page.confidence_scores?.average_page_confidence_score ?? null;
    const reasons: string[] = [];
    if (!rowCountMatches && visibleTableRows > 0) {
      reasons.push("The document annotation count does not match the visible table rows.");
    }
    if (confidence != null && confidence < confidenceFloor) {
      reasons.push(`Page confidence ${confidence.toFixed(3)} is below ${confidenceFloor}.`);
    }
    return { page: pageNumber, reasons, visibleTableRows, extractedRows, confidence };
  });

  const issues: string[] = [];
  if (!rowCountMatches) {
    issues.push(
      `OCR tables contain ${totalVisibleRows} visible rows but the annotation contains ${parsed.data.length}.`,
    );
    return { document: null, issues, pages };
  }

  let tripOffset = 0;
  const trips = pages.flatMap((page) => {
    const pageTrips = parsed.data
      .slice(tripOffset, tripOffset + page.visibleTableRows)
      .map((trip, rowIndex) => ({
        source_page: page.page,
        source_row: rowIndex + 1,
        date: trip.date,
        tail_no: trip.aircraft,
        department: trip.department,
        division: trip.division,
        flight_hours: trip.flightHours,
        route: trip.route,
        passengers: trip.passengers.length > 0 ? trip.passengers.join(", ") : null,
        comments: trip.comments,
        invoiced_amount: trip.invoiced,
        warnings: [...page.reasons],
      }));
    tripOffset += page.visibleTableRows;
    return pageTrips;
  });

  return {
    document: {
      document_type: trips.length > 0 ? "flight_log" : "other",
      report: {
        title: null,
        criteria_start: null,
        criteria_end: null,
        default_tail_no: null,
        source_agency: "WV Aviation Division",
        response_date: null,
      },
      trips,
    },
    issues,
    pages,
  };
}
