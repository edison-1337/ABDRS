---
name: 00-abdrs
description: Repository-wide operating context and strict development workflow for the Barangay Document Request System (Express, Supabase PostgreSQL, TextBee SMS API). Read this before any other skill or repository change.
metadata:
  short-description: Canonical ABDRS repository context and safe workflow
---

# Barangay Document Request System: canonical repository skill

## Mandatory precedence

You are working in the Barangay Document Request System repository. Read this file before loading or applying any other skill. Treat it as the repository's operating contract.

You MUST:

1. Inspect the current branch, working tree, relevant files, and existing tests before editing.
2. Make the smallest coherent change that satisfies the request. Preserve unrelated user work.
3. Follow the project's existing conventions — route shape, library layout, JSDoc typedefs, SQL style, and visual language — before introducing abstractions or dependencies.
4. Run the full verification gate (`npm run lint` and `npm test`) after implementation and before every push.
5. Report every command that was run, its result, and any remaining limitation.
6. Ask the developer before every commit and receive explicit approval for that exact commit. Never stage or commit a file without a yes. This applies to every file in the repository, including documentation and every `.md` file.
7. Ask the developer before any merge, rebase, cherry-pick, branch switch, conflict resolution that could discard work, or automatic incorporation of commits from another branch. Never perform these actions autonomously.
8. Never hide, revert, reset, overwrite, or delete existing work without explicit permission. Do not use destructive Git commands as a shortcut.

If a request conflicts with these rules, stop before the conflicting action and ask the developer for direction.

## Product context

Barangay Document Request System (ABDRS) is a single-site web application for one barangay. Residents request official documents online, staff review and act on those requests, and both parties are notified by SMS through the TextBee API.

The central domain record is a **request**: a resident asking for one document type, tracked by a control number through a validated lifecycle.

The deployment unit is **one barangay**. There is deliberately no multi-tenant `barangay_id` scoping. Do not introduce a tenant column, a tenant resolver, or a tenant-aware query filter; if multi-site support is ever genuinely required, that is a schema decision to raise with the developer, not one to add speculatively.

## Technical baseline

- Runtime: Node.js `>= 20.11`, ES modules, `"type": "module"`.
- Server: Express `5`. Entry point `src/server.js`.
- Frontend: plain HTML5, CSS3, and vanilla JavaScript ES modules served from `public/`. No framework, no bundler, no build step for browser assets.
- Database: Supabase PostgreSQL. Row access uses `@supabase/supabase-js` server-side; DDL migrations in `database/migrations/` run with `pg` over `DATABASE_URL`.
- SMS: TextBee API. Base URL `https://api.textbee.dev/api/v1`, authenticated with the `x-api-key` header.
- Tests: `node:test`, files colocated as `*.test.js` next to the module they cover.
- Tooling: ESLint 9.
- Deployment target: a single long-running Node process backed by Supabase PostgreSQL, plus an outbox worker process.

Do not add a frontend framework, a bundler, a TypeScript migration, or an ORM as part of an unrelated feature. Any such change requires an explicit request and its own verification.

## Repository map

```text
public/                          Browser assets. No secrets, no server code.
  css/base/                      Design tokens, reset, typography
  css/components/                Shared primitives
  css/layouts/                   App shell and auth layouts
  js/pages/                      One controller per page
  js/components/                 Feature components
  js/lib/                        Browser helpers
src/
  server.js                      Entry: middleware chain, then routes
  routes/                        HTTP transport, one file per resource
  middleware/                    request-id, auth, error-handler, not-found
  lib/requests/                  Request domain — workflow, validation,
                                 control-number, eligibility, requirements
  lib/sms/                       Notification domain — events, templates,
                                 outbox, delivery, signature, providers/
  lib/api/                       errors, respond, rate-limit, validate
  lib/auth/                      password, session, otp, roles
  lib/db/                        pool, transactions, migrate, seed
  lib/repositories/              Supabase-js data access
  lib/types/                     JSDoc typedefs
  lib/utils/                     date-utils, phone, reference, id
database/migrations/             Ordered SQL migrations
database/rollback/               Matching down-migrations
docs/                            Architecture references
```

## The governing rule

**`src/lib` owns every decision. `src/routes` and `public/js` only move data.**

