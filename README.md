# SOCIETY ERP

A configurable, multi-tenant SaaS for residential housing societies, RWAs, apartment complexes,
gated communities, cooperative housing societies and townships.

- **Platform engine** – plans, subscriptions, modules, feature flags, landing-page CMS, leads, support, audit.
- **Tenant engine** – society, buildings, units, residents, settings, categories, workflows.
- **Access engine** – database-driven roles & permissions (`module:action`), module gating, subscription gating.
- **ERP modules** – billing, payments, accounting, expenses & purchase orders, complaints, visitors & deliveries, amenities, staff & attendance, domestic help, vehicles & parking, security incidents, emergency (SOS & broadcasts), contracts & AMC, assets, inventory, notices, community feed, events, polls, surveys, documents, meetings, voting, committee, reports, data import.

Everything a society or platform owner normally changes (plans, prices, modules, permissions, categories,
SLAs, notification channels, landing content) lives in the database and is edited from the UI - never in code.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, React Router, TanStack Query, Zustand, Axios, React Hook Form, Zod, Tailwind CSS, shadcn-style UI, Recharts, vite-plugin-pwa |
| Backend | Node.js 20+, Express, TypeScript, MongoDB (Mongoose), Redis + BullMQ (optional in dev), Socket.IO |
| Auth | JWT access tokens + rotating, revocable refresh tokens (reuse detection), account lockout |
| Integrations | Payment provider abstraction (Razorpay / mock), email (SMTP / console), WhatsApp (Meta Cloud / console), web push, S3-compatible or local storage |
| Testing | Vitest + Supertest (API), Vitest + Testing Library (web), Playwright (E2E) |

## Quick start

```bash
npm install
npm run dev
```

- API: http://localhost:4100 (health: `/api/v1/health`)
- Web: http://localhost:5174

No MongoDB or Redis installed? Nothing to do: when `MONGODB_URI` is empty the API boots an
**embedded MongoDB replica set** (data persisted under `apps/api/.data/mongo`), and when `REDIS_URL`
is empty background jobs run **in-process**. Point the same variables at real services for production
(see `docker-compose.yml`).

On first boot the API seeds the module catalogue, permissions, platform settings, feature flags,
notification templates, default plans, landing content and the platform super admin:

| Account | Email | Password |
|---|---|---|
| SUPER_ADMIN | `superadmin@societyerp.local` | `SuperAdmin@123` |

Load a demo society (Palm Grove Residency: 2 towers, 48 units, admin/committee/guard/member users):

```bash
npm run seed
```

| Account | Email | Password |
|---|---|---|
| Society admin | `admin@palmgrove.demo` | `Admin@12345` |
| Committee | `committee@palmgrove.demo` | `Committee@123` |
| Security guard | `guard@palmgrove.demo` | `Guard@12345` |
| Member | `member@palmgrove.demo` | `Member@12345` |

