# Send Money Limits Module

A backend HTTP API service enforcing per-sender daily (₱50,000) and monthly (₱500,000) spending limits with Asia/Manila (PHT, UTC+8) timezone reset semantics.

---

## Table of Contents

- [Spec-Driven Development (SDD)](#spec-driven-development-sdd)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Example Requests](#example-requests)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Running Tests](#running-tests)
- [Assumptions and Design Decisions](#assumptions-and-design-decisions)
- [Failure Cases](#failure-cases)
- [What Would Be Revisited Before Production](#what-would-be-revisited-before-production)

---

## Spec-Driven Development (SDD)

This project was built using a phase-gated **Spec-Driven Development** workflow. Each phase produces a formal document that must be reviewed and approved before the next phase begins. The full specification lives in [`.sdd/specs/send-money-limits/`](.sdd/specs/send-money-limits/).

### Phases

| Phase | Command | Output | Purpose |
|-------|---------|--------|---------|
| 1. Requirements | `/sdd:spec-requirements` | [`requirements.md`](.sdd/specs/send-money-limits/requirements.md) | Captures *what* the system must do in numbered, testable EARS-format statements |
| 2. Design | `/sdd:spec-design` | [`design.md`](.sdd/specs/send-money-limits/design.md) | Defines *how* — architecture, component interfaces, data models, error strategy |
| 2b. Research | (generated with design) | [`research.md`](.sdd/specs/send-money-limits/research.md) | Records *why* — framework choices, concurrency strategy, library trade-offs |
| 3. Tasks | `/sdd:spec-tasks` | [`tasks.md`](.sdd/specs/send-money-limits/tasks.md) | Breaks design into 1–3 hour executable work items with requirement traceability |
| 4. Implementation | `/sdd:spec-impl` | Source code | TDD execution — Red → Green → Refactor against each task |

### How the phases connect

**Requirements** assign every acceptance criterion a numeric ID (e.g. `3.8`).
**Design** references those IDs in each component definition, proving coverage.
**Tasks** inherit the same IDs, so every sub-task lists which requirements it satisfies.
**Tests** are written before implementation, targeting the interfaces defined in the design.

This creates a traceable chain: `Requirement ID → Design Component → Task → Test → Implementation`. Nothing is built that wasn't specified; nothing specified is left unbuilt.

### Spec files

- **[requirements.md](.sdd/specs/send-money-limits/requirements.md)** — 10 numbered requirement groups covering user management, send-money flow, limit enforcement, PHT timezone resets, transaction history, API contracts, and infrastructure.
- **[design.md](.sdd/specs/send-money-limits/design.md)** — Full technical design: layered architecture diagram, component contracts (TypeScript interfaces), physical data model (PostgreSQL DDL), request/response schemas, and error handling strategy.
- **[research.md](.sdd/specs/send-money-limits/research.md)** — Discovery log: why Fastify over Express, why `amount` is a string (IEEE 754), why `SELECT FOR UPDATE` for concurrency, why Luxon for timezone math, known `fastify-type-provider-zod` limitations.
- **[tasks.md](.sdd/specs/send-money-limits/tasks.md)** — Ordered implementation checklist with parallel execution markers `(P)`, dependency notes, and requirement ID coverage per sub-task.


---

## Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose v2
- No local Node.js or PostgreSQL installation required for running the service

For local development only:

- Node.js 22 LTS
- npm

---

## Quick Start

```bash
docker compose up --build
```

This single command:
1. Builds a multi-stage Docker image (TypeScript compilation → slim runtime)
2. Starts a PostgreSQL 16 database with health checks
3. Runs `prisma migrate deploy` to apply all schema migrations
4. Runs `prisma db seed` to load sample users and transactions
5. Starts the API server on port 3000

The Swagger UI is available at: **http://localhost:3000/docs**

Health check: **http://localhost:3000/health**

---

## Example Requests

### 1. Create a user

```bash
curl -s -X POST http://localhost:3000/api/users \
  -H 'Content-Type: application/json' \
  -d '{"mobileNumber": "+639991234567", "firstName": "Maria", "lastName": "Clara"}' | jq
```

### 2. Send money

```bash
curl -s -X POST http://localhost:3000/api/transactions \
  -H 'Content-Type: application/json' \
  -d '{
    "senderId": "<sender-uuid>",
    "recipientId": "<recipient-uuid>",
    "amount": "1500.00"
  }' | jq
```

### 3. Check limit usage

```bash
curl -s http://localhost:3000/api/users/<user-uuid>/limits | jq
```

### 4. View transaction history

```bash
curl -s "http://localhost:3000/api/users/<user-uuid>/transactions?page=1&pageSize=20" | jq
```

> Seeded user IDs are printed by the seed script and visible in the `/api/users` responses. Use the Swagger UI at `/docs` to explore all endpoints interactively.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all registered users (newest first) — added to make seeded user IDs discoverable for manual testing |
| POST | `/api/users` | Register a new user |
| GET | `/api/users/:userId` | Look up a user by UUID |
| POST | `/api/transactions` | Send money (enforces limits) |
| GET | `/api/users/:userId/limits` | Real-time daily and monthly usage |
| GET | `/api/users/:userId/transactions` | Paginated transaction history |
| GET | `/docs` | Interactive Swagger UI |
| GET | `/health` | Health check |

---

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://martech_user:martech_pass@db:5432/martech_db` |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment (`development`, `production`) | `development` |
| `LOG_LEVEL` | Pino log level (`debug`, `info`, `warn`, `error`) | `info` |

---

## Running Tests

```bash
npm install
npm test
npm run test:coverage
```

---

## Assumptions and Design Decisions

### Limit period boundaries
Daily and monthly periods reset at **midnight Asia/Manila (PHT, UTC+8)**. All period boundary computation happens in application code using Luxon — the database session timezone is never set. Period start/end instants are passed to the database as UTC `Date` values.

### Monetary representation
`amount` is accepted and returned as a **decimal string** (e.g. `"1500.00"`), not a JSON number.

> **Why a string?** JSON numbers use IEEE 754 floating point, which cannot represent values like `1500.10` exactly — e.g. `0.1 + 0.2` evaluates to `0.30000000000000004` in JavaScript, not `0.3`. For a financial limit check, even a tiny float error can cause a transaction that should be blocked to pass, or vice versa. Sending a string preserves the exact decimal value all the way to the server. The application then uses `Prisma.Decimal` (backed by `decimal.js`) for all arithmetic, and the database stores amounts as `NUMERIC(15,2)` — both are exact. This is standard practice in fintech APIs — Stripe, for example, uses the same string-based approach for monetary amounts.

### Concurrent send-money safety
Each send-money request acquires a `SELECT ... FOR UPDATE` row lock on the sender's user row inside a Prisma interactive transaction. This serialises concurrent requests from the same sender at the database level. The second concurrent request blocks until the first commits and then re-reads the updated aggregate — preventing double-spend under race conditions.

### FAILED transaction audit trail
When a limit is breached, a `FAILED` transaction record is inserted and **committed** before `LimitExceededError` is thrown. This provides an immutable audit trail. The error is stored outside the `$transaction` callback and thrown after commit to avoid rollback wiping the record.

### No authentication
All endpoints are open (no auth layer). This is an explicit assessment constraint, documented here as a production revisit item.

### Amount validation
The Zod schema for `amount` enforces the regex `/^\d+(\.\d{1,2})?$/` plus a positive-value check. Values like `"0"`, `"-1.00"`, `"1.999"`, and `"abc"` are rejected with `422 VALIDATION_ERROR`.

---

## Failure Cases

| Scenario | HTTP Code | Error Code |
|----------|-----------|------------|
| User not found | 404 | `USER_NOT_FOUND` |
| Duplicate mobile number | 409 | `DUPLICATE_MOBILE_NUMBER` |
| Sender equals recipient | 422 | `SELF_TRANSFER_NOT_ALLOWED` |
| Daily limit exceeded | 422 | `DAILY_LIMIT_EXCEEDED` |
| Monthly limit exceeded | 422 | `MONTHLY_LIMIT_EXCEEDED` |
| Invalid amount format | 422 | `VALIDATION_ERROR` |
| Unexpected server error | 500 | `INTERNAL_SERVER_ERROR` |

---

## What Would Be Revisited Before Production

1. **Authentication & authorisation** — all endpoints are currently open.
2. **SELECT FOR UPDATE bottleneck** — serialises all sends per sender. At scale, consider a materialised counter with optimistic concurrency or an atomic Redis `INCR`.
3. **Connection pooling** — default Prisma pool. Production would configure `connection_limit` and use PgBouncer.
4. **Rate limiting** — no per-IP or per-user rate limiting.
5. **Observability** — structured logging is in place (Pino) but no distributed tracing or metrics (Prometheus/OpenTelemetry).
6. **Mobile number validation** — currently any non-empty string is accepted. Production would enforce E.164 format.
7. **Integration test isolation** — integration tests require a real PostgreSQL instance; Testcontainers setup is recommended to avoid cross-test pollution.