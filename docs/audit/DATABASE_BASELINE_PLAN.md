# DATABASE_BASELINE_PLAN.md

**Objetivo:** reconciliar Git ↔ `schema.prisma` ↔ migraciones ↔ Supabase producción sin pérdida de datos.

**Estado:** cadena preparada y ensayada en CI; **NO aplicada a producción**.

**Prohibido:** `prisma db push` en producción, `prisma migrate reset`, `DROP` improvisados, force push de release.

## 1. Evidencia confirmada

Snapshot read-only de Supabase obtenido el 2026-08-11:

- PostgreSQL 17.6.
- `public._prisma_migrations` no existe: la base fue evolucionada fuera de Prisma Migrate / mediante `db push` o cambios equivalentes.
- Las 12 tablas actualmente modeladas por Prisma existen.
- Existen cinco tablas legacy no modeladas por Prisma: `added_users`, `assignments`, `festivos`, `passwords`, `reservations`.
- Existe `Reservation.externalSurgeonName`, columna legacy no modelada por Prisma.
- `PatientInBlock` carece de `preanesthesiaAppointmentAt`, `isDeferredUrgency` y `specialCircuitReason`.
- Falta el índice `PatientInBlock_preanesthesiaAppointmentAt_idx`.
- `ReservationEventType` tiene 11 valores en producción y 19 en `schema.prisma`.

Detalle reproducible: `docs/audit/16_PRODUCTION_SCHEMA_RECONCILIATION.md`.

## 2. Decisión de baseline

No se debe marcar como aplicado un baseline generado directamente desde el `schema.prisma` objetivo, porque producción todavía no coincide con ese objetivo.

La cadena correcta es:

### `0_baseline_production_20260811`

Representa únicamente el estado **Prisma-managed** ya existente en producción según el snapshot.

En producción:

- **NO se ejecuta**;
- se marca como aplicado con `prisma migrate resolve` tras backup y verificación.

No modela ni elimina los objetos legacy.

### `20260811071500_reconcile_preanesthesia_phase2`

Delta aditivo que lleva el baseline al `schema.prisma` actual:

- añade 8 valores a `ReservationEventType`;
- añade 3 columnas a `PatientInBlock`;
- añade el índice de cita preanestesia.

No contiene `DROP`, renames ni transformación destructiva de datos.

## 3. Ensayo obligatorio

GitHub Actions ejecuta PostgreSQL limpio y verifica:

1. el baseline aislado reproduce los gaps observados;
2. la cadena completa se aplica con `prisma migrate deploy`;
3. `prisma migrate status` queda limpio;
4. en una base limpia el schema final coincide con `schema.prisma`;
5. existen las columnas/enum esperados;
6. tests P0, typecheck y build siguen pasando;
7. `db:push` permanece bloqueado en CI.

Ninguna acción del CI conecta con Supabase producción.

## 4. Precondiciones para producción

Antes de cualquier escritura:

- [ ] CI verde en el commit exacto a liberar.
- [ ] Backup/snapshot de Supabase creado inmediatamente antes.
- [ ] Capacidad de restauración confirmada.
- [ ] `DATABASE_URL`/`DIRECT_URL` verificadas contra el proyecto correcto sin compartir secretos.
- [ ] Ventana sin otros cambios de esquema.
- [ ] Snapshot read-only repetido si ha pasado tiempo o ha habido cambios desde 2026-08-11.
- [ ] Revisión final del SQL de ambas migraciones.

## 5. Secuencia prevista de producción

Ejecutar desde el release aprobado y con `DIRECT_URL` de producción:

```bash
# Estado inicial: se espera ausencia de historial en base no vacía
npx prisma migrate status

# Crear historial declarando que el baseline ya existe físicamente
npx prisma migrate resolve --applied 0_baseline_production_20260811

# Debe quedar pendiente únicamente el delta de reconciliación
npx prisma migrate status

# Aplicar el delta
npx prisma migrate deploy

# Verificación del historial
npx prisma migrate status
```

**No exigir un `prisma migrate diff` global vacío en producción.** La base conserva objetos legacy no modelados deliberadamente; un diff global puede proponer eliminarlos.

Verificar los objetos gestionados y la preservación del legacy ejecutando en Supabase SQL Editor:

```text
scripts/db/verify-production-managed-schema.sql
```

Resultado esperado:

- `missing_managed_tables = 0`
- `preanesthesia_appointment_exists = true`
- `deferred_urgency_exists = true`
- `special_circuit_reason_exists = true`
- `preanesthesia_index_exists = true`
- `missing_reservation_event_values = 0`
- `reservation_event_value_count = 19`
- `prisma_migration_history_exists = true`
- `preserved_external_surgeon_name = true`
- `preserved_legacy_tables = true`

Si el estado observado difiere de lo esperado, **detenerse**. No improvisar `resolve`, `db push` ni SQL manual adicional.

## 6. Smoke tests tras migración

Usar datos ficticios, nunca pacientes reales de prueba:

- login usuario activo;
- usuario desactivado no conserva sesión;
- listar reservas;
- crear/editar un paciente ficticio;
- persistir cita `preanesthesiaAppointmentAt`;
- flujo urgencia diferida (`isDeferredUrgency`, `specialCircuitReason`);
- registrar los nuevos tipos de `ReservationEventType`;
- confirmar que tablas legacy y `Reservation.externalSurgeonName` siguen presentes.

## 7. Rollback

El delta es aditivo. Si la aplicación presenta un problema después:

- revertir el release de aplicación;
- no intentar quitar enum values automáticamente;
- mantener las columnas nuevas si no hay corrupción: son compatibles hacia atrás;
- restaurar snapshot solo ante incidente que lo justifique.

Nunca ejecutar `migrate reset` en producción.

## 8. Gobernanza futura

| Entorno | Regla |
|---|---|
| Desarrollo | `prisma migrate dev` para nuevos cambios de schema |
| CI/staging | `prisma migrate deploy` sobre PostgreSQL aislado |
| Producción | `prisma migrate deploy` sobre migraciones revisadas |
| Prohibido | `db push` en prod, ALTER manual improvisado, reset |

Toda migración nueva debe pasar por CI y revisión antes de release.

## 9. Criterio de cierre P0

- [ ] baseline marcado como aplicado en producción;
- [ ] delta aplicado;
- [ ] `migrate status` limpio;
- [ ] verificador de esquema gestionado OK;
- [ ] smoke tests OK;
- [ ] objetos legacy intactos;
- [ ] documentación de deploy ya no recomienda `db push`.
