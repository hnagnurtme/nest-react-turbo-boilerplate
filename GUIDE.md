# Developer Guide

`README.md` explains what this boilerplate guarantees and how to stand it up. This guide is the one you keep open while you're actually writing code in it — daily commands, where things go, and the exact steps to add a feature without breaking the guarantees the boilerplate exists to provide.

---

## 1. Daily commands

Everything is wrapped in a [`justfile`](justfile) so you don't have to remember whether something is a root `pnpm` script, a filtered `pnpm --filter`, or a raw `docker compose` call. Run `just` with no arguments any time to see the full list, grouped.

```bash
just doctor      # confirms your toolchain and .env files are in place
just fresh       # install deps, start Postgres+Redis, run migrations
just dev         # API + web, both in watch mode
```

The recipes you'll use most:

| Command                                | Does                                                                                                                  |
| :------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| `just dev`                             | Start infra (if not running) + both apps, watch mode                                                                  |
| `just dev-api` / `just dev-web`        | Start just one side                                                                                                   |
| `just check`                           | Everything CI checks — lint, typecheck, format, env drift, both test suites, coverage gate. Run this before you push. |
| `just new-module <name>`               | Scaffold a backend feature slice from `items`                                                                         |
| `just contract`                        | Regenerate the OpenAPI spec + typed client after changing an endpoint                                                 |
| `just db-migrate` / `just db-generate` | Apply / create a migration                                                                                            |
| `just db-studio`                       | Browse the database                                                                                                   |
| `just db-shell`                        | `psql` into the local container                                                                                       |
| `just up` / `just down`                | Local Postgres + Redis containers                                                                                     |
| `just doctor`                          | Sanity-check your local setup                                                                                         |

`just` is a thin wrapper — every recipe just shells out to the `pnpm`/`docker compose` command documented in `README.md`'s command table. If `just` isn't installed, everything still works directly through `pnpm`.

---

## 2. Where things go

Two independent five-layer stacks. In both, **a lower layer may never import a higher one** — `eslint-plugin-boundaries` fails the build at the exact import line if you get this wrong, so treat a boundary lint error as "this belongs somewhere else," not as something to silence.

### Backend (`apps/api/src`)

```
config → common → core → integrations → modules
```

| Layer          | Put here                                                                                                                              | Never put here                                           |
| :------------- | :------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------- |
| `config`       | Zod env schema, typed config accessor                                                                                                 | Anything that imports another layer                      |
| `common`       | Pure functions, constants, DTOs, type guards                                                                                          | Anything touching DB, Redis, HTTP, or `ExecutionContext` |
| `core`         | DB, guards, middleware, filters, interceptors, logger, telemetry — infrastructure that knows about HTTP but not about any one feature | Business/domain logic                                    |
| `integrations` | Outbound adapters to third-party systems (empty by default — see `README.md`)                                                         | Anything a feature module could reach directly           |
| `modules`      | Feature slices: `controller` / `service` / `repository` / `dto` / `*.module.ts`                                                       | Direct SQL execution outside a repository                |

A module is only reachable from outside through its `index.ts`. `boundaries/entry-point` enforces this — `import { AuthModule } from '../../modules/auth'`, never `.../modules/auth/auth.service`.

### Frontend (`apps/web/src`)

```
lib → entities → features → app
```

