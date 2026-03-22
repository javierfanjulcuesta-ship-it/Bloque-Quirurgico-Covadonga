# Refactor autorización – Endpoints críticos

## Problemas detectados

| # | Problema | Endpoint | Solución |
|---|----------|----------|----------|
| 1 | GET /users permitía a cualquier autenticado ver emails y roles de todos | GET /api/users | user:list para datos completos; roles con booking/schedule obtienen lista mínima (sin email) |
| 2 | No existía GET por ID de reserva → riesgo IDOR si se añadía | — | Creado GET /api/reservations/[id] con canAccessBooking |
| 3 | Rangos de fecha sin límite en listados | GET reservations, block-opening-plan, anesthetist-assignments | Límite 93 días |
| 4 | Prisma sin select explícito → riesgo de exponer campos nuevos | Varios | select explícito en todas las consultas |
| 5 | GET block-opening-plan sin permiso de agenda | GET /api/block-opening-plan | requireAnyPermission schedule:view |

---

## Permisos ajustados

| Permiso | Cambio |
|---------|--------|
| user:list | Nuevo. Solo gestor/gestor-anestesista. Lista completa con email. |
| booking:view:own, schedule:view:own, booking:create | Dan acceso a lista mínima de usuarios (id, name, role) para co-surgeon y display |

---

## Resumen por endpoint

| Endpoint | Auth | Permiso | Recurso | Select | Límites |
|----------|------|---------|---------|--------|---------|
| POST /reservations | ✓ | booking:create | — | ✓ | — |
| GET /reservations | ✓ | booking:view:own \| all | surgeonFilter | ✓ | 93 días |
| GET /reservations/[id] | ✓ | canAccessBooking | booking | ✓ | — |
| PUT /anesthetist-assignments | ✓ | anesthetist:assign | — | ✓ | 93 días |
| GET /anesthetist-assignments | ✓ | schedule:view:own \| anesthetist:assign | anesthetistId | ✓ | 93 días |
| GET /block-opening-plan | ✓ | schedule:view:own \| all | — | ✓ | 93 días |
| PUT /block-opening-plan | ✓ | or:open_close | — | — | — |
| GET /users | ✓ | user:list \| (booking/schedule) | — | ✓ | Respuesta reducida sin user:list |
| POST /users | ✓ | user:create | — | — | — |
| GET /contact | ✓ | contact:view | — | — | — |

---

## Códigos HTTP consistentes

- 401: No autenticado
- 403: Autenticado pero sin permiso
- 404: Recurso no encontrado
- 409: Conflicto (ej. slot ocupado)
- 400: Datos inválidos o rango excedido
