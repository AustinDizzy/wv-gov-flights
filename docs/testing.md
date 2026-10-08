# Testing

Unit fixtures cover the old per-aircraft layout, newer multi-aircraft layout, cover letters, page-row disagreement, invoice normalization, passenger/route parsing, UTC offset conversion, sustained-ground and telemetry splitting, overnight merging, simplification, matching, and upload path guards.

The Cloudflare Vitest project applies checked-in migrations to isolated local D1 and uses local R2/Workflow bindings. Provider calls are isolated behind small modules so Mistral, Globe, location resolution, and Workers AI can be mocked at the fetch or Workflow-step boundary.

Authentication tests use reserved `example.com` addresses. Real contributor
addresses belong only in the ignored local environment and the deployed
`ADMIN_EMAILS` Worker secret.

Playwright has no `webServer` entry. It only uses an already-running `BASE_URL`, so test execution cannot start a development server.
