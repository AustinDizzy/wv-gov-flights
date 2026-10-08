import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const aircraftRegistration = z.enum([
  "N1WV",
  "N3WV",
  "N5WV",
  "N6WV",
  "N890SP",
  "N895SP",
]);

export const mistralFlightLogAnnotationSchema = z
  .array(
    z
      .object({
        date,
        aircraft: aircraftRegistration,
        department: z.string().trim().min(1),
        division: z.string().trim().min(1).nullable().optional().default(null),
        flightHours: z.number().nonnegative(),
        route: z.string().trim().min(1),
        passengers: z.array(z.string().trim().min(1)).optional().default([]),
        comments: z.string().nullable().optional().default(null),
        invoiced: z.number().nonnegative(),
      })
      .strict(),
  );

export const extractedTripSchema = z
  .object({
    source_page: z.number().int().positive(),
    source_row: z.number().int().positive(),
    date,
    tail_no: z.string().trim().min(1).nullable(),
    department: z.string().trim().min(1),
    division: z.string().trim().min(1).nullable(),
    flight_hours: z.number().nonnegative(),
    route: z.string().trim().min(1),
    passengers: z.string().nullable(),
    comments: z.string().nullable(),
    invoiced_amount: z.number().nonnegative().nullable(),
    warnings: z.array(z.string()),
  })
  .strict();

export const extractedFlightDocumentSchema = z
  .object({
    document_type: z.enum(["flight_log", "cover_letter", "other"]),
    report: z
      .object({
        title: z.string().nullable(),
        criteria_start: date.nullable(),
        criteria_end: date.nullable(),
        default_tail_no: z.string().nullable(),
        source_agency: z.string().nullable(),
        response_date: date.nullable(),
      })
      .strict(),
    trips: z.array(extractedTripSchema),
  })
  .strict()
  .superRefine((document, context) => {
    if (document.document_type !== "flight_log" && document.trips.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Cover letters and non-flight-log documents must not contain trips.",
        path: ["trips"],
      });
    }
  });

export type ExtractedTrip = z.infer<typeof extractedTripSchema>;
export type ExtractedFlightDocument = z.infer<typeof extractedFlightDocumentSchema>;

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

export const westVirginiaFlightLogJsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "West Virginia Aviation Division - Aircraft Flight Log",
  description:
    "Flight log entries from the official PDF. The 'Agency' column in the PDF often contains two lines: the main department on top and a division/sub-agency below it.",
  type: "array",
  items: {
    type: "object",
    properties: {
      date: {
        type: "string",
        format: "date",
        description: "Flight date in YYYY-MM-DD format",
      },
      aircraft: {
        type: "string",
        enum: aircraftRegistration.options,
        description: "Aircraft registration",
      },
      department: {
        type: "string",
        description:
          "Main department/agency (first line of the Agency column). Examples: 'Department of Administration', 'Governor's Office', 'WV State Police', 'Department of Environmental Protection'",
      },
      division: {
        ...nullableString,
        description:
          "Division or sub-agency (second line of the Agency column when present). Examples: 'Aviation Division', 'Division of Mining and Reclamation', 'Public Employees Insurance Agency'. Use null when absent.",
      },
      flightHours: {
        type: "number",
        minimum: 0,
        description: "Flight hours as decimal number",
      },
      route: {
        type: "string",
        description: "Full route/destinations text exactly as shown",
      },
      passengers: {
        type: "array",
        items: { type: "string" },
        description:
          "Array of passenger names. Empty array [] if the column shows a department/division name or is blank.",
      },
      comments: {
        ...nullableString,
        description: "Full comments/notes from the Comments column",
      },
      invoiced: {
        type: "number",
        minimum: 0,
        description: "Invoiced amount as number (no $ sign)",
      },
    },
    required: [
      "date",
      "aircraft",
      "department",
      "flightHours",
      "route",
      "invoiced",
    ],
    additionalProperties: false,
  },
} as const;

export const DOCUMENT_ANNOTATION_PROMPT = `
Convert the entire West Virginia Aviation Division Aircraft Flight Log PDF into a clean JSON array. Output ONLY valid JSON — nothing else.

### Required Output Schema (strictly follow this structure)

Each object must contain exactly these fields:

- "date": "YYYY-MM-DD"
- "aircraft": one of ["N1WV", "N3WV", "N5WV", "N6WV", "N890SP", "N895SP"]
- "department": string (main department from the first line of the Agency column)
- "division": string or null (second line of the Agency column when it exists and is different from the department)
- "flightHours": number (decimal)
- "route": string (exact text from Destinations column)
- "passengers": array of strings (individual names only)
- "comments": string or null
- "invoiced": number (numeric value only)

### Critical Parsing Rules

Agency Column Handling (most important):
- The Agency column frequently has two lines.
  - Top line → "department"
  - Bottom line (when present and meaningful) → "division"
- If there is no second line, or the second line is blank/redundant, set "division": null
- Sometimes a division name appears in the Passengers column instead — move it to division when appropriate and set passengers to an empty array.

Passengers Column:
- Extract only actual person names into the array.
- If the column contains a department or division name (instead of people), move that value to division (if not already captured) and use passengers: []
- If blank → passengers: []

Other Rules:
- Convert all dates from MM/DD/YYYY → YYYY-MM-DD
- Keep route exactly as written in the PDF
- Capture full text in comments
- invoiced must be a clean number (e.g. 2240.00)
- Process every row across all pages in the original order (sorted by aircraft then date)
- Do not add, guess, or omit any data

Return only the JSON array.
`.trim();