Change the default passwords before exposing an environment (`SEED_SUPER_ADMIN_PASSWORD`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + web with hot reload |
| `npm run build` | Production build of API (tsup) and web (Vite + PWA) |
| `npm run typecheck` | TypeScript across shared, api and web |
| `npm run lint` | ESLint across workspaces |
| `npm test` | API integration tests (embedded MongoDB) + web unit tests |
| `npm run test:e2e` | Playwright end-to-end tests (boots API + web automatically) |
| `npm run seed` | Demo data |

## Repository layout

```
packages/shared   module registry, default roles, enums, error codes, shared zod schemas & types
apps/api          Express API: core engines (access, modules, subscription, configuration, workflow,
                  notifications, jobs, audit), models, business modules, seed, tests
apps/web          React app: public site, auth, platform console, society console, resident portal, guard app
e2e               Playwright specs
docs              architecture, deployment, operations
```

See `docs/ARCHITECTURE.md` for the engines and access hierarchy, `docs/DEPLOYMENT.md` for Docker /
environment configuration and `docs/OPERATIONS.md` for migrations, backups and recovery.

## Billing & payments

- **Charge heads** (Billing → Setup) define how each line is calculated: fixed, per sq ft, metered (rate × consumption from meter readings), formula (safe arithmetic over `area`, `floor`, `bedrooms`, `consumption`, `amount`, `rate`) or percentage of the other lines. Each head can be limited to unit types / buildings and mapped to an income ledger code and fund.
- **Billing runs** generate one draft invoice per unit for a period, skip units already invoiced for that period, mark meter readings as billed and can be issued together. Issuing posts a debit on the unit ledger, fires the accounting hook and notifies residents (channels are configured per society).
- **Invoice lifecycle**: `DRAFT → ISSUED → PARTIALLY_PAID → PAID`, `OVERDUE` after the configurable grace period (with a one-time penalty: flat, percent or interest p.a., capped), `CANCELLED` (only without payments). Reminders before/after the due date are idempotent.
- **Payments** are allocated oldest-due first (or to selected invoices); the leftover stays as an advance on the unit ledger. Receipts are numbered per financial year. Refunds reverse allocations newest-first and post to the ledger.
- **Online payments**: the server creates the gateway order, the browser completes checkout (Razorpay, or the built-in demo gateway in test mode), and the server verifies the HMAC signature before anything is recorded. Webhooks (`/api/v1/webhooks/payments/:provider/:societyId`) are signature-checked and processed once per event id; a lost webhook is recovered by the reconciliation job.
- **Subscription payments** to the platform use the same verified flow (`/society/subscription/pay/*`); the platform team can also record offline (NEFT/cheque) payments from the console.
- Gateway secrets are encrypted at rest (`ENCRYPTION_KEY`) and never returned by the API.

## Expenses, approvals & accounting

- **Approval workflows** (Settings → Workflows) are per-society definitions with ordered steps (approver = role, user or permission), per-step conditions (e.g. a second admin step only when `amount >= 50000`) and an auto-approve rule. Expenses, purchase orders, vendors, amenity bookings and documents use them through one engine (`core/workflows`). Approvers get an in-app/push task and decide from the **Approvals** inbox.
- **Vendors** carry categories, GST/PAN, masked bank details and payment terms; **expenses** move `DRAFT → PENDING → APPROVED/REJECTED`, then `UNPAID → PARTIAL → PAID` as payments are recorded. **Purchase orders** cover requisition → quotes → approval → order → goods receipt → conversion into an approved expense.
- **Accounting** is double-entry: a seeded, editable chart of accounts (system accounts are protected), funds (corpus, sinking…), bank/cash accounts and journals (`DRAFT → POSTED → REVERSED`, reversals are mirrored entries, never edits). Invoices, payments, refunds, expense approvals and expense payments post automatically through finance hooks; each can be switched off in `accounting.config`.
- **Reports**: trial balance, income & expenditure, balance sheet, general ledger, day book, receivables ageing and fund statements, all exportable as CSV (separate `accounting:export` permission).
- **Bank reconciliation**: import statement CSVs (common Indian bank layouts are detected), lines are deduplicated by fingerprint, auto-matched to payments by reference/amount/date, and can be matched, unmatched or ignored manually.

## Helpdesk & complaints

- Residents raise tickets against their unit (or public common-area issues); staff can log tickets on behalf of a unit. Categories come from Settings → Categories.
- **SLA**: response and resolution targets per priority are configured per society (`complaints.sla`) and stamped on each ticket; the first public staff reply or assignment stops the response clock, resolution stops it fully. Reopening restarts the clock.
- **Escalation**: a configurable ladder (`complaints.escalation`) notifies roles/users once per level when resolution is overdue; the `sla.escalate` job runs every 5 minutes.
- Lifecycle `OPEN → IN_PROGRESS → RESOLVED → CLOSED` with `REOPENED` (residents can reopen within a configurable window) and auto-close of resolved tickets after N days. Internal notes are never shown to residents; residents can rate resolutions.

## Visitors, deliveries & the gate app

- **Passes**: residents pre-approve guests (`POST /visitors/pre-approve`) and get a 6-digit passcode plus a QR payload (`SERP:V:<token>`) with share text for WhatsApp; recurring passes (domestic help) carry weekday rules and an end date.
- **Guard app** (`/guard`, mobile-first, installable PWA): dashboard with "inside now" and expected lists, scan/lookup (`POST /visitors/lookup` accepts passcode or QR token and returns `valid`/`reason`), walk-in registration with camera photo, expected list, timeline and deliveries. Walk-ins ask the resident for approval in real time (Socket.IO room `society:<id>:unit:<unitId>`); approving by phone is allowed only when the guard has `visitors:approve`.
- **Offline**: gate actions (check-in/out, walk-in, delivery) are queued in IndexedDB with a `clientRef` and replayed when the device is back online; the server treats a replayed `clientRef` as a no-op (`replayed: true`). Nothing is shown as "done" until the server confirms it.
- **Deliveries**: residents announce expected parcels (`leaveAtGate`), the gate matches courier arrivals to announcements and can hold parcels; residents confirm collection.
- **Guard isolation**: guard roles never receive finance, member, plan, subscription or society-settings permissions; the API enforces this (403) regardless of what the client renders.
- **Jobs**: `VISITOR_EXPIRE` expires unused passes, times out unanswered walk-in requests and auto-checks-out overstays per the visitor configuration (`GET/PUT /visitors/config`).
- Demo data: `npm run seed` creates passes, walk-ins in every state and two deliveries for unit A-101 (member@palmgrove.demo).

## Amenities & bookings

- **Catalogue** (`/app/amenities`): every rule is data on the amenity: opening hours and days, slot length (or whole-day mode), capacity (how many bookings may overlap), max guests, minimum notice, advance window, fee model (free / per slot / per hour / per booking) plus a refundable deposit, approval requirement, cancellation window and maintenance blocks. Amenity types are a configurable category (`AMENITY_TYPE`).
- **Overlap safety**: the booking engine takes a short per-amenity lease in MongoDB before it counts overlapping holds, so concurrent requests (even across API instances) can never exceed capacity; losers get `409 BOOKING_OVERLAP`.
- **Lifecycle**: `CONFIRMED` (free, no approval) → or `PENDING_APPROVAL` (routed through the `amenity_approval` workflow, decided from Approvals or the booking page) → `PENDING_PAYMENT` (the fee + deposit are invoiced through billing; the slot is held until `paymentDueAt`, configurable `paymentWindowHours`) → `CONFIRMED` once the invoice is settled online or at the office → `COMPLETED` after the slot ends (deposits become refunds due).
- **Cancellation & refunds**: residents cancel their own future bookings; inside the free window (or when the committee cancels) the full fee comes back, later cancellations refund the configured percentage; deposits are always returned. Refunds are processed by finance against the original payment (`payments:refund`) and post through the normal refund flow.
- **Policy** (`amenities.config`): default slot length, advance days, minimum notice, active bookings per unit, cancellation hours, late-cancellation refund %, payment window and "block bookings while dues are pending".
- **Jobs**: `AMENITY_COMPLETE` completes finished bookings, expires unpaid holds (cancelling the invoice) and cancels approvals nobody answered before the slot started.
- Residents book from **My Amenities** (`/app/my/amenities`), pay from the booking card (demo gateway or Razorpay) and follow the timeline; the API returns `403` for anyone without `amenities:*` permissions regardless of the UI.

## Notices, community feed, events, polls & surveys

- **Audiences** (`core/audience`): one definition shared by every communication module: everyone, buildings, unit groups, roles or hand-picked people, optionally narrowed to owners / tenants / family. The same definition drives the visibility filter, the eligibility check (votes, RSVPs, responses) and the notification fan-out; `POST /notices/audience/preview` returns the head-count and label the pickers show.
- **Notices** (`/notices`): drafts → scheduled (published by the `COMMUNITY_SWEEP` job) → published → archived. Per-notice channels (in-app, push, email, WhatsApp), pinning, expiry, categories (`NOTICE_CATEGORY`), read receipts and optional acknowledgements (`/notices/:id/readers`). Residents only ever see published notices addressed to them.
- **Community feed** (`/community`): resident posts, comments, likes and reports; committee announcements with audiences; moderation (hide, approve, pin, clear reports, delete) and feed rules (`communication.config`: posts on/off, pre-moderation, comments, reports).
- **Events** (`/events`): audience-targeted events with capacity (people + guests), RSVP deadlines and attendee lists / export; cancellations notify everyone who RSVP'd; past events complete automatically.
- **Polls** (`/polls`): fixed options, one vote per user or per unit, anonymous or named, single or multiple choice, live or closed-only results, timed auto-close.
- **Surveys** (`/surveys`): single / multiple choice, rating, yes-no and free-text questions with server-side validation, one editable response per user, aggregated results, CSV export and anonymity.

## Documents & file uploads

- **Uploads** (`POST /files/upload`, multipart, authenticated): files are stored under the caller's society namespace (`societies/<id>/<scope>/…`) with type and size checks (`MAX_UPLOAD_MB`); the response carries the storage key plus a short-lived preview URL. Modules verify the key belongs to the society before linking it (complaints, notices, documents…).
- **Repository** (`/documents`): folders with their own visibility, documents with category (`DOCUMENT_CATEGORY`), tags, pin, expiry and version history. Visibility levels: admin, committee, members, or specific units (share certificates, sale deeds). Residents additionally only see the categories listed in `documents.config.memberVisibleCategories`.
- **Downloads** never expose storage keys: `POST /documents/:id/download` returns a signed URL valid for `signedUrlMinutes` (local driver signs with `SIGNED_URL_SECRET`; S3 uses presigned URLs) and counts the download in the audit log.
- **Review workflow**: with `requireApprovalForStaffUploads` on and the `document_approval` workflow active, committee uploads wait in Approvals before residents can see them.
- **Expiry reminders**: the `DOCUMENT_EXPIRY` job warns document managers `expiryReminderDays` before insurance policies, AMCs or licences lapse.

## Meetings, voting & committee

- **Meetings** (`/meetings`): committee meetings default to the committee audience, AGM / SGM to every unit. Agenda items, RSVPs, attendance marking (per unit for general meetings) with quorum computed against `agmQuorumPercent`, minutes and resolutions with outcomes, publication to the audience, reminders (`GOVERNANCE_SWEEP`, `reminderHours` before) and an iCalendar download.
- **Voting** (`/voting`): resolutions (for / against / abstain with a configurable pass threshold, abstentions excluded) and elections (choose up to `seats` candidates). One ballot per unit by default, anonymous by default, quorum checks, results frozen at close and announced to the audience. A resolution recorded in minutes can be sent to a formal e-vote; the counts and outcome flow back into the minutes when it closes.
- **Committee** (`/committee`): positions are a configurable category (`COMMITTEE_POSITION`), contact details are shown to residents only when the member allows it, and **handover mode** walks the outgoing committee through a checklist (bank signatories, audited accounts, registers, contracts, assets, credentials) before the incoming members take office; every step is audited and the committee is notified.

## Staff, domestic help, vehicles & parking

- **Staff** (`/staff`): society, agency and contract staff with categories (`STAFF_CATEGORY`), shifts and weekly offs from `staff.config`, salary / ID proof visible only to editors (masked otherwise). Attendance is a per-day register: gate punches (`/staff/:id/check-in|out`) compute late marks and overtime from the shift; the office marks the day in bulk or per cell; the nightly `ATTENDANCE_PROCESS` job marks the previous day (absent or week off) and reminds the office once a day when today is still unmarked. Monthly register export to CSV.
- **Domestic help** (`/domestic-help`): residents register their maid / cook / driver, get a 6-digit passcode + QR to share, and the office verifies the ID. A helper registered by a second flat is linked to the same record (matched on phone), so one passcode works for every engaging unit. Guards look the helper up by passcode or QR (`/domestic-help/lookup`) and punch in / out; entries are logged, idempotent on `clientRef` so the guard app can queue them offline, and the family is notified when `notifyOnEntry` is on. The office can block a helper at the gate and require verification before entry (`domestic_help.config`).
- **Vehicles** (`/vehicles`): plates are normalised (no spaces, upper case) and unique per society; residents register their own, the office issues stickers. `/vehicles/lookup` serves the gate by partial plate or sticker and hides the owner's name unless `privacy.config.showVehicleOwnerToGuards` allows it.
- **Parking** (`/parking`): slots created singly or as a numbered range per level / zone, allocated to a unit (optionally to a vehicle) and released; occupancy and per-type stats feed the dashboard widget.
- **Guard app**: `/guard/help` adds domestic help check-in / out and vehicle lookup next to the visitor screens, all through the same offline queue.

## Security incidents & emergency

- **Incidents** (`/security/incidents`): guards report from `/guard/incidents` (type and severity chips, photo, works offline through the queue with a `clientRef` so replays are safe) and the office logs from the security desk. Each incident carries a category (`INCIDENT_TYPE`), severity, location / gate / unit, people or vehicles involved, police details and an append-only timeline. Flow: OPEN → INVESTIGATING (on assignment) → RESOLVED (outcome + action taken) → CLOSED, with reopen. High and critical incidents also alert the roles in `security.config.notifyRoleKeysOnCritical`; residents are told when an incident mentions their unit; resolved incidents auto-close after `autoCloseResolvedAfterDays` (`SECURITY_SWEEP`). Who sees the register is a role question: `security:view` sees everything, `security:create` alone sees own reports. Gates are managed from the same page (shared with the visitor module). CSV export.
- **Emergency contacts** (`/emergency/contacts`): every new society starts with the platform's default helpline list (`emergency.defaultContacts`, editable by the platform admin) and adds its own hospitals, utilities and office numbers; residents and guards get a click-to-call list.
- **SOS** (`/emergency/sos`): residents (`/app/my/emergency`) and guards (`/guard/emergency`) raise an SOS with a category, location and optional GPS. One live SOS per person (repeat taps return the same alert), never queued offline — the app says plainly when it could not send. Responders (roles in `emergency.config.sosNotifyRoleKeys` plus anyone with `emergency:respond`, guards by default) are alerted on every channel at CRITICAL priority and over the gate socket; the first "I'm responding" acknowledges it and tells the person who raised it; resolve / false alarm closes it; the raiser can cancel their own. Unacknowledged SOS escalate to `escalationRoleKeys` after `escalateUnacknowledgedMinutes` (`EMERGENCY_SWEEP`, every 2 minutes).
- **Broadcasts** (`/emergency/broadcast`): the office sends an emergency notice to an audience (everyone, buildings, units, roles, custom) on all channels; it stays on every member's screen (sticky banner in the app and gate shell) until the all-clear or `broadcastActiveHours` pass. Reads, contacts and SOS stay available on a lapsed subscription.

## Contracts & AMC, assets and inventory

- **Contracts** (`/contracts`): AMCs, service, supply, lease and insurance agreements with a vendor, term, value and billing cycle, the assets they cover and attached documents. DRAFT → ACTIVE → EXPIRED / RENEWED / TERMINATED, with renewal creating the successor contract and re-pointing the covered assets. `CONTRACT_REMIND` marks expiry, sends each reminder in `contracts.config.reminderDays` exactly once (again if the end date changes) and flags overdue AMC visits. Service visits are logged on the contract and mirrored into every covered asset's maintenance log; contract bills become expenses (linked by `contractId`) that go through the normal expense approval, so billed / paid totals show on the contract.
- **Assets** (`/assets`): register with category (`ASSET_CATEGORY`), location, make / model / serial, purchase details, warranty, straight-line book value (cost, salvage, expected life), the AMC that covers it and a maintenance log (preventive, breakdown, inspection, AMC visit, upgrade) whose cost can be booked as an expense linked by `assetId`. Status ACTIVE / UNDER_MAINTENANCE / DISPOSED with disposal details. `ASSET_REMIND` announces maintenance coming due (`assets.config.maintenanceReminderDays`) and warranties about to lapse, once each.
- **Inventory** (`/inventory`): store items (`INVENTORY_CATEGORY`) with minimum level, reorder quantity and moving-average unit cost. Every movement is a ledger row with the balance after it: stock in (re-averages cost), issue (atomic, refuses to go negative unless `inventory.config.allowNegativeStock`), physical count. Goods received on a purchase order flow into stock automatically for lines linked to an item. `INVENTORY_LOW_STOCK` alerts the configured roles once per item and again after `realertAfterDays` while it stays low; the alert clears when stock rises above the minimum.
- Dashboard widgets link straight into pre-filtered lists (expiring contracts, maintenance due, items below minimum).

## Reports & dashboard

- **Reports** (`/reports`): a catalogue of ready-made reports (billing vs collections, dues by building, expenses by category, vendor spend, income vs expense trend, amenity utilisation, complaints & SLA, visitor traffic and categories, staff attendance, occupancy, security incidents, contract expiry, asset maintenance, inventory consumption, domestic help entries). Each report declares the module it belongs to and the extra permission it needs, so the catalogue a user sees is exactly what their society has enabled and their role allows. Every report runs with sensible defaults (`GET /reports/:key`), accepts a period / month / as-of / months parameter, renders as chart + table, and exports CSV with a totals row (`reports:export`, audited).
- **Dashboard**: widgets are contributed by modules and filtered by module access and permissions; administrators customise the shared layout (hide widgets, reorder) from the dashboard itself, stored in the `dashboard.widgets` society setting.

## Data import

- **Settings → Data import** (`/society/import`): a four-step wizard for units, residents, vehicles, staff, assets and inventory items from `.csv` / `.xlsx` (up to 5,000 rows). Each type publishes its fields, a downloadable template and the permission it needs (`units:import`, `residents:import`, `vehicles:create`…) on top of `society:import`; the module must be enabled for the society.
- **Flow**: upload → the server reads the headers and suggests a column mapping (exact names, labels, aliases, fuzzy) → the user fixes the mapping and chooses whether existing rows are skipped or reported → a dry run validates every row (required columns, types, unit codes, categories, duplicates inside the file) without writing anything → the run is queued (`IMPORT_RUN`) and written row by row through the normal services, so numbering, audit entries, notifications and opening balances behave exactly as manual entry. Progress streams to the uploader over the socket; problems are listed per row and downloadable as CSV. Buildings referenced by units are created on the fly; residents can be invited to log in as part of the import.
