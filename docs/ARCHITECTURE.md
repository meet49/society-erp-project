# Architecture

## System model

```
PLATFORM ENGINE   landing CMS · plans · modules · feature flags · leads · support · platform settings
TENANT ENGINE     society · buildings · units · residents · settings · categories
ACCESS ENGINE     roles · permissions · user access · module access · scope (own vs all)
SUBSCRIPTION      plans · trial · monthly/annual · renewal · expiry · limits
WORKFLOW          approvals · escalation · SLA · automation
ERP               billing · accounting · expenses · visitors · deliveries · complaints · amenities · staff · domestic help · vehicles · parking
                  security incidents · emergency · contracts/AMC · assets · inventory · notices · community · events · polls · surveys
                  documents · meetings · voting · committee · reports · data import
COMMUNICATION     in-app notifications · email · WhatsApp · push · realtime (Socket.IO)
AUDIT/ANALYTICS   audit log · reports · platform metrics
```

## Backend layout (`apps/api/src`)

| Folder | Responsibility |
|---|---|
| `config/env.ts` | zod-validated environment; the process refuses to start on invalid config |
| `lib/` | logger (pino, secrets redacted), errors (`AppError`, canonical codes), mongo (embedded replica set fallback, `withTransaction`), redis (optional), cache + invalidation bus, crypto, pagination, validation, csv |
| `middleware/` | `requestContext`, `authenticate`, `requireSociety`, `requirePlatform`, `authorizePermission`, `requireModule`, `requireSubscription`, `requireFeature`, rate limiters, error handler |
| `models/` | Mongoose models; every society-owned entity carries `societyId` (indexed) and important records soft-delete |
| `core/` | engines shared by all modules (below) |
| `modules/` | vertical business modules: `*.schemas.ts` (zod) → `*.routes.ts` (middleware chain) → `*.controller.ts` (thin) → `*.service.ts` (business logic) |
| `seed/` | `bootstrap.ts` (idempotent structural data at every start), `index.ts` (demo data), seed hooks |

### Core engines

- **ConfigurationService** – `getPlatformSetting`, `getSocietySetting` (deep-merged with defaults), `getFeatureFlag`, `getModuleConfiguration`, `getPlanConfiguration`, `getWorkflowConfiguration`. All business configuration is read through it.
- **ModuleEngine** – resolves module state per society: global status → plan → society toggle → feature flag → dependencies. Disabling never deletes data.
- **SubscriptionEngine** – lifecycle `TRIALING → ACTIVE → PAST_DUE → EXPIRED → SUSPENDED → CANCELLED`, configurable grace period / past-due behaviour / reminder days, expiry radar, MRR/ARR stats, idempotent lifecycle sweep job.
- **AccessControlService** – the single place effective access is computed: roles (+ `grantsAllPermissions`) + membership direct allow/deny, filtered by accessible modules; platform context for SUPER_ADMIN; navigation generated from module definitions + permissions + flags.
- **LimitService** – plan limits (`maxUnits`, `maxUsers`, …) vs live usage; `assertWithinLimit` before creating records.
- **CategoryService** – configurable categories (complaint, visitor, staff, vendor, expense, asset, inventory, domestic help, unit types, document, fund, incident, event) seeded per society.
- **WorkflowEngine** – database-defined approval chains (`WorkflowDefinition`/`WorkflowInstance`) used by expenses, purchases, amenities, documents and move requests.
- **NotificationService** – DB is the source of truth; delivery over in-app socket, email, WhatsApp, push through provider abstractions; templates per platform with society overrides; channel matrix per society and per event; user preferences.
- **JobQueue** – BullMQ when `REDIS_URL` is set (dedicated worker process), in-process runner otherwise. Handlers are idempotent.
- **DomainEvents** – services emit events (`complaint.created`, `payment.received`, `subscription.expired`…); notifications, realtime and audit subscribe.
- **AuditService** – actor, society, action, resource, before/after (secrets stripped), request id.
- **AudienceService** (`core/audience`) – one targeting model (`ALL`, buildings, unit groups, roles, custom users, resident types) shared by notices, posts, events, polls, surveys, meetings, voting and emergency broadcasts: `matchFilter` for reads, `resolveUserIds` for delivery, `describe`/`count` for previews.
- **SequenceService** – per-society document numbers (`INV`, `EXP`, `TKT`, `INC`, `SOS`, `CON`, `AST`…) with never / yearly / fiscal-year reset.
- **StorageService** – local or S3 driver; private files are referenced by key and served through short-lived signed URLs (`assertOwned` ties keys to the society).
- **Reports catalogue** (`modules/reports/reports.catalog.ts`) – report definitions (module, extra permission, parameters, columns, chart, aggregation) exposed through one API; the catalogue a caller sees is filtered by accessible modules and permissions.
- **Import engine** (`modules/imports`) – spreadsheet imports (units, residents, vehicles, staff, assets, inventory): parse → suggest mapping → dry-run validation → queued run that writes through the normal services.

