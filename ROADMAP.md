# Roadmap

Phased build order for the Barangay Document Request System. Each phase ends with something runnable and something testable. Do not start a phase before the previous one is verified.

**Commit approval.** Never commit before asking first. Staging or committing any file — including this roadmap and every other `.md` file — requires explicit developer approval for that exact commit, and approval for one commit never authorizes the next. The authoritative policy lives in `AGENTS.md` and `.agents/skills/00-abdrs/SKILL.md`.

---

## Phase 0 — Foundations

The skeleton is in place. This phase makes it runnable.

- [x] Folder architecture, `README.md`, `AGENTS.md`, canonical `SKILL.md`, architecture diagrams
- [ ] `npm install`
- [ ] `.env` from `.env.example`, with `SMS_PROVIDER=mock`
- [ ] ESLint flat config
- [ ] `src/server.js` with the middleware chain and a health route
- [ ] `GET /api/health`

**Exit:** `npm run dev` serves the app and `npm run verify` passes.

---

## Phase 1 — Database

- [ ] `001_core_schema.sql` — settings, staff, residents, sessions
- [ ] `002_document_types.sql` — document types and their required documents
- [ ] `003_requests.sql` — requests, request documents, status history
- [ ] `004_sms_outbox.sql` — outbox queue, sms_messages, webhook receipts
- [ ] `005_functions_triggers.sql` — `updated_at`, audit writer
- [ ] `006_indexes_views.sql`
- [ ] `007_seed_data.sql` — document types, requirements, staff roles
- [ ] Matching down-migrations in `database/rollback/`
- [ ] `src/lib/db/pool.js`, `transactions.js`, `migrate.js`, `seed.js`

**Invariants to encode in the schema, not in code:**

- `requests.control_number` is `UNIQUE` and has no update path
- `UNIQUE (request_id, event)` on the outbox enforces one SMS per request per event
- `CHECK` on `requests.status` restricts it to the six legal values

**Exit:** `npm run migrate` then `npm run seed` on an empty database, twice in a row with no error.

---

## Phase 2 — Request domain

Pure logic first. No HTTP, no database.

- [ ] `src/lib/utils/phone.js` + tests
- [ ] `src/lib/utils/date-utils.js` + tests
- [ ] `src/lib/requests/control-number.js` + tests
- [ ] `src/lib/requests/workflow.js` + tests — the state machine
- [ ] `src/lib/requests/requirements.js` + tests
- [ ] `src/lib/requests/eligibility.js` + tests
- [ ] `src/lib/requests/validation.js` + tests
- [ ] `src/lib/types/domain.js` typedefs

**Exit:** every transition and every one of the ten request rules has a passing test.

---

## Phase 3 — Auth and staff access

- [ ] `src/lib/auth/password.js`, `session.js`, `roles.js`, `otp.js`
- [ ] `src/middleware/auth.js` — `requireAuth`, `requireRole`
- [ ] `src/middleware/request-id.js`, `error-handler.js`, `not-found.js`
- [ ] `src/lib/api/errors.js`, `respond.js`, `validate.js`, `rate-limit.js`
- [ ] `src/routes/auth.routes.js`
- [ ] `src/routes/residents.routes.js`, `staff.routes.js`

**Exit:** a resident session cannot read another resident's request; a non-staff session cannot reach the queue. Both are proven by a test.

---

## Phase 4 — Document requests end to end

- [ ] `src/lib/repositories/*.repo.js` — parameterized SQL only
- [ ] `src/routes/documents.routes.js`, `requests.routes.js`
- [ ] Submission assigns a control number and returns it
- [ ] Upload handling with Multer, stored outside the served tree
- [ ] Public tracking by control number, rate limited
- [ ] `public/` pages: landing, login, register, new request, my requests, track

**Exit:** a resident files a request in the browser and sees a control number and a timeline.

---

## Phase 5 — Staff queue

- [ ] Staff pages: dashboard, request queue, request detail, documents, residents, SMS log
- [ ] Review, approve, reject, release actions routed through `workflow.js`
- [ ] Rejection requires a reason
- [ ] Approval blocked until requirements are satisfied
- [ ] Release requires a pickup date inside the window

**Exit:** a request walks `submitted → under_review → approved → released` in the browser, and every illegal jump is refused with a `critical` finding.

---

## Phase 6 — SMS

- [ ] `src/lib/sms/templates.js` and `events.js`
- [ ] `src/lib/sms/providers/mock.js`, `textbee.js`, `index.js`
- [ ] `src/lib/sms/delivery.js`
- [ ] `src/lib/sms/signature.js` + tests
- [ ] `src/lib/sms/outbox.js`, `outbox-worker.js`
- [ ] `src/routes/sms.routes.js`, `webhooks.routes.js`
- [ ] Outbox row written in the same transaction as each state change

**Exit:** with `SMS_PROVIDER=mock`, every transition enqueues exactly one message. With `textbee`, a real message arrives and a forged webhook is rejected.

---

## Phase 7 — Hardening

- [ ] Rate limits on all public unauthenticated endpoints
- [ ] Helmet, CORS allow-list, cookie hardening
- [ ] `toErrorResponse` audit: no raw driver or gateway message reaches the client
- [ ] Log audit: no name, address, contact number, document body, or OTP
- [ ] Accessibility and mobile pass over every page
- [ ] Full `npm run verify`

**Exit:** the security invariants in `AGENTS.md` are each demonstrated by a test or a manual check.

---

## Phase 8 — Delivery

- [ ] Seed a realistic barangay profile
- [ ] Document the production deployment: Node process, worker process, MySQL, `.env`
- [ ] Register the TextBee webhook URL and set `TEXTBEE_WEBHOOK_SECRET`
- [ ] Backup and restore procedure for MySQL
- [ ] Resident-facing instructions page

---

## Explicitly out of scope

- Multi-site or multi-branch tenancy. This is a single barangay deployment.
- A frontend framework, bundler, or TypeScript migration.
- An ORM. Repositories use `mysql2` placeholders directly.
- Payments, e-signature, and online document preview.