Do not duplicate a request or SMS rule in a route handler, a middleware file, or a browser controller when `src/lib` can own it. A new business rule goes into `src/lib` with a colocated test.

## Data and authentication invariants

The database is reached through Supabase. The `service_role` key is a full-access server secret and must stay server-side. Row Level Security is enabled as defense-in-depth, but ownership (Request Rule 5) is always enforced in `src/lib/repositories` — it is never trusted to the `anon` key alone.

Migrations are applied in filename order and are never edited after being applied. To change a schema, add a new migration in `database/migrations/` and a matching down-migration in `database/rollback/`. Keep schema, `src/lib/types/` typedefs, repository queries, and tests synchronized.

Authentication is server-side session based. Passwords are hashed with bcrypt. Residents may additionally prove control of a phone number with an SMS one-time passcode.

Two separate authorization concerns exist and must not be conflated:

1. **Ownership** — a resident may read or act on a request only when `request.resident_id` equals the authenticated resident's id.
2. **Staff role** — a staff-only operation requires an explicitly authorized role.

Every request read and write must satisfy one of them. Never add a query that trusts a client-supplied resident id without checking it against the session.

## Security invariants

These are not preferences. A change that breaks one is a defect.

1. `TEXTBEE_API_KEY` and `SESSION_SECRET` are server-side only. Never place them under `public/`, inline them into a served page, return them in a response, log them, or commit them. Treat any discovered secret as an incident: stop, avoid printing it, remove only with developer approval, and tell the developer to rotate it.
2. `.env.local` is gitignored and untracked and is excluded from commit and push. No env-shaped file (`.env`, `.env.example`, `.env.local`, `*.env`) is ever committed. Real credentials live only in the local, untracked `.env.local`.
3. Data access uses the `supabase-js` query builder. Never build or concatenate raw SQL strings; never issue an unparameterized statement.
4. Logs carry ids, statuses, and correlation ids. Never a full name, address, contact number, document body, or one-time passcode.
5. Resident uploads are written outside the served asset tree and are never committed.
6. Rate-limit every public unauthenticated endpoint, especially one-time-passcode verification and public control-number tracking.
7. `toErrorResponse` in `src/lib/api/errors.js` is the only place an HTTP status is decided. Never echo a raw driver or gateway message to the client.

## Request rules

1. A document is never issued unless the request status is `released`.
2. A control number is unique and immutable once assigned.
3. Only `approved` may become `released`, and `released` is terminal.
4. A rejection requires a non-empty reason.
5. A resident may only read or act on their own requests.
6. Only `active` document types are requestable.
7. Every required document must be on file before approval.
8. An SMS failure never rolls back the request transaction.
9. At most one SMS per request per event, enforced by a unique index.
10. Release requires a pickup date inside the configured release window.

Legal transitions are declared once in `src/lib/requests/workflow.js`. Nothing else may move a request between states.

Validation severity decides whether a write is allowed:

- `critical` — blocks the transition.
- `warning` — allowed, but an enabled rule or bound was violated.
- `suggestion` — informational; never blocks.

Never downgrade a `critical` finding to a `warning` to let a transition succeed, and never claim a request is valid without running the validator.

## SMS rules and TextBee constraints

TextBee turns an Android phone into an SMS gateway. Two properties of that gateway shape the whole notification design.

**Throughput.** One registered phone sustains roughly 10–15 messages per minute. Therefore a state change must never call the gateway inline. The state change and its `sms_outbox` row are written in the **same** PostgreSQL transaction, and `src/lib/sms/outbox-worker.js` drains the queue under a throttle.

Because `supabase-js` cannot span several PostgREST calls in one transaction, an atomic state change plus outbox enqueue is a Postgres function invoked through `.rpc()`. Nothing may stretch that atomic write across two `supabase-js` calls.

**Signed receipts.** Delivery callbacks are HMAC-SHA256 signed over the raw request body, in the `X-Signature` header, and carry an `idempotencyKey`. `src/lib/sms/signature.js` verifies over the exact raw bytes before a payload may change state, then de-duplicates on `idempotencyKey`.

Status handling:

