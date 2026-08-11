# Legacy Prisma migrations archived during baseline preparation

These SQL files are preserved for forensic/history purposes only.

They were the only two migrations present before the production baseline work. Both are incremental `ALTER` migrations that assume a pre-existing database created historically via `prisma db push` or manual evolution. They cannot remain in the rebuilt active chain because their effects are now represented by the observed production baseline plus an explicit forward reconciliation migration.

Original active paths:

- `prisma/migrations/20260502143000_surgical_patient_circuit_phase1/migration.sql`
- `prisma/migrations/20260502160000_preanesthesia_phase2/migration.sql`

The active Prisma migration history is rebuilt around:

- `prisma/migrations/0_baseline_production_20260811/migration.sql`
- `prisma/migrations/20260811071500_reconcile_preanesthesia_phase2/migration.sql`

The first migration represents only the Prisma-managed objects observed to exist in production on 2026-08-11. The second adds the phase-2 fields and enum values that the read-only production snapshot proved were still missing.

**Production safety:** archiving these historical files changes no database. On the existing production database, `0_baseline_production_20260811` is intended to be marked as already applied only after backup and final read-only verification; it must not be executed there. The reconciliation migration is then applied through `prisma migrate deploy` under the runbook in `docs/audit/16_PRODUCTION_SCHEMA_RECONCILIATION.md`.
