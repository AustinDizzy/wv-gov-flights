export { ReportIngestionWorkflow } from "../../src/workflows/report-ingestion";
export { TrackCollectionWorkflow } from "../../src/workflows/track-collection";

export default {
  fetch(): Response {
    return new Response("test worker");
  },
} satisfies ExportedHandler<Env>;
