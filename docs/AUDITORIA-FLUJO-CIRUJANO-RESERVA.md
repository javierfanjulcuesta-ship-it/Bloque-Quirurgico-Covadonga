# Auditoría extremo a extremo: flujo cirujano → confirmación de huecos

**Objetivo:** Comprobar si el flujo desde la solicitud de correo al cirujano hasta la confirmación de huecos está implementado, qué partes funcionan y qué falta.

**Base:** Código real en `bloque-quirurgico-v2` (Next.js, Prisma, SQLite).

---

## 1. Alta inicial del cirujano

### Cómo se crea un nuevo usuario cirujano

| Aspecto | Implementación |
|---------|----------------|
| **Pantalla/componente** | `src/components/gestor/CrearNuevoUsuario.tsx` |
| **Dónde se usa** | Pestaña "Crear usuario" en `src/app/calendario/page.tsx` (tab `crear-usuario`), visible solo para gestores |
| **Ruta de acceso** | `/calendario` → pestaña "Crear usuario" |

### Datos solicitados

- **Perfil (rol):** obligatorio, select entre `cirujano`, `anestesista`, `gestor`, `endoscopista`
- **Correo electrónico:** obligatorio
- **Nombre:** opcional (si vacío, se genera desde el email con `emailToDisplayName`)

### Validaciones

- Email no vacío
- Email válido (`isValidEmail` en `src/lib/validation.ts`)
- Email único (comprobado en `POST /api/users`)

### Flujo de envío de invitación

1. **POST /api/users** (`src/app/api/users/route.ts`)
   - Requiere sesión gestor (`getSessionFromCookie`, `hasGestorAccess`)
   - Genera contraseña temporal (10 caracteres)
   - Crea usuario en Prisma con `approved: true`
   - Devuelve `{ user, tempPassword }`

2. **POST /api/email/send-invitation** (`src/app/api/email/send-invitation/route.ts`)
   - Requiere sesión gestor
   - Parámetros: `toEmail`, `role`, `recipientName`, `accessLink`, `initialPassword`
   - Llama a `sendNewUserInvitationEmail` (Graph o mock)

3. **Fallback:** Si falla el envío por API, se abre `mailto:` con el correo precompletado

### Desde qué dirección sale el correo

- **Buzón configurado:** `jfanjul@riberacare.com` (variable `GESTOR_EMAIL` en `src/lib/config.ts`)
- **Implementación:** `src/lib/email/outlookService.ts` → `createGraphOutlookAdapter` o `createMockOutlookAdapter`
- Si faltan `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` → **mock** (no se envía correo real)

### Contenido que recibe el cirujano

- Plantillas en `src/lib/emailsNuevoUsuario.ts`
- Asunto según rol (ej. cirujano: "Organización de la programación del bloque quirúrgico y nueva función de contacto")
- Bloque de acceso: enlace, usuario (email), contraseña inicial
- Normas de programación del bloque
- Texto de seguridad y compatibilidad

### Trazabilidad

- **Usuario:** `User` en Prisma (`id`, `email`, `name`, `role`, `approved`, `createdAt`, `updatedAt`)
- **No se guarda:** quién creó el usuario, cuándo se envió el correo de invitación

---

## 2. Acceso del cirujano a la aplicación

### Modo demo vs real

| Config | `modoDemo` | Login | Usuarios | Reservas |
|-------|------------|-------|----------|----------|
| Demo | `true` (por defecto) | Selector sin contraseña | `MOCK_USERS` de `dataHelpers.ts` | `localStorage` |
| Real | `NEXT_PUBLIC_DEMO_MODE=false` | Email + contraseña | API `/api/users` | API `/api/reservations` |

### Cómo entra por primera vez (modo real)

- **Pantalla:** `src/app/page.tsx`
- **Formulario:** email + contraseña
- **POST /api/auth/login** (`src/app/api/auth/login/route.ts`)
  - Valida email y contraseña
  - Comprueba `approved: true`
  - Crea sesión JWT en cookie `bloque_session` (7 días)

### Crear contraseña

- **Contraseña inicial:** viene en el correo de invitación (generada temporalmente)
- **Cambio de contraseña:** **NO IMPLEMENTADO**
  - El email dice: "Puede cambiar su contraseña en cualquier momento desde la aplicación, en la pestaña Mi perfil"
  - `MiPerfil` (`src/components/MiPerfil.tsx`) solo tiene: foto, nombre, apellidos, correo, teléfono, especialidad. **No hay formulario de cambio de contraseña.**

