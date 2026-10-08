import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireAdmin } from "../../../../lib/auth";
import { json, stableId } from "../../../../lib/utils";

const schema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  aircraft_ids: z.array(z.string()).default([]),
}).strict();

export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await requireAdmin(request, env);
    const body = schema.parse(await request.json());
    const id = await stableId(
      "backfill",
      `${body.start_date}:${body.end_date}:${[...body.aircraft_ids].sort().join(",")}`,
    );
    try {
      await env.TRACK_COLLECTION.create({
        id,
        params: {
          startDate: body.start_date,
          endDate: body.end_date,
          aircraftIds: body.aircraft_ids,
          triggeredBy: session.user.id,
        },
      });
    } catch {
      const existing = await env.TRACK_COLLECTION.get(id);
      return json({ workflow_instance_id: id, status: await existing.status() }, { status: 200 });
    }
    return json({ workflow_instance_id: id }, { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Invalid backfill request." }, { status: 400 });
  }
};
