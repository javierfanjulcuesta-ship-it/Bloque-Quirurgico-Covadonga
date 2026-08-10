-- QxFlow production schema audit (READ ONLY)
-- Safe to run in Supabase SQL Editor: SELECT statements only.
-- Do not add UPDATE/ALTER/CREATE/DROP statements to this file.

-- 1) Environment fingerprint (no credentials)
SELECT
  current_database() AS database_name,
  current_schema() AS current_schema,
  current_user AS database_user,
  current_setting('server_version') AS postgres_version;

-- 2) Public tables expected/observed
SELECT
  table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 3) Columns, types, nullability and defaults for all public tables
SELECT
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;

-- 4) Enum values in database order
SELECT
  t.typname AS enum_name,
  e.enumsortorder,
  e.enumlabel AS enum_value
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;

-- 5) Indexes
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 6) Primary, unique and foreign-key constraints
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.constraint_schema = kcu.constraint_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
 AND tc.constraint_schema = ccu.constraint_schema
WHERE tc.constraint_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position;

-- 7) Prisma migration-history presence. This is deliberately safe if the table does not exist.
SELECT to_regclass('public._prisma_migrations') AS prisma_migrations_table;

-- 8) Explicit critical objects that have previously drifted.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='PatientInBlock' AND column_name='patientEmail'
  ) AS patient_email_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='PatientInBlock' AND column_name='patientPhone'
  ) AS patient_phone_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='PatientInBlock' AND column_name='preanesthesiaAppointmentAt'
  ) AS preanesthesia_appointment_exists,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='BlockOpeningPlan'
  ) AS block_opening_plan_exists,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='ProgrammingRule'
  ) AS programming_rule_exists,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='UserAuditEvent'
  ) AS user_audit_event_exists;
