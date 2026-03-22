# Auditoría: Normas de programación y avisos por correo

---

# PARTE 1: NORMAS DE PROGRAMACIÓN

## 1.1 Auditoría de normas actuales

### Ubicación y descripción

| Ubicación | Regla | Tipo | Uso |
|-----------|-------|------|-----|
| `lib/email/emailConstants.ts` | **NORMAS_PROGRAMACION_BLOQUE** | Bloque de texto ~600 caracteres | Correos de invitación (cirujano, endoscopista) |
| `lib/constants.ts` | **RESOURCES**, QUIRUFANO_IDS | Arrays | Recursos permitidos, quirófanos |
| `lib/constants.ts` | **MORNING_SLOTS**, AFTERNOON_SLOTS | Arrays de TimeSlot | Tramos horarios |
| `lib/constants.ts` | **PREANESTHESIA_DAYS**, PREANESTHESIA_MAX_PATIENTS | Valores | Consulta preanestesia: lun/jue, máx 12 |
| `lib/constants.ts` | **SCHEDULING_DEADLINE_DAY**, SCHEDULING_DEADLINE_WEEK_OFFSET | Números | Cierre: jueves 00:00 semana siguiente |
| `lib/constants.ts` | **NOTIFICATION_DAY** | 3 (miércoles) | Día del recordatorio (no usado en cron) |
| `lib/constants.ts` | **TRANSITION_MINUTES_PER_PROCEDURE** | 10 | Minutos extra por procedimiento |
| `lib/constants.ts` | **SOLICITUD_RECURSOS_OPTIONS** | Array | Opciones de recursos para cirujano |
| `lib/utils.ts` | **MAX_DAYS_AHEAD** = 28 | Constante | Máximo 4 semanas por delante |
| `lib/utils.ts` | **isNextWeekReserveClosed()** | Lógica | Tras jueves 00:00, bloquea reservas semana siguiente |
| `lib/utils.ts` | **canReserveOnDate()**, **canScheduleWeek()** | Lógica | Días laborables, festivos, rango |
| `lib/validations/reservation.ts` | slotIndex 0-5 mañana, 0-4 tarde | Refine Zod | ENFORCED en API |
| `lib/blockOpeningPlan.ts` | **canReserveSlot()** | Lógica | CLOSED/URGENT_RESERVED bloquean reserva |
| `lib/auth/permissions` + `constants` | **getAllowedResourcesForRole()** | Lógica | Cirujano vs endoscopista: recursos distintos |

### Reglas textuales en NORMAS_PROGRAMACION_BLOQUE (resumidas)

1. Quirófanos y salas en régimen compartido; cirujanos en Q1-Q3 + menores; endoscopistas solo menores + dolor.
2. Días laborables: lunes a viernes.
3. Cierre semana siguiente: jueves 00:00.
4. Miércoles: recordatorio automático huecos sin pacientes.
5. Primeros tramos mañana/tarde: reserva mínima 1h 30min.
6. +10 min por procedimiento (limpieza/anestesia).
7. Pacientes asignados a consulta preanestesia (lun/jue mañana).
8. Contacto: "Contactar al gestor" en la app.

---

## 1.2 Clasificación ADVISORY vs ENFORCED

| Regla | Clasificación | Dónde se aplica |
|-------|----------------|------------------|
| Texto NORMAS_PROGRAMACION_BLOQUE | ADVISORY | Solo en correos invitación |
| slotIndex 0-5 / 0-4 | ENFORCED | Zod en createReservation |
| CLOSED / URGENT_RESERVED | ENFORCED | blockOpeningPlan.canReserveSlot |
| Recursos por rol (endoscopista) | ENFORCED | Frontend + backend (resourceId enum) |
| Días laborables (L-V) | ENFORCED | utils.canReserveOnDate (frontend) |
| isNextWeekReserveClosed | ENFORCED | Frontend cirujano (bloquea UI) |
| canScheduleWeek (28 días) | ENFORCED | utils.canReserveOnDate |
| TRANSITION_MINUTES_PER_PROCEDURE | ENFORCED | blockOpeningPlan.getProgrammedMinutes |
| PREANESTHESIA_MAX_PATIENTS | ENFORCED | AsignarAnestesistas (límite 2 por recurso) |

---

## 1.3 Propuesta: modelo ProgrammingRule

### Modelo Prisma mínimo

```prisma
model ProgrammingRule {
  id              String   @id @default(cuid())
  key             String   @unique   // ej: "normas_texto_completo", "cierre_dia_semana"
  name            String             // Nombre legible para el gestor
  description     String?  @db.Text   // Descripción técnica opcional
  category        String             // "scheduling", "resources", "deadlines", "informational"
  valueJson       String?  @db.Text  // JSON: número, string, array, objeto
  isActive        Boolean  @default(true)
  enforcementType String   @default("advisory")  // "advisory" | "enforced"
  updatedAt       DateTime @updatedAt
  updatedByUserId String?

  @@index([category])
  @@index([isActive])
}
```

