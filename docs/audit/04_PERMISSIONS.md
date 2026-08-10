# Permisos y autorización

**Score sugerido:** 62/100  
**Fuente de verdad código:** `src/lib/auth/permissions.ts`, `authorization.ts`, API routes.

Roles Prisma: `GESTOR` · `GESTOR_ANESTESISTA` · `ANESTESISTA` · `CIRUJANO` · `ENDOSCOPISTA`  
Roles sesión: `gestor` · `gestor-anestesista` · `anestesista` · `cirujano` · `endoscopista`

---

## 1. Matriz acción × rol

Leyenda: **S** = sí (backend + UI típica) · **P** = parcial / inconsistente · **N** = no · **U** = solo UI / no persistido · **—** = no aplica

| Acción | GESTOR | GESTOR_ANESTESISTA | ANESTESISTA | CIRUJANO | ENDOSCOPISTA |
|--------|:------:|:------------------:|:-----------:|:--------:|:------------:|
| Ver calendario | S | S | S | S* | S* |
| Ver todas las reservas | S | S | N** | N | N |
| Ver propias reservas | — | S | S | S | S |
| Crear reserva | S | S | N | S | S |
| Modificar reserva / añadir pacientes | S | S | N | S (propias) | S (propias) |
| Cancelar reserva | S | S | N | S (propias) | S (propias) |
| Programar paciente | S | S | N | S | S |
| Modificar paciente | S | S | N | S | S |
| Ver información clínica (pacientes) | S | S | P*** | S (propias) | S (propias) |
| Asignar anestesista | S | S | N | N | N |
| Cambiar anestesista | S | S | N | N | N |
| Cerrar programación (deadline sistema) | sistema/cron | sistema/cron | N | N | N |
| Liberar huecos (cron / cancel post-cierre) | S/sistema | S/sistema | N | vía cancel | vía cancel |
| Solicitar indisponibilidad | N | P (como anest.) | U | N | N |
| Gestionar usuarios | S | S | N | N | N |
| Consultar histórico | S (vía datos) | S | stub | S | S |
| Cuadro de mando | S | S | N | N | N |
| Preanestesia (consulta/valoración) | visión | S | S | N | N |
| Normas (editar) | S | S | N | N | N |
| Normas (ver) | S | S | P | S | S |
| Mensajes (bandeja contacto) | S | S | N | N | N |
| Mensajes (enviar contacto) | S | S | S | S | S |
| Apertura de bloque | permiso existe | permiso existe | N | N | N |

\* Cirujano/endoscopista usan `/cirujano` (calendario propio), no shell gestor.  
\*\* Listado anestesista filtra/strips pacientes ajenos.  
\*\*\* **Detalle por ID** puede devolver pacientes ajenos (IDOR) — ver abajo.

`GESTOR_ANESTESISTA` hereda permisos de GESTOR **más** `booking:view:own` y `schedule:view:own` (visión operativa global + funciones de anestesista en permisos). La UI de `/calendario` lo trata como gestor con extras.

---

## 2. Permisos explícitos en código

```
booking:create|update|cancel|view:all|view:own
patient:create|update|cancel
schedule:view:all|view:own
anesthetist:assign
metrics:view
user:create|list|update|approve|deactivate|reactivate
or:open_close
contact:view
rules:edit
```

No hay permiso fino para “ver PII de paciente de otro cirujano” separado de `booking:view:*`.

---

## 3. Hallazgos de autorización

### P0 — IDOR anestesista
`src/app/api/reservations/[id]/route.ts` → `hasFullReservationView` incluye `anestesista`.  
Cualquier anestesista autenticado que conozca/adivine un `id` obtiene payload completo (`fullName`, NH, email, teléfono, procedimiento, etc.).  
El **listado** es más restrictivo → inconsistencia lista vs detalle.

### P0 — Sesión sticky
APIs confían en claims JWT. Usuario `approved=false` o soft-deleted puede operar hasta expiración (~3 días), excepto flujos que lean `/api/auth/session`.

### P1 — Default rol gestor
`roleToFrontend()` retorna `"gestor"` para roles desconocidos.

### P1 — Sin middleware
Rutas `/calendario`, `/cirujano` accesibles como SPA; protección real = API. OK si APIs son correctas; malo para defense-in-depth y para no filtrar datos embebidos.

### P1 — Permisos solo UI
- Indisponibilidades: localStorage, no server.
- Algunas normas editables no se aplican al motor de scheduling.
- Apertura de bloque: permiso `or:open_close` sin backend operativo.

### P2 — Over-fetch listado gestor
Gestores reciben todos los pacientes del rango — necesario operativamente, pero amplia superficie si XSS/sesión robada.

---

## 4. Endpoints sin requireAuth (esperado o riesgo)

| Endpoint | Auth |
|----------|------|
| `POST /api/auth/login` | público + rate limit |
| `POST /api/auth/logout` | limpia cookie |
| `POST /api/contact` | público |
| `POST /api/email/webhook` | secret |
| `POST /api/cron/...` | Bearer CRON_SECRET (condicional) |
| `GET /api/auth/debug-session` | solo development |

Resto de APIs inventariadas: con sesión (salvo bugs puntuales).

---

## 5. Recomendaciones (sin implementar)

1. Anestesista: acceso detalle solo si asignado al turno/recurso/fecha o `anesthetistId` coincide; o strip PII.  
2. Helper `requireActiveUser(session)` consultando DB.  
3. Fail-closed en `roleToFrontend`.  
4. Tests de matriz permisos por endpoint.  
5. Evaluar middleware solo para redirect UX (no sustituye checks API).
