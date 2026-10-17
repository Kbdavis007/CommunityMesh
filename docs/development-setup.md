# Development setup and data ownership

## Data ownership

| Store | Authoritative data |
| --- | --- |
| Supabase Auth and Postgres | Authentication identities; profiles; communities and memberships; listings and listing images; contributor tasks and the task-completion outbox |
| Supabase Storage | Avatars, identity-verification images, and other private user-specific media |
| Cloudflare D1 | DAO proposals, voting snapshots and private ballots, governance executions, community policy versions, CC/WC/RT/VT balances and ledger entries, and AI run logs |
| Cloudflare R2 | Public and semi-public non-profile assets in the `r2_assets` bucket |
| Browser IndexedDB | Device-scoped cached records, account-partitioned pending operations, per-source cursors, unresolved conflicts, and public asset metadata |

Workers are the application API boundary. The browser must not connect directly
to D1, R2, or Supabase Postgres, and must not receive privileged provider
credentials. D1 and Supabase identifiers are application-level references, not
cross-database foreign keys.

## Prerequisites

- Node.js and npm (the repository's `package-lock.json` is authoritative).
- Docker running for the local Supabase stack.
- A Supabase CLI available through `npx supabase`.
- Cloudflare Wrangler is installed with the project dependencies.

Install JavaScript dependencies and run the client checks:

```sh
npm ci
npm test
npm run build
npm run lint
```

## Local Supabase

`supabase/config.toml` configures the local Supabase project and its Auth
redirects for Vite's `http://localhost:5173` development origin. It contains no
provider credentials. Start the local services and apply every checked-in
migration with:

```sh
npx supabase start
npx supabase db reset
npx supabase status
```

`db reset` recreates the local database and applies
`supabase/migrations/*.sql`; it is destructive to local Supabase data. Stop the
local services when finished:

```sh
npx supabase stop
```

For a separately approved hosted Supabase project, authenticate and link that
project before using `npx supabase db push`. Review the migration plan and
target project before applying migrations. Do not put project keys in source
control. Local Worker-only values belong in the ignored `.dev.vars` file; keep
them server-side and use only the minimum required by the Worker.

## Local D1 and Worker

The `DB` binding in `wrangler.jsonc` points at `migrations/d1`. Apply and inspect
those migrations against Wrangler's local D1 emulator:

```sh
npm exec -- wrangler d1 migrations apply DB --local
npm exec -- wrangler d1 migrations list DB --local
```

Start the local Worker with `npm run worker:dev`; its health endpoint is
`http://localhost:8787/api/v1/health`. The current Worker configuration also
declares the `AI` binding. It does not invoke a model in local health checks.

## R2 bucket and deployment bindings

The production asset bucket is named `r2_assets`. The Worker needs an R2 bucket
binding (named `ASSETS` in application code) in `wrangler.jsonc`, in addition to
the existing D1 `DB` and Workers AI `AI` bindings. The R2 binding is added with
the asset-metadata migration task; it is not present in the current local
configuration yet. Keep the bucket private and route retrieval through the
authorized Worker endpoints; do not enable a public `r2.dev` bucket for
protected assets.

Creating or linking a remote R2 bucket requires the account's R2 subscription
checkout. Provider documentation does not establish whether every account can
complete that flow without a payment method. Verify the deployment account's
payment-method requirements and billing controls before provisioning `r2_assets`.
Do not run a remote bucket-creation command as part of local development.

## Migration ownership and sequence

1. Apply `supabase/migrations/` to Supabase Auth/Postgres. The SQL references
   Supabase's `auth.users` and Auth functions, so use the Supabase local stack
   or a linked Supabase project, not a plain standalone PostgreSQL server.
2. Apply `migrations/d1/` to D1 with Wrangler. The local `DB` binding and
   migration directory are declared in `wrangler.jsonc`.
3. Use the R2 bucket only for public or semi-public non-profile objects.
   Supabase Storage remains the owner of private user media.
4. The browser's version-2 IndexedDB schema is defined in
   `src/storage/indexed-db.ts`. Sync transport and server change feeds are
   separate features; do not treat the service-worker cache as a database.

Apply schema changes through new, ordered migration files in the owning store.
Do not edit an already-applied production migration or use the development
reset commands against production.
