# Fullstack Monorepo Boilerplate

A multi-tenant, enterprise-grade starting point for B2B SaaS, marketplaces and internal admin systems — **NestJS + PostgreSQL on the back, React + Vite on the front**, in a Turborepo/pnpm monorepo.

It contains **no business logic**. There is exactly one reference feature slice (`items`) whose only job is to be copied. Everything else is infrastructure, and every architectural rule it claims to enforce is enforced by a machine — the type system, the linter, a database constraint, or a CI gate.

This file covers what the boilerplate guarantees and how to stand it up. For day-to-day commands, where new code goes, and the exact steps to add a feature, see **[`GUIDE.md`](GUIDE.md)**.

---

## What it guarantees

These seven properties are the reason the boilerplate exists. Each one is held up by a mechanism, not by a convention.

| #   | Guarantee                                                                        | Enforced by                                                                                                                              |
| :-- | :------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Zero-leakage multi-tenancy** — you never write `WHERE tenant_id = ...` by hand | PostgreSQL Row Level Security with `FORCE ROW LEVEL SECURITY`, and an application role created `NOBYPASSRLS`                             |
| 2   | **Fail-closed by default** — missing context returns nothing, never everything   | RLS policies compare against `NULLIF(current_setting('app.tenant_id', true), '')::uuid`, which matches no row when unset                 |
| 3   | **One source of truth for the API contract**                                     | The OpenAPI document is generated from the API and committed; the typed client is generated from it; CI fails if either has drifted      |
| 4   | **Fail-fast configuration**                                                      | A Zod schema parses `process.env` before the app boots and exits with the offending variable's name                                      |
| 5   | **Uniform responses and errors**                                                 | Every success is a `{ data, meta }` envelope; every failure is RFC 9457 `application/problem+json` with a stable machine-readable `code` |
| 6   | **Architecture as lint errors**                                                  | `eslint-plugin-boundaries` — an import that crosses a layer in the wrong direction fails CI at the exact line                            |
| 7   | **Zero business leakage**                                                        | The framework ships one reference slice; optional integrations are documented recipes, not code you have to delete                       |

---

## Prerequisites