### Reglas candidatas a editables (primera fase)

| key | name | category | valueJson ejemplo | enforcementType |
|-----|------|----------|-------------------|-----------------|
| normas_texto_completo | Normas completas (correos) | informational | `{"text": "..."}` | advisory |
| first_slot_min_minutes | Mín. minutos primer tramo | scheduling | `90` | enforced |
| transition_minutes | Minutos transición por procedimiento | scheduling | `10` | enforced |
| max_weeks_ahead | Semanas máximas por delante | scheduling | `4` | enforced |
| preanesthesia_max_patients | Máx pacientes consulta preanestesia | scheduling | `12` | enforced |

Las reglas más estructurales (slotIndex, recursos, días laborables) pueden mantenerse en código en una primera fase.

---

## 1.4 Permisos

| Acción | GESTOR | GESTOR_ANESTESISTA | ANESTESISTA | CIRUJANO |
|--------|--------|--------------------|-------------|----------|
| Ver reglas (todas) | ✓ | ✓ | ✗ | ✗ |
| Ver reglas (solo advisory) | - | - | ✓ | ✓ |
| Editar reglas | ✓ | ✓ | ✗ | ✗ |

**Recomendación:** Cirujano y anestesista pueden ver las reglas ADVISORY (texto informativo) en una sección "Normas de programación" sin poder editarlas. Las reglas ENFORCED son internas; solo el gestor las edita.

---

## 1.5 API mínima

| Método | Ruta | Descripción | Permiso |
|--------|------|-------------|---------|
| GET | /api/programming-rules | Listar reglas activas | gestor: todas; otros: advisory |
| GET | /api/programming-rules/[id] | Detalle de una regla | mismo criterio |
| PATCH | /api/programming-rules/[id] | Actualizar valueJson, isActive | anesthetist:assign o nuevo permiso rules:edit |

**Schema Zod sugerido para PATCH:**

```ts
patchProgrammingRuleSchema = z.object({
  valueJson: z.string().optional(),
  isActive: z.boolean().optional(),
});
```

---

## 1.6 Cambios mínimos (enfoque conservador)

1. Crear modelo `ProgrammingRule` y migración.
2. Seed con 4–5 reglas editables a partir de constantes actuales.
3. Nuevo permiso `rules:edit` para GESTOR y GESTOR_ANESTESISTA.
4. API GET y PATCH `/api/programming-rules`.
5. Helper `getProgrammingRule(key)` que lee de DB, con fallback a constantes si no existe.
6. Ir sustituyendo constantes por lecturas de `getProgrammingRule` de forma gradual (empezar por `normas_texto_completo`).
7. Tab de "Normas" en área gestor para ver/editar (UI sencilla).

---

# PARTE 2: AVISOS POR CORREO A ANESTESISTAS

## 2.1 Estado actual

### Hallazgo principal: no existe envío de correo por asignación

**No hay ningún correo enviado cuando se asigna un anestesista a un turno.**  

El endpoint `PUT /api/anesthetist-assignments` solo persiste en BD; no llama a `sendEmail` ni a ninguna función de notificación.

### Flujo actual

1. Gestor usa AsignarAnestesistas.
2. `saveAssignments()` → `PUT /api/anesthetist-assignments`.
3. Backend hace `deleteMany({})` + `create` en transacción.
4. No se envía email.
5. El anestesista solo ve sus asignaciones al entrar en "Mi programación" en la app.

### Otros correos existentes

| Función | Cuándo se dispara | Estado |
|---------|-------------------|--------|
| sendNewUserInvitationEmail | Crear usuario (POST /api/email/send-invitation) | ✓ Implementado |
| sendRecordatorioMiercolesEmail | (Nadie la llama) | Existe pero no hay cron |
| sendPacienteNoAptoEmail | (Lógica manual o futura) | Existe |
| sendReplyToReservationEmail | Webhook correo / processIncomingEmail | ✓ Usado |

---

## 2.2 Contenido propuesto para correo de asignación

### Asunto sugerido

```
Asignación de turno – Bloque Quirúrgico [fecha] [recurso]
```

### Cuerpo propuesto (texto plano)

```
Estimado/a [Nombre],

Se le ha asignado el siguiente turno en el Bloque Quirúrgico:

Fecha: [fecha_formateada]
Turno: [Mañana/Tarde]
Recurso: [Q1 / Consulta preanestesia / etc.]

Puede consultar su programación completa en la aplicación del bloque quirúrgico.

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera
```

### Variables necesarias

