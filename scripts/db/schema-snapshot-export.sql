-- QxFlow production schema snapshot (READ ONLY)
-- One-row JSON export for comparing Supabase production with Prisma.
-- Contains schema metadata only; it does not read application row data.

SELECT jsonb_build_object(
  'environment', jsonb_build_object(
    'database_name', current_database(),
    'current_schema', current_schema(),
    'postgres_version', current_setting('server_version')
  ),
  'tables', COALESCE((
    SELECT jsonb_agg(t.table_name ORDER BY t.table_name)
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
  ), '[]'::jsonb),
  'columns', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'table', c.table_name,
        'position', c.ordinal_position,
        'column', c.column_name,
        'data_type', c.data_type,
        'udt_name', c.udt_name,
        'nullable', c.is_nullable,
        'default', c.column_default
      )
      ORDER BY c.table_name, c.ordinal_position
    )
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
  ), '[]'::jsonb),
  'enums', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'enum', t.typname,
        'order', e.enumsortorder,
        'value', e.enumlabel
      )
      ORDER BY t.typname, e.enumsortorder
    )
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
  ), '[]'::jsonb),
  'indexes', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'table', i.tablename,
        'index', i.indexname,
        'definition', i.indexdef
      )
      ORDER BY i.tablename, i.indexname
    )
    FROM pg_indexes i
    WHERE i.schemaname = 'public'
  ), '[]'::jsonb),
  'constraints', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'table', tc.table_name,
        'name', tc.constraint_name,
        'type', tc.constraint_type,
        'column', kcu.column_name,
        'foreign_table', ccu.table_name,
        'foreign_column', ccu.column_name
      )
      ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position
    )
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    LEFT JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.constraint_schema = ccu.constraint_schema
    WHERE tc.constraint_schema = 'public'
      AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
  ), '[]'::jsonb),
  'prisma_migrations_table', to_regclass('public._prisma_migrations'),
  'critical', jsonb_build_object(
    'patient_email_exists', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PatientInBlock' AND column_name='patientEmail'
    ),
    'patient_phone_exists', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PatientInBlock' AND column_name='patientPhone'
    ),
    'preanesthesia_appointment_exists', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PatientInBlock' AND column_name='preanesthesiaAppointmentAt'
    ),
    'block_opening_plan_exists', EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='BlockOpeningPlan'
    ),
    'programming_rule_exists', EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='ProgrammingRule'
    ),
    'user_audit_event_exists', EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='UserAuditEvent'
    )
  )
) AS schema_snapshot;
