# Diseño: Reservas y Pacientes – Cancelar / Sustituir

**Migración:** Ejecutar `npx prisma migrate dev` para aplicar los nuevos valores del enum `ReservationEventType`.

---

## 1. Estados de Reservation (Prisma)

Se mantiene el enum actual. Mapeo semántico:

| Prisma      | Significado                               | Equivalente |
|-------------|--------------------------------------------|-------------|
| PENDING     | Hueco reservado, sin pacientes (o tras cancelar último) | RESERVED    |
| CONFIRMED   | Hueco con al menos un paciente programado | PROGRAMMED  |
| CANCELLED   | Reserva completa cancelada                | CANCELLED   |
| RELEASED    | Liberado (legacy, se mantiene)            | -           |

Reglas:
- Cancelar paciente → borrar paciente, si quedan 0 pacientes → status = PENDING
- Sustituir/actualizar paciente → mantener reserva, status = CONFIRMED
- Cancelar reserva completa → status = CANCELLED

---

## 2. Reglas por rol

| Acción                      | CIRUJANO | ENDOSCOPISTA | ANESTESISTA | GESTOR | GESTOR_ANESTESISTA |
|----------------------------|----------|--------------|-------------|--------|--------------------|
| Actualizar reserva (propia) | ✓        | ✓            | ✗           | ✓ (todas) | ✓ (todas)        |
| Actualizar paciente (propio)| ✓        | ✓            | ✗           | ✓      | ✓                  |
| Cancelar paciente (propio) | ✓        | ✓            | ✗           | ✓      | ✓                  |
| Cancelar reserva (propia)  | ✓        | ✓            | ✗           | ✓      | ✓                  |
| Sobre reservas ajenas      | ✗        | ✗            | ✗           | ✓      | ✓                  |

ANESTESISTA solo puede ver reservas y programación; no puede modificar pacientes ni cancelar reservas.

---

## 3. Permisos

| Permiso        | Descripción                               | Roles                          |
|----------------|-------------------------------------------|--------------------------------|
| booking:update | Actualizar reserva (añadir/editar datos) | cirujano*, endoscopista*, gestor, gestor-anestesista |
| booking:cancel | Cancelar reserva completa                 | cirujano*, endoscopista*, gestor, gestor-anestesista |
| patient:update | Actualizar/sustituir paciente             | cirujano*, endoscopista*, gestor, gestor-anestesista |
| patient:cancel | Cancelar paciente de una reserva          | cirujano*, endoscopista*, gestor, gestor-anestesista |

\* Solo sobre reservas propias. Gestores sobre cualquiera.

---

## 4. Endpoints

| Método | Ruta                               | Descripción                         |
|--------|------------------------------------|-------------------------------------|
| PATCH  | /api/reservations/[id]             | Actualizar reserva (ej. añadir pacientes) |
| PATCH  | /api/reservations/[id]/patient     | Actualizar/sustituir un paciente    |
| PATCH  | /api/reservations/[id]/patient/cancel | Cancelar un paciente de la reserva |
| PATCH  | /api/reservations/[id]/cancel      | Cancelar reserva completa           |

---

## 5. Ejemplo de uso (API client)

```typescript
// Añadir pacientes a reserva existente (hueco reservado)
PATCH /api/reservations/{id}
Body: { patients: [{ historyNumber, procedure, estimatedDurationMinutes, anesthesiaType, insuranceType, ... }] }

// Actualizar un paciente
PATCH /api/reservations/{id}/patient
Body: { patientId, procedure?: string, ... }

// Cancelar un paciente
PATCH /api/reservations/{id}/patient/cancel
Body: { patientId, reason?: string }

// Cancelar reserva completa
PATCH /api/reservations/{id}/cancel
Body: { reason?: string }
```

---

## 6. Auditoría (ReservationEvent)

| EventType                    | Cuándo                        |
|-----------------------------|-------------------------------|
| RESERVATION_PATIENT_UPDATED  | Actualización de datos de paciente |
| RESERVATION_PATIENT_REPLACED | Sustitución de paciente por otro |
| RESERVATION_PATIENT_CANCELLED | Paciente eliminado de la reserva |
| RESERVATION_CANCELLED       | Reserva completa cancelada    |
