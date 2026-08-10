# Lógica de negocio y trazabilidad

**Score robustez/reglas:** ~48–55/100 combinado

---

## 1. Reglas auditadas

### Solapamientos / overflow
- `overflowConflicts.ts`: duración efectiva = procedimiento + **10 min** transición (`TRANSITION_MINUTES_PER_PROCEDURE`).
- Bloquea invasión de slots posteriores con pacientes.
- Contigüidad mismo titular: tratada en checks de invader.
- Norma editable `transition_minutes` en UI **no** sustituye la constante en runtime.

### Doble reserva
- Defensa BD: `@@unique([date, resourceId, shift, slotIndex])`.
- App: detecta ocupado; captura **P2002** → `slot_occupied`.
- Hold vacío mismo cirujano: puede añadir pacientes; otro cirujano: ocupado.

### Duración / buffers
- Buffer fijo 10 min por procedimiento en create/update/metrics/UI.
- Riesgo: divergencia si gestor cambia norma en BD.

### Cierre semanal
- `schedulingDeadline.ts`: jueves 00:00 (hora **local del host**, no Europe/Madrid explícito).
- Tras cierre: no “solo reservar” semana siguiente; sí programar en huecos libres.
- PENDING vacíos post-cierre → cron → RELEASED + email cirujanos.
- Último paciente cancelado post-cierre → RELEASED; antes → PENDING retenido.

### Cancelaciones
- Reserva completa: exige `force` si hay pacientes; borra pacientes; CANCELLED.
- Paciente individual: txn + reglas de retención.
- UI: confirmaciones en cirujano.

### Pacientes / programación
- Resolución `cualquier-quirofano` a un OR libre.
- Endoscopista limitado a ciertos recursos.
- Circuito phase2: autocita preanestesia (Madrid), urgencia diferida, notificaciones dry-run.

### Anestesistas
- PUT reemplaza todas las asignaciones en txn.
- Protección wipe si payload vacío y BD no vacía.
- SESPA → solo `canSespa`.
- UI max 2 recursos/turno; confirmaciones por límites/indisponibilidad.
- Indisponibilidad **no** enforced en servidor.

### Urgencias / estados
- Estados: PENDING, CONFIRMED, RELEASED, CANCELLED.
- Reuso de filas CANCELLED/RELEASED al volver a reservar.
- `isDeferredUrgency` / special circuit.

### Apertura de bloque
- Modelo existe; API/lib stub → siempre OPEN. Feature no operativa.

---

## 2. Operaciones que deberían ser transaccionales

| Operación | Hoy | Debería |
|-----------|-----|---------|
| Create single slot + patients | Parcial (`$transaction`) | Mantener + lock/optimistic |
| Add patients to empty hold | Txn create patients + status; **count fuera** | Count/lock dentro |
| Multi-slot reserve/program | **N POSTs** | Batch txn o saga compensatoria |
| Cancel patient + status reserva | Txn | OK; valorar serialización |
| Cancel reservation force | Txn en helper | OK |
| Anesthetist PUT replace | Txn delete+create | OK; añadir versión |
| Cron release N reservas | Loop updates | Txn por lote o skip locked |
| Phase2 post-create | Tras txn | Idealmente misma txn o outbox |

---

## 3. Concurrencia — escenarios peligrosos

1. Dos cirujanos mismo hueco → unique ayuda; UX debe mostrar error claro.  
2. Dos adds concurrentes a PENDING vacío → **duplicar pacientes**.  
3. Multi-hueco: primer OK, segundo fail → huecos huérfanos.  
4. Dos gestores PUT asignaciones → last-write-wins.  
5. Cancel vs add patient simultáneo → orden determina resultado.  
6. Cron release vs cirujano programa en el mismo instante → race status.  
7. Overflow check TOCTOU vs otra reserva.

---

## 4. Trazabilidad (Quién / Qué / Cuándo / Antes / Después)

### Cubierto parcialmente vía `ReservationEvent`
Creación, update, cancel, release, auto-release, patient update/cancel, conflicts (email), circuit dry-runs, phase2 assigns.

### Campos
- Quién: `actorUserId` (a menudo).  
- Qué: `eventType` + `detailsJson`.  
- Cuándo: `createdAt`.  
- Antes/Después: **no estructurado** — no hay snapshot before/after completo.

### Huecos de auditoría

| Acción | ¿Evento? |
|--------|----------|
| Asignar/cambiar anestesista | **No** |
| Editar normas | **No** (solo updatedAt en rule) |
| Crear/baja usuarios | **No-op** `logUserAuditEvent` |
| Login/logout | **No** |
| Cambio cirujano de reserva | Parcial vía UPDATE genérico |
| Cambio quirófano/horario | Depende de si se modela como nueva reserva |
| Reapertura RELEASED→CONFIRMED | Via create reuse; evento CREATED/UPDATED |
| Lectura de PII (acceso) | **No** |
| `RESERVATION_PATIENT_REPLACED` / `PREANESTHESIA_PENDING` | Enum existe, **no emitidos** |

Histórico UI **no** lee `ReservationEvent`; filtra reservas.

### ¿Puede el sistema responder forense completo?
**No de forma fiable.** Puede aproximar ciclo de vida de reserva/paciente, no administración ni asignaciones ni accesos.

---

## 5. Recomendaciones (diseño)

1. Event sourcing ligero: before/after JSON en mutaciones críticas.  
2. Activar UserAudit + AnesthetistAssignmentEvent.  
3. Atomic multi-slot API.  
4. Cablear normas BD al motor o dejar de editarlas.  
5. Timezone Europe/Madrid único para deadlines.  
6. Tests de carrera en create/cancel/cron.
