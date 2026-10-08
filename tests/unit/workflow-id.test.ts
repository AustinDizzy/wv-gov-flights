import { describe, expect, it } from "vitest";
import { reportIngestionWorkflowId } from "../../src/lib/ingestion/workflow-id";

describe("report ingestion Workflow IDs", () => {
  it("uses the unique batch ID rather than reusable document bytes", () => {
    expect(
      reportIngestionWorkflowId("batch_29ae0482-78e9-43f0-afdd-587c9c17bbda"),
    ).toBe("ingest-29ae0482-78e9-43f0-afdd-587c9c17bbda");
  });

  it("rejects unsafe identifiers", () => {
    expect(() => reportIngestionWorkflowId("batch_../../other")).toThrow(
      "Invalid ingestion batch ID.",
    );
  });
});