### Validaciones y estados

- Usuario no aprobado → `"Usuario no aprobado"` (401)
- Credenciales incorrectas → `"Email o contraseña incorrectos"`
- Sesión expirada → cookie no válida, redirección a `/`

### Errores posibles

- "Error de conexión" si falla el fetch
- "Usuario no aprobado" si `approved: false`
- "Email o contraseña incorrectos"

---

## 3. Solicitud de huecos por el cirujano

### A) Desde la app

#### Pasos exactos

1. Cirujano entra en `/cirujano`
2. Selecciona huecos en el calendario (verde = libre)
3. Opciones: "Solo reservar" o "Programar pacientes"
4. Si "Programar pacientes" → modal `ProgramarPacientesModal` con datos de pacientes

#### Componentes y rutas

| Elemento | Archivo |
|----------|---------|
| Página cirujano | `src/app/cirujano/page.tsx` |
| Calendario semanal | `WeekGridCalendar`, `DaySlotGrid` |
| Modal programar | `src/components/cirujano/ProgramarPacientesModal.tsx` |
| Servicio reservas | `src/lib/reservations.ts` → `getReservations`, `createReservationEntry` |

#### Endpoints

- **GET /api/reservations** (filtros: `dateFrom`, `dateTo`, `resourceId`, `surgeonId`)
- **POST /api/reservations** (body: `date`, `resourceId`, `shift`, `slotIndex`, `patients`)

#### Validaciones

- Sesión activa (cookie)
- Rol `cirujano` o `endoscopista`
- `createReservationSchema` (zod): fecha YYYY-MM-DD, resourceId, shift, slotIndex, patients
- Hueco no ocupado (comprobación en BD antes de crear)
- En front: `resolveSlotsToSameRoom` (quirófanos), `isNextWeekReserveClosed`, duración total vs tiempo reservado

#### Datos obligatorios

- `date`, `resourceId`, `shift`, `slotIndex`
- Pacientes (si se programan): `historyNumber`, `procedure`, `estimatedDurationMinutes`, `anesthesiaType`, `insuranceType`

#### Qué se guarda

- **Modo demo:** `localStorage` vía `addOrUpdateStoredReservation` (`storageMensajesYNotificaciones.ts`)
- **Modo real:** Prisma `Reservation` + `PatientInBlock`

#### Qué ve el usuario

- Notificación: "Reserva realizada. Los huecos quedan reservados a su nombre." o "Pacientes programados correctamente."
- Error: "El hueco ya está ocupado" (409), "Error al crear la reserva", etc.

---

### B) Por correo electrónico

#### Pasos exactos

1. Cirujano envía correo al buzón del gestor (`jfanjul@riberacare.com`)
2. Un servicio externo debe reenviar el correo al webhook (ver sección siguiente)
3. **POST /api/email/webhook** recibe el mensaje
4. `processIncomingEmail` clasifica, parsea, valida y crea reserva
5. Se envía respuesta automática por correo

#### Webhook

- **Ruta:** `src/app/api/email/webhook/route.ts`
- **Autenticación:** header `x-email-webhook-secret` o query `webhookSecret` = `EMAIL_WEBHOOK_SECRET`
- **Payload esperado:** `{ id, fromEmail, subject, bodyPlain }` (opcional: `fromName`, `bodyHtml`, `receivedAt`)

#### Procesamiento

- **Archivo:** `src/lib/email/processIncomingEmail.ts`
- Clasificación: `classifyIncomingEmail` → `reservation`, `general`, `access_request`, `unknown`
- Parseo: `parseReservationEmail` → fecha, recurso, turno, slot, pacientes
- Creación: `createReservationInDb` (misma lógica que API de reservas)

#### Formato esperado del correo

- Fecha: `YYYY-MM-DD` o `DD/MM/YYYY`
- Recurso: Q1, Q2, Q3, procedimientos menores, técnicas del dolor
- Turno: mañana/tarde, morning/afternoon
- Slot: tramo 0–5 (mañana), 0–4 (tarde)
- Pacientes: HC-xxx, procedimiento, X min, tipo anestesia, entidad

#### Validaciones

- Remitente registrado y `approved: true`
- Rol `cirujano` o `endoscopista` (`isCirujanoOrEndoscopista`)
- Hueco libre (misma comprobación que API)
- Formato parseable (si no → respuesta "formato no reconocible")

#### Respuestas automáticas

