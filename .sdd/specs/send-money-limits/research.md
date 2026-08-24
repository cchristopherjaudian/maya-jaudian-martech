# Research & Design Decisions

---
**Purpose**: Capture discovery findings, architectural investigations, and rationale that inform the technical design.

---

## Summary

- **Feature**: `send-money-limits`
- **Discovery Scope**: New Feature (greenfield backend service)
- **Key Findings**:
  - Prisma 7 (pure TypeScript runtime, released Nov 2025) is the current stable ORM — 3× faster queries, 90% smaller bundle than Prisma 6; selected over TypeORM and Knex for type safety.
  - Fastify v5 with `fastify-type-provider-zod` (now official under the Fastify GitHub org, June 2026 release) provides OpenAPI 3 spec generation from Zod schemas; known issue: avoid `.transform()` in Zod response schemas to prevent empty-object fields in generated OpenAPI output.
  - Timezone-aware limit computation must happen in application code (Luxon) by converting PHT period boundaries to UTC before querying `TIMESTAMPTZ` columns — never rely on database session timezone.
  - Concurrent send-money requests from the same sender require a row-level `SELECT FOR UPDATE` lock on the sender's `users` record within a serialized Prisma transaction to prevent both requests from passing the limit check independently.

---

## Research Log

### Framework Selection: Fastify vs Express

