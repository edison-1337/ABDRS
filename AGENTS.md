# Repository instructions

Before reading or applying any other skill, read the canonical repository skill:
`.agents/skills/00-abdrs/SKILL.md`.

It contains the codebase context, security invariants, required verification gate, and Git safety rules. Those instructions apply to every task in this repository.

The rules below remain authoritative for request and SMS behavior.

## The one architectural rule

**`src/lib` owns every decision. `src/routes` and `public/js` only move data.**

Before writing logic in a route handler, a middleware file, or a browser controller, check whether it is a domain decision. If it is, it belongs in `src/lib` and needs a colocated `*.test.js`.

```text
Wrong    routes/requests.routes.js  →  if (status === 'approved') { ... }
Right    lib/requests/workflow.js   →  isLegalTransition(from, to)
```

Concretely:

| Concern | Owner |
| --- | --- |
| Legal state transitions | `src/lib/requests/workflow.js` |
| Validation findings and severity | `src/lib/requests/validation.js` |
| Control number format and allocation | `src/lib/requests/control-number.js` |
| Which document types may be requested | `src/lib/requests/eligibility.js` |
| Required-document checklist | `src/lib/requests/requirements.js` |
| Message text for an event | `src/lib/sms/templates.js` |
| Queueing, throttling, retry | `src/lib/sms/outbox.js` |
| Gateway status mapping | `src/lib/sms/delivery.js` |
| Webhook authenticity | `src/lib/sms/signature.js` |
| SQL statements | `src/lib/repositories/` |
| Phone normalization | `src/lib/utils/phone.js` |

A route handler may parse input, enforce auth, call the library, and return JSON. That is its entire job.

## Request rules

Rule 1
Never issue a document unless the status is `released`.
Violation
Status `approved`, document handed over

❌ Not yet issued

Rule 2
Control number is unique and immutable
Assigned once at submission

Example
BRGY-2026-000041 submitted

Attempt to change to BRGY-2026-000099

❌ Invalid

Rule 3
Only approved may become released
released is terminal

submitted ──▶ approved ──▶ released

released ──▶ anything

❌ Terminal state

Rule 4
Rejection requires a reason

Status set to `rejected` with an empty reason

❌ Invalid

Rule 5
Residents see only their own requests

Resident A opens Resident B's control number

❌ Forbidden

Rule 6
Only active document types are requestable

Document type archived

Resident files a request for it

❌ Not requestable

Rule 7
Requirements gate approval

Barangay Clearance requires: (1) Valid ID, (2) Proof of Residence

Approved with (1) uploaded and (2) missing

❌ Blocked

Rule 8
SMS never blocks the request

SMS gateway returns 429

Resident's approval transaction

✅ Committed — SMS retries from the outbox

Rule 9
One SMS per request per event

Approved event queued twice

❌ Duplicate — blocked by unique index

Rule 10
Release requires a pickup date

Released with no pickup date, or a date outside the release window

❌ Invalid

## Validation severity

Severity is not advisory wording. It decides whether a write is allowed.

- `critical` — blocks the transition. The request cannot proceed.
- `warning` — the transition is allowed but an enabled rule or bound was violated.
- `suggestion` — informational only. Never blocks, never justifies a silent change.

Never downgrade a `critical` finding to a `warning` to make a transition succeed. Never claim a request is valid without running the validator.

## SMS rules

1. **Never call the gateway inline.** A state change writes its outbox row in the same transaction. The worker sends.
2. **A gateway `200` means accepted, not delivered.** A message starts at `queued`. Only a verified webhook may move it to `sent` or `delivered`.
3. **Never retry a `401`.** The key is wrong or revoked; retrying cannot succeed.
4. **Retry `429` and `5xx` with backoff**, up to `SMS_MAX_ATTEMPTS`.
5. **Verify every webhook** against the raw request body before it may change state, then de-duplicate on `idempotencyKey`.
6. **Throttle to the device.** Default 10–15 messages per minute. The outbox enforces this; callers do not.
7. **Never log message bodies or recipient numbers.** Log the outbox row id and status only.

## Security invariants