### Request pipeline for a society API

```
requestContext → authenticate (JWT + session revocation check) → requireSociety (tenant from token only)
→ requireModule('billing') → requireSubscription() → authorizePermission('billing:create') → validate(zod)
→ controller → service (societyId from req.tenant) → model
```

The society id is **never** taken from body/query/headers; it is encoded in the signed access token when
the user logs in or switches society, and membership is re-verified on every request.

### Access hierarchy

```
GLOBAL MODULE → PLAN → SUBSCRIPTION → SOCIETY MODULE → ROLE → PERMISSION → USER
```

Permission keys are `module:action`. `*_own` actions grant own-scope access (member self-service);
`authorizePermission` sets `req.ownScope` so services restrict queries to the caller's units.

## Frontend layout (`apps/web/src`)

| Folder | Responsibility |
|---|---|
| `lib/api-client.ts` | Axios instance: bearer header, single-flight refresh on 401, request id, timeout, safe GET retries, normalised `ApiError { code, message, fields }` |
| `lib/query-client.ts` | TanStack Query with global error → toast mapping (`meta.silent` opt-out) |
| `stores/` | Zustand: auth session (`AccessContext`), UI (theme, sidebar, online state) |
| `hooks/` | API hooks per domain (`useSocieties`, `usePlans`, `useRoles`, `useUnits`…); every mutation invalidates its keys; access-changing mutations refresh `/auth/me` |
| `app/routes.tsx` | central route config: path, lazy element, layout, module, permission, subscription requirement; drives the router, sidebar visibility, breadcrumbs and UX gates |
| `layouts/` | public site, auth, app shell (platform & society), mobile-first guard shell |
| `components/ui` | shadcn-style primitives; `components/common` – DataTable, StatCard, gates, forms, charts (validated palette), notification bell |
| `features/` | pages by area: public, auth, platform, society (settings suite, onboarding, widgets), units, … |

Frontend gates (`PermissionGate`, `ModuleGate`, `PlanGate`, `SubscriptionGate`, `FeatureGate`) are UX only;
the API enforces every rule and tests assert it (`apps/api/tests`).

## Tenancy & security

- Every tenant entity has `societyId`; queries are always scoped by `req.tenant.societyId`.
- Refresh tokens are hashed at rest, rotated on use; reuse revokes the whole session family.
- Helmet, CORS allow-list, rate limits (global, auth, public forms), lockout after failed logins.
- Webhooks are verified against provider signatures and stored idempotently (`WebhookEvent`).
- Private files are served through short-lived signed URLs; credentials at rest are AES-256-GCM encrypted.
- Audit logs never contain passwords, tokens or secrets (`sanitizeForAudit`).

## Testing strategy

- `apps/api/tests` – integration tests against an embedded MongoDB replica set: auth, tenancy (A cannot see B), RBAC, module engine (MODULE_DISABLED, plan E2E), subscription (EXPIRED blocks, PAST_DUE read-only), platform console, landing CMS publish, leads, support threads, signup vertical slice.
- `e2e/` – Playwright, one spec per journey: vertical slice (landing → signup → wizard → roles → users → login → navigation → API authorization → CMS publish), billing (invoice → online payment → receipt), helpdesk, gate app (pass → guard check-in, offline banner), amenities (booking → payment), community (notice → feed → poll) and operations (reports, spreadsheet import wizard, incident desk, SOS from the gate answered by the office, stock movements).
- `apps/web/src/**/*.test.ts(x)` – Vitest + Testing Library for pure logic and components that carry business rules: the offline queue (never fakes success, replays in order, drops server rejections visibly), dashboard layout, report cell formatting, list state and badges.

## Money flow (billing, payments, accounting hooks)

```
charge heads + meter readings ──► billing run ──► draft invoices ──► issue ──► unit ledger (DEBIT)
                                                                          │
payment (offline / verified online) ──► FIFO allocation ──► invoices ──► unit ledger (CREDIT)
                                                                          │
refund ──► reverse allocations ──► unit ledger (DEBIT)          finance hooks ──► accounting journals
```

