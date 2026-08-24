# Integration Test Report

Covers `npm run test:integration` — end-to-end tests that exercise the full HTTP stack (Fastify routing, Zod validation, controllers, services, repositories) against a real PostgreSQL database. This complements the unit suite (`npm test`), which mocks all collaborators and never touches a database.

Corresponds to spec tasks [10.1 and 10.2](../.sdd/specs/send-money-limits/tasks.md).

---

## How it works

| Aspect | Detail |
|---|---|
| Database | A dedicated `martech_test_db` database on the same Postgres instance started by `docker compose up` (default: `postgresql://martech_user:martech_pass@localhost:5432/martech_test_db`, overridable via `TEST_DATABASE_URL`) |
| Schema setup | `tests/global-setup.ts` runs once per test run: creates the database if missing, drops and recreates the `public` schema, then applies the SQL from every folder in `prisma/migrations` directly |
| Per-test isolation | `tests/setup.ts` truncates `transactions` and `users` (`RESTART IDENTITY CASCADE`) before every test, so no test can see another test's data |
| App under test | `tests/helpers/build-app.ts` wires the real `UserService`, `TransactionService`, and `LimitService` against real repositories and a real `PrismaClient` pointed at the test database, then calls the same `buildApp()` used by `src/main.ts` |
| Request execution | Fastify's `app.inject()` — exercises the full route → validation → controller → service → repository → database chain without opening a TCP socket |
| Concurrency | `fileParallelism: false` and a single forked worker (`vitest.integration.config.ts`), since all test files share one physical database |

Why direct SQL instead of `prisma migrate deploy` in `global-setup.ts`: Prisma 7's CLI loads `@prisma/dev`, which throws `ERR_REQUIRE_ESM` on Node versions before the stable `require(esm)` support (this host runs Node 20.10). Reading and executing `prisma/migrations/*/migration.sql` directly sidesteps the CLI entirely and produces an identical schema — the app's own Docker image (Node 22) is unaffected by this issue.

---

## Test files and coverage

### `tests/send-money.integration.test.ts` — task 10.1

| Test | Requirements |
|---|---|
| Happy path: `POST /api/transactions` returns `201` with `id`, `senderId`, `recipientId`, decimal-string `amount`, `currency: "PHP"`, `status: "COMPLETED"`, ISO 8601 `createdAt` | 2.1, 2.7, 2.8 |
| Daily limit breach: accumulate ₱49,999.99, submit ₱0.02 → `422 DAILY_LIMIT_EXCEEDED`, `remaining: "0.01"` | 3.5, 3.6 |
| Monthly limit breach: accumulate ₱499,999.99 earlier in the month (not today), submit ₱0.02 → `422 MONTHLY_LIMIT_EXCEEDED`, `remaining: "0.01"` | 3.5, 3.7 |
| Unknown sender → `404 USER_NOT_FOUND` | 2.4 |
| Unknown recipient → `404 USER_NOT_FOUND` | 2.5 |

> Note: task 10.1's spec text describes the daily-breach `remaining` value as `"49999.99"`; the correct value per the approved design (`remaining = limit − spent`) and the existing `LimitService` unit tests is `"0.01"`, which is what this test asserts.

### `tests/limits-and-history.integration.test.ts` — task 10.2

| Test | Requirements |
|---|---|
| Fresh user, no transactions → `spent: "0.00"`, `remaining` equal to the full daily/monthly limit | 4.2, 4.3 |
| After a known ₱1,500.00 completed transaction → `spent`/`remaining` reflect it for both periods | 4.2, 4.3, 4.5 |
| `GET /limits` for an unknown user → `404 USER_NOT_FOUND` | 4.4 |
| `GET /transactions` returns both a sent and a received transaction with correct `direction` | 5.2, 5.3 |
| Pagination: 25 transactions seeded → default page (`page=1, pageSize=20`) returns 20 with `total: 25, totalPages: 2`; `page=2&pageSize=10` returns 10 with `totalPages: 3` | 5.6 |
| `GET /transactions` for an unknown user → `404 USER_NOT_FOUND` | 5.5 |

---

## Results

Last run: 11/11 passed, ~0.8s total.

```
✓ tests/limits-and-history.integration.test.ts > GET /api/users/:userId/limits (integration) > returns zero spent and full remaining for a fresh user with no transactions
✓ tests/limits-and-history.integration.test.ts > GET /api/users/:userId/limits (integration) > reflects spent and remaining after a known completed transaction
✓ tests/limits-and-history.integration.test.ts > GET /api/users/:userId/limits (integration) > returns 404 when the user does not exist
✓ tests/limits-and-history.integration.test.ts > GET /api/users/:userId/transactions (integration) > returns both sent and received transactions with correct direction
✓ tests/limits-and-history.integration.test.ts > GET /api/users/:userId/transactions (integration) > applies pagination and reports accurate metadata
✓ tests/limits-and-history.integration.test.ts > GET /api/users/:userId/transactions (integration) > returns 404 when the user does not exist
✓ tests/send-money.integration.test.ts > POST /api/transactions (integration) > happy path: persists a COMPLETED transaction and returns 201
✓ tests/send-money.integration.test.ts > POST /api/transactions (integration) > rejects with 422 DAILY_LIMIT_EXCEEDED when the daily cap would be breached
✓ tests/send-money.integration.test.ts > POST /api/transactions (integration) > rejects with 422 MONTHLY_LIMIT_EXCEEDED when the monthly cap would be breached
✓ tests/send-money.integration.test.ts > POST /api/transactions (integration) > returns 404 USER_NOT_FOUND when the sender does not exist
✓ tests/send-money.integration.test.ts > POST /api/transactions (integration) > returns 404 USER_NOT_FOUND when the recipient does not exist

Test Files  2 passed (2)
     Tests  11 passed (11)
```

Regenerate this with:

```bash
npm run test:integration
```

(requires a reachable PostgreSQL instance — `docker compose up -d` starts one).

---

## A bug this suite caught

Writing these tests surfaced a real gap: `GET /api/users/:userId/limits` never checked whether the user existed — it aggregated a nonexistent user's (nonexistent) transactions and returned `200` with all-zero usage instead of `404`, violating Requirement 4.4. Fixed by injecting `UserService` into `transactionRoutes` and calling `getUserById` before `LimitService.getLimitUsage`. Covered by both a unit test (`src/http/routes/transaction.routes.test.ts`) and the integration test above.

---

## Known limitations

- **Shared Postgres instance, not a disposable one.** Tests reuse the `docker compose` database via a separate `martech_test_db` rather than a per-run Testcontainers instance. Isolation is achieved through truncation, not through a fresh container — acceptable for local/CI runs on one machine, but not as strong as full isolation would be for parallel CI runners.
- **Real wall-clock time.** `POST /api/transactions` and `GET /limits` inject `new Date()` at the route layer (not test-controllable), so PHT boundary edge cases (e.g. "today is the 1st of the month") are handled defensively in `tests/helpers/factories.ts` rather than via a mocked clock. Millisecond-precision boundary behavior is already covered deterministically by `LimitService` unit tests.
