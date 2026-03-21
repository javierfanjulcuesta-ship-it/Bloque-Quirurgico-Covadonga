# Propuesta: flujo MVP para producción

**Objetivo:** Definir el flujo ideal mínimo viable e incremental sobre el sistema actual.

**Base:** Auditoría en `AUDITORIA-FLUJO-CIRUJANO-RESERVA.md`.

---

## 1. Flujo ideal (4 fases)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. ALTA CIRUJANO                                                             │
│    Gestor crea usuario → envía invitación → cirujano recibe correo           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. SOLICITUD DE HUECO                                                        │
│    Cirujano entra en app → selecciona huecos → envía solicitud               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. COMPROBACIÓN DE DISPONIBILIDAD                                           │
│    Sistema verifica hueco libre → crea reserva o rechaza                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. CONFIRMACIÓN AL CIRUJANO                                                  │
│    Notificación en app + (opcional) correo de confirmación                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Fase 1: Alta del cirujano

### Pasos concretos

| # | Actor | Acción |
|---|-------|--------|
| 1 | Gestor | Entra en `/calendario` → pestaña "Crear usuario" |
| 2 | Gestor | Completa perfil, email, nombre (opcional) |
| 3 | Sistema | Valida y crea usuario en BD |
| 4 | Sistema | Envía correo de invitación con enlace + contraseña temporal |
| 5 | Cirujano | Recibe correo y accede por primera vez |

### Pantallas necesarias

| Pantalla | Estado actual | Cambio propuesto |
|----------|---------------|------------------|
| Crear usuario (gestor) | ✅ Existe `CrearNuevoUsuario` | Sin cambios |
| Login (cirujano) | ✅ Existe en `/` | Sin cambios |

### Endpoints necesarios

| Método | Ruta | Estado | Notas |
|--------|------|--------|-------|
| POST | `/api/users` | ✅ Existe | Mantener |
| POST | `/api/email/send-invitation` | ✅ Existe | Mantener |

### Validaciones

| Validación | Dónde | Estado |
|------------|-------|--------|
| Email obligatorio y válido | Front + API | ✅ |
| Email único | API | ✅ |
| Rol válido | API | ✅ |
| Sesión gestor | API | ✅ |

### Trazabilidad (incremental)

**Propuesta:** Añadir tabla `UserInvitation` o campos en `User`:

```prisma
// Opción A: campos en User (migración mínima)
model User {
  // ... existentes
  createdByUserId String?   // Quién lo creó (gestor)
  invitationSentAt DateTime? // Cuándo se envió el correo
}
```

**Alternativa sin migración:** Registrar en logs de aplicación (menos trazable en BD).

---

## 3. Fase 2: Solicitud de hueco

### Pasos concretos

| # | Actor | Acción |
|---|-------|--------|
| 1 | Cirujano | Login en `/` |
| 2 | Cirujano | Navega a `/cirujano` |
| 3 | Sistema | Carga calendario con huecos libres/ocupados (API) |
| 4 | Cirujano | Selecciona uno o varios huecos |
| 5 | Cirujano | Elige "Solo reservar" o "Programar pacientes" |
| 6 | Cirujano | Confirma → envía solicitud |

### Pantallas necesarias

| Pantalla | Estado actual | Cambio propuesto |
|----------|---------------|------------------|
| Login | ✅ `/` | Sin cambios |
| Dashboard cirujano | ✅ `/cirujano` | Sin cambios (ya usa `getReservations` correctamente) |
| Calendario semanal | ✅ `WeekGridCalendar`, `DaySlotGrid` | Sin cambios |
| Modal programar | ✅ `ProgramarPacientesModal` | Sin cambios |

### Endpoints necesarios

| Método | Ruta | Estado | Notas |
|--------|------|--------|-------|
| GET | `/api/reservations` | ✅ Existe | Mantener |
| POST | `/api/reservations` | ✅ Existe | Mantener |

