import { handle } from "@astrojs/cloudflare/handler";
import { ReportIngestionWorkflow } from "./workflows/report-ingestion";
import { TrackCollectionWorkflow } from "./workflows/track-collection";

export { ReportIngestionWorkflow, TrackCollectionWorkflow };

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    return handle(request, env, context);
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    context: ExecutionContext,
  ): Promise<void> {
    const date = new Date(controller.scheduledTime).toISOString().slice(0, 10);
    const id = `weekly-${date}`;
    context.waitUntil(
      env.TRACK_COLLECTION.create({ id, params: {} }).catch(async () => {
        // A retried cron delivery reuses the same deterministic instance.
        const existing = await env.TRACK_COLLECTION.get(id);
        await existing.status();
      }),
    );
  },
} satisfies ExportedHandler<Env>;
