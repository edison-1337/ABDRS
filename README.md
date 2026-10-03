<h1 align="center">Barangay Document Request System</h1>

<p align="center">
  <em>Request a barangay document, track its status, and get notified by SMS.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20-5FA04E" alt="Node.js 20" />
  <img src="https://img.shields.io/badge/Express-5-000000" alt="Express 5" />
  <img src="https://img.shields.io/badge/HTML-E34F26" alt="HTML" />
  <img src="https://img.shields.io/badge/CSS-1572B6" alt="CSS" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E" alt="JavaScript" />
  <img src="https://img.shields.io/badge/MySQL-4479A1" alt="MySQL" />
  <img src="https://img.shields.io/badge/TextBee_SMS_API-5B21B6" alt="TextBee SMS API" />
  <img src="https://img.shields.io/badge/node:test-6E9F18" alt="node:test" />
</p>

---

## What it is

Barangay Document Request System is a web application for a single barangay that lets residents request official documents online, lets barangay staff review and act on those requests, and keeps both parties informed automatically by SMS through the TextBee API.

It is built as a plain HTML, CSS, and JavaScript frontend in front of a Node.js and Express server, with MySQL as the system of record and a provider-swappable SMS adapter as the notification boundary.

## What it does

- 📄 **Online document requests** — residents file a request for any active document type and immediately receive a unique control number.
- 🔎 **Status tracking** — residents look up a request by control number without needing an account.
- ✅ **Staff review workflow** — staff move a request through a validated state machine: submitted → under review → approved → released.
- 📎 **Requirement checklist** — each document type declares its required documents; approval is blocked until all of them are on file.
- 📲 **SMS notifications** — submission, approval, rejection, and release each trigger a templated SMS sent through TextBee.
- 📤 **Reliable delivery** — an outbox worker absorbs TextBee's ~10–15 messages/minute throughput limit so a slow gateway never fails a request.
- 🛡️ **Verified webhooks** — inbound delivery receipts are HMAC-verified and de-duplicated before they update a message's status.
- 📋 **Full audit trail** — every state transition is recorded with actor, timestamp, and reason.
- 🔐 **Separated access** — residents see only their own requests; staff see the queue. Neither can reach the other's data.

## Built with

| Layer | Technology |
| --- | --- |
| Frontend | HTML5 · CSS3 · Vanilla JavaScript (ES modules) |
| Server | Node.js 20 · Express 5 |
| Database | MySQL 8 with ordered SQL migrations |
| SMS | TextBee SMS API (`x-api-key`, `/gateway/send-sms`, signed webhooks) |
| Auth | bcrypt password hashing · server-side sessions · SMS one-time passcodes |
| File uploads | Multer, stored outside the versioned tree |
| Testing | `node:test` (built in, zero dependencies) |
| Tooling | ESLint 9 |

## Architecture

```text
public/                              Browser assets (no secrets, ever)
├── css/
│   ├── base/                        Design tokens, reset, typography
│   ├── components/                  Reusable primitives (button, card, table…)
│   └── layouts/                     App shell and auth layouts
└── js/
    ├── pages/                       One controller per page
    ├── components/                  Feature components
    └── lib/                         Browser helpers (api client, form, session)

src/
├── server.js                        Entry point: middleware chain then routes
├── routes/                          HTTP transport only — one file per resource
│   ├── auth.routes.js
│   ├── requests.routes.js
│   ├── documents.routes.js
│   ├── residents.routes.js
│   ├── staff.routes.js
│   ├── sms.routes.js
│   └── webhooks.routes.js           TextBee delivery receipts
├── middleware/
│   ├── request-id.js                Correlation id for every request
│   ├── auth.js                      requireAuth / requireRole
│   ├── error-handler.js             Single terminal error boundary
│   └── not-found.js
└── lib/                             ◄── THE LIBRARY — all business logic
    ├── requests/                    Request domain
    │   ├── workflow.js              State machine and legal transitions
    │   ├── validation.js            critical / warning / suggestion findings
    │   ├── control-number.js        Control number generation
    │   ├── eligibility.js           Per-document-type request rules
    │   └── requirements.js          Required-document checklist
    ├── sms/                         Notification domain
    │   ├── events.js                Event → template → recipient binding
    │   ├── templates.js             Message text per event
    │   ├── outbox.js                Transactional queue + throttle
    │   ├── outbox-worker.js         Drains the outbox
    │   ├── delivery.js              Gateway status → internal status
    │   ├── signature.js             HMAC-SHA256 verify + idempotency
    │   └── providers/
    │       ├── index.js             Env-switchable provider factory
    │       ├── textbee.js           Real gateway adapter
    │       └── mock.js              Development adapter, no network
    ├── api/                         errors.js · respond.js · rate-limit.js · validate.js
    ├── auth/                        password.js · session.js · otp.js · roles.js
    ├── db/                          pool.js · transactions.js · migrate.js · seed.js
    ├── repositories/                Parameterized SQL, one module per table group
    ├── types/                       JSDoc typedefs for domain and SMS contracts
    └── utils/                       date-utils.js · phone.js · reference.js · id.js

database/
├── migrations/                      Ordered, timestamped, never edited after apply
└── rollback/                        Matching down-migrations
```

