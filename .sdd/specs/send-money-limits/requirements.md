# Requirements Document

## Project Description (Input)
Technical Assessment: Send Money Limits Module — Build a backend service (Node.js/TypeScript) that processes SEND MONEY transactions and enforces per-user daily (₱50,000) and monthly (₱500,000) spending limits, using Asia/Manila timezone for calendar boundaries. Must include Swagger/OpenAPI docs, Docker Compose setup, seed data, and a README.

## Introduction
The Send Money Limits Module is a backend HTTP API service that enables internal user-to-user PHP money transfers while enforcing configurable per-user daily and monthly spending limits. All calendar boundaries use the Asia/Manila (PHT, UTC+8) timezone. The service must be fully containerized, documented, and exercisable from seed data immediately after startup.

---

## Requirements

### Requirement 1: User Management

**Objective:** As a system operator, I want users to be uniquely identifiable within the system, so that transactions can be attributed and limits tracked per individual.

#### Acceptance Criteria
1. The Send Money Service shall assign each user a unique identifier (e.g., mobile number, customer ID, or equivalent UUID).
2. When a user is created, the Send Money Service shall persist the user record with at minimum a unique identifier and any required profile fields.
3. If a duplicate unique identifier is submitted during user creation, the Send Money Service shall reject the request with a 409 Conflict response and an informative error message.
4. The Send Money Service shall expose an endpoint to retrieve an individual user's profile by their unique identifier.

---

### Requirement 2: Send Money Transactions

**Objective:** As a registered user, I want to send money to another registered user, so that I can make internal transfers within the system.

#### Acceptance Criteria
1. When a send-money request is received, the Send Money Service shall validate that both the sender and recipient are existing users in the system.
2. When a send-money request is received, the Send Money Service shall validate that the sender and recipient are not the same user.
3. When a send-money request is received, the Send Money Service shall validate that the transaction amount is a positive PHP value with no more than 2 decimal places.
4. If the sender does not exist, the Send Money Service shall return a 404 Not Found response with a descriptive error message.
5. If the recipient does not exist, the Send Money Service shall return a 404 Not Found response with a descriptive error message.
6. If the transaction amount is zero, negative, or has more than 2 decimal places, the Send Money Service shall return a 422 Unprocessable Entity response with a descriptive validation error.
7. When a send-money request passes all validations and limit checks, the Send Money Service shall persist the transaction and return a 201 Created response with the transaction details.
8. The Send Money Service shall record each transaction with at minimum: transaction ID, sender ID, recipient ID, amount, currency (PHP), status, and timestamp (ISO 8601 in UTC).

---

### Requirement 3: Spending Limit Enforcement

**Objective:** As a compliance officer, I want per-user daily and monthly spending caps enforced automatically, so that no user can exceed defined transfer thresholds within a calendar period.

#### Acceptance Criteria
1. The Send Money Service shall enforce a daily spending limit of ₱50,000 per user, where the calendar day is defined by the Asia/Manila (UTC+8) timezone.
2. The Send Money Service shall enforce a monthly spending limit of ₱500,000 per user, where the calendar month is defined by the Asia/Manila (UTC+8) timezone.
3. When a send-money request is received, the Send Money Service shall compute the sender's total outgoing amount for the current calendar day (PHT) before applying the transaction.
4. When a send-money request is received, the Send Money Service shall compute the sender's total outgoing amount for the current calendar month (PHT) before applying the transaction.
5. When a transaction amount does not exceed the sender's remaining daily limit and does not exceed the sender's remaining monthly limit, the Send Money Service shall allow the transaction.
6. If a transaction would cause the sender's daily cumulative total to exceed ₱50,000, the Send Money Service shall reject the request with a 422 Unprocessable Entity response and indicate the daily limit breach with the remaining available amount.
7. If a transaction would cause the sender's monthly cumulative total to exceed ₱500,000, the Send Money Service shall reject the request with a 422 Unprocessable Entity response and indicate the monthly limit breach with the remaining available amount.
8. The Send Money Service shall reset each user's daily accumulated total at midnight Asia/Manila time at the start of each new calendar day.
9. The Send Money Service shall reset each user's monthly accumulated total at 00:00:00 Asia/Manila time on the first day of each new calendar month.
10. While computing period totals, the Send Money Service shall only include transactions with a successful/completed status.

---

