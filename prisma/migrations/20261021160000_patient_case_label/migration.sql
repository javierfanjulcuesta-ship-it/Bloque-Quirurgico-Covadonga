-- Los identificadores de paciente salen de la base.
-- La etiqueta Caso N no se calcula a partir del nombre ni de la historia.

ALTER TABLE "PatientInBlock" ADD COLUMN IF NOT EXISTS "caseLabel" TEXT;
UPDATE "PatientInBlock"
SET "caseLabel" = 'Caso ' || (COALESCE("orderIndex", 0) + 1)::text
WHERE "caseLabel" IS NULL OR btrim("caseLabel") = '';
ALTER TABLE "PatientInBlock" ALTER COLUMN "caseLabel" SET NOT NULL;
ALTER TABLE "PatientInBlock" DROP COLUMN IF EXISTS "historyNumber";
ALTER TABLE "PatientInBlock" DROP COLUMN IF EXISTS "fullName";
ALTER TABLE "PatientInBlock" DROP COLUMN IF EXISTS "patientEmail";
ALTER TABLE "PatientInBlock" DROP COLUMN IF EXISTS "patientPhone";

ALTER TABLE "ScheduleChange" DROP COLUMN IF EXISTS "beforeJson";
ALTER TABLE "ScheduleChange" DROP COLUMN IF EXISTS "afterJson";

ALTER TABLE "OutboundDraft" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
UPDATE "OutboundDraft"
SET "expiresAt" = "createdAt" + interval '7 days'
WHERE "expiresAt" IS NULL;
ALTER TABLE "OutboundDraft" ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE OR REPLACE FUNCTION qx_strip_patient_keys(value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  key text;
  elem jsonb;
  arr jsonb := '[]'::jsonb;
BEGIN
  IF value IS NULL OR jsonb_typeof(value) = 'null' THEN
    RETURN 'null'::jsonb;
  ELSIF jsonb_typeof(value) = 'object' THEN
    FOR key IN SELECT k FROM jsonb_object_keys(value) AS k
    LOOP
      IF lower(key) IN (
        'historynumber', 'numerohistoria', 'historia', 'fullname', 'patientname',
        'patientphone', 'patientemail', 'initials', 'dni', 'nie', 'nif'
      ) THEN
        CONTINUE;
      END IF;
      result := result || jsonb_build_object(key, qx_strip_patient_keys(value -> key));
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(value) = 'array' THEN
    FOR elem IN SELECT e FROM jsonb_array_elements(value) AS e
    LOOP
      arr := arr || jsonb_build_array(qx_strip_patient_keys(elem));
    END LOOP;
    RETURN arr;
  ELSE
    RETURN value;
  END IF;
END;
$$;

UPDATE "Proposal"
SET "payloadJson" = qx_strip_patient_keys("payloadJson"::jsonb)::text
WHERE "payloadJson" IS NOT NULL AND btrim("payloadJson") ~ '^[\[{]';

DROP FUNCTION qx_strip_patient_keys(jsonb);
