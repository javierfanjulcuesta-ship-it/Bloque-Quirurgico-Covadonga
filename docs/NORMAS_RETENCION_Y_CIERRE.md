# Normas de retención y cierre de programación

## Regla funcional

- **CIRUJANO, GESTOR, GESTOR_ANESTESISTA** pueden cancelar un paciente dentro de su reserva y mantener el hueco (status PENDING) hasta el cierre.
- **ANESTESISTA** no tiene permiso `patient:cancel` → no puede cancelar pacientes.
- **Cierre**: jueves 00:00 de la semana anterior a la semana objetivo.
- **Antes del cierre**: al cancelar el último paciente → status PENDING (retención).
- **Después del cierre**: al cancelar el último paciente → status RELEASED (bolsa común).
- **Liberación automática**: reservas PENDING sin pacientes cuya semana ya pasó el cierre se liberan vía cron.
- **Notificación**: al liberar huecos automáticamente, se envía un correo agrupado a todos los usuarios con rol **CIRUJANO** (no ENDOSCOPISTA, ANESTESISTA ni otros). Solo fecha, turno y recurso; sin datos sensibles.

---

## Lógica actual

### Punto único de configuración

**`lib/schedulingDeadline.ts`** centraliza toda la lógica de cierre. Para cambiar el día u hora de cierre, modificar solo:

- `lib/constants.ts`: `SCHEDULING_DEADLINE_DAY = 4` (jueves, 0=Dom … 4=Jue)

### Funciones (`lib/schedulingDeadline.ts`, re-exportadas en `utils`)

- **`getDeadlineForSlotWeek(slotDateIso)`**: devuelve el instante de cierre (00:00) para la semana del slot.
- **`isNextWeekReserveClosed(slotDateIso)`**: true si el slot está en la semana siguiente y ya pasó el jueves 00:00 de la semana actual.
- **`isReservationRetentionStillAllowed(slotDateIso)`**: true si `now < jueves 00:00` de la semana anterior al slot.

### PATCH `/api/reservations/[id]/patient/cancel`

- Si `remainingCount === 0`:
  - `isReservationRetentionStillAllowed(date)` → PENDING
  - else → RELEASED, `releasedAt`, `releaseReason: "cierre_programacion_semana_objetivo"`

### Bloqueo de modificaciones

- Reservas con status **RELEASED** o **CANCELLED** no se pueden modificar.

### Slots libres

- **createReservationInDb**: si existe reserva CANCELLED o RELEASED en el slot, se reutiliza la fila (update).
- **getProgrammedMinutes**: solo cuenta PENDING y CONFIRMED.
- **GET /api/reservations**: solo devuelve PENDING y CONFIRMED (RELEASED/CANCELLED = slot libre).

---

## Cron: liberación automática y notificación

**POST /api/cron/release-pending-reservations**

- Encuentra reservas PENDING sin pacientes cuya semana objetivo ya pasó el cierre.
- Las marca como RELEASED (no se libera dos veces; idempotente).
- Evento `RESERVATION_RELEASED` por cada reserva.
- Evento `AUTO_RELEASE_TO_COMMON_POOL` para la tanda (auditoría).
- Si hay huecos liberados: envía **un correo agrupado** a todos los CIRUJANO (solo rol CIRUJANO, aprobados, con email válido).
- Registra en `ReleaseNotificationLog`: releasedCount, slotDetailsJson, recipientCount, emailStatus (SENT/FAILED/SKIPPED).
- Si el correo falla, la liberación no se revierte.

**Configuración Vercel** (`vercel.json`):

```json
{
  "crons": [
    {
      "path": "/api/cron/release-pending-reservations",
      "schedule": "5 0 * * 4"
    }
  ]
}
```

- `5 0 * * 4` = jueves a las 00:05 (evita solaparse con el minuto exacto).
- Variable de entorno: `CRON_SECRET` para autorizar la llamada.

**Cron externo** (alternativa):

```bash
curl -X POST https://tu-app.vercel.app/api/cron/release-pending-reservations \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `lib/utils.ts` | `isReservationRetentionStillAllowed()` |
| `app/api/reservations/[id]/patient/cancel/route.ts` | PENDING vs RELEASED, bloqueo RELEASED |
| `app/api/reservations/[id]/route.ts` | Bloqueo RELEASED |
| `app/api/reservations/[id]/patient/route.ts` | Bloqueo RELEASED |
| `app/api/reservations/[id]/cancel/route.ts` | Bloqueo RELEASED |
| `lib/blockOpeningPlan.ts` | getProgrammedMinutes: solo PENDING/CONFIRMED |
| `lib/reservations/createReservationInDb.ts` | Reutilizar slots CANCELLED/RELEASED |
| `app/api/reservations/route.ts` | GET: solo PENDING/CONFIRMED |
| `app/api/cron/release-pending-reservations/route.ts` | Liberación + envío correo a CIRUJANO |
| `lib/email/releaseNotificationEmail.ts` | Plantilla correo huecos liberados |
| `lib/email/outlookService.ts` | `sendReleaseNotificationToSurgeons()` |
| `prisma/schema.prisma` | `ReleaseNotificationLog`, evento `AUTO_RELEASE_TO_COMMON_POOL` |

---

## Ejemplo de correo a cirujanos

**Asunto:** 3 huecos disponibles – Bloque Quirúrgico

**Cuerpo:**

```
Estimado/a Dr./Dra.,

Se han liberado huecos de quirófano a la bolsa común tras el cierre de programación del jueves. Estos huecos están ahora disponibles para reservar:

• lunes, 17 de marzo de 2026 – Mañana – Q1
• lunes, 17 de marzo de 2026 – Tarde – Procedimientos menores
• martes, 18 de marzo de 2026 – Mañana – Q2

Puede consultar la programación y reservar en la aplicación del bloque quirúrgico.

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera
```

---

## Auditoría

- **RESERVATION_PATIENT_CANCELLED**: siempre al cancelar un paciente.
- **RESERVATION_RELEASED**: al liberar por deadline (cron o patient cancel).
- `detailsJson` incluye: `trigger`, `date`, `resourceId`, etc.
