export function reportIngestionWorkflowId(batchId: string): string {
  const normalized = batchId.replace(/^batch_/, "");
  if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    throw new Error("Invalid ingestion batch ID.");
  }
  return `ingest-${normalized}`;
}
