# 16 — Production schema reconciliation

**Estado:** preparado y validado solo en rama de hardening. **No aplicado a producción.**

## Evidencia de producción (snapshot read-only 2026-08-11)

El snapshot exportado desde Supabase SQL Editor contiene únicamente metadatos de esquema. No contiene filas clínicas.

### Hallazgos confirmados

- PostgreSQL: 17.6.
- `public._prisma_migrations`: **no existe**.
- Tablas Prisma actuales presentes: `User`, `Reservation`, `ReservationEvent`, `AnesthetistAssignment`, `PatientInBlock`, `EmailMessage`, `EmailProcessingLog`, `ContactMessage`, `ReleaseNotificationLog`, `BlockOpeningPlan`, `ProgrammingRule`, `UserAuditEvent`.
- Objetos legacy/no gestionados por `schema.prisma` presentes y que **NO se deben borrar** durante el baseline: `added_users`, `assignments`, `festivos`, `passwords`, `reservations`.
- Columna legacy/no gestionada presente: `Reservation.externalSurgeonName`. Se preserva; no forma parte del Prisma Client actual.

### Drift Prisma → producción confirmado

`PatientInBlock` carece de tres campos que el Prisma Client actual espera:

- `preanesthesiaAppointmentAt TIMESTAMP(3) NULL`
- `isDeferredUrgency BOOLEAN NOT NULL DEFAULT false`
- `specialCircuitReason TEXT NULL`

Por tanto también falta el índice:

- `PatientInBlock_preanesthesiaAppointmentAt_idx`

El enum `ReservationEventType` tiene **11 valores en producción**, mientras `schema.prisma` tiene **19**. Faltan:

1. `PREANESTHESIA_PENDING`
2. `PATIENT_NOTIFICATION_DRY_RUN_CREATED`
3. `ADMIN_NOTIFICATION_DRY_RUN_CREATED`
4. `ADMIN_NOTIFICATION_SKIPPED_NO_EMAIL`
5. `PATIENT_SURGICAL_CIRCUIT_SUSPENDED`
6. `PREANESTHESIA_APPOINTMENT_ASSIGNED`
7. `DEFERRED_URGENCY_CREATED`
8. `PREANESTHESIA_NO_SLOT_AVAILABLE`

El código de fase 2 escribe directamente los tres campos ausentes y registra varios de esos valores enum; por tanto este drift puede producir errores Prisma `P2022`/errores de enum en ejecución.

En el resto de objetos Prisma gestionados, el snapshot de columnas, índices y claves coincide con el estado pre-reconciliación representado por el baseline preparado.

## Estrategia corregida

La propuesta anterior de marcar como aplicada una migración generada directamente desde el `schema.prisma` objetivo era incorrecta mientras producción no coincidiera con ese objetivo. Se sustituye por una cadena de dos pasos:

1. `0_baseline_production_20260811`
   - representa los objetos Prisma que **ya existen** en producción según el snapshot read-only;
   - no contiene los tres campos fase 2 ni los ocho valores enum ausentes;
   - en producción se **marca como aplicada**, nunca se ejecuta.

2. `20260811071500_reconcile_preanesthesia_phase2`
   - añade únicamente los tres campos ausentes, los ocho valores enum y el índice;
   - no borra, renombra ni reescribe datos existentes;
   - usa operaciones aditivas e idempotentes (`IF NOT EXISTS`) para tolerar estado parcial.

## Ensayo automático en CI

El workflow `database-baseline-artifact.yml` debe demostrar en PostgreSQL limpio:

1. que el baseline por sí solo reproduce exactamente los gaps observados;
2. que el baseline tiene 11 valores `ReservationEventType`;
3. que la cadena completa se aplica con `prisma migrate deploy`;
4. que al final existen los tres campos fase 2 y los 19 valores enum;
5. que `prisma migrate status` queda limpio;
6. que `prisma migrate diff` no detecta drift contra `schema.prisma`;
7. que tests P0, typecheck y build siguen pasando.

## Procedimiento de producción — NO EJECUTAR SIN AUTORIZACIÓN

### Precondiciones obligatorias

- snapshot/backup verificable de Supabase inmediatamente antes;
- confirmar proyecto Supabase correcto y `DIRECT_URL` de esa base;
- congelar cambios de esquema durante la ventana;
- rama/release exacta con esta cadena de migraciones;
- CI verde.

### Secuencia prevista

```bash
# 1) Observación
npx prisma migrate status

# 2) Crear historial sin ejecutar el baseline sobre tablas existentes
npx prisma migrate resolve --applied 0_baseline_production_20260811

# 3) Verificar que solo queda pendiente el delta aditivo
npx prisma migrate status

# 4) Aplicar el delta revisado
npx prisma migrate deploy

# 5) Verificación
npx prisma migrate status
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

### Smoke tests posteriores

- login con usuario activo;
- listado de reservas;
- creación/edición de paciente sin datos reales de prueba;
- circuito que persiste `preanesthesiaAppointmentAt`;
- urgencia diferida (`isDeferredUrgency`, `specialCircuitReason`);
- creación de eventos con los nuevos valores enum;
- confirmar que tablas legacy y `Reservation.externalSurgeonName` siguen intactas.

## Rollback

Las operaciones del delta son aditivas. Ante fallo funcional:

- detener despliegue de aplicación y volver al release anterior;
- **no** eliminar enum values automáticamente;
- mantener columnas nuevas (son compatibles hacia atrás y sus defaults son seguros);
- restaurar snapshot únicamente si existe corrupción o un incidente que lo justifique.

No ejecutar `migrate reset`, `db push` ni `DROP` en producción.

## Criterio de cierre P0 DB

Este P0 solo puede darse por cerrado cuando:

- CI de la cadena completa está verde;
- existe backup de producción;
- baseline está marcado como aplicado;
- delta está aplicado con `migrate deploy`;
- `migrate status` y diff quedan limpios;
- smoke tests pasan;
- no se ha eliminado ningún objeto legacy.
