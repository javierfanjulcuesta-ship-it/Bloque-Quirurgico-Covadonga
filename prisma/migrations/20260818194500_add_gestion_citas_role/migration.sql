-- Code-only migration. Do not apply to production from the isolated DEMO workflow.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'GESTION_CITAS';