The rule this project is built around: **`src/lib` owns every decision; `src/routes` and `public/js` only move data.** If a rule about requests or SMS can be decided without touching HTTP or the DOM, it belongs in `src/lib`, and it needs a colocated `*.test.js`.

## Request model

A request is the central record. It carries a control number, the requesting resident, the document type, its current status, and the reason a rejection happened if it was rejected.

Requests move through this lifecycle:

```text
submitted ──▶ under_review ──▶ approved ──▶ released   (terminal)
     │              │              │
     └──▶ cancelled │              └──▶ rejected      (terminal)
                    └──▶ cancelled
```

Legal transitions are declared once in `src/lib/requests/workflow.js`. Nothing else may move a request between states.

Every transition is validated and classified before it is applied:

- **critical** — invalidates the request and blocks the transition.
- **warning** — the request is usable but violates an enabled rule or advisory bound.
- **suggestion** — an optimization opportunity only; never blocks.

The non-negotiable rules:

1. A document is never issued unless the request status is `released`.
2. A control number is unique and immutable once assigned.
3. Only `approved` may become `released`, and `released` is terminal.
4. A rejection requires a non-empty reason.
5. A resident may only read or act on their own requests.
6. Only `active` document types are requestable.
7. Every required document must be on file before approval.
8. An SMS failure never rolls back the request transaction.
9. At most one SMS is sent per request per event, enforced by a unique index.
10. Release requires a pickup date inside the configured release window.

## SMS architecture

TextBee turns an Android phone into an SMS gateway. Its API key has full account access, so it lives only on the server, only in an environment variable, and never in `public/`.

Two TextBee constraints shape the notification design:

- **Throughput.** One phone sustains roughly 10–15 messages per minute. Sending synchronously inside a request transaction would fail whenever the gateway is busy.
- **Signed receipts.** Delivery callbacks are HMAC-SHA256 signed and carry an `idempotencyKey`.

So the design is: a state change and an outbox row are written in **one** MySQL transaction, and a background worker drains the queue under a throttle. Route handlers never call TextBee inline.

## Security & privacy

- **Secrets never reach the browser.** `TEXTBEE_API_KEY` and `SESSION_SECRET` are server-side only. `public/` contains no credential and no server code.
- **One template, no secrets.** `.env` is gitignored; `.env.example` ships placeholders only.
- **Resident data stays scoped.** Every read and write of a request is checked against the authenticated resident's own id. Staff authorization is checked separately.
- **Webhooks are verified.** Inbound receipts are validated against the raw request body before they are allowed to change a message status, then de-duplicated on `idempotencyKey`.
- **Parameterized SQL only.** All queries use `mysql2` placeholders. No value is ever concatenated into a statement.
- **PII stays out of logs.** Log lines carry ids, statuses, and request ids — never a full name, address, contact number, or document body.
- **Uploaded files are personal data.** Resident uploads land outside the served asset tree and are never committed.

## For contributors

### Requirements

- Node.js 20.11 or newer
- npm
- A MySQL 8 database and a user that can create tables
- A TextBee account with a registered device, to send real SMS

### Install and run

```bash
npm install
```

Copy the environment template and fill in the database and session values. For local development leave `SMS_PROVIDER=mock` so nothing is sent and no gateway credential is required.

```bash
npm run migrate
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To send real SMS, set `SMS_PROVIDER=textbee`, provide `TEXTBEE_API_KEY`, and run the outbox worker in a second terminal:

```bash
npm run outbox:work
```

### Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the server with file watching |
| `npm start` | Start the server without watching |
| `npm run migrate` | Apply pending database migrations |
| `npm run migrate:status` | List migrations and whether each has been applied |
| `npm run seed` | Load baseline reference data |
| `npm run outbox:work` | Run the SMS outbox worker |
| `npm run lint` | Run ESLint |
| `npm test` | Run the test suite once |
| `npm run verify` | Run lint and tests together |

Before every push, run the verification gate:

```bash
npm run lint
npm test
```

Both commands must pass. Also run `git diff --check` and inspect the final diff before pushing.

## Contribution workflow

Read [`AGENTS.md`](AGENTS.md) and the canonical repository skill at [`.agents/skills/00-abdrs/SKILL.md`](.agents/skills/00-abdrs/SKILL.md) before making changes.

Keep changes focused, update tests when behavior changes, and preserve existing uncommitted work. Never automatically merge, rebase, or cherry-pick. Before pushing, report the branch, changed files, verification results, and any remaining limitation.

## Further documentation

- [`AGENTS.md`](AGENTS.md) — domain rules and repository instruction entrypoint
- [`ROADMAP.md`](ROADMAP.md) — phased build order
- [`docs/frontend-architecture.html`](docs/frontend-architecture.html) — frontend architecture reference
- [`docs/backend-architecture.html`](docs/backend-architecture.html) — backend architecture reference

## License

This is a private application. Licensing and deployment decisions are controlled by the project owner.