1. A gateway `200` means **accepted, not delivered**. A message starts at `queued`. Only a verified webhook may advance it.
2. A gateway `401` is never retried. The key is wrong or revoked.
3. A gateway `429` and `5xx` are retried with backoff, up to `SMS_MAX_ATTEMPTS`.
4. A gateway `400` is a device or request defect. It is reported, not retried blindly.
5. Callers never throttle. `src/lib/sms/outbox.js` owns that.

The provider is selected by the `SMS_PROVIDER` environment variable. `mock` is the correct value for local development and automated tests and must perform no network call. `textbee` is the real adapter. Keep the provider contract stable so a third provider is a single new file in `src/lib/sms/providers/` plus a factory branch.

## Application conventions

- Keep route handlers thin: validate input, enforce auth, call `src/lib`, return a stable JSON shape.
- Use the JSDoc typedefs in `src/lib/types/`; update them when behavior changes. Avoid `any` and unchecked casts.
- Keep library logic deterministic and testable. Use `src/lib/utils/date-utils.js` for date and business-day behavior instead of ad hoc date math, and `src/lib/utils/phone.js` for Philippine number normalization instead of ad hoc string handling.
- Preserve accessible controls, labels, keyboard behavior, loading states, empty states, and actionable error states in UI changes.
- Reuse an existing component before adding a new primitive. Feature components belong in the matching folder; shared primitives belong in `public/css/components` and `public/js/components`.
- Keep API response shapes backward-compatible unless the request explicitly includes an API change.
- Do not hand-edit generated or installed artifacts.

## Required development workflow

### Before editing

Run:

```bash
git status --short --branch
git diff --stat
```

Read the nearest relevant route or page, the library modules it imports, and the related test or migration before editing. If the task crosses auth, SMS, or migrations, load the relevant library module first.

### During editing

- Make the smallest coherent change that satisfies the request.
- Keep changes focused and explain non-obvious decisions in comments only where they protect an invariant.
- Add or update unit tests for workflow transitions, validation, phone normalization, signature verification, and any changed logic.
- For migrations, verify ordering, constraints, indexes, triggers, and rollback implications.
- For UI changes, verify mobile behavior and accessibility. Do not use placeholder claims in product copy.

### Verification before push

Run both commands from the repository root, in this order:

```bash
npm run lint
npm test
```

Both must pass before pushing. If a command fails, fix the cause and rerun the complete gate. Do not push with a known lint, test, or syntax failure. If an external dependency or environment prevents verification, do not claim success; report the exact command and the blocker to the developer.

After the gate, inspect:

```bash
git diff --check
git status --short --branch
git diff --stat
```

Before `git push`, show the developer the branch, intended remote and ref, changed-file summary, and verification results. Push only the current branch and only when the developer's request authorizes it. Never merge another branch automatically.

### Commit approval

Never create a commit before asking first. Staging (`git add`) or committing (`git commit`) requires explicit developer approval for that exact commit, and approval for one commit never authorizes the next.

For every proposed commit, report and then wait:

- the current branch;
- the exact files that would be committed;
- the verification results (`npm run lint`, `npm test`).

Ask, for example, "May I commit these files on `staging`?", then stop. Do not stage or commit until the developer answers yes. If approval is not given, leave the changes in the working tree. This applies to every file in the repository, including documentation and every `.md` file, and it covers `git stash`, `git tag`, and any other command that writes Git state.

## Git and collaboration safety

- Never commit or stage before asking first and receiving explicit approval for that exact commit.
- Work on the current branch unless the developer explicitly asks to create or switch branches.
- Never run `git merge`, `git rebase`, `git cherry-pick`, `git reset --hard`, `git checkout --`, or a broad deletion command without explicit developer approval for that exact operation.
- If another branch contains a likely fix, tell the developer which branch or commit you found and ask whether to merge, cherry-pick, or reimplement it manually.
- Preserve uncommitted changes, including changes you did not create. If a conflict exists, stop and ask rather than resolving by preference.
- Do not amend, squash, force-push, or change commit history unless explicitly requested.
- Never assume a green local build authorizes a merge or a deployment.

## Completion report

Every implementation response must state:

- what changed and why;
- files added or modified;
- tests and verification commands with outcomes;
- migration, auth, and security implications, if any;
- whether anything remains blocked or requires developer approval;
- whether no branch merge or automatic cross-branch incorporation was performed.