- `reservation_created`: confirmación con fecha, recurso, referencia
- `format_not_recognized`: instrucciones de formato
- `sender_not_registered`: indicar solicitar alta
- `role_not_authorized`: solo cirujanos/endoscopistas
- `slot_occupied`: hueco ocupado, consultar app

#### Punto crítico: recepción del correo

- **El webhook NO recibe correos automáticamente**
- Falta: poll de bandeja o suscripción Microsoft Graph que envíe los correos al webhook
- Documentación: `docs/PLAN-INTEGRACION-OUTLOOK.md`, `docs/FLUJO_RESERVAS_EMAIL.md` indican que hay que configurar SendGrid/Mailgun/Cloudflare o poll de Graph

---

## 4. Procesamiento de la solicitud

### Comprobación de hueco libre

- **API:** `src/app/api/reservations/route.ts` (POST)
- **Email:** `src/lib/reservations/createReservationInDb.ts`
- Consulta: `prisma.reservation.findFirst` con `date`, `resourceId`, `shift`, `slotIndex`, `status: { not: "CANCELLED" }`
- Si existe → 409 "El hueco ya está ocupado" / respuesta por correo

### Resolución de conflictos

- **No hay cola ni negociación:** si el hueco está ocupado, se rechaza
- No hay sugerencia de huecos alternativos automática

### Revisión por gestor

- **No existe:** la reserva se crea directamente con estado `PENDING`
- No hay flujo de aprobación manual

### Estados

- **Prisma:** `PENDING`, `CONFIRMED`, `RELEASED`, `CANCELLED`
- **Uso actual:** las reservas se crean en `PENDING`; no hay flujo explícito para `CONFIRMED` o `RELEASED`
- **Distinción solicitud vs reserva:** no. La "solicitud" es la creación directa de la reserva; no hay entidad separada "Solicitud" que luego se convierta en "Reserva"

---

## 5. Confirmación al cirujano

### Confirmación visual en la app

- Tras crear reserva: notificación toast "Reserva realizada..." o "Pacientes programados correctamente."
- El calendario se refresca y muestra los huecos como ocupados/reservados
- **Implementado:** sí (en `handleSoloReservar` y `handleProgramarSave`)

### Confirmación por correo

- **Vía app:** no se envía correo al crear reserva desde la app
- **Vía correo:** sí, `sendReplyToReservationEmail` con plantilla `reservation_created`

### Mensaje interno

- No hay sistema de mensajería interna para confirmaciones

### Cambio de estado en calendario

- Sí: `refreshReservations()` recarga y el slot pasa de libre a ocupado/reservado

### Respuesta automática si llegó por correo

- **Implementado:** `getReservationReplyContent("reservation_created", ...)` y `sendReplyToReservationEmail`

---

## 6. Casos especiales

| Caso | Implementación |
|------|----------------|
| Remitente no registrado | Sí. Respuesta por correo + `processingStatus: FAILED` |
| Rol no válido (ej. anestesista) | Sí. Respuesta por correo + `FAILED` |
| Hueco ocupado | Sí. Respuesta por correo + 409 en API |
| Formato incorrecto | Sí. Respuesta "formato no reconocible" |
| Sesión expirada | Sí. 401 en API, redirección a `/` en cliente |
| Doble solicitud / duplicado | Parcial. Por correo: `externalId` evita reprocesar. Por app: no hay idempotencia explícita |
| Usuario no aprobado | Sí. Login rechazado, correo rechazado (remitente debe estar `approved`) |

---

## 7. Trazabilidad completa

| Fase | Datos guardados | Tabla/Origen |
|------|-----------------|--------------|
| Creación usuario | id, email, name, role, approved, createdAt | `User` |
| Envío invitación | **No** | — |
| Primer acceso | **No** (solo sesión en cookie) | — |
| Solicitud por app | reservation, patients, createdAt | `Reservation`, `PatientInBlock` |
| Solicitud por correo | externalId, fromEmail, classification, processingStatus, senderUserId, reservationId, resultMessage | `EmailMessage`, `EmailProcessingLog` |
| Confirmación | resultMessage en EmailMessage | `EmailMessage` |

**Logs:** `EmailProcessingLog` con acciones: `classified`, `parsed`, `reservation_created`, `reply_sent`, `error`

---

## 8. Resultado final

### A) Mapa del flujo actual

