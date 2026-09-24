# Operations: migrations, backups, recovery

## Schema & data migrations

- **Structural data** (module catalogue, permissions, platform settings, notification templates,
  navigation groups, default plans, landing sections) is synchronised by `apps/api/src/seed/bootstrap.ts`
  at every API start. Adding a module or permission to `packages/shared` is picked up automatically;
  edits made by the platform owner (names, labels, status, hidden navigation) are preserved.
- **Society settings** are stored as documents keyed by setting name and deep-merged with code defaults
  (`core/configuration/defaults.ts`), so new keys never require a migration.
- **Document shape changes** that need backfills go into `apps/api/src/migrations/<timestamp>-<name>.ts`
  and run with `npx tsx src/migrations/run.ts` before deploying the new version. Keep migrations
  idempotent (check before write) and record them in the `migrations` collection.
- Mongo indexes are declared on the models. In production (`autoIndex` off) create new indexes ahead
  of deployment with `db.<collection>.createIndex(...)` during a low-traffic window.

## Tenant onboarding & data migration

Societies import from spreadsheets (Excel / CSV) through Settings → Data import (`/api/v1/society/import`):
download template → upload (up to 5,000 rows) → map columns (suggested automatically) → dry-run validation with
per-row errors → import in the background (`import.run` job) → result with a downloadable error list.
Nothing is written until validation passes and the admin confirms; rows are written through the normal
services, so numbering, audit, notifications and opening balances are identical to manual entry.
Recommended order for a new society: units (creates buildings) → residents → vehicles → staff → assets → inventory.
Uploaded files are kept under the `imports/` storage scope for the audit trail.

## Background jobs

With `REDIS_URL` set, jobs run in the `worker` process (BullMQ); without it they run inside the API.
Every handler is idempotent. A failed sweep is logged as `Job failed` and retried on the next schedule;
nothing is lost because each sweep re-derives its work from the database and records what it already
sent (`remindersSent` on contracts, `reminders.*` on assets, `lowStockAlertedAt` on inventory items,
`escalatedAt` on SOS alerts). See `docs/ARCHITECTURE.md` for the job table.

## Emergency readiness

- Every society starts with the platform's default helpline list (`emergency.defaultContacts` platform
  setting); societies add hospitals, utilities and office numbers under Emergency → Contacts.
- SOS alerts notify the roles in `emergency.config.sosNotifyRoleKeys` plus everyone with
  `emergency:respond` (guards by default) at CRITICAL priority on all channels; configure the email,
  WhatsApp and push drivers in production or alerts stay in-app only.
- Escalation goes to `escalationRoleKeys` after `escalateUnacknowledgedMinutes`; confirm the
  `emergency.sweep` job is running (Platform → Health) after every deploy.

## Backups

- **MongoDB**: run `mongodump --uri "$MONGODB_URI" --gzip --archive=society-erp-$(date +%F).gz` daily
  (or enable Atlas continuous backups). Keep at least 30 daily and 12 monthly archives off-site.
- **Uploads**: with `STORAGE_DRIVER=s3` enable bucket versioning and lifecycle rules; with `local`
  storage back up the uploads volume alongside the database.
- **Secrets**: store `ENCRYPTION_KEY`, JWT secrets and provider keys in a secret manager. The
  encryption key is required to read stored gateway credentials after a restore.

## Recovery

1. Restore the database: `mongorestore --uri "$MONGODB_URI" --gzip --archive=<file> --drop`.
2. Restore uploads to the same paths/keys.
3. Deploy the same application version (or newer; bootstrap is forward-compatible).
4. Start the API; bootstrap re-syncs structural data and the health endpoint reports `ok`.
5. Verify: super admin login, one society login, `/api/v1/health`, background job driver.

Tenant-level recovery (one society) can be done by restoring to a staging cluster and exporting the
society's collections filtered by `societyId`; every tenant document carries that field.

## Retention & privacy

- Sessions (refresh tokens) and one-time tokens expire through TTL indexes.
- Audit logs are append-only; archive them yearly if volume requires.
- Deactivating users keeps their records for the audit trail; personal data requests are handled by
  anonymising the `User` document (name/email/phone) rather than deleting business history.

## Monitoring

- `GET /api/v1/health` (public, minimal) and Platform console → Settings → Health (detailed).
- Structured JSON logs (pino) with `requestId`, `route`, `status`, `duration`, `errorCode`; ship to your log platform.
- Alert on: health degraded, job failures (`Job failed` log lines), subscription sweep errors, 5xx rate.
