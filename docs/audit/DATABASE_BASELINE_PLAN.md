# DATABASE_BASELINE_PLAN.md

**Objetivo:** reconciliar Git ↔ `schema.prisma` ↔ `prisma/migrations` ↔ BD producción (Supabase/Neon) **sin pérdida de datos**.  
**Estado:** PROPUESTA — **NO EJECUTAR** hasta autorización explícita.  
**Prohibido:** `migrate reset`, `db push` a prod, DROP, force push, borrar ramas.

---

## Principios

1. Primero **observar** (solo lectura).  
2. Diff en **clon/staging**, nunca improvisar en prod.  
3. Preferir `prisma migrate resolve` + SQL revisado frente a push.  
4. Toda acción sobre prod exige **backup/snapshot** previo.  
5. Después del baseline: **solo** `migrate deploy` (adiós `db push` en prod).

---

## Fase 0 — Preparación (sin tocar datos)

- [ ] Confirmar proyecto Vercel oficial: `bloque-quirurgico-covadonga`.  
- [ ] Confirmar URL BD Production (pooled vs direct).  
- [ ] Snapshot / PITR de Supabase o Neon.  
- [ ] Crear **rama de trabajo** tipo `chore/db-baseline` desde checkpoint acordado.  
- [ ] Crear **BD clon** (branch Neon / dump restore a staging).  
- [ ] Documentar quién ejecuta y ventana de mantenimiento (puede ser 0 downtime si solo `resolve`).

---

## Fase 1 — Inventario solo lectura (prod + clon)

En **clon** (preferible) o prod con usuario read-only:

```bash
# A) Schema real → archivo scratch (NO sobrescribir schema.prisma del repo)
npx prisma db pull --schema prisma/schema.prod-introspected.prisma

# B) Estado de migraciones
npx prisma migrate status
```

También anotar:

```sql
SELECT migration_name, finished_at, applied_steps_count
FROM "_prisma_migrations"
ORDER BY finished_at;
```

Si la tabla no existe → confirma historia `db push` → causa clásica de **P3005**.

Checklist de columnas críticas:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'PatientInBlock'
ORDER BY ordinal_position;
```

Verificar especialmente: `patientEmail`, `patientPhone`, statuses, `preanesthesiaAppointmentAt`, `isDeferredUrgency`, `specialCircuitReason`.

Verificar tablas: `User`, `Reservation`, `BlockOpeningPlan`, `ProgrammingRule`, `UserAuditEvent`, `ReleaseNotificationLog`.

Verificar enum `ReservationEventType` values.

**Salida de esta fase:** informe DIFF (prod vs `schema.prisma` actual).

---

## Fase 2 — Clasificar el DIFF

| Caso | Acción segura |
|------|----------------|
| Columna en schema y en BD | OK |
| Columna en schema, falta en BD | SQL `ADD COLUMN` revisado (idempotente) en clon → test app → luego prod |
| Columna en BD, no en schema | Decidir: añadir a schema o ignorar documentado |
| Tabla en schema, falta en BD | Crear vía migración nueva (no push ciego) |
| Tabla en BD, no en schema | No borrar; documentar o mapear |
| Enum value falta | `ALTER TYPE … ADD VALUE` (no transaccional en PG antiguo — planificar) |
| Migración en Git, ya aplicada manualmente | `prisma migrate resolve --applied "<name>"` |
| Migración en Git, no aplicada, columnas ya existen | `resolve --applied` (no re-ejecutar phase2) |
| Migración en Git, no aplicada, columnas faltan | `migrate deploy` **solo** tras backup y en orden |

---

## Fase 3 — Baseline en clon (ensayo completo)

### Opción recomendada (BD existente con push)

1. Alinear clon al schema deseado con **SQL explícito** o una migración “delta” revisada.  
2. Generar **migración baseline squash** que represente el schema completo actual (solo para historial futuro), **sin ejecutar CREATE** destructivo sobre tablas existentes.  
3. Marcar baseline + phase1/phase2 como aplicadas:

```bash
npx prisma migrate resolve --applied "20260502143000_surgical_patient_circuit_phase1"
npx prisma migrate resolve --applied "20260502160000_preanesthesia_phase2"
# + resolve del baseline squash si se crea
```

4. Verificar:

```bash
npx prisma migrate status   # sin pendientes inesperados
npx prisma generate
# smoke tests app contra clon
```

5. Probar flujo que antes rompió: `GET/POST /api/reservations` con pacientes + `patientEmail`.

### Opción B (solo piloto, no preferida a largo plazo)

Seguir con `db push` documentado y tratar las 2 migraciones como docs. **Rechazada** como estrategia de hospital real.

---

## Fase 4 — Aplicar a producción (solo tras OK en clon)

1. Backup/snapshot.  
2. Congelar deploys (opcional pero recomendable).  
3. Aplicar **exactamente** el mismo SQL/delta validado en clon.  
4. `migrate resolve` / `migrate deploy` según el plan del ensayo (no improvisar).  
5. Smoke producción: login, listar reservas, crear/editar paciente con email, cancel, cron dry-run si aplica.  
6. Actualizar docs: prohibir `db push` en prod; añadir scripts `db:migrate:status`, `db:migrate:deploy`.

---

## Fase 5 — Gobernanza futura

| Regla | Detalle |
|-------|---------|
| Dev | `prisma migrate dev` para cambios de schema |
| CI/Preview | `migrate deploy` contra BD preview |
| Prod | Solo `migrate deploy` en release |
| Prohibido | ALTER manual en dashboard; `db push` prod; reset |
| Drift check | Job semanal `migrate status` + diff introspect |

Actualizar: `docs/PILOTO.md`, `docs/DEPLOY-VERCEL.md`, `docs/SETUP_BACKEND.md`, `package.json` scripts.

---

## Por qué apareció P3005 / P2022 (recordatorio)

| Error | Causa | Mitigación |
|-------|-------|------------|
| P3005 | `migrate deploy` sobre BD no vacía sin historial | Baseline + `resolve` |
| P2022 | Client espera columna inexistente | Alinear BD↔schema con migración/SQL; no parches sueltos indefinidos |

---

## Rollback

| Paso | Rollback |
|------|----------|
| Solo `migrate resolve` (marcas) | Revertir filas en `_prisma_migrations` con SQL cuidadoso + backup |
| `ADD COLUMN` nullable | Dejar columna (seguro) o drop solo si vacío y autorizado |
| `ADD COLUMN` NOT NULL + default | Reversible con cuidado; preferir nullable primero |
| Enum ADD VALUE | En PostgreSQL **no se puede quitar** fácilmente un enum value → planir irreversible |

---

## Criterios de aceptación del baseline

- [ ] `migrate status` limpio en clon y prod.  
- [ ] App smoke OK incluyendo `patientEmail`.  
- [ ] Cero ALTER manuales posteriores.  
- [ ] Docs y scripts alineados.  
- [ ] Proyecto Vercel oficial documentado.  
- [ ] Backup verificado restaurable (al menos un drill en staging).

---

## Qué NO hacer en esta auditoría

- Ejecutar cualquiera de los comandos anteriores contra producción.  
- `prisma migrate reset`.  
- `prisma db push` a prod.  
- Borrar el proyecto Vercel duplicado.