- Nombre del anestesista (User.name)
- Email (User.email)
- Fecha (date)
- Turno (Mañana/Tarde)
- Recurso (Q1, Q2, consulta-preanestesia, etc.)

---

## 2.3 Reglas de envío recomendadas

| Evento | ¿Enviar? | Notas |
|--------|----------|-------|
| Asignación nueva (anestesista no estaba antes) | ✓ | Enviar |
| Cambio de anestesista en el mismo slot | ✓ | Enviar al nuevo; opcional aviso al anterior |
| Mismo anestesista, mismo slot (guardar sin cambios) | ✗ | No enviar |
| Desasignación (slot queda sin anestesista) | Opcional | Avisar al que se desasigna si se implementa desasignación |
| Múltiples asignaciones en un mismo guardado | Agrupar | Un correo por anestesista con todas sus asignaciones nuevas/cambiadas |

### Evitar duplicados y spam

1. **Diff antes de guardar:** Comparar estado anterior vs nuevo.
2. **Solo cambios relevantes:** Enviar solo si hay slots añadidos o modificados para ese anestesista.
3. **Agrupación:** Un solo correo por anestesista con el listado de cambios.
4. **Límite:** Máximo 1 correo por anestesista por operación de guardado.

---

## 2.4 Trazabilidad: AssignmentNotificationLog

### Modelo propuesto

```prisma
model AssignmentNotificationLog {
  id                   String   @id @default(cuid())
  anesthetistId        String
  assignmentId         String?  // AnesthetistAssignment.id (si aplica)
  notificationType     String   // "assignment_new", "assignment_changed", "assignment_removed"
  channel              String   @default("email")  // "email" | "in_app" (futuro)
  recipientEmail       String
  subject              String?
  status               String   // "sent", "failed", "skipped"
  failureReason        String?  @db.Text
  detailsJson          String?  @db.Text  // { date, shift, resourceId, ... }
  createdAt            DateTime @default(now())

  @@index([anesthetistId])
  @@index([createdAt])
  @@index([status])
}
```

### Cuándo registrar

- **sent:** Email enviado correctamente.
- **failed:** Error al enviar (excepción, Graph error, etc.).
- **skipped:** No se envió por regla de negocio (sin cambios, duplicado, etc.).

---

## 2.5 Seguridad y privacidad

- No incluir datos clínicos en el correo.
- Solo: fecha, turno, recurso.
- No exponer información de otros profesionales.
- Usar el email del usuario de la app (User.email).
- Si no hay email, no enviar (y registrar `skipped` con motivo).

---

## 2.6 Mejoras prioritarias (orden sugerido)

1. **Alta:** Implementar envío de correo en `PUT /api/anesthetist-assignments` solo cuando haya cambios reales (diff).
2. **Alta:** Crear `AssignmentNotificationLog` y registrar todos los intentos (sent/failed/skipped).
3. **Media:** Agrupar notificaciones por anestesista en un solo correo.
4. **Media:** Plantilla de correo en constante o pequeño módulo (`assignmentNotificationEmail.ts`).
5. **Baja:** Aviso al anestesista desasignado (si se implementa desasignación explícita).

---

## 2.7 Refactor mínimo propuesto

### Archivos nuevos

- `lib/email/assignmentNotification.ts`: `buildAssignmentNotificationEmail(params)`, `shouldNotifyAssignmentChange()`
- Modelo `AssignmentNotificationLog` en Prisma

### Cambios en anesthetist-assignments

1. Antes del `deleteMany`, leer asignaciones actuales.
2. Calcular diff: nuevas, modificadas, eliminadas.
3. Tras la transacción, para cada anestesista con cambios:
   - Construir correo con `buildAssignmentNotificationEmail`
   - Llamar a `sendEmail`
   - Insertar en `AssignmentNotificationLog`
4. Manejar errores sin hacer fallar el PUT (log + registro en BD).

---

## 2.8 Ejemplo de correo que recibiría un anestesista

**Asunto:** Asignación de turno – Bloque Quirúrgico 17 mar 2026 Q1

**Cuerpo (texto plano):**

```
Estimado/a Dr. María López,

Se le ha asignado el siguiente turno en el Bloque Quirúrgico:

Fecha: lunes, 17 de marzo de 2026
Turno: Mañana
Recurso: Q1

Puede consultar su programación completa en la aplicación del bloque quirúrgico.

Un cordial saludo,
Coordinación del Bloque Quirúrgico
Hospital Covadonga – Grupo Ribera
```

Si hay varias asignaciones en el mismo guardado:

```
Se le han asignado los siguientes turnos:

• Lunes 17 marzo – Mañana – Q1
• Lunes 17 marzo – Mañana – Consulta de preanestesia
• Martes 18 marzo – Tarde – Q2

Puede consultar su programación completa en la aplicación.
```