### Validaciones (front)

| Validación | Dónde | Estado |
|------------|-------|--------|
| Semana siguiente cerrada | `isNextWeekReserveClosed` | ✅ |
| Mismo quirófano si varios slots | `resolveSlotsToSameRoom` | ✅ |
| Duración pacientes ≤ tiempo reservado | Modal | ✅ |

---

## 4. Fase 3: Comprobación de disponibilidad

### Pasos concretos (en servidor)

| # | Acción |
|---|--------|
| 1 | Recibir solicitud (POST /api/reservations) |
| 2 | Validar sesión y rol (cirujano/endoscopista) |
| 3 | Validar schema (fecha, recurso, turno, slot) |
| 4 | Consultar BD: ¿existe reserva en ese slot con status ≠ CANCELLED? |
| 5a | Si libre → crear reserva PENDING |
| 5b | Si ocupado → devolver 409 |

### Estados de reserva (MVP)

| Estado | Significado | Uso en MVP |
|--------|-------------|------------|
| `PENDING` | Reserva creada, pendiente de confirmación | **Reserva confirmada automáticamente** (sin aprobación gestor) |
| `CONFIRMED` | Confirmada explícitamente | No usado en MVP (reserva = confirmada) |
| `RELEASED` | Liberada (hueco devuelto) | Para futuras liberaciones |
| `CANCELLED` | Cancelada | Excluida de disponibilidad |

**Propuesta MVP:** Tratar `PENDING` como "reserva confirmada". No añadir flujo de aprobación gestor en esta fase.

### Endpoints

| Método | Ruta | Lógica |
|--------|------|--------|
| POST | `/api/reservations` | Ya comprueba hueco libre antes de crear |

### Validaciones (API)

| Validación | Estado |
|------------|--------|
| Sesión activa | ✅ |
| Rol cirujano/endoscopista | ✅ |
| Schema zod | ✅ |
| Hueco libre (date, resourceId, shift, slotIndex) | ✅ |
| slotIndex en rango (mañana 0-5, tarde 0-4) | ✅ |

---

## 5. Fase 4: Confirmación al cirujano

### Pasos concretos

| # | Canal | Acción |
|---|-------|--------|
| 1 | App | Mostrar notificación de éxito |
| 2 | App | Refrescar calendario (huecos pasan a ocupados) |
| 3 | (Opcional) | Enviar correo de confirmación |

### Mensajes al usuario

| Situación | Mensaje propuesto | Dónde |
|-----------|-------------------|-------|
| Reserva OK | "Reserva realizada. Los huecos quedan reservados a su nombre." | Toast en `/cirujano` |
| Pacientes programados OK | "Pacientes programados correctamente." | Toast en `/cirujano` |
| Hueco ocupado | "El hueco ya está ocupado. Seleccione otro hueco disponible." | Toast error |
| Error genérico | "Error al crear la reserva. Inténtelo de nuevo." | Toast error |

**Estado actual:** ✅ Ya implementados en `handleSoloReservar` y `handleProgramarSave`.

### Cambio incremental: correo de confirmación (opcional)

**Propuesta:** Añadir envío de correo al cirujano cuando crea reserva desde la app.

- **Endpoint:** Reutilizar lógica de `sendReplyToReservationEmail` o crear `sendReservationConfirmationEmail`
- **Cuándo:** Tras `POST /api/reservations` exitoso
- **Contenido:** Similar a `reservation_created` en `reservationReplyTemplates.ts`

---

## 6. Cambios incrementales necesarios

### Críticos (sin ellos el flujo no funciona en producción)

| # | Cambio | Archivo(s) | Esfuerzo |
|---|--------|------------|----------|
| 1 | **Calendario gestor use API en modo real** | `src/app/calendario/page.tsx` | Bajo |
| 2 | **modoDemo=false en producción** | `.env` / despliegue | Trivial |

### Importantes (robustez)

