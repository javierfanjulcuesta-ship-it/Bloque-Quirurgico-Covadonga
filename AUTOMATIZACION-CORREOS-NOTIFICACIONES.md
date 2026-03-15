# Automatización de correos y notificaciones – Bloque Quirúrgico V2

Este documento describe los flujos de correo y notificaciones in-app del sistema de gestión del bloque quirúrgico (Hospital Covadonga – Grupo Ribera).

---

## 1. Recordatorio automático (miércoles)

**Objetivo:** Recordar a los cirujanos (y endoscopistas) que tienen huecos reservados para la **próxima semana** sin pacientes programados.

- **Cuándo:** Los miércoles (según constante `RECORDATORIO_MIERCOLES` en `src/lib/constants.ts`).
- **A quién:** Usuarios con rol cirujano o endoscopista que tengan al menos un hueco reservado en la semana siguiente sin pacientes asignados.
- **Acción:** Se crea una **notificación in-app** para cada usuario afectado (almacenada vía `addNotification` en `src/lib/storageMensajesYNotificaciones.ts`). Opcionalmente se puede abrir el cliente de correo con la plantilla de recordatorio (asunto y cuerpo desde `getRecordatorioMiercolesSubject()` y `getRecordatorioMiercolesBody(apellido)` en `src/lib/emailsNuevoUsuario.ts`).
- **Control de no duplicar:** Se guarda la semana (lunes en ISO) para la que ya se envió el recordatorio con `setRecordatorioSentWeek(weekMondayIso)`; se consulta con `getRecordatorioSentWeek()`.

**Componente de referencia en el proyecto original:** `RecordatorioAutoMiercoles.tsx` (ejecuta esta lógica al cargar la vista de programación o desde un panel del gestor).

---

## 2. Notificación de huecos liberados (jueves)

**Objetivo:** Informar a los usuarios que el jueves a las 00:00 se ha cerrado la reserva de la semana siguiente y que los huecos no completos han quedado liberados.

- **Cuándo:** El jueves a las 00:00 (cierre de la semana siguiente según `CIERRE_JUEVES_*` en `constants.ts`).
- **A quién:** Usuarios con acceso a programación (cirujanos, endoscopistas) que tengan interés en ver huecos liberados (en el original se muestra una notificación in-app al entrar en la app).
- **Acción:** Se crea una **notificación in-app** indicando que hay huecos liberados para la semana X. Persistencia con `setHuecosLiberadosSentWeek(weekMondayIso)` para no repetir el aviso para la misma semana.
- **Consultas:** `getHuecosLiberadosSentWeek()` y `setHuecosLiberadosSentWeek(weekMondayIso)` en `storageMensajesYNotificaciones.ts`.

**Componente de referencia en el proyecto original:** `NotificacionHuecosLiberadosJueves.tsx`.

---

## 3. Alta de nuevo usuario (gestor)

**Objetivo:** Al dar de alta un usuario desde el área de gestión, abrir el cliente de correo con una plantilla según su rol.

- **Cuándo:** Cuando el gestor crea un usuario y elige “Enviar correo” (o similar).
- **Plantillas por rol:** Definidas en `src/lib/emailsNuevoUsuario.ts`:
  - **Cirujano:** asunto y cuerpo con normas de programación y bloque de acceso (enlace + contraseña inicial).
  - **Anestesista:** bienvenida y uso de la aplicación (agenda, preferencias).
  - **Gestor / Gestor-Anestesista:** invitación con enlace de acceso.
  - **Endoscopista:** bienvenida, normas (procedimientos menores y técnicas del dolor) y bloque de acceso.
- **Uso:** `getEmailSubject(role)`, `getEmailBody(role, options)` con `EmailBodyOptions` (recipientName, accessLink, initialPassword). Se abre el cliente con `buildMailtoLink(toEmail, subject, body)`.

---

## 4. Mensajes al gestor (“Contactar al gestor”)

**Objetivo:** El usuario (cirujano, endoscopista, etc.) envía un mensaje (asunto + cuerpo) al gestor desde la app.

- **Persistencia:** `addMessageToGestor(msg)` en `storageMensajesYNotificaciones.ts`; listado con `getMessagesToGestor()`.
- **Opcional:** Si el gestor tiene correo configurado, al enviar el mensaje se puede abrir un `mailto:` con el correo del gestor, asunto y cuerpo del mensaje, para enviar el email desde el cliente de correo.

---

## 5. Paciente no apto (consulta de preanestesia)

**Objetivo:** Cuando en consulta de preanestesia se marca a un paciente como “no apto”, se registra y se puede avisar al cirujano por correo.

- **Persistencia:** `addNoApto(reservationId, patientId)` y `getNoAptoList()` en `storageMensajesYNotificaciones.ts`. Consulta `isPacienteNoApto(reservationId, patientId)`.
- **Correo:** Plantillas `getPacienteNoAptoSubject()` y `getPacienteNoAptoBody(apellido)` en `emailsNuevoUsuario.ts`. Se puede abrir un mailto al cirujano responsable de la reserva.

---

## 6. Notificaciones in-app (genéricas)

- **Almacenamiento:** `addNotification`, `getNotifications`, `getNotificationsForUser`, `markNotificationRead`, `markAllNotificationsReadForUser` en `storageMensajesYNotificaciones.ts`.
- **Tipos:** Definidos en `src/lib/types.ts` (`AppNotification`: id, userId, title, message, date, read).
- **Uso:** Recordatorio miércoles, huecos liberados jueves, y cualquier otro aviso que la app quiera mostrar en el panel de notificaciones del usuario.

---

## Resumen de archivos

| Función | Archivo |
|--------|---------|
| Tipos (User, Reservation, MessageToGestor, AppNotification, etc.) | `src/lib/types.ts` |
| Recursos (Q1–Q3, procedimientos menores, técnicas del dolor), turnos, constantes de cierre/recordatorio | `src/lib/constants.ts` |
| Persistencia mensajes, notificaciones, festivos, reservas, recordatorio/huecos liberados, no apto | `src/lib/storageMensajesYNotificaciones.ts` |
| Plantillas de email (nuevo usuario, recordatorio miércoles, paciente no apto) y mailto | `src/lib/emailsNuevoUsuario.ts` |

Los componentes de UI que **disparan** estas automatizaciones (por ejemplo `RecordatorioAutoMiercoles`, `NotificacionHuecosLiberadosJueves`, y la pantalla de alta de usuario del gestor) se integrarán cuando se implementen las vistas de programación y gestión en la aplicación V2.
