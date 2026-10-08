# Track repair

Track repair reuses `TrackCollectionWorkflow` with `mode: "repair"`. It is never
started by the cron or ordinary backfill form.

## Safety defaults

- `dryRun` defaults to `true`.
- Stored `raw/globe/{icao}/{date}.json.gz` objects are checked before the
  provider is contacted.
- `allowProviderFetch` defaults to `false`.
- When provider fetching is explicitly enabled, the default request budget is
  25 and the hard maximum is 100. Every attempt consumes the budget, including
  a provider response with no trace for that aircraft/date.
- Applying a repair recomputes bundle candidates but does not attach them unless
  `autoAttachMatches` is separately enabled.
- Provider requests execute sequentially with a durable one-second pause after
  each request, in addition to the normal retry/backoff behavior.
- An observation with contributor-corrected geometry is reported as skipped
  and is not superseded automatically.

The authenticated endpoint is:

```text
POST /api/admin/tracks/repair
```

A storage-only dry-run request looks like:

```json
{
  "start_date": "2026-06-01",
  "end_date": "2026-06-30",
  "aircraft_ids": [],
  "dry_run": true,
  "allow_provider_fetch": false,
  "provider_request_budget": 0,
  "auto_attach_matches": false
}
```

The resulting Workflow status reports provider request, stored, provider-result,
and missing day counts, plus observations that would be created, revised, left
unchanged, or skipped because of contributor-corrected geometry.

Applying a repair requires both `"dry_run": false` and this exact confirmation:

```json
{
  "confirmation": "APPLY STORED TRACK REPAIR"
}
```

Provider access remains separately opt-in. Review the completed dry-run result
before submitting an applying request. The first applying run should retain
`"auto_attach_matches": false`; it will make the corrected bundle suggestions
available in contributor review without changing trip links.