| # | Cambio | Archivo(s) | Esfuerzo |
|---|--------|------------|----------|
| 3 | **Cambio de contraseña** | `MiPerfil.tsx`, `POST /api/auth/change-password` | Medio |
| 4 | **Trazabilidad alta usuario** | `User` (createdByUserId, invitationSentAt) o tabla nueva | Bajo |

### Opcionales (mejora UX)

| # | Cambio | Esfuerzo |
|---|--------|----------|
| 5 | Correo de confirmación al reservar desde app | Bajo |
| 6 | Integración correo entrante (webhook + poll/suscripción) | Alto |

---

## 7. Detalle de cambios incrementales

### 7.1 Calendario gestor: usar API en modo real

**Problema:** `calendario/page.tsx` usa `getStoredReservations()` siempre.

**Solución:**

```ts
// En calendario/page.tsx
import { getReservations } from "@/lib/reservations";
import { modoDemo } from "@/lib/config";

const refreshReservations = useCallback(async () => {
  if (modoDemo) {
    setReservations(getStoredReservations());
    return;
  }
  try {
    const list = await getReservations({ dateFrom, dateTo });
    setReservations(list);
  } catch {
    setReservations([]);
  }
}, [modoDemo, dateFrom, dateTo]);
```

- Calcular `dateFrom`/`dateTo` según la semana visible.
- Mantener `getStoredReservations()` para modo demo.

### 7.2 Cambio de contraseña

**Nuevo endpoint:** `POST /api/auth/change-password`

- Body: `{ currentPassword, newPassword }`
- Requiere sesión
- Validar `currentPassword` con `verifyPassword`
- Validar `newPassword` (mín. 8 caracteres)
- Actualizar `passwordHash` en User

**Cambio en MiPerfil:** Añadir sección "Cambiar contraseña" (solo si `!modoDemo`).

### 7.3 Trazabilidad alta usuario

**Opción mínima (sin migración):** En `POST /api/users`, después de crear usuario, loguear:

```
[UserCreated] id=X email=Y createdBy=session.userId
```

**Opción con migración:** Añadir `createdByUserId` en User y rellenarlo en POST.

---

## 8. Resumen: flujo MVP producción

| Fase | Pasos | Pantallas | Endpoints | Estados reserva |
|------|------|-----------|-----------|-----------------|
| 1. Alta | Gestor crea → envía invitación → cirujano recibe | CrearNuevoUsuario, Login | POST /users, POST /email/send-invitation | — |
| 2. Solicitud | Cirujano selecciona huecos → confirma | /cirujano, WeekGridCalendar, ProgramarPacientesModal | GET/POST /reservations | — |
| 3. Disponibilidad | Verificar hueco libre → crear o 409 | — | POST /reservations (lógica interna) | PENDING = confirmada |
| 4. Confirmación | Toast + refresh calendario | /cirujano | — | — |

### Validaciones consolidadas

- **Alta:** email válido, único, rol válido, sesión gestor
- **Solicitud:** sesión, rol cirujano/endoscopista, schema, hueco libre, slotIndex en rango
- **Confirmación:** (no aplica validaciones adicionales)

### Trazabilidad mínima

- `User`: createdAt, (opcional) createdByUserId, invitationSentAt
- `Reservation`: createdAt, surgeonId, status
- `EmailMessage` + `EmailProcessingLog`: para reservas por correo (cuando se integre)

---

## 9. Orden de implementación sugerido

1. **Calendario gestor** (crítico) → 1–2 h
2. **Verificar modoDemo=false** en entorno producción
3. **Cambio de contraseña** (importante) → 2–3 h
4. **Trazabilidad alta** (opcional, bajo esfuerzo) → 1 h
5. **Correo confirmación desde app** (opcional) → 1–2 h

Con los puntos 1 y 2 el flujo básico funciona en producción. Los puntos 3–5 mejoran robustez y UX.