| Layer      | Put here                                                                                                                                                                                                 |
| :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib`      | Framework-agnostic infrastructure with no identity concept: the HTTP client, the raw token store (`lib/auth/token-store.ts`)                                                                             |
| `entities` | Domain data used by more than one feature: `entities/session` (user, memberships, active tenant)                                                                                                         |
| `features` | One self-contained slice: `features/items`, `features/auth`. Cross-feature imports go through the feature's `index.ts` only                                                                              |
| `app`      | Composition: router, providers, layout, anything that needs to see _everything_ (e.g. `app/components/route-guard.tsx` reads `entities/session`, which `lib` and `shared` components are not allowed to) |

If a component needs session/user data and you're tempted to put it in `shared/`, it belongs in `app/` instead — `shared` has no concept of identity by design.

### Where does _this specific thing_ go?

| You're adding...                                         | Goes in                                                                                                            |
| :------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| A new DB table                                           | `apps/api/src/core/database/schema/<name>.ts`, export from `schema/index.ts`                                       |
| A new endpoint                                           | A feature module under `apps/api/src/modules/<name>/`                                                              |
| A new outbound call to a third party                     | `apps/api/src/core/integrations/<name>/` behind a port interface, never called directly from a `modules/*` service |
| A cross-feature React hook/util with no domain logic     | `apps/web/src/shared/`                                                                                             |
| A cross-feature React hook that reads `entities/session` | `apps/web/src/entities/` if it's genuinely domain data, `apps/web/src/app/` if it's composition-only               |
| A new shared UI primitive                                | `packages/ui/src/primitives/` — it must never import `@repo/api-contract` or fetch data itself                     |

---

## 3. Adding a backend feature

Everything below is what `just new-module <name>` does _not_ do for you, on top of what it does. Read `apps/api/src/modules/items/` alongside this — it is the literal template.

### 3.1 Scaffold

```bash
just new-module invoices
```

This copies `modules/items` to `modules/invoices`, rewrites every casing of `item`/`items`, and emits a migration stub in `apps/api/drizzle/` that already contains `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and the tenant isolation policy. **That RLS boilerplate is the entire point of using the generator instead of copy-pasting by hand** — a table that's missing it looks completely normal until a second tenant's data shows up in the first tenant's response.

The generator prints a checklist of what it can't decide for you. Work through it:

1. **Register the module** in `apps/api/src/app.module.ts`'s `imports` array.
2. **Add the CASL subject.** `packages/shared/src/auth/ability.ts` defines `SubjectShapes` and the switch statement inside `defineAbilityFor`. Add your new subject's shape (the fields CASL will match conditions against — at minimum `id` and `tenantId`) and extend each role's `can(...)` grants.
3. **Write the RLS integration test.** As of this writing, `modules/items` itself doesn't ship a dedicated per-module RLS test — the one authoritative suite lives at `apps/api/src/core/database/__tests__/tenant-isolation.integration.spec.ts` and tests the `items` table directly. Copy its structure (seed two tenants, assert a naive query only returns the caller's rows, assert a cross-tenant `INSERT` is rejected) into a new spec next to your module, pointed at your new table. **Do not skip this.** It's the only thing that actually proves isolation instead of assuming the migration stub did its job.
4. **Regenerate the contract**: `just contract`, then commit both `openapi.json` and the regenerated client. CI's `static` job fails the build if this would have produced a diff.

### 3.2 The shape of a slice (what `items` demonstrates)

- **`*.repository.ts`** — every query goes through `TransactionManager` (see §5 below), and **never adds its own `WHERE tenant_id = ...`.** RLS is the thing that makes that omission safe instead of a bug; adding a manual filter on top just gives you two places to keep in sync and a false sense that the filter is what's protecting you.
- **`*.service.ts`** — business logic. This is also where a **per-record** authorization check belongs, on top of the guard's type-level check:

  ```ts
  const item = await this.getOrThrow(id);
  const ability = defineAbilityFor(actor);
  ForbiddenError.from(ability).throwUnlessCan('update', subject('Item', item));
  ```

  The guard (`@CheckPolicies((a) => a.can('update', 'Item'))`) can only check "can this role ever update an Item" — it runs before any record is loaded, so it has nothing to test a per-record condition (e.g. "only the creator can delete it") against. That check has to happen here, after the repository returns the row.

- **`*.controller.ts`** — thin. Validates with a Zod schema (`new ZodValidationPipe(mySchema)`), delegates to the service, returns the plain value — `TransformInterceptor` wraps it in the `{ data, meta }` envelope for you. A list endpoint returning `{ items, meta }` from the service is recognized automatically and unwrapped into the paginated envelope shape.
- **`dto/*.ts`** — a Zod schema plus its inferred type, one file per shape. Nothing here talks to the database.

### 3.3 Extra endpoints beyond CRUD

Anything mutating (`POST`/`PATCH`/`PUT`/`DELETE`) gets CSRF protection automatically from the global `CsrfMiddleware` — you don't add anything for that yourself. If you're calling it from `apps/web`, use the generated `api-contract` hook; the HTTP client already attaches the CSRF header from memory on every non-`GET` request.

---

## 4. Adding a frontend feature

Read `apps/web/src/features/items/` alongside this.

1. **Scaffold the folder**: `apps/web/src/features/<name>/{index.ts,pages/,components/}`.
2. **Data fetching** goes through the generated hooks in `@repo/api-contract` (`useListItems`, `useCreateItem`, ...). If the backend endpoint doesn't exist yet, add it first and run `just contract` — don't hand-write a fetch call that bypasses the generated client, or the envelope-unwrapping and auth headers won't apply.
3. **Permission-gate the UI** with `<Can>`:

   ```tsx
   <Can I="create" a="Item">
     <CreateItemDialog />
   </Can>
   ```

   This is UX, not security — it only hides the button. The API enforces the real check via `PoliciesGuard` regardless of what the UI shows, so never skip step 2 of §3.2 by relying on the frontend hiding something.

4. **Tables and forms**: `@repo/ui`'s `DataTable`, `ConfirmDialog`, and `FormField` composites — see `items-page.tsx` for the full pattern (columns, pagination, the delete-confirmation flow). Don't reach for a new table/dialog library; if `@repo/ui` is missing something, add it there so the next feature gets it too.
5. **Export only what's needed** from the feature's `index.ts`. Nothing outside a feature should import its internals directly — `boundaries/entry-point` enforces this the same way it does on the backend.
6. **Multi-tenant state**: if your feature reads `entities/session`'s `activeTenantId`, make sure any cached query data is invalidated on tenant switch. (`apps/web` doesn't yet call `queryClient.clear()` on tenant switch — if you're the one adding tenant-switch UI, that call needs to go wherever `setActiveTenant` is dispatched, or stale data from the previous tenant will render briefly.)

---

## 5. Working with `TransactionManager`

Three methods, three different meanings. Picking the wrong one either leaks data across tenants or — more often, since RLS fails closed — silently returns **zero rows** with no error, which is a confusing bug to chase down. `apps/api/src/core/database/transaction.manager.ts` has the full reasoning in comments; this is the quick-reference version.

| Method                      | Use for                                                                                                                     | What it does                                                                                                                                                                                                                                                                                                                                                                                          |
| :-------------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runInTenantContext(fn)`    | The overwhelming majority of queries — anything scoped to "the current request's tenant"                                    | Sets `app.tenant_id` from the verified JWT claim in CLS. RLS scopes every query inside `fn` to that tenant.                                                                                                                                                                                                                                                                                           |
| `runAsUser(userId, fn)`     | The rare query that is legitimately about _a user across all their tenants_ — e.g. "list every tenant this user belongs to" | Sets `app.user_id` instead. Only works on tables whose RLS policy has a matching `OR user_id = ...` clause (currently just `memberships` — see `auth.service.ts`'s `loadMemberships`). Extending this to a new table means adding that second `USING` clause to its migration, deliberately, not just calling `runAsUser` and hoping.                                                                 |
| `runAsPlatform(reason, fn)` | Nothing, currently, unless you add a role for it                                                                            | Runs with **no** tenant/user context set. Since `app_runtime` is `NOBYPASSRLS`, this returns zero rows on every RLS-protected table — it exists as a named placeholder for a genuine cross-tenant admin role that doesn't exist yet in this boilerplate. If you need one, add a dedicated database role with the access it actually needs and use a distinct method for it; don't repurpose this one. |

**The tell that you picked wrong**: a query that should return data comes back empty, with no exception. If you're querying a tenant-scoped table and you don't yet know which tenant, you're not ready for `runInTenantContext`; if you don't know which user either, you probably don't have enough context to run the query safely at all.

---

## 6. Testing a new feature

| Layer          | Where                        | What it should prove                                                                                                   |
| :------------- | :--------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| Unit           | `*.spec.ts` next to the file | Pure logic — DTO validation, service logic with a fake repository                                                      |
| Integration    | `*.integration.spec.ts`      | The real thing against real Postgres: RLS isolation (§3.1 step 3), any raw SQL, anything touching `TransactionManager` |
| Frontend smoke | `*.test.tsx`                 | The component renders without crashing against a mocked API layer — see `items-page.smoke.test.tsx`                    |

Run `just test-all` before opening a PR, or just `just check` to also get lint/typecheck/format/coverage in one shot — it's the same set of gates `.github/workflows/ci.yml` runs.

The coverage gate (`just coverage`) holds `core/database`, `modules/auth`, and `core/filters`+`core/interceptors` to a higher bar (90–95%) than everything else (70%), because a gap in RLS or auth logic is a data breach and a gap in a utility function is not. See `scripts/check-coverage.ts` for the exact thresholds.

---

## 7. Pitfalls worth knowing before you hit them

Short, because each of these cost real debugging time while building the reference `auth`/`items` modules — better to read the sentence than rediscover it.

- **A cross-tenant read on an RLS-protected table returns zero rows, not an error.** If a query "should" find data and doesn't, check whether it needs `runAsUser` instead of `runInTenantContext` (§5) before assuming the data isn't there.
- **`emitDecoratorMetadata` needs a real import, not `import type`.** If you get "Nest can't resolve dependencies of X" for a constructor parameter that's clearly provided, check whether an editor's auto-fix turned that import into a type-only one. NestJS backend files have `@typescript-eslint/consistent-type-imports` disabled for exactly this reason — don't re-enable it per-file.
- **`tsx` cannot run the compiled API.** It uses esbuild, which doesn't emit decorator metadata. Always go through `nest build` (`just build`, or `pnpm --filter @repo/api dev` which uses `nest start --watch`) — never `tsx src/main.ts`.
- **A cookie's `Path` restricts which requests carry it, including requests from your own middleware.** If you narrow a cookie's path "for safety," check every place server-side code reads that cookie on a _different_ path first — `httpOnly` already protects the value from XSS regardless of path, so narrowing the path is rarely buying you anything extra, and it's an easy way to silently break another endpoint.
- **`document.cookie` cannot read a cookie set by a different origin**, full stop, regardless of `SameSite` or `Path`. If the API and the web app are ever on different origins (as this boilerplate's default cross-site config assumes), don't design a browser-JS-reads-a-cookie flow — pass the value through a response body instead, the way the CSRF synchronizer token does.
- **Nest's "Mapped {path}" startup log can show the wrong path.** If a route 404s and the log claims it's mapped correctly, `curl` it directly rather than trusting the log — `setGlobalPrefix` + `enableVersioning` interacting is one known way the two diverge.

---

## 8. When something doesn't fit the pattern

If a feature genuinely doesn't fit "copy `items`, adjust" — a background job, a webhook receiver, a scheduled task — don't force it into the `modules/*` CRUD shape. Put the job/consumer logic under the relevant module still, but keep entry points (`*.controller.ts` for HTTP, a separate `*.processor.ts` for a queue consumer, etc.) distinct so each can be tested and reasoned about on its own. The layering rules (`modules` can't be reached except through `index.ts`, `core` never imports `modules`) still apply regardless of what triggers the code.

When in doubt, `README.md`'s "What it guarantees" table names the seven properties nothing in this codebase should ever compromise. If a change would require breaking one of them, that's a signal to stop and reconsider the approach, not to add an exception.
