# Trazabilidad y analítica de reservas

Instrumentación mínima para medir el flujo de reservas y optimizar el bloque quirúrgico.

---

## Estado actual (implementado)

| Componente | Estado |
|------------|--------|
| Modelo Reservation (origin, releasedAt, cancelledAt, etc.) | ✅ |
| Modelo ReservationEvent | ✅ |
| Eventos en creación desde app | ✅ |
| Eventos en creación desde email | ✅ |
| Eventos en conflicto (app y email) | ✅ |
| Cancelación / liberación / actualización | ⏳ Pendiente de flujo en la app |

---

## 1. Campos en Reservation (trazabilidad)

| Campo | Tipo | Uso |
|-------|------|-----|
| `origin` | `APP` \| `EMAIL` \| `GESTOR` | Origen de la reserva |
| `createdByUserId` | `String?` | Quién la creó (gestor puede crear en nombre de otro) |
| `updatedByUserId` | `String?` | Quién la modificó por última vez |
| `releasedAt` | `DateTime?` | Momento de liberación del hueco |
| `cancelledAt` | `DateTime?` | Momento de cancelación |
| `releaseReason` | `String?` | Motivo de liberación |
| `cancellationReason` | `String?` | Motivo de cancelación |

`createdByUserId` coincide con `surgeonId` en app y correo. Es útil cuando el gestor cree reservas en nombre de cirujanos.

---

## 2. Modelo ReservationEvent

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | String | Identificador único |
| `reservationId` | `String?` | Reserva asociada (null si rechazo) |
| `eventType` | ReservationEventType | Tipo de evento |
| `actorUserId` | `String?` | Usuario que realizó la acción |
| `origin` | `String?` | `"app"` \| `"email"` \| `"gestor"` en el momento del evento |
| `detailsJson` | `String?` | Contexto en JSON (slot, motivo, etc.) |
| `createdAt` | DateTime | Momento del evento |

**Eventos registrados:**

| Evento | Descripción | Cuándo se crea |
|--------|-------------|----------------|
| `RESERVATION_CREATED` | Reserva creada desde app | Creación exitosa vía API |
| `RESERVATION_CREATED_FROM_EMAIL` | Reserva creada desde correo | Creación exitosa vía webhook |
| `RESERVATION_UPDATED` | Reserva modificada | (pendiente) |
| `RESERVATION_CANCELLED` | Reserva cancelada | (pendiente) |
| `RESERVATION_RELEASED` | Reserva liberada | (pendiente) |
| `RESERVATION_REJECTED_CONFLICT` | Rechazo por hueco ocupado | Conflicto en app o correo |

---

## 3. Puntos donde se instrumenta

| Ubicación | Evento | Dato |
|-----------|--------|------|
| `createReservationInDb` (origin=APP) | `RESERVATION_CREATED` | `createdByUserId`, `origin`, slot en details |
| `createReservationInDb` (origin=EMAIL) | `RESERVATION_CREATED_FROM_EMAIL` | `createdByUserId`, `origin`, slot en details |
| `POST /api/reservations` (409) | `RESERVATION_REJECTED_CONFLICT` | `actorUserId`, `origin=app`, slot en details |
| `processIncomingEmail` (conflicto) | `RESERVATION_REJECTED_CONFLICT` | `actorUserId`, `origin=email`, slot en details |

**Pendiente (sin flujo implementado):**

- Cancelación: cuando exista el flujo, actualizar `cancelledAt`, `cancellationReason` y registrar `RESERVATION_CANCELLED`
- Liberación: cuando exista el flujo automático o manual, actualizar `releasedAt`, `releaseReason` y registrar `RESERVATION_RELEASED`
- Actualización: cuando exista edición de reserva, registrar `RESERVATION_UPDATED` y `updatedByUserId`

---

## 4. Métricas que se pueden calcular

| Métrica | Fuente |
|---------|--------|
| Reservas por canal | `Reservation.origin` |
| Conflictos por cirujano | `RESERVATION_REJECTED_CONFLICT` + `actorUserId` |
| Conflictos por slot | `RESERVATION_REJECTED_CONFLICT` + `detailsJson` (date, resourceId, shift, slotIndex) |
| Huecos más demandados | Slots en conflictos rechazados |
| Adopción del canal email | `RESERVATION_CREATED_FROM_EMAIL` por fecha |
| Tasa de liberación | `Reservation.releasedAt` no nulo |
| Tasa de cancelación | `Reservation.cancelledAt` no nulo |
| Motivos de liberación/cancelación | `releaseReason`, `cancellationReason` |
| Tiempo entre creación y fecha quirúrgica | `Reservation.createdAt` vs `Reservation.date` |
| Comportamiento por cirujano | Eventos + `Reservation.surgeonId` |
| Especialidad | (con User.especialidad si se añade) |

---

## 5. Migración

```bash
npx prisma migrate dev --name add_reservation_analytics
```

O para aplicar el esquema sin historial:

```bash
npx prisma db push
```
