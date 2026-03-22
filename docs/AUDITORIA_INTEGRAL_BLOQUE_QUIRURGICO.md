# AUDITORÍA INTEGRAL – Gestión de Bloque Quirúrgico

**Fecha:** Marzo 2025  
**Modo:** Lectura exclusiva (sin modificaciones)  
**Perspectiva:** Experto informático senior en sistemas hospitalarios y software asistencial  

---

## A. VEREDICTO EJECUTIVO

La aplicación transmite buena orientación asistencial: roles, recursos, cierre semanal, regla SESPA, trazabilidad de reservas y liberación automática a bolsa común están bien planteados. Sin embargo, presenta **deficiencias graves** que impiden su uso serio en entorno hospitalario: un cirujano puede ver las reservas de todos los demás, múltiples endpoints críticos devuelven 503, la asignación masiva de anestesistas borra todo sin transacción atómica, no hay auditoría de gestión de usuarios ni protección del último gestor, y parte de la UI depende de localStorage aunque el modo demo esté desactivado. Un responsable de sistemas de un hospital la aprobaría como base conceptual, pero la rechazaría para un piloto operativo hasta corregir al menos las vulnerabilidades de exposición de datos y las funcionalidades bloqueadas.

---

## B. FORTALEZAS REALES

### 1. Adecuación al entorno hospitalario

- **Modelo de recursos:** Q1, Q2, Q3, procedimientos menores, técnicas del dolor; endoscopista restringido a procedimientos menores y técnicas del dolor. Coherente con un bloque quirúrgico real.
- **Regla SESPA:** Validación de que, si hay pacientes SESPA, solo se asignen anestesistas con `canSespa=true`. Lógica asistencial correcta.
- **Cierre semanal:** Jueves 00:00 cierra la semana siguiente; lógica centralizada en `schedulingDeadline.ts`. Regla operativa razonable.
- **Liberación automática:** Cron que libera huecos PENDING sin pacientes tras el deadline, notifica por email y registra eventos. Bien alineado con la operativa real.
- **Separación de roles:** GESTOR, GESTOR_ANESTESISTA, ANESTESISTA, CIRUJANO, ENDOSCOPISTA con permisos explícitos (RBAC). La jerarquía gestor-anestesista está bien expresada.

### 2. Seguridad y permisos

- **Permisos centralizados** en `permissions.ts` con `hasPermission`, `hasAnyPermission`. No hay checks dispersos por rol.
- **Validación Zod** en reservas, pacientes, fechas y slots. Tipos de admisión, recursos y rangos de slots definidos.
- **Rate limit** en login (5 intentos / 15 min) y en contacto público.
- **Webhook y cron** protegidos con `EMAIL_WEBHOOK_SECRET` y `CRON_SECRET`.
- **Passwords** con bcrypt (12 rounds), cookie httpOnly, secure en producción.

### 3. Trazabilidad y eventos

- **ReservationEvent** registra creación, actualización, cancelación, liberación y auto-liberación. `logReservationEvent` se usa en los flujos críticos.
- **Origen de reserva:** APP, EMAIL, GESTOR con `createdByUserId` y `updatedByUserId`.

### 4. Calidad técnica

- **TypeScript y Prisma** bien aprovechados. Schema coherente con la lógica de negocio.
- **Lógica de negocio compartida:** `createReservationInDb` usada por API y webhook. Reutilización de `logReservationEvent`.

### 5. Experiencia operativa

- **Vista gestor:** Calendario semanal, asignación de anestesistas con aviso SESPA, gestión de usuarios y normas.
- **Vista cirujano:** Bloque, normas de programación, bolsa común.
- **Vista anestesista:** Mi programación, valoración preanestesia, no disponibilidad.

---

## C. DEBILIDADES O RIESGOS REALES

### 1. Exposición de datos (crítico)

**GET /api/reservations** no filtra por `surgeonId` cuando el usuario tiene `booking:view:own`. Cirujanos y anestesistas reciben todas las reservas, incluyendo pacientes de otros cirujanos (NHC, procedimiento, cirujano, financiador). El schema de query incluye `surgeonId` opcional pero no se usa en el `where` de Prisma. Violación clara de privacidad y confidencialidad clínica.

**Archivo:** `src/app/api/reservations/route.ts` líneas 61–76.