| Tool                                    | Version         | Notes                                                                                  |
| :-------------------------------------- | :-------------- | :------------------------------------------------------------------------------------- |
| Node.js                                 | ≥ 20.11         | `node --version`                                                                       |
| pnpm                                    | ≥ 10            | `corepack enable` is enough — the version is pinned in `package.json`                  |
| Docker                                  | with Compose v2 | `docker compose version`                                                               |
| Git                                     | any             |                                                                                        |
| [`just`](https://github.com/casey/just) | any (optional)  | Not required — every recipe is a documented `pnpm`/`docker compose` command underneath |

Nothing else needs installing. PostgreSQL and Redis run in containers.

---

## Quickstart (about five minutes)

```bash
git clone <this-repo-url> my-project
cd my-project
rm -rf .git && git init          # start your own history

pnpm install                     # 1. install the workspace
pnpm bootstrap                   # 2. name the project, generate secrets, write .env files
docker compose up -d             # 3. start PostgreSQL 16 + Redis 7
pnpm db:migrate                  # 4. create the schema, roles and RLS policies
pnpm db:seed                     # 5. optional: one tenant, one login, one item
pnpm dev                         # 6. API and web, both in watch mode
```

With [`just`](https://github.com/casey/just) installed, steps 1 and 3–6 collapse to `just fresh` (run `just bootstrap` yourself in between, since it's interactive) followed by `just dev`.

- API: <http://localhost:3000>
- Web: <http://localhost:5173>
- If you ran `pnpm db:seed` (or `just fresh`, which runs it for you): log in with `owner@example.com` / `password123`.

`pnpm bootstrap` asks for a project name, generates every secret with `crypto.randomBytes`, and creates a `.env` from each `.env.example`. It **never overwrites an existing `.env`**, so it is safe to re-run. When it finishes it prints the short list of things it cannot decide for you — domains, CORS origins, the observability endpoint, TLS.

> The script is named `bootstrap`. Both `setup` and `init` are reserved pnpm built-in commands (they configure pnpm itself / scaffold a bare `package.json`) and would silently shadow a script of the same name.

> You do not need to rename the `@repo/*` packages. That namespace is internal and never published; renaming it only risks missing a reference.

---

## Workspace layout

```
.
├── apps/
│   ├── api/                  NestJS backend — five layers, Drizzle, RLS
│   └── web/                  React 19 + Vite single-page app
│
├── packages/
│   ├── tsconfig/             base / nest / react TypeScript configs (strict everywhere)
│   ├── eslint-config/        flat config + the layer boundary rules
│   ├── shared/               types, error codes, RFC 9457 shapes, the CASL ability factory
│   ├── api-contract/         types and React Query hooks generated from openapi.json
│   └── ui/                   shared design system and tokens
│
├── infra/
│   ├── postgres/init/        database roles, created on first container start
│   └── nginx/                nginx site config for the production web image
│
├── scripts/                  setup, CI gates, the feature-slice generator, deploy
├── docker-compose.yml        local PostgreSQL + Redis
├── docker-compose.prod.yml   the full production stack
└── turbo.json                task graph, caching inputs and outputs
```

The backend is a **modular monolith** in five layers. Imports may only point downwards — `modules → core → common → shared`. A wrong-direction import is a lint error, not a review comment.

---

## Commands

Run all of these from the repository root. If [`just`](https://github.com/casey/just) is installed, `just <recipe>` (e.g. `just dev`, `just check`) wraps the same commands with tab-completion and a couple of convenience recipes on top — run `just` with no arguments for the full list. Everything below still works directly through `pnpm` with no extra tooling required.

| Command                             | What it does                                             |
| :---------------------------------- | :------------------------------------------------------- |
| `pnpm bootstrap`                    | Interactive first-run initialiser. Idempotent.           |
| `pnpm dev`                          | Everything in watch mode.                                |
| `pnpm build`                        | Production build of every package, in dependency order.  |
| `pnpm lint`                         | ESLint, including the architectural boundary rules.      |
| `pnpm typecheck`                    | TypeScript across the whole workspace, no emit.          |
| `pnpm format` / `pnpm format:check` | Prettier, write / verify.                                |
| `pnpm test`                         | Unit tests with coverage.                                |
| `pnpm test:integration`             | Integration tests, including tenant isolation under RLS. |
| `pnpm db:generate`                  | Generate a migration from changes to the Drizzle schema. |
| `pnpm db:migrate`                   | Apply pending migrations.                                |
| `pnpm db:seed`                      | Seed development data.                                   |
| `pnpm db:studio`                    | Browse the database.                                     |
| `pnpm api:contract`                 | Regenerate `openapi.json` and the typed client from it.  |
| `pnpm check:env`                    | Verify `.env.example` matches the Zod env schema.        |
| `pnpm gen:module <name>`            | Scaffold a new backend feature slice.                    |
| `pnpm clean`                        | Remove build output and `node_modules`.                  |

---

## Adding a feature

```bash
pnpm gen:module invoices
```

This clones the `items` reference slice, rewrites every casing of `item`/`items`, copies the RLS integration test alongside it, and emits a migration stub that **already contains** `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` and the tenant policy.

That last part is the point of the generator. Copying a slice by hand and forgetting the RLS statements produces a table that looks fine, passes its tests, and silently returns other tenants' rows.

Afterwards the generator prints what it deliberately did not guess: registering the module, adding the CASL subject, folding the RLS statements into the generated migration, filling in the isolation test, and regenerating the contract. Work through that list, then:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration
```

---

## Testing

| Layer         | Command                                   | What it proves                                                                                                                       |
| :------------ | :---------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| Unit          | `pnpm test`                               | Pure logic, in isolation, no I/O.                                                                                                    |
| Integration   | `pnpm test:integration`                   | Real PostgreSQL via Testcontainers, migrated as the owner role and queried as the restricted runtime role — exactly like production. |
| Coverage gate | `pnpm exec tsx scripts/check-coverage.ts` | Line coverage per area, not one repo-wide average.                                                                                   |

Coverage thresholds are set by blast radius, because a single total is easy to game:

| Area                                              | Minimum line coverage |
| :------------------------------------------------ | --------------------: |
| `src/core/database/**` (RLS, transactions)        |                   95% |
| `src/modules/auth/**`                             |                   90% |
| `src/core/filters/**`, `src/core/interceptors/**` |                   90% |
| Everything else                                   |                   70% |

Integration tests must connect as a `NOBYPASSRLS` role. Running them as a superuser bypasses row level security entirely and turns the whole isolation suite green while proving nothing.

---

## Continuous integration

`.github/workflows/ci.yml` runs four jobs on every push and pull request to `main` and `develop`.

| Job        | Gates                                                                     | Broken means                                                                                                  |
| :--------- | :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------ |
| `static`   | format, lint, typecheck, env-schema drift, OpenAPI contract drift         | A layer boundary was crossed, a variable is undocumented, or the committed contract no longer matches the API |
| `test`     | migrations, migration drift, unit tests, integration tests, coverage gate | The schema changed without a migration, or tenant isolation regressed                                         |
| `security` | `pnpm audit --audit-level=high`, gitleaks                                 | A high-severity advisory, or a secret in the history                                                          |
| `build`    | both Docker images                                                        | The thing that ships does not build                                                                           |

Nothing uses `continue-on-error`. A red gate is always a real problem, and every failure message says what to run to fix it.

---

## Deployment

The target is a **single VPS running Docker Compose**. No Kubernetes, no managed platform.

```bash
# On the server, once:
git clone <your-repo-url> /srv/app && cd /srv/app
cp .env.example .env && $EDITOR .env     # production secrets live only here

# Every release:
./scripts/deploy.sh main
```

`scripts/deploy.sh` does, in order: preflight checks → fetch the ref → build images → start PostgreSQL and Redis → **run migrations** → swap in the new `api` and `web` containers → poll `/readyz` with retries → roll the code back to the previous revision if that fails.

Three things about that order are deliberate:

- **Migrations run before the swap.** The reverse leaves a window where new code queries columns that do not exist. This only works if migrations are additive — expand, migrate, contract; never rename or drop a column in the same deploy.
- **Rollback restores code, not the schema.** That is safe exactly because migrations are additive.
- **`stop_grace_period` is longer than the app's shutdown deadline.** On `SIGTERM` the API reports `/readyz` as 503, waits for the load balancer to notice, stops accepting connections, drains in-flight requests, then closes its pools. Cut that short and every deploy drops requests.

### What you configure where

- **`.env` on the server** — everything the API reads at runtime: database URL, Redis, JWT secrets, CORS origins.
- **`--build-arg` at image build time** — every `VITE_*` variable. Vite inlines these into the JavaScript bundle, so setting them in `.env` or `environment:` has no effect whatsoever. A staging build and a production build are two different images. Never put a secret in one.
- **The edge proxy on the host** — TLS. The `api` and `web` containers bind to `127.0.0.1` and are reachable only through it. PostgreSQL and Redis publish no ports at all.

Web and API are served from different sites, so the refresh cookie is `SameSite=None; Secure`, and CSRF protection is an Origin-header check plus a synchronizer token — not a cookie-based double-submit, since `document.cookie` can't read a cookie set by a different origin in the first place (see `GUIDE.md` §7). Be aware that third-party cookies are blocked by Safari and Brave by default: if your users are not exclusively on Chrome or Edge, put both behind one hostname (`app.example.com` and `app.example.com/api`) with a single `location /api` block in the edge proxy, and switch the refresh cookie back to `SameSite=Lax`. That change touches two files.

---

## License

MIT — see `LICENSE`, or replace it with whatever your project needs.