- `UnitLedgerEntry` is the single source of truth for a unit's balance: `openingBalance + Σdebit − Σcredit`. Invoices, payments, penalties and refunds all post here; the residents module asks billing for the balance before approving a move-out (`setDuesResolver`).
- `PaymentOrder` records every gateway order (`CREATED → PAID | FAILED | EXPIRED`). Marking an order paid is an atomic `findOneAndUpdate` on `status: CREATED`, so the client callback and the webhook cannot both record a payment.
- `WebhookEvent` has a unique `(provider, eventId)` index. Signature verification happens **before** the event is stored, so an unsigned request can never reserve a genuine event id.
- Providers implement `PaymentProvider` (`core/payments/payment-provider.ts`): `createOrder`, `verifyPaymentSignature`, `verifyWebhookSignature`, `parseWebhook`, `refund`. Razorpay talks to the REST API; the mock provider is deterministic (HMAC with `MOCK_PAYMENT_SECRET`) and is what tests and the demo society use.
- Accounting integration goes through `registerFinanceHooks` (`onInvoiceIssued`, `onPaymentReceived`, `onPaymentRefunded`, …). Hook failures are logged and never block money movements.
- Background jobs: `invoice.overdue` (hourly: overdue status, one-time penalty, reminders) and `payment.reconcile` (every 10 minutes: expire stale orders, recover paid orders whose webhook was lost).

## Background jobs

All jobs are registered with `registerJobHandlers` and scheduled from `core/jobs/scheduler.ts`; every handler is idempotent and safe to run twice.

| Job | Cadence | Purpose |
|---|---|---|
| `subscription.lifecycle` | 15 min | trial / past-due / expiry transitions, reminders |
| `invoice.overdue`, `payment.reconcile` | 1 h / 10 min | overdue status + penalties; recover paid orders whose webhook was lost |
| `sla.escalate`, `complaint.autoclose` | 5 min / 6 h | SLA breaches and escalation chain; auto-close resolved tickets |
| `visitor.expire` | 10 min | expire passes, time out pending approvals, auto check-out |
| `amenity.complete` | 30 min | expire unpaid holds, complete finished bookings |
| `community.sweep`, `governance.sweep` | 5 min | publish scheduled notices, close polls / surveys, meeting reminders, close votes |
| `document.expiry` | 12 h | document expiry reminders |
| `attendance.process` | 6 h | auto-mark yesterday, unmarked-attendance reminder |
| `emergency.sweep` | 2 min | escalate unacknowledged SOS, expire broadcasts |
| `security.sweep` | 6 h | auto-close resolved incidents |
| `contract.remind`, `asset.remind`, `inventory.lowstock` | 6 h / 12 h / 6 h | contract expiry + AMC visits; maintenance + warranty; low stock |
| `import.run` | on demand | runs a validated spreadsheet import |
| `notification.deliver`, `email.send`, `whatsapp.send`, `push.send` | on demand | channel delivery, idempotent per (notification, channel) |

## Realtime

Socket.IO rooms: society, user, role, gate and unit. Services emit domain events; the `*.events.ts` file of each module fans them out (`gate.changed`, `security.changed`, `emergency.sos`, `emergency.broadcast`, `contracts.changed`, `import.progress`…) and the web hooks invalidate TanStack Query caches on those events, so screens stay live without polling.

## Workflow engine

`core/workflows/workflow.service.ts` owns `WorkflowDefinition` (per society, seeded defaults) and `WorkflowInstance` (one per submitted entity). `start()` evaluates the auto-approve condition and each step's condition against the entity context (`amount`, `categoryKey`, …), creates the instance and emits `workflow.step_pending` (approver notifications). `decide()` records a decision on the current step, advances or completes the instance and emits `workflow.completed`; business modules subscribe to that event (idempotently) to finalise their entity. Direct approval endpoints (`/expenses/:id/approve`) go through the same engine, so a decision is always attributed to a workflow step when one is pending.

## Accounting model

- `Account` (chart of accounts, `systemKey` for automatic postings), `Fund`, `BankAccount`, `BankTransaction`, `JournalEntry` (balanced lines, `refType/refId` back-references).
- Balances are never stored: reports aggregate posted journal lines (`POSTED` and `REVERSED` originals plus their mirrored reversals net to zero).
- Automatic postings (finance hooks): invoice issued → Dr Receivables / Cr Income (per line's `ledgerAccountCode`, fund tagged); payment → Dr Cash/Bank / Cr Receivables (+ Cr Member advances for unallocated amounts); refund → reverse; expense approved → Dr Expense / Cr Payables (+ Cr TDS payable); expense paid → Dr Payables / Cr Bank. Cancelling an invoice reverses its journal by reference.
- The accounting module can be disabled for a society; billing and payments keep working (hooks are skipped) and can be back-posted later.