### 2. Funcionalidades en 503 (operativa rota)

Múltiples endpoints devuelven 503:

- **PATCH /api/reservations/[id]** – actualizar reserva / añadir pacientes
- **PATCH /api/reservations/[id]/cancel** – cancelar reserva
- **PATCH /api/reservations/[id]/patient** – actualizar paciente
- **PATCH /api/reservations/[id]/patient/cancel** – cancelar paciente
- **PUT /api/block-opening-plan** – cierre/apertura de quirófanos
- **PATCH /api/programming-rules/[id]** – edición de normas

En modo real, un cirujano puede crear reservas pero no modificar ni cancelar; las normas y el plan de apertura no son editables. Flujo asistencial incompleto.

### 3. Asignación de anestesistas: riesgo de pérdida de datos

**PUT /api/anesthetist-assignments** hace `deleteMany({})` y luego crea todas las asignaciones. Si falla tras el borrado o en una creación intermedia, se pierden todas las asignaciones sin rollback parcial. No hay respaldo ni estrategia incremental.

### 4. Auditoría de usuarios desactivada

`logUserAuditEvent` es no-op. Desactivar o reactivar un usuario no deja rastro. Para cumplimiento y responsabilidad en gestión de usuarios, es insuficiente.

### 5. Endpoint de depuración en producción

**GET /api/auth/debug-session** expone diagnóstico de sesión sin autenticación. Indica si la cookie existe, validación del token y errores. Herramienta de diagnóstico útil, pero no debe estar accesible en producción.

### 6. Sin protección del último gestor

Deactivate no comprueba si el usuario es el último gestor activo. Se puede dejar el sistema sin ningún gestor con capacidad de crear usuarios o recuperar la situación.

### 7. Mezcla de localStorage y API

Con `modoDemo=false`, las reservas vienen de la API, pero componentes como `HistoricoView`, `AsignarAnestesistas` (cuando no hay `propReservations`), `ValoracionPreanestesia`, no disponibilidad de anestesistas y mensajes al gestor siguen usando localStorage. En modo real, esos datos serán vacíos o inconsistentes si no se migran a API/BD.

### 8. Normas de programación y apertura bloqueadas

`ProgrammingRule` en schema, pero API en 503. Las normas vienen de constantes locales. El plan de apertura (`BlockOpeningPlan`) también en 503. Reglas operativas clave no son configurables por el gestor.

### 9. Gestor crea reservas como “él mismo”

En POST /api/reservations, `surgeonId` se toma siempre de `session.userId`. No existe flujo para que un gestor reserve en nombre de otro cirujano, aunque el modelo contempla `createdByUserId` y origen GESTOR. El documento habla de “gestor puede crear en nombre de otro” pero no está implementado en la API de reservas.

### 10. Sin filtro por cirujano en GET reservations

El schema de validación admite `surgeonId` en query, pero la ruta no lo aplica. Para gestores podría ser útil filtrar; para cirujanos es obligatorio para cumplir `booking:view:own`.

---

## D. CITAS LITERALES (SIMULADAS)

*Frases que podría pronunciar un experto hospitalario en una reunión de validación:*

- “Un cirujano no puede ver las programaciones de otros cirujanos. Es confidencialidad básica. Hay que filtrar por surgeonId cuando el permiso sea view:own.”
- “Si no puedo cancelar un paciente o modificar una reserva desde la app, ¿qué hacemos cuando hay un error o un cambio de última hora? Hoy tendríamos que tocar la base de datos a mano.”
- “Cuando el gestor guarda las asignaciones de anestesistas, ¿qué pasa si falla a mitad? ¿Perdemos todo el turno?” 
- “Desactivar usuarios sin registro de quién lo hizo y cuándo no es aceptable en un sistema hospitalario.”
- “El endpoint de debug de sesión no puede estar abierto en producción.”
- “La regla SESPA está bien. Eso sí que suena a que lo han pensado con alguien del bloque.”
- “El cierre del jueves y la liberación automática encajan con cómo trabajamos. Eso está bien orientado.”
- “¿Las normas de programación las edita alguien o están fijas en código? Si son fijas, cada cambio es un despliegue.”
- “Endoscopistas solo en procedimientos menores y técnicas del dolor: correcto.”

---

## E. NIVEL DE MADUREZ ACTUAL