- **Context**: Assessment requires a runnable HTTP API with Swagger/OpenAPI in-browser UI; stack is free choice (Node.js/TypeScript).
- **Sources Consulted**:
  - [fastify-type-provider-zod on npm](https://www.npmjs.com/package/fastify-type-provider-zod) — updated June 2026, now officially under `fastify` GitHub org.
  - [fastify-zod-openapi on npm](https://www.npmjs.com/package/fastify-zod-openapi) — alternative, community maintained.
- **Findings**:
  - Fastify v5 has first-class TypeScript support, built-in JSON Schema validation, and dedicated type-provider ecosystem.
  - `@fastify/swagger` + `@fastify/swagger-ui` generate OpenAPI spec and serve interactive UI at a configurable route.
  - `fastify-type-provider-zod` (official) enables Zod schemas as Fastify's request/response type providers with full TypeScript inference.
  - Known issue: Zod `.transform()` on response schemas produces empty objects in generated OpenAPI output. Mitigation: use plain Zod shapes (no `.transform()`) for response schemas; apply transformations inside service layer instead.
  - Express requires additional libraries (express-openapi-validator, swagger-jsdoc) and manual type wiring; more boilerplate for the same outcome.
- **Implications**: **Select Fastify v5** with `fastify-type-provider-zod`, `@fastify/swagger`, and `@fastify/swagger-ui`. This gives OpenAPI 3.x spec with interactive UI from a single route registration pattern.

---

### ORM Selection: Prisma 7 vs TypeORM vs Knex

- **Context**: Need type-safe database access with PostgreSQL migrations and seed support.
- **Sources Consulted**:
  - [Prisma changelog](https://www.prisma.io/changelog) — Prisma 7.8.0 is current stable (Aug 2026).
  - [Upgrade to Prisma ORM 6 guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-6) — context on migration patterns.
  - [Prisma 2026 guide](https://cadence.withremote.ai/blog/prisma-2026-guide) — community overview of v7 changes.
- **Findings**:
  - Prisma 7 (released Nov 2025): dropped Rust query engine entirely; pure TypeScript runtime, ~3× faster queries, ~90% smaller bundle. Current stable is v7.8.0.
  - Prisma provides: schema-driven migrations (`prisma migrate`), auto-generated typed client, seed script support (`prisma db seed`), raw query escape hatch for `SELECT FOR UPDATE`.
  - TypeORM: decorator-heavy, complex setup, known TypeScript edge cases with decorators.
  - Knex: query builder only, no schema migrations out of the box, no auto-generated types.
- **Implications**: **Select Prisma 7** as the ORM. Use `prisma.$transaction()` for atomic limit-check + insert. Use `prisma.$queryRaw` for `SELECT ... FOR UPDATE` locking.

---

### Timezone Strategy: PHT Calendar Boundaries

- **Context**: Limits reset at midnight Asia/Manila time. Database must not be the source of timezone logic.
- **Sources Consulted**:
  - [PostgreSQL TIMESTAMPTZ best practices](https://oneuptime.com/blog/post/2026-01-25-postgresql-timezone-handling/view) — store in UTC, compute locally.
  - `node-postgres` issues: PostgreSQL team stopped using `Asia/Manila` in regression tests due to `tzdata` estimate changes — minor edge risk, no functional impact.
- **Findings**:
  - Always store `TIMESTAMPTZ` (UTC) in PostgreSQL; never rely on session `SET timezone`.
  - Compute the start of the current PHT calendar day and calendar month in application code, then convert to UTC for use in `WHERE created_at >= $start AND created_at < $end` queries.
  - **Luxon** library: well-maintained, timezone-aware (`DateTime.now().setZone('Asia/Manila').startOf('day')`), converts to UTC via `.toUTC()`.
  - Alternative `date-fns-tz`: lighter but slightly less ergonomic for period arithmetic.
- **Implications**: **Select Luxon** for all PHT boundary computation. Never pass a timezone string to the database; always pass UTC `Date` values. Document the timezone assumption clearly in README.

---

### Money Representation: NUMERIC vs Integer Centavos

- **Context**: PHP amounts can have up to 2 decimal places. Float arithmetic is unsafe for financial data.
- **Findings**:
  - `NUMERIC(15,2)` in PostgreSQL stores exact decimal values without floating-point error. Prisma maps this to `Decimal` (via `@prisma/decimal`).
  - Integer centavos (amount × 100 stored as `BIGINT`) avoids any decimal handling but requires all API surfaces to convert — adds complexity and potential for off-by-one errors.
  - Prisma 7's `Decimal` type integrates with `zod` via `z.string().refine(isValidDecimal)` or `z.number()` + custom validator.
- **Implications**: **Select `NUMERIC(15,2)` / Prisma `Decimal`** for the `amount` field. Validate at the API boundary that the input has ≤2 decimal places using a Zod `.refine()` check. Return amounts as `string` in JSON (IEEE 754 safe for values ≤ ₱500,000 but best practice for financial APIs is string).

---

### Concurrency and Limit Race Conditions

- **Context**: Two simultaneous `POST /api/transactions` from the same sender could both compute the remaining limit as sufficient before either commits, resulting in both succeeding and breaching the cap.
- **Sources Consulted**:
  - [Winning Race Conditions with PostgreSQL - DEV Community](https://dev.to/mistval/winning-race-conditions-with-postgresql-54gn)
- **Findings**:
  - `SELECT ... FOR UPDATE` on the sender's row inside a `BEGIN ... COMMIT` block serializes concurrent senders: the second transaction blocks until the first commits or rolls back.
  - PostgreSQL default isolation (`READ COMMITTED`) combined with `FOR UPDATE` is sufficient; no need for `SERIALIZABLE` isolation (which is heavier).
  - Prisma 7 supports `prisma.$queryRaw<User[]>(Prisma.sql\`SELECT * FROM users WHERE id = ${id} FOR UPDATE\`)` within a `prisma.$transaction()` callback.
- **Implications**: Wrap the entire send-money flow (lock sender → compute limits → insert transaction) inside `prisma.$transaction()` with `SELECT ... FOR UPDATE` on the sender row. This adds ~1 round-trip latency per transaction but guarantees correctness at assessment scale.

---

### Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Layered (Controller → Service → Repository) | Vertical layers with strict dependency direction | Well-understood, low ceremony, fast to implement | Layer leakage if boundaries not enforced | Right-sized for assessment scope |
| Hexagonal (Ports & Adapters) | Core domain isolated behind ports | Highly testable, adapter-swappable | Significant additional scaffolding for this scope | Overkill for 3-day assessment |
| MVC (Express-style) | Model-View-Controller | Familiar | Ambiguous "model" layer mixes domain + persistence | Weaker separation |

**Selected**: Layered Architecture (Router → Controller → Service → Repository → Database).

---

## Design Decisions

### Decision: User Identifier

- **Context**: Assessment says "design your own user model" with a unique identifier (mobile number, customer ID, UUID).
- **Alternatives Considered**:
  1. Mobile number as natural key — realistic for fintech, human-readable.
  2. UUID as surrogate key — collision-free, no PII in URL path params.
  3. Composite (UUID internal + mobile as unique constraint) — best of both.
- **Selected Approach**: UUID as primary key (`id`), `mobile_number` as unique constraint. URLs use UUID; mobile number used for user creation and lookup.
- **Rationale**: UUID avoids PII leakage in logs and URLs; mobile number maps to real-world fintech identity; combination enables both operational queries.
- **Trade-offs**: Slightly more complex user creation DTO (must provide mobile number), but API is more production-realistic.
- **Follow-up**: Seed data must include several users with pre-defined mobile numbers for easy cURL testing.

---

### Decision: Amount Representation in API Response

- **Context**: `NUMERIC(15,2)` → Prisma `Decimal` → JSON serialization.
- **Alternatives Considered**:
  1. Return as `number` (JavaScript float) — simple, but float precision risk above 2^53.
  2. Return as `string` — unambiguous decimal, safe for any amount.
- **Selected Approach**: Return amount as `string` in all API responses (e.g., `"amount": "1500.00"`). Accept as `number` in request body with Zod `.refine()` validation.
- **Rationale**: Financial API best practice; avoids any JSON float precision edge case; Prisma `Decimal` serializes cleanly to string.
- **Trade-offs**: Consumers must parse string to numeric type; offset by clear OpenAPI schema documentation.

---

### Decision: Transaction Status Lifecycle

- **Context**: Assessment says status beyond success/failure is optional; document if used.
- **Selected Approach**: Two statuses only — `COMPLETED` (synchronous success) and `FAILED` (rejected due to validation/limit breach but still persisted for audit). Failed transactions do NOT count toward limits.
- **Rationale**: Keeps the data model simple; persisting failed attempts gives an audit trail without adding async/pending states that would require background jobs.
- **Trade-offs**: No `PENDING` state means no support for async settlement — acceptable for assessment scope.
- **Follow-up**: README should document this decision.

---

### Decision: Limit Computation Method

- **Context**: Real-time SUM vs. materialized counter table.
- **Selected Approach**: Real-time `SUM(amount)` query with indexed `(sender_id, created_at)` composite index.
- **Rationale**: Always consistent with transaction data; no cache-invalidation complexity; index makes the query O(log n + matching rows) — sufficient for assessment scale.
- **Trade-offs**: At very high transaction volumes (millions/day) a counter cache would be needed; documented in README "production revisit" section.

---

### Decision: `tx` Threading Through `LimitService` (Post-Validation Fix)

- **Context**: Design review identified that `LimitService.checkLimits` calling `TransactionRepository.sumByPeriod` via the default `PrismaClient` (not the `tx` client) inside `prisma.$transaction()` would compete for a pooled connection, causing a deadlock when `connection_limit` is small or under concurrent load.
- **Alternatives Considered**:
  1. Run `sumByPeriod` before starting the transaction — removes the deadlock but loses the atomicity benefit of the `FOR UPDATE` lock covering the read.
  2. Thread `tx` through `checkLimits` — preserves atomicity and avoids pool contention.
- **Selected Approach**: Add `tx?: PrismaTransactionClient` parameter to `LimitService.checkLimits`; forward it to `TransactionRepository.sumByPeriod`. When inside a Prisma interactive transaction, always pass `tx`.
- **Rationale**: All limit-aggregation queries run on the same connection as the `FOR UPDATE` lock, ensuring they see a consistent snapshot within the transaction and avoiding pool exhaustion.
- **Trade-offs**: Slightly more coupled interface (domain service receives infra type `PrismaTransactionClient`); acceptable for assessment scope.

---

### Decision: `amount` Accepted as `string` in Request Body (Post-Validation Fix)

- **Context**: Design review identified that accepting `amount: number` and validating ≤2 decimal places with `Number.isInteger(amount * 100)` is unreliable due to IEEE 754 float arithmetic — `1500.10 * 100 === 150010.00000000002` in JavaScript, causing false rejections of valid amounts.
- **Alternatives Considered**:
  1. Accept `number`, round to 2dp before validation — introduces silent rounding, could accept out-of-spec values.
  2. Accept `string`, validate with regex — deterministic, no float involvement.
- **Selected Approach**: Accept `amount` as `string` in `CreateTransactionRequest`. Validate with Zod: `z.string().regex(/^\d+(\.\d{1,2})?$/).refine(v => new Prisma.Decimal(v).gt(0), 'Must be positive')`.
- **Rationale**: Regex-based validation is exact and immune to float precision issues. The service layer already uses `string` for amount; this removes the number→string conversion step from the controller entirely.
- **Trade-offs**: API consumers must send amounts as JSON strings (`"amount": "1500.00"`) rather than numbers — standard practice for financial APIs; documented in OpenAPI schema.

---

### Decision: `Prisma.Decimal` for All Monetary Arithmetic (Post-Validation Fix)

- **Context**: Initial design referenced `decimal.js` for limit arithmetic but did not list it in the Technology Stack. Prisma 7 already exports `Prisma.Decimal` (backed by `decimal.js`) from `@prisma/client`, creating ambiguity about whether to add a separate `decimal.js` dependency.
- **Selected Approach**: Use `Prisma.Decimal` exclusively for all monetary comparisons and arithmetic. No additional `decimal.js` package added.
- **Rationale**: Zero additional dependency; type-compatible with Prisma's returned `Decimal` column values (`NUMERIC(15,2)` → `Prisma.Decimal`); same underlying library, single source of truth.
- **Trade-offs**: Couples monetary arithmetic to Prisma's re-export — if Prisma is ever removed, `decimal.js` would need to be added explicitly. Acceptable for this service scope.

---

## Risks & Mitigations

- **Timezone tzdata drift** (Asia/Manila tzdata changes) — Mitigation: pin `tzdata` version in Docker image; use Luxon's bundled timezone database.
- **Prisma 7 ecosystem maturity** — Mitigation: Prisma 7 is stable (v7.8.0 as of Aug 2026), production-used widely; no blocking known issues.
- **Zod `.transform()` in OpenAPI** — Mitigation: avoid `.transform()` entirely in response schema definitions; transformations happen at service layer before controller shapes the response.
- **Float precision in seed data** — Mitigation: seed amounts are specified as string literals parsed by `Prisma.Decimal` to avoid any float imprecision at seed time.
- **Concurrent limit breach under high load** — Mitigation: `SELECT FOR UPDATE` serializes per-sender; `tx` threading ensures aggregation runs on the same connection; acceptable latency trade-off at assessment scale.

---

## References

- [fastify-type-provider-zod (official)](https://www.npmjs.com/package/fastify-type-provider-zod) — Zod type provider for Fastify v5, under fastify GitHub org.
- [Prisma changelog](https://www.prisma.io/changelog) — Prisma 7.8.0 current stable.
- [PostgreSQL TIMESTAMPTZ handling](https://oneuptime.com/blog/post/2026-01-25-postgresql-timezone-handling/view) — Always store UTC, compute timezone locally.
- [Race conditions with PostgreSQL](https://dev.to/mistval/winning-race-conditions-with-postgresql-54gn) — SELECT FOR UPDATE pattern.
- [Prisma quickstart with PostgreSQL](https://www.prisma.io/docs/prisma-orm/quickstart/postgresql) — Official setup guide.
