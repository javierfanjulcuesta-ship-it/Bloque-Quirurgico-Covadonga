# Legacy Prisma migrations archived during baseline preparation

These SQL files are preserved for forensic/history purposes only.

They were the only two migrations present before the production baseline work. Both are **incremental ALTER migrations** that assume a pre-existing database created historically via `prisma db push`/manual evolution. They therefore cannot remain in the active migration chain after introducing a full current-schema baseline: on a fresh database, the baseline already contains these columns, enum values and indexes, so replaying these legacy migrations would duplicate them.

Original active paths:

- `prisma/migrations/20260502143000_surgical_patient_circuit_phase1/migration.sql`
- `prisma/migrations/20260502160000_preanesthesia_phase2/migration.sql`

The active Prisma migration history is being rebuilt around `prisma/migrations/0_baseline_current/migration.sql`.

**Production safety:** archiving these files does not change any database. The baseline must not be executed on the existing production database; after a read-only schema comparison proves the database matches the baseline (or after an explicitly reviewed delta brings it into alignment), `0_baseline_current` can be marked as already applied with `prisma migrate resolve --applied 0_baseline_current`. That production operation is intentionally not performed by this branch.
