import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDatabase } from "../../../../../db/client";
import { z } from "zod";
import { requireAdmin } from "../../../../../lib/auth";
import { updateObservedFlightGeometry } from "../../../../../lib/db/admin-queries";
import { json } from "../../../../../lib/utils";

const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const schema = z.object({
  operation: z.enum(["merge", "trim", "split", "correct"]),
  note: z.string().max(1000).nullable(),
  geometry: z.object({
    type: z.literal("Feature"),
    properties: z.record(z.string(), z.unknown()).nullable().optional(),
    geometry: z.object({
      type: z.literal("LineString"),
      coordinates: z.array(coordinate).min(2).max(500),
    }).strict(),
  }).strict(),
}).strict();

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const session = await requireAdmin(request, env);
    const body = schema.parse(await request.json());
    const db = createDatabase(env.DB);
    const flightId = String(params.id);
    const updated = await updateObservedFlightGeometry(db, {
      flightId,
      geometryJson: JSON.stringify(body.geometry),
      pointCount: body.geometry.geometry.coordinates.length,
      operation: body.operation,
      note: body.note,
      actorUserId: session.user.id,
    });
    if (!updated) return json({ error: "Observed flight not found." }, { status: 404 });
    return json({ updated: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return json({ error: "Invalid observed-flight geometry." }, { status: 422 });
    return json({ error: "Could not update geometry." }, { status: 500 });
  }
};
