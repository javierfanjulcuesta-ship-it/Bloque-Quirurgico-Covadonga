# Auditoría: Cierre de programación y cancelar paciente

## 1. Centralización de la lógica de cierre

### Archivos que usan scheduling deadline

| Archivo | Uso | Fuente |
|---------|-----|--------|
| `lib/schedulingDeadline.ts` | Definición central | Constantes |
| `lib/utils.ts` | Reexporta `isNextWeekReserveClosed`, `isReservationRetentionStillAllowed` | schedulingDeadline |
| `app/cirujano/page.tsx` | `isNextWeekReserveClosed`, `isReservationRetentionStillAllowed` | utils |
| `app/api/cron/release-pending-reservations/route.ts` | `isReservationRetentionStillAllowed` | utils |
| `app/api/reservations/[id]/patient/cancel/route.ts` | `isReservationRetentionStillAllowed` | utils |

### Constantes en `lib/constants.ts`

- `SCHEDULING_DEADLINE_DAY = 4` (jueves)
- `SCHEDULING_DEADLINE_HOUR = 0` (reservado)
- `SCHEDULING_DEADLINE_MINUTE = 0` (reservado)

### Inconsistencias detectadas

- Ninguna: toda la lógica pasa por `schedulingDeadline.ts` o por `utils` (reexportado).

---

## 2. Flujo UX: Cancelar paciente

### Respuesta de la API

`PATCH /api/reservations/[id]/patient/cancel` devuelve:

```json
{
  "reservation": { ... },
  "slotOutcome": "retained" | "released" | null
}
```

- `retained`: último paciente, antes del cierre → hueco PENDING
- `released`: último paciente, después del cierre → hueco RELEASED
- `null`: quedan más pacientes en la reserva

### Mensajes al cirujano

| Situación | Mensaje de éxito |
|-----------|------------------|
| slotOutcome = retained | "Paciente cancelado. El hueco se mantiene reservado a su nombre para que pueda programar otro paciente." |
| slotOutcome = released | "Paciente cancelado. Al haber pasado el cierre del jueves, el hueco ha pasado a la bolsa común y ya no está reservado." |
| slotOutcome = null | "Paciente cancelado correctamente." |

### Confirmación previa

- Si es el último paciente y antes del cierre: "Al ser el último paciente del hueco, el hueco se mantendrá reservado a su nombre para que pueda programar otro paciente."
- Si es el último paciente y después del cierre: "Al ser el último paciente y haber pasado el cierre del jueves, el hueco pasará a la bolsa común y quedará disponible para otros."

---

## 3. Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `lib/constants.ts` | `SCHEDULING_DEADLINE_HOUR`, `SCHEDULING_DEADLINE_MINUTE` |
| `lib/schedulingDeadline.ts` | Uso de constantes, derivación de offset |
| `app/api/reservations/[id]/patient/cancel/route.ts` | Campo `slotOutcome` en la respuesta |
| `lib/api/reservations.ts` | `cancelReservationPatient` devuelve `CancelPatientResult` |
| `lib/reservations.ts` | `cancelPatient` y wrapper |
| `app/cirujano/page.tsx` | Botón cancelar, confirmación, mensajes tras cancelar |
