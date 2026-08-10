# Base de datos y Prisma

**Estado:** CRÍTICO/FRÁGIL para gobernanza de schema  
**Score sugerido:** 35/100  
**Plan de reconciliación:** ver `DATABASE_BASELINE_PLAN.md`

---

## 1. Situación real

| Hecho | Detalle |
|-------|---------|
| Provider | PostgreSQL (`DATABASE_URL` + `DIRECT_URL`) |
| Schema | Maduro y amplio en `prisma/schema.prisma` |
| Migraciones en Git | **Solo 2** ALTER (phase1 circuit, phase2 preanestesia) |
| Creación histórica | **`prisma db push`** documentado en PILOTO/DEPLOY/SETUP |
| `_prisma_migrations` | Muy probable incompleta/vacía en prod → **P3005** al `migrate deploy` |
| P2022 observado | `PatientInBlock.patientEmail` esperado por Prisma, ausente en BD hasta fix manual |
| Fix manual | Columna añadida a mano en Supabase — **no es estrategia sostenible** |
| Rama actual | Checkpoint `c905836` incluye phase2 en schema + migración |

---

## 2. Modelos y puntos sensibles

### Reservas
- `Reservation` unique `(date, resourceId, shift, slotIndex)` — defensa principal anti doble reserva.
- `anesthetistId` es **String?** sin FK.
- Cascada: pacientes se borran con reserva (`onDelete: Cascade`).

### Pacientes (`PatientInBlock`)
Campos clínicos/contacto:
- `historyNumber`, `fullName`, `procedure`, duraciones, `anesthesiaType`, `insuranceType`, `admissionType`, `notes`, `solicitudRecursos`
- Contacto: **`patientEmail`**, `patientPhone`
- Circuito: `workflowStatus`, `preanesthesiaStatus`, `financingStatus`, `preanesthesiaAppointmentAt`, `isDeferredUrgency`, `specialCircuitReason`

### Auditoría
- `ReservationEvent` — usado de verdad.
- `UserAuditEvent` — **en schema**, pero `src/lib/userAudit.ts` es **no-op** (“no existe en schema desplegado”).
- `EmailProcessingLog`, `ReleaseNotificationLog` — logs de email/liberación.

### Otros
- `AnesthetistAssignment`, `ProgrammingRule`, `BlockOpeningPlan`, `ContactMessage`, `EmailMessage`.

---

## 3. Migraciones existentes

### `20260502143000_surgical_patient_circuit_phase1`
- ADD `patientEmail`, `patientPhone`, statuses (con `IF NOT EXISTS`)
- Backfill + NOT NULL defaults
- ADD VALUES enum eventos phase1

### `20260502160000_preanesthesia_phase2`
- ADD `preanesthesiaAppointmentAt`, `isDeferredUrgency`, `specialCircuitReason` (**sin** `IF NOT EXISTS`)
- Enum phase2 + índice `preanesthesiaAppointmentAt`

**No hay** migración `CREATE TABLE` del resto del esquema.

---

## 4. Respuestas a las 10 preguntas críticas

1. **Qué migraciones existen:** las dos anteriores + `migration_lock.toml` (postgresql).  
2. **Cuáles parecen aplicadas:** desconocido sin inspeccionar `_prisma_migrations` en prod (fuera de alcance destructivo). Si hubo P2022, **phase1 no estaba aplicada** en ese momento; luego se añadió columna a mano.  
3. **Por qué P3005:** BD no vacía creada/evolucionada con `db push`, sin historial de migraciones que Prisma reconozca.  
4. **Por qué P2022:** Prisma Client generado desde schema con `patientEmail`; BD sin esa columna.  
5. **¿schema = prod?** **No garantizado.** Historial git muestra alineaciones reactivas (`isActive` removido, modelos deshabilitados temporalmente).  
6. **Cambios schema sin migración:** casi todo lo pre-phase1 (`canSespa`, soft-delete, BlockOpeningPlan, ProgrammingRule, ReleaseNotificationLog, UserAuditEvent, enums…).  
7. **Migraciones vs realidad:** phase2 puede fallar si columnas ya existen (manual/push).  
8. **¿db push histórico?** **Sí, explícito** en docs y `package.json` (`db:push`, `db:setup`).  
9. **Riesgo pérdida de datos:** alto si alguien hace `migrate reset` / `db push --force-reset` / DROP. Bajo si solo se lee/diff/baseline con `resolve`.  
10. **Baseline correcto:** ver `DATABASE_BASELINE_PLAN.md` (sin tocar prod en esta auditoría).

---

## 5. Columnas que Prisma espera y podrían faltar en BD

Prioridad alta (ya causaron o pueden causar P2022):

| Columna / objeto | Origen |
|------------------|--------|
| `PatientInBlock.patientEmail` | phase1 |
| `PatientInBlock.patientPhone` | phase1 |
| `PatientInBlock.workflowStatus` | phase1 |
| `PatientInBlock.preanesthesiaStatus` | phase1 |
| `PatientInBlock.financingStatus` | phase1 |
| `PatientInBlock.preanesthesiaAppointmentAt` | phase2 |
| `PatientInBlock.isDeferredUrgency` | phase2 |
| `PatientInBlock.specialCircuitReason` | phase2 |
| Índice `PatientInBlock_preanesthesiaAppointmentAt_idx` | phase2 |
| Enum values circuit/preanestesia | phase1/2 |

Si prod nunca recibió `db push` post-commits de soft-delete / normas / apertura:

| Objeto | Riesgo |
|--------|--------|
| `User.canSespa`, `deletedAt`, `deletedByUserId`, `deletionReason` | P2022 / features rotas |
| Tablas `BlockOpeningPlan`, `ProgrammingRule`, `ReleaseNotificationLog`, `UserAuditEvent` | P2021 / rutas 500 |
| Enums `AUTO_RELEASE_TO_COMMON_POOL`, patient events | fallos al insertar eventos |

---

## 6. Constraints e índices relevantes

| Constraint | Efecto |
|------------|--------|
| Unique slot | Anti doble reserva (P2002 → `slot_occupied`) |
| Unique email User | Anti usuarios duplicados |
| Unique assignment `(date,shift,type,resource)` | Una asignación por recurso/turno |
| Unique ProgrammingRule.key | Normas por clave |
| Cascade PatientInBlock | Borrar reserva borra pacientes |
| Cascade Assignment→User | Borrar usuario borra asignaciones (**cuidado**) |
| Sin unique NH+reserva | Mismo historyNumber repetible |

---

## 7. Raw SQL

Único uso: `scripts/migrate-roles-to-enum.ts` con `$executeRawUnsafe` y placeholders `?` (estilo SQLite) — **probable incorrecto en Postgres**. No usar en prod.

---

## 8. Conclusión

El schema de código **adelanta** a la gobernanza de migraciones.  
La columna `patientEmail` manual es síntoma, no cura.  
**Prohibido** seguir con ALTER manuales.  
Siguiente paso autorizado debe ser el plan de baseline, en clon/staging primero.
