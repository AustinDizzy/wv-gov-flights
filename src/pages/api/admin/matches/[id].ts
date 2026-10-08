import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createDatabase } from "../../../../db/client";
import { z } from "zod";
import { requireAdmin } from "../../../../lib/auth";
import {
  confirmMatchCandidate,
  getMatchCandidate,
  insertAuditEvent,
  rejectMatchCandidate,
} from "../../../../lib/db/admin-queries";
import { json, stableId } from "../../../../lib/utils";

const schema = z.object({ action: z.enum(["confirm", "reject"]) }).strict();

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const session = await requireAdmin(request, env);
    const db = createDatabase(env.DB);
    const body = schema.parse(await request.json());
    const candidate = await getMatchCandidate(db, params.id);
    if (!candidate) return json({ error: "Candidate not found." }, { status: 404 });
    const breakdown = JSON.parse(candidate.score_breakdown_json) as {
      bundle?: { flight_ids?: unknown };
    };
    const bundledIds = breakdown.bundle?.flight_ids;
    const observedFlightIds =
      Array.isArray(bundledIds)
        ? bundledIds.filter((value): value is string => typeof value === "string")
        : [candidate.observed_flight_id];
    const uniqueFlightIds = [...new Set(observedFlightIds)];
    if (uniqueFlightIds.length === 0) {
      uniqueFlightIds.push(candidate.observed_flight_id);
    }
    if (body.action === "confirm") {
      await confirmMatchCandidate(db, {
        tripId: candidate.trip_id,
        observedFlightIds: uniqueFlightIds,
        linkIds: await Promise.all(
          uniqueFlightIds.map((flightId) =>
            stableId("link", `${candidate.trip_id}:${flightId}`)
          ),
        ),
        actorUserId: session.user.id,
      });
    } else {
      await rejectMatchCandidate(db, {
        tripId: candidate.trip_id,
        observedFlightIds: uniqueFlightIds,
      });
    }
    await insertAuditEvent(db, {
      actorUserId: session.user.id,
      action: body.action,
      entityType: "flight_match_candidate",
      entityId: String(params.id),
      afterJson: JSON.stringify(candidate),
    });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Could not update candidate." }, { status: 400 });
  }
};
