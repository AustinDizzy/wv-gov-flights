# Golden Dome Airways deployment

The checked-in Wrangler configuration targets the existing `golden-dome-airways` Worker, its `golden-dome-airways` D1 database, the `wv-gov-flights` R2 bucket, and the `l.abs.codes/wv-gov-flights` route. Review every remote command before running it.

## Configuration

The checked-in non-sensitive Worker variables are:

- `APP_BASE_PATH`, currently `/wv-gov-flights`.
- `PUBLIC_ORIGIN`, currently `https://l.abs.codes`.
- `AI_GATEWAY_ID`.
- `GLOBE_API_BASE_URL`.

The Google OAuth callback is:

```text
{PUBLIC_ORIGIN}{APP_BASE_PATH}/api/auth/callback/google
```

### Analytics

Analytics is optional and configured through runtime Worker variables beginning
with `PUBLIC_ANALYTICS_`:

- `PUBLIC_ANALYTICS_SRC` is the script URL and enables analytics.
- Every other non-empty suffix becomes a kebab-case `data-*` attribute. For
  example, `PUBLIC_ANALYTICS_SITE_ID` becomes `data-site-id`, and
  `PUBLIC_ANALYTICS_DOMAIN` becomes `data-domain`.

Set `PUBLIC_ANALYTICS_SRC` and any provider-specific attributes in the deployed
Worker's Cloudflare dashboard. The checked-in Wrangler configuration uses
`keep_vars` so those dashboard-managed values survive later deploys without
committing the live values. If `PUBLIC_ANALYTICS_SRC` is absent, or the app is
not running in production, no analytics script is rendered. For local bindings,
an example is documented in `.dev.vars.example`; put any real values only in the
ignored `.dev.vars`.

## Worker secrets

The deployed Worker requires these secrets:

```sh
npx wrangler secret put ADMIN_EMAILS
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put MISTRAL_API_KEY
```

`ADMIN_EMAILS` is a comma-separated, case-insensitive contributor allowlist.
Treat it as authorization configuration even if the addresses themselves are
not confidential. Use at least 32 random bytes for Better Auth. If the
configured Globe provider requires an API key, add `GLOBE_API_KEY` as a secret;
otherwise leave it unset. Remove an unused provider secret instead of storing a
dummy production value.

For local Worker bindings, copy `.dev.vars.example` to the ignored `.dev.vars`
file. The checked-in `GLOBE_API_KEY=` entry is empty because the credential is
optional; set it only when the configured provider requires authentication. Do
not place personal addresses or credentials in `wrangler.jsonc`.

Cloudflare supports a `secrets.required` manifest in `wrangler.jsonc`, but that
manifest also limits which keys Wrangler loads from `.dev.vars`. This project
does not use it because `GLOBE_API_KEY` is an optional secret. The checked-in
`.dev.vars.example` remains the source of truth for local secret names and for
`wrangler types`; deployed secrets remain managed with `wrangler secret put`.

## Wrangler and CI credentials

Cloudflare account selection is Wrangler configuration, not an application
binding. When an explicit account is required, set `CLOUDFLARE_ACCOUNT_ID` in
the shell, CI secret/variable store, or an ignored `.env` file. Authenticate CI
with `CLOUDFLARE_API_TOKEN`; do not add either value to `wrangler.jsonc` or
`.dev.vars.example`. `.env.example` documents the supported names.

The D1 `database_id` in `wrangler.jsonc` identifies the bound database resource
and is intentionally checked in; it is not the Cloudflare account ID or an
authentication credential.

## Data and migrations

The schema was compacted to one pre-launch baseline migration with a matching
Drizzle snapshot. `src/db/schema.ts` is the source for relational schema changes;
Drizzle Kit generates reviewed SQL and snapshot metadata, while Wrangler applies
the SQL to D1.

Any local D1 database created from the former `0001`–`0008` development history
should be treated as disposable and recreated before validating the compacted
baseline. This repository does not automatically delete local data.

Create and validate a migration locally first:

```sh
npm run db:generate -- --name describe_the_change
npm run db:check
npm run db:migrate:local
npm run db:migrate:validate
```

Review generated SQL before applying it. Use
`npm run db:generate -- --custom --name describe_the_change` for custom SQL such
as FTS5 or triggers. Never use `drizzle-kit push` against a shared or production
database, and never add a numbered SQL file without its generated journal entry
and snapshot.

Applying a production migration is an explicit remote action:

```sh
npx wrangler d1 migrations list golden-dome-airways --remote
npx wrangler d1 migrations apply golden-dome-airways --remote
```

Use the database name for remote migration commands to avoid an accidentally
retargeted binding. Create a current D1 bookmark or backup before applying a
reviewed production migration. Never rewrite an already-applied migration;
correct it with the next numbered migration.

The legacy importer can generate reviewed import artifacts without performing remote writes:

```sh
npm run import:legacy -- \
  --database /path/to/legacy/data.db \
  --datasources /path/to/legacy/public \
  --output ./legacy-import
```

## Verify and deploy

Run the verification commands documented in the README and inspect the dry-run bundle. Deployment remains an explicit operator action:

```sh
npx wrangler deploy
```

## Legacy Pages domain

The independent [`infra/pages-redirect`](../infra/pages-redirect) project owns
the replacement deployment for the existing `wv-gov-flights` Cloudflare Pages
project. Its advanced-mode `_worker.js` sends every request to the Astro Worker
with a permanent `308`, preserving the request path and query string.

Deploying the redirect is a separate, explicit action whose command names the
existing Pages project and its production branch:

```sh
npm run pages-redirect:deploy
```
