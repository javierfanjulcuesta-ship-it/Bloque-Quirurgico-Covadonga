-- QxFlow production managed-schema verifier (READ ONLY)
-- This intentionally tolerates documented unmanaged legacy objects.
-- Expected after baseline resolve + reconciliation migration.

WITH expected_tables(name) AS (
  VALUES
    ('User'),
    ('Reservation'),
    ('ReservationEvent'),
    ('AnesthetistAssignment'),
    ('PatientInBlock'),
    ('EmailMessage'),
    ('EmailProcessingLog'),
    ('ContactMessage'),
    ('ReleaseNotificationLog'),
    ('BlockOpeningPlan'),
    ('ProgrammingRule'),
    ('UserAuditEvent')
),
missing_tables AS (
  SELECT e.name
  FROM expected_tables e
  LEFT JOIN information_schema.tables t
    ON t.table_schema = 'public'
   AND t.table_name = e.name
   AND t.table_type = 'BASE TABLE'
  WHERE t.table_name IS NULL
),
expected_event_values(value) AS (
  VALUES
    ('RESERVATION_CREATED'),
    ('RESERVATION_CREATED_FROM_EMAIL'),
    ('RESERVATION_UPDATED'),
    ('RESERVATION_CANCELLED'),
    ('RESERVATION_RELEASED'),
    ('AUTO_RELEASE_TO_COMMON_POOL'),
    ('RESERVATION_REJECTED_CONFLICT'),
    ('RESERVATION_PATIENT_UPDATED'),
    ('RESERVATION_PATIENT_REPLACED'),
    ('RESERVATION_PATIENT_CANCELLED'),
    ('PATIENT_WORKFLOW_STARTED'),
    ('PREANESTHESIA_PENDING'),
    ('PATIENT_NOTIFICATION_DRY_RUN_CREATED'),
    ('ADMIN_NOTIFICATION_DRY_RUN_CREATED'),
    ('ADMIN_NOTIFICATION_SKIPPED_NO_EMAIL'),
    ('PATIENT_SURGICAL_CIRCUIT_SUSPENDED'),
    ('PREANESTHESIA_APPOINTMENT_ASSIGNED'),
    ('DEFERRED_URGENCY_CREATED'),
    ('PREANESTHESIA_NO_SLOT_AVAILABLE')
),
actual_event_values AS (
  SELECT e.enumlabel::text AS value
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'ReservationEventType'
),
missing_event_values AS (
  SELECT e.value
  FROM expected_event_values e
  LEFT JOIN actual_event_values a ON a.value = e.value
  WHERE a.value IS NULL
)
SELECT
  (SELECT COUNT(*) FROM missing_tables) AS missing_managed_tables,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='PatientInBlock' AND column_name='preanesthesiaAppointmentAt'
  ) AS preanesthesia_appointment_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='PatientInBlock' AND column_name='isDeferredUrgency'
  ) AS deferred_urgency_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='PatientInBlock' AND column_name='specialCircuitReason'
  ) AS special_circuit_reason_exists,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='PatientInBlock'
      AND indexname='PatientInBlock_preanesthesiaAppointmentAt_idx'
  ) AS preanesthesia_index_exists,
  (SELECT COUNT(*) FROM missing_event_values) AS missing_reservation_event_values,
  (SELECT COUNT(*) FROM actual_event_values) AS reservation_event_value_count,
  (to_regclass('public._prisma_migrations') IS NOT NULL) AS prisma_migration_history_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Reservation' AND column_name='externalSurgeonName'
  ) AS preserved_external_surgeon_name,
  (
    SELECT COUNT(*) = 5
    FROM information_schema.tables
    WHERE table_schema='public'
      AND table_type='BASE TABLE'
      AND table_name IN ('added_users','assignments','festivos','passwords','reservations')
  ) AS preserved_legacy_tables;
