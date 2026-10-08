import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireAdmin } from "../../../../lib/auth";
import { json } from "../../../../lib/utils";

const APPLY_CONFIRMATION = "APPLY STORED TRACK REPAIR";

const schema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  aircraft_ids: z.array(z.string()).default([]),
  dry_run: z.boolean().default(true),
  allow_provider_fetch: z.boolean().default(false),
  provider_request_budget: z.number().int().min(0).max(100).default(25),
  auto_attach_matches: z.boolean().default(false),
  confirmation: z.string().optional(),
}).strict().superRefine((value, context) => {
  if (!value.dry_run && value.confirmation !== APPLY_CONFIRMATION) {
    context.addIssue({
      code: "custom",
      path: ["confirmation"],
      message: `Applying a repair requires confirmation: ${APPLY_CONFIRMATION}`,
    });
  }
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await requireAdmin(request, env);
    const body = schema.parse(await request.json());
    const id = [
      "repair",
      body.dry_run ? "dry" : "apply",
      body.allow_provider_fetch ? "provider" : "stored",
      body.start_date,
      body.end_date,
      crypto.randomUUID(),
    ].join("-");
    await env.TRACK_COLLECTION.create({
      id,
      params: {
        startDate: body.start_date,
        endDate: body.end_date,
        aircraftIds: body.aircraft_ids,
        triggeredBy: session.user.id,
        mode: "repair",
        dryRun: body.dry_run,
        allowProviderFetch: body.allow_provider_fetch,
        providerRequestBudget: body.provider_request_budget,
        autoAttachMatches: body.auto_attach_matches,
      },
    });
    return json(
      {
        workflow_instance_id: id,
        dry_run: body.dry_run,
        allow_provider_fetch: body.allow_provider_fetch,
        provider_request_budget: body.provider_request_budget,
        auto_attach_matches: body.auto_attach_matches,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Invalid repair request." }, { status: 400 });
  }
};