```
[GESTOR] CrearNuevoUsuario → POST /api/users → POST /api/email/send-invitation
                ↓
[CIRUJANO] Recibe correo (enlace + contraseña)
                ↓
[CIRUJANO] Login (/) → POST /api/auth/login → cookie sesión
                ↓
[CIRUJANO] /cirujano → getReservations (API o localStorage) → createReservationEntry
                ↓
[CONFIRMACIÓN APP] Notificación + refresh calendario

--- Alternativa por correo ---

[CIRUJANO] Envía correo a jfanjul@riberacare.com
                ↓
[EXTERNO] ??? → POST /api/email/webhook (falta orquestación)
                ↓
processIncomingEmail → createReservationInDb → sendReplyToReservationEmail
                ↓
[CIRUJANO] Recibe correo de confirmación
```

### B) Partes implementadas y funcionan

- Alta de usuario por gestor (formulario + API)
- Envío de invitación (Graph si configurado, mailto como fallback)
- Login real con email + contraseña
- Solicitud de huecos desde la app (demo y real)
- Comprobación de hueco libre
- Confirmación visual en app
- Webhook de correo (si se le llama con POST)
- Procesamiento de correo: clasificación, parseo, creación, respuesta por correo
- Casos: remitente no registrado, rol no autorizado, hueco ocupado, formato incorrecto

### C) Partes a medias

- **Calendario gestor:** usa `getStoredReservations()` siempre; en modo real debería usar `getReservations()` (API)
- **Cambio de contraseña:** anunciado en el email pero no implementado en MiPerfil
- **Recepcion de correos:** el webhook existe pero no hay integración que envíe los correos entrantes al webhook (poll o suscripción Graph)

### D) Partes que faltan

- Integración que reciba correos del buzón y los envíe al webhook
- Cambio de contraseña en MiPerfil
- Flujo de aprobación por gestor (si se desea)
- Transiciones explícitas PENDING → CONFIRMED / RELEASED
- Trazabilidad: quién creó el usuario, cuándo se envió la invitación

### E) Puntos débiles o riesgos

1. **Calendario en modo real:** la página `/calendario` (gestor) lee de `localStorage`; las reservas reales están en BD. El gestor no vería las reservas creadas por cirujanos en modo real.
2. **Webhook sin orquestación:** sin poll/suscripción, las reservas por correo no se procesan automáticamente.
3. **Contraseña temporal:** no hay forma de cambiarla desde la app.
4. **Demo vs real:** muchas rutas asumen demo (getStoredReservations, getUsers con MOCK_USERS cuando modoDemo).

### F) Qué haría falta para un flujo robusto en producción

1. **Calendario gestor:** usar `getReservations()` (API) cuando `!modoDemo` en lugar de `getStoredReservations()`.
2. **Integración de correo entrante:** implementar poll de bandeja (Graph) o configurar SendGrid/Mailgun Inbound para enviar al webhook.
3. **Cambio de contraseña:** añadir en MiPerfil un formulario que llame a `POST /api/auth/change-password` (crear endpoint).
4. **Trazabilidad:** añadir `createdByUserId` en User (o tabla de auditoría) y registrar envío de invitación.
5. **Idempotencia:** considerar idempotency key en POST reservas si hay riesgo de doble envío.
6. **Pruebas:** verificar flujo completo con `modoDemo=false` y base de datos real.

---

## Rutas de archivo de referencia

| Concepto | Archivo |
|----------|---------|
| Config | `src/lib/config.ts` |
| Alta usuario (UI) | `src/components/gestor/CrearNuevoUsuario.tsx` |
| API usuarios | `src/app/api/users/route.ts` |
| API invitación | `src/app/api/email/send-invitation/route.ts` |
| Plantillas email | `src/lib/emailsNuevoUsuario.ts` |
| Login | `src/app/page.tsx`, `src/app/api/auth/login/route.ts` |
| AuthContext | `src/context/AuthContext.tsx` |
| Página cirujano | `src/app/cirujano/page.tsx` |
| Servicio reservas | `src/lib/reservations.ts` |
| API reservas | `src/app/api/reservations/route.ts` |
| Crear reserva (BD) | `src/lib/reservations/createReservationInDb.ts` |
| Webhook correo | `src/app/api/email/webhook/route.ts` |
| Procesar correo | `src/lib/email/processIncomingEmail.ts` |
| Parser correo | `src/lib/email/parseReservationEmail.ts` |
| Respuestas correo | `src/lib/email/reservationReplyTemplates.ts` |
| Calendario gestor | `src/app/calendario/page.tsx` |
| MiPerfil | `src/components/MiPerfil.tsx` |
| Prisma schema | `prisma/schema.prisma` |