**Clasificación: MAQUETA CONVINCENTE**

**Justificación:** La estructura y el modelo de negocio están bien pensados, la separación de roles y la regla SESPA son coherentes, y el flujo de cierre semanal es operativamente razonable. Pero la exposición de datos entre cirujanos es crítica, varias funciones esenciales (cancelar, modificar reservas, editar normas, apertura de bloque) no funcionan en producción, y la auditoría de usuarios y la protección del último gestor no están implementadas. En un hospital no se podría desplegar como piloto serio en el estado actual.

Para alcanzar “piloto serio” haría falta:
- Corregir el filtrado por `surgeonId` en GET reservations.
- Activar las rutas de PATCH reservations/patient/cancel.
- Añadir auditoría de gestión de usuarios y protección del último gestor.
- Desactivar o proteger el debug-session en producción.

---

## F. RECOMENDACIONES PRIORIZADAS

### 1. Cinco mejoras exigibles antes de tomarla en serio

1. **Corregir GET /api/reservations:** Si el usuario tiene `booking:view:own`, filtrar por `surgeonId = session.userId` (o equivalente para anestesistas). Si tiene `booking:view:all`, mantener el listado completo.
2. **Activar PATCH reservations:** Implementar al menos cancelar reserva y cancelar paciente. Son operaciones diarias en un bloque real.
3. **Proteger o eliminar /api/auth/debug-session:** Restringir a desarrollo/staging o eliminar en producción.
4. **Proteger el último gestor:** Antes de desactivar, comprobar que quede al menos un gestor activo. Rechazar la operación si no.
5. **Auditoría de usuarios:** Activar `logUserAuditEvent` y usarla en desactivar/reactivar. Registrar actor, fecha y tipo de evento.

### 2. Cinco mejoras de evolución natural

1. **Transacción atómica en PUT anesthetist-assignments:** Sustituir delete-all + create por upsert por rango de fechas o por transacción que garantice todo-o-nada.
2. **Normas de programación editables:** Activar el modelo ProgrammingRule y la API de PATCH para que el gestor pueda cambiar plazos y textos sin despliegues.
3. **Plan de apertura funcional:** Activar BlockOpeningPlan para cierre/apertura de quirófanos por fecha y turno.
4. **Reservar en nombre de otro:** Permitir al gestor indicar `surgeonId` distinto en la creación de reserva cuando el origen sea GESTOR.
5. **Migrar funcionalidades en localStorage:** Histórico, no disponibilidad, mensajes al gestor y valoración preanestesia a API/BD para modo real.

---

## G. RIESGOS DE IMPLANTACIÓN REAL

- **Confidencialidad:** Cirujanos viendo programaciones de otros. Riesgo legal y de confianza inmediato.
- **Frustración operativa:** Imposibilidad de cancelar o modificar reservas desde la app. Intervenciones manuales en BD o procesos paralelos (Excel, teléfono).
- **Pérdida de asignaciones:** Un fallo en el PUT de asignaciones podría dejar al bloque sin turnos de anestesistas hasta reasignación manual.
- **Bloqueo administrativo:** Desactivación del último gestor sin forma de recuperar acceso.
- **Resistencia al cambio:** Si la UI depende de que “alguien sepa cómo funciona por dentro” o de datos en localStorage, la adopción será baja y habrá errores.
- **Cumplimiento normativo:** Ausencia de auditoría en gestión de usuarios dificulta justificar quién hizo qué en una inspección o reclamación.

---

## H. JUICIO FINAL

**¿Puede pilotarse de verdad con pocos usuarios?**  
**No**, en el estado actual. La exposición de reservas entre cirujanos es un impedimento absoluto. Aunque se corrigiera solo eso, las funciones bloqueadas (cancelar, modificar, normas, apertura) limitarían mucho el uso real.

**¿Necesita una capa importante de maduración?**  
**Sí.** La base conceptual y parte de la implementación son sólidas, pero hay que:
- Corregir la exposición de datos.
- Activar las rutas críticas en 503.
- Añadir auditoría y protección del último gestor.
- Revisar dependencias de localStorage en modo real.

Con esas correcciones, la aplicación estaría en condiciones de un piloto controlado con pocos usuarios y supervisión técnica cercana. Sin ellas, se quedaría en demostración o prototipo avanzado.
