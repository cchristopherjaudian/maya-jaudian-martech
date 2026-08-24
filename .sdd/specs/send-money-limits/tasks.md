# Implementation Plan

---

- [ ] 1. Initialize the project, developer tooling, and environment configuration

- [x] 1.1 Set up the TypeScript project with all runtime and development dependencies
  - Initialize a Node.js project and configure TypeScript 5.x with strict mode, ES module output, and path aliases
  - Add runtime dependencies: Fastify v5, fastify-type-provider-zod, @fastify/swagger, @fastify/swagger-ui, Zod v3, Prisma 7 client, Luxon, and their corresponding type packages
  - Add development dependencies: Vitest, @vitest/coverage-v8, ts-node, and the TypeScript compiler
  - Configure tsconfig.json with strict mode, module resolution, sourceMap, and a dedicated output directory
  - Configure Vitest with TypeScript support and test file glob patterns
  - _Requirements: 7.1, 7.2_

- [x] 1.2 Set up Docker Compose, Dockerfile, and environment configuration files
  - Write a multi-stage Dockerfile: a build stage that compiles TypeScript and a slim runtime stage using node:22-alpine
  - Write docker-compose.yml with the application service and a PostgreSQL 16 service, including a health check on the database and a `depends_on` condition so the app waits until the database is healthy
  - Create .env.example listing all required variables (DATABASE_URL, PORT, NODE_ENV, LOG_LEVEL) with placeholder values and one-line descriptions
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 1.3 Implement the Config module with fail-fast environment validation
  - Define a Zod schema that parses and validates all required environment variables at module load time
  - Throw a ConfigError that names the missing or invalid variable if validation fails, so the process exits with a clear message before the server starts
  - Export a typed AppConfig object that the rest of the application imports instead of accessing process.env directly
  - _Requirements: 7.3, 7.6_

---

- [ ] 2. Define the database schema, generate migrations, and seed sample data

- [x] 2.1 Define the Prisma schema and generate the initial database migration
  - Add the User model with a UUID primary key, a unique mobile_number field, first and last name fields, and TIMESTAMPTZ audit columns (createdAt, updatedAt)
  - Add the Transaction model with a UUID primary key, sender and recipient foreign keys to User, a NUMERIC(15,2) amount field with a positive check constraint, a PHP currency field, a status field (COMPLETED or FAILED), and a TIMESTAMPTZ createdAt column set by the database
  - Define composite indexes on (sender_id, created_at DESC) and (recipient_id, created_at DESC) to support efficient limit aggregation and history queries
  - Run `prisma migrate dev` to produce the first migration file under prisma/migrations
  - _Requirements: 7.1, 7.2_

- [x] 2.2 Create the database seed script with representative sample data
  - Seed at least five users with distinct mobile numbers, first names, and last names so every seed user has a known identity for testing
  - Seed a set of completed transactions between seeded users that cover varied amounts across both daily and monthly periods, ensuring limit queries return non-zero results immediately after startup
  - Configure prisma db seed in package.json and invoke it from the Docker entrypoint after the migration step
  - _Requirements: 7.4_

---

- [x] 3. (P) Define the domain error hierarchy, limit constants, and shared status types
  - Create typed error classes extending a base AppError for every domain failure: UserNotFoundError, DuplicateMobileNumberError, LimitExceededError (carrying breach reason, the applicable limit, and the remaining amount), SelfTransferError, InvalidAmountError, and ConfigError
  - Export DAILY_LIMIT (50 000) and MONTHLY_LIMIT (500 000) as typed numeric constants
  - Define TransactionStatus as a discriminated union (COMPLETED | FAILED) and LimitBreachReason as a union (DAILY_LIMIT_EXCEEDED | MONTHLY_LIMIT_EXCEEDED)
  - This task has no dependency on the Prisma schema or Docker files and can start in parallel with Task 2
  - _Requirements: 1.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.6, 3.7, 6.4, 6.5_

---

- [ ] 4. Implement the repository layer

- [x] 4.1 (P) Implement UserRepository for all user persistence operations
  - Implement create: insert a new user record and translate any Prisma P2002 unique-constraint violation on mobile_number into a DuplicateMobileNumberError
  - Implement findById: return the User record or null given a UUID string
  - Implement findByMobileNumber: return the User record or null given a mobile number string
  - Depends on Task 2.1 for the generated Prisma client types and Task 3 for the error classes; can run in parallel with Task 4.2
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.4, 2.5_

- [x] 4.2 (P) Implement TransactionRepository for inserts, period aggregation, and history queries
  - Implement create: insert a transaction record with explicit status; accept an optional Prisma transaction client (tx) for use inside atomic blocks
  - Implement sumByPeriod: execute a parameterised COALESCE(SUM(amount), 0) query on rows where sender_id matches, status is COMPLETED, and created_at falls within the provided UTC start–end range; forward the optional tx client so the query shares a connection with the caller's database transaction
  - Implement findByUserId: return paginated transactions where the user appears as either sender or recipient, ordered by created_at descending; include a count query to populate pagination metadata
  - Depends on Task 2.1 and Task 3; can run in parallel with Task 4.1
  - _Requirements: 2.7, 2.8, 3.3, 3.4, 3.10, 5.1, 5.2, 5.3, 5.4_

---

- [x] 5. (P) Implement UserService for user creation and lookup
  - Implement createUser: delegate to UserRepository.create and surface DuplicateMobileNumberError to callers on conflict
  - Implement getUserById: delegate to UserRepository.findById and throw UserNotFoundError when the result is null
  - Depends on Task 4.1; can start in parallel with Task 6 once Task 4.1 is complete
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

---

- [ ] 6. Implement LimitService for timezone-aware period boundaries, limit checks, and usage queries

- [x] 6.1 Implement Asia/Manila period boundary computation using Luxon
  - Compute the start of the current PHT calendar day and the start of tomorrow (exclusive end) as UTC Date objects using Luxon's setZone and startOf APIs
  - Compute the start of the current PHT calendar month and the start of the next month as UTC Date objects using the same approach
  - Compute the next daily reset instant (midnight PHT) and next monthly reset instant (first second of next month PHT) to include in limit usage responses
  - Never set the database session timezone; always pass UTC Date values to repository queries
  - _Requirements: 3.1, 3.2, 3.8, 3.9_

- [x] 6.2 Implement limit check logic and real-time limit usage aggregation
  - Implement checkLimits: call sumByPeriod for the daily period then the monthly period, forwarding the optional tx client both times; evaluate the daily cap first — if spent + amount exceeds DAILY_LIMIT return a DAILY_LIMIT_EXCEEDED result; then evaluate the monthly cap; use Prisma.Decimal for all arithmetic to avoid IEEE 754 float errors
  - Implement getLimitUsage: call sumByPeriod for both periods without a tx client, then compute spent, remaining (clamped to zero), and resetsAt for each; return the full LimitUsage structure with userId, asOf timestamp, and timezone tag
  - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 3.10, 4.1, 4.2, 4.3, 4.4, 4.5_

---

- [ ] 7. Implement TransactionService for send-money orchestration and transaction history

- [ ] 7.1 Implement the send-money flow with database locking and limit enforcement
  - Open a Prisma interactive transaction and immediately issue a SELECT FOR UPDATE on the sender's user row to serialise concurrent requests from the same sender at the database level
  - Verify the sender exists (throw UserNotFoundError if not) and the recipient exists (throw UserNotFoundError if not), and confirm sender and recipient are different users (throw SelfTransferError if they match)
  - Call LimitService.checkLimits, passing the tx client so all aggregation queries run on the same pooled connection and see a consistent snapshot; on a limit breach, insert a FAILED transaction for audit and throw LimitExceededError carrying the breach reason, limit, and remaining
  - On a successful limit check, insert a COMPLETED transaction within the same Prisma transaction, commit, and return the persisted record
  - Accept a now: Date parameter injected by the controller so tests can supply a deterministic timestamp without mocking the system clock
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [ ] 7.2 Implement transaction history retrieval with direction enrichment and pagination
  - Verify the target user exists before querying; throw UserNotFoundError if not
  - Call TransactionRepository.findByUserId with the provided pagination options (page and pageSize, defaulting to page 1 and pageSize 20, capping pageSize at 100)
  - Enrich each raw transaction record with a direction field: SENT when the requesting userId matches sender_id, RECEIVED when it matches recipient_id
  - Return a PaginatedResult containing the enriched data array and pagination metadata (page, pageSize, total, totalPages)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

---

- [ ] 8. Build the HTTP layer, Swagger documentation, and application bootstrap

- [ ] 8.1 Bootstrap the Fastify application with plugins and the global error handler
  - Register fastify-type-provider-zod as the type provider so Zod schemas drive both runtime validation and TypeScript inference for every route
  - Register @fastify/swagger with an OpenAPI 3.x info block (title, version, description) and @fastify/swagger-ui served at the /docs path with the Swagger UI bundle
  - Register a global setErrorHandler that maps each domain error class to its HTTP status code and serialises the response as a standard ErrorEnvelope (statusCode, error code, message, optional details object)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 8.2 (P) Implement user management routes and UserController
  - Register POST /api/users with a Zod body schema (mobileNumber string, firstName string, lastName string), a 201 UserResponse schema, and a 409 error schema; delegate to UserService.createUser; map DuplicateMobileNumberError to 409 via the global error handler
  - Register GET /api/users/:userId with UUID param validation and a 200 UserResponse schema; delegate to UserService.getUserById; map UserNotFoundError to 404
  - Response schema fields must use plain Zod shapes without .transform() to preserve accurate OpenAPI output
  - Can start in parallel with Task 8.3 after Task 8.1 is complete
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.4, 6.5_

- [ ] 8.3 (P) Implement transaction, limit usage, and history routes with TransactionController
  - Register POST /api/transactions with a Zod body schema accepting senderId (UUID string), recipientId (UUID string), and amount (string validated by /^\d+(\.\d{1,2})?$/ with a positive Prisma.Decimal check); inject new Date() as the now parameter when calling TransactionService.sendMoney; map LimitExceededError to 422 with remaining and limit in the details field
  - Register GET /api/users/:userId/limits; inject new Date() when calling LimitService.getLimitUsage; return the LimitUsageResponse including timezone tag and resetsAt fields
  - Register GET /api/users/:userId/transactions with optional page and pageSize query params (both positive integers); delegate to TransactionService.getTransactionHistory; return TransactionHistoryResponse with the full pagination metadata block
  - Can start in parallel with Task 8.2 after Task 8.1 is complete
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.4, 6.5_

- [ ] 8.4 Wire the application entry point, health check, graceful shutdown, and project README
  - Create the main entry point: call loadConfig, instantiate the Prisma client, construct all repositories, services, and the Fastify app in dependency order, and start listening; exit with a non-zero code and ConfigError message if startup validation fails
  - Register GET /health returning { status: "ok", timestamp: ISO string } for the Docker health check
  - Register SIGTERM and SIGINT handlers that close the Fastify server and disconnect the Prisma client cleanly
  - Write the project README: prerequisites, docker compose up steps, Swagger UI URL, example curl requests for the three primary flows (send money, check limits, view history), documented assumptions, failure case descriptions, and brief notes on what would be revisited before a production launch
  - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

---

- [ ] 9. Write unit tests for core business logic and input validation

- [ ] 9.1 (P) Unit tests for LimitService covering all boundary and timezone cases
  - Test daily cap boundary: a transaction that brings the total to exactly ₱50,000 is allowed; one that brings it to ₱50,000.01 is rejected with DAILY_LIMIT_EXCEEDED and the correct remaining value
  - Test monthly cap boundary: same pattern with ₱500,000 and MONTHLY_LIMIT_EXCEEDED
  - Test PHT daily reset: a transaction timestamped at 23:59:59.999 PHT counts in the current day; one at 00:00:00.000 PHT the next moment falls in a new day with a fresh zero total
  - Test PHT monthly reset: last millisecond of a month counts in that month; first millisecond of the next month starts a fresh period
  - Test breach priority: when a single transaction would breach both daily and monthly caps, DAILY_LIMIT_EXCEEDED is returned
  - Mock TransactionRepository.sumByPeriod to return controlled string values and inject deterministic now: Date values
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 8.1, 8.3_

- [ ] 9.2 (P) Unit tests for TransactionService guards and Zod amount validation
  - Test that sendMoney throws SelfTransferError when senderId equals recipientId
  - Test the amount Zod schema: rejects "0", "-1.00", "1500.001", "abc", and empty string; accepts "1500.10", "50000.00", "1", and "0.99"
  - Mock UserRepository, LimitService, and TransactionRepository to isolate TransactionService from any database concern
  - Can run in parallel with Task 9.1
  - _Requirements: 2.2, 2.3, 2.6, 8.2, 8.3_

---

- [ ] 10. Write integration tests exercising the full HTTP stack against a live database

- [ ] 10.1 (P) Integration tests for the send-money transaction flow
  - Provision isolated test users before each test suite; use a dedicated test database or Testcontainers to avoid cross-test pollution
  - Test happy path: POST /api/transactions returns 201 with correct id, senderId, recipientId, amount (as a decimal string), currency PHP, status COMPLETED, and a valid ISO 8601 createdAt
  - Test daily limit breach: accumulate transactions totalling ₱49,999.99, then submit ₱0.02; expect 422 with error code DAILY_LIMIT_EXCEEDED and a remaining field of "49999.99"
  - Test monthly limit breach: set up a monthly spend near ₱500,000 and push it over; expect 422 with MONTHLY_LIMIT_EXCEEDED
  - Test unknown sender: expect 404 with error code USER_NOT_FOUND
  - Test unknown recipient: expect 404 with error code USER_NOT_FOUND
  - Can run in parallel with Task 10.2 once Task 8 is complete
  - _Requirements: 2.1, 2.4, 2.5, 2.7, 3.5, 3.6, 3.7, 8.1, 8.2, 8.3_

- [ ] 10.2 (P) Integration tests for the limit usage and transaction history endpoints
  - Test GET /api/users/:id/limits after a known completed transaction: daily and monthly spent equal the transaction amount, remaining equals the full limit minus that amount
  - Test GET /api/users/:id/limits for a fresh user with no transactions: spent is "0.00" and remaining equals the full limit for both periods
  - Test GET /api/users/:id/transactions: both a sent and a received transaction for the same user appear in the results, each with the correct direction value (SENT or RECEIVED)
  - Test pagination: create more transactions than the default pageSize and verify totalPages, total, page, and pageSize are all accurate in the response
  - Test 404 on both endpoints when the userId does not exist
  - Can run in parallel with Task 10.1
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 8.2, 8.3_