These are not preferences. A change that breaks one is a defect.

1. `TEXTBEE_API_KEY` and `SESSION_SECRET` are server-side only. Never place them under `public/`, inline them into a page, return them in a response, log them, or commit them.
2. `.env` is gitignored. `.env.example` holds placeholders only.
3. All SQL uses `mysql2` placeholders. Never concatenate a value into a statement.
4. Every request read and write is scoped to the authenticated resident's own id, or explicitly authorized as staff.
5. Logs carry ids, statuses, and correlation ids. Never a full name, address, contact number, document body, or OTP.
6. Resident uploads are written outside the served asset tree and are never committed.
7. Rate-limit every public, unauthenticated endpoint, especially OTP verification and public tracking.

## Database conventions

Migrations in `database/migrations/` are applied in filename order and are never edited after they have been applied. To change a schema, add a new migration and a matching down-migration in `database/rollback/`.

Keep schema, JSDoc typedefs in `src/lib/types/`, repository queries, and tests synchronized.

## Application conventions

- Route handlers stay thin: validate input, enforce auth, call `src/lib`, return a stable JSON shape.
- Errors go through `toErrorResponse` in `src/lib/api/errors.js`. It is the only place a status code is decided.
- Never echo a raw error message to the client. A message is echoed only when this repository constructed it.
- Reuse an existing component before adding a new primitive. Feature components live in the matching feature folder; shared primitives live in `public/css/components` and `public/js/components`.
- Preserve accessible controls, labels, keyboard behavior, loading states, empty states, and actionable error states in UI changes.
- Keep browser modules free of secrets and free of SQL.

## Required development workflow

### Before editing

Read the nearest route or page, the library modules it imports, and the related test or migration. If the change touches auth, SMS, or migrations, read the relevant library module first.

### During editing

- Make the smallest coherent change that satisfies the request. Preserve unrelated work.
- Add or update tests for workflow transitions, validation, phone normalization, signature verification, and any changed logic.
- For migrations, verify ordering, constraints, indexes, triggers, and rollback.
- For UI changes, verify mobile behavior and accessibility. Do not use placeholder claims in product copy.

### Verification before push

Run both commands from the repository root, in this order:

```bash
npm run lint
npm test
```

Both must pass before pushing. Do not push with a known lint or test failure. If an external dependency prevents verification, do not claim success — report the exact command and the blocker.

Then inspect:

```bash
git diff --check
git status --short --branch
git diff --stat
```

Before `git push`, show the owner the branch, intended remote and ref, changed-file summary, and verification results.

### Commit approval

**Never commit without asking first.** Running `git commit` (and staging with `git add`) requires explicit approval from the developer for that exact commit. Approval for one commit is never approval for the next.

Before any commit, report and then wait:

- the current branch;
- the exact files that would be included;
- the verification results (`npm run lint`, `npm test`).

Ask, for example, "May I commit these files on `staging`?", then stop. Do not stage or commit until the developer answers yes. If approval is not given, leave the changes in the working tree and do not commit.

This applies to **every file in the repository**, including documentation and every `.md` file. The same rule covers `git stash`, `git tag`, and any other command that writes Git state.

## Git and collaboration safety

- Never run `git commit` before asking first and receiving explicit approval for that exact commit.
- Work on the current branch unless the developer explicitly asks to create or switch branches.
- Never run `git merge`, `git rebase`, `git cherry-pick`, `git reset --hard`, `git checkout --`, or a broad deletion command without explicit approval for that exact operation.
- Never hide, revert, reset, overwrite, or delete existing work without explicit permission. Do not use destructive Git commands as a shortcut.
- Do not amend, squash, force-push, or rewrite history unless explicitly requested.
- Never assume a green local build authorizes a merge or a deployment.
- If a discovered secret is committed, stop, do not print it, and tell the developer to rotate it immediately.

## Completion report

Every implementation response must state:

- what changed and why;
- files added or modified;
- tests and verification commands with outcomes;
- migration, auth, and security implications, if any;
- whether anything remains blocked or requires approval;
- whether no branch merge or cross-branch incorporation was performed.