### Requirement 4: Limit Usage Inspection

**Objective:** As a registered user, I want to view my current daily and monthly spending usage, so that I know how much of my limit I have consumed and how much remains.

#### Acceptance Criteria
1. The Send Money Service shall expose an endpoint to retrieve a user's current limit usage by their unique identifier.
2. When a limit-usage request is received, the Send Money Service shall return the user's daily limit (₱50,000), daily amount spent, and daily amount remaining for the current PHT calendar day.
3. When a limit-usage request is received, the Send Money Service shall return the user's monthly limit (₱500,000), monthly amount spent, and monthly amount remaining for the current PHT calendar month.
4. If the requested user does not exist, the Send Money Service shall return a 404 Not Found response.
5. The Send Money Service shall compute limit usage in real time from persisted transaction data, ensuring consistency with transaction processing.

---

### Requirement 5: Transaction History

**Objective:** As a registered user, I want to view my transaction history, so that I can audit my past send-money activity.

#### Acceptance Criteria
1. The Send Money Service shall expose an endpoint to retrieve the transaction history for a given user by their unique identifier.
2. When a transaction-history request is received, the Send Money Service shall return all transactions where the user is either the sender or the recipient.
3. The Send Money Service shall return each transaction record with at minimum: transaction ID, counterpart user identifier, direction (sent/received), amount, currency, status, and timestamp.
4. The Send Money Service shall return transactions ordered by timestamp descending (most recent first) by default.
5. If the requested user does not exist, the Send Money Service shall return a 404 Not Found response.
6. Where pagination parameters are provided, the Send Money Service shall apply them to the result set and include pagination metadata in the response.

---

### Requirement 6: API Design and Documentation

**Objective:** As a developer or reviewer, I want a documented, interactive HTTP API, so that I can discover, understand, and exercise all endpoints without external tooling.

#### Acceptance Criteria
1. The Send Money Service shall expose a RESTful HTTP API with clearly named endpoints for all required functionality (send money, limit usage, transaction history, and user management).
2. The Send Money Service shall serve an OpenAPI 3.x specification describing all implemented endpoints, request schemas, response schemas, and error codes.
3. When a browser navigates to the Swagger UI path (e.g., `/docs` or `/swagger`), the Send Money Service shall render an interactive Swagger UI connected to the live API.
4. The Send Money Service shall return all error responses as JSON objects containing at minimum a machine-readable error code and a human-readable message.
5. The Send Money Service shall use standard HTTP status codes: 200/201 for success, 400/422 for client validation errors, 404 for not found, 409 for conflicts, and 500 for unexpected server errors.

---

### Requirement 7: Infrastructure and Developer Setup

**Objective:** As a reviewer, I want the service runnable from a single command with no manual database setup, so that I can evaluate it immediately after cloning the repository.

#### Acceptance Criteria
1. The Send Money Service shall include a `docker-compose.yml` that starts both the application and its database with `docker compose up`.
2. When `docker compose up` completes successfully, the Send Money Service shall be ready to accept HTTP requests without any additional manual configuration steps on the host.
3. The Send Money Service shall include a `.env.example` file listing all required environment variables with placeholder values and brief descriptions.
4. The Send Money Service shall include seed data, fixtures, or a documented bootstrap script such that the API can be exercised immediately after startup with no additional data entry.
5. The Send Money Service shall include a README containing: prerequisites, installation and run instructions, the Swagger UI URL, example requests for the primary flow (send money, check limits, view history), documented assumptions, failure case handling, and notes on what would be revisited before a production launch.
6. If any required environment variable is missing at startup, the Send Money Service shall fail fast with a clear error message identifying the missing variable rather than starting in a degraded state.

---

### Requirement 8: Testing

**Objective:** As a developer, I want automated tests covering critical business logic, so that regressions in limit enforcement and transaction processing are caught early.

#### Acceptance Criteria
1. The Send Money Service shall include automated tests for the spending limit enforcement logic (daily cap, monthly cap, boundary conditions, and timezone-based reset).
2. The Send Money Service shall include automated tests for the send-money transaction flow covering happy path, limit breach, invalid input, and non-existent user scenarios.
3. When tests are executed via the standard test runner command, the Send Money Service test suite shall complete and report pass/fail results without requiring external services to be running (unit tests) or with isolated test infrastructure (integration tests).
