# Arquitectura

**Estado:** ACEPTABLE para piloto hospitalario pequeño · FRÁGIL para crecer sin disciplina  
**Score sugerido:** 58/100

---

## 1. Visión general

```
Browser (Next.js App Router, client shells)
    │  cookie JWT httpOnly (bloque_session)
    ▼
API Routes (src/app/api/**)  ← sin middleware.ts
    │  requireAuth / requirePermission / canAccess*
    ▼
Domain libs (src/lib/reservations|auth|email|metrics|…)
    │
    ▼
Prisma Client → PostgreSQL (Neon/Supabase via DATABASE_URL + DIRECT_URL)
```

**Patrón dominante:** pocas rutas de página (`/calendario`, `/cirujano`) que actúan como **shells multi-tab** por rol. La lógica de negocio crítica está parcialmente en `src/lib`, pero aún hay mucha orquestación en páginas React.

**Modo dual:** `modoDemo` (solo development + `NEXT_PUBLIC_DEMO_MODE≠false`) vs API real. En producción el demo no se activa.

---

## 2. Estructura de carpetas (mapa)

| Ruta | Rol |
|------|-----|
| `src/app/` | Páginas, layout, manifest, API routes |
| `src/components/` | UI por rol (gestor/cirujano/anestesista/calendar/ui) |
| `src/context/` | AuthContext, UsersContext |
| `src/lib/auth/` | JWT, permisos, authorization |
| `src/lib/reservations/` | Create, overflow, circuit, cancel helpers |
| `src/lib/email/` | Adapters, webhook processing, templates |
| `src/lib/metrics/` | Cuadro de mando / economía / optimization |
| `src/lib/validations/` | Zod schemas |
| `prisma/` | schema + 2 migraciones + seed |
| `scripts/` | Usuarios, showcase, rules seed |
| `docs/` | Mucha documentación histórica (parcialmente stale) |

---

## 3. Mapa funcional (Feature → UI → API → Servicio → Modelo → Permisos)

| Funcionalidad | UI | Endpoint | Servicio | Modelo | Permisos |
|---------------|----|----------|----------|--------|----------|
| Login | `/` | `POST /api/auth/login` | `session.ts`, bcrypt | User | público (rate limit) |
| Sesión | AuthContext | `GET /api/auth/session` | revalida DB | User | cookie |
| Calendario | `/calendario` | `GET /api/reservations` | `dataHelpers` | Reservation, PatientInBlock | view:all/own |
| Reservar hueco | `/cirujano` | `POST /api/reservations` | `createReservationInDb` | Reservation | booking:create |
| Programar pacientes | `ProgramarPacientesModal` | POST / PATCH patient | create + phase2 | PatientInBlock | patient:* |
| Cancelar paciente | Mis pacientes | `PATCH …/patient/cancel` | deadline + txn | PatientInBlock, Reservation | patient:cancel |
| Cancelar reserva | modales cirujano | `PATCH …/cancel` | `executeReservationCancelPatch` | Reservation | booking:cancel |
| Bolsa común / liberación | `UltimasLiberacionesView` + cron | `GET common-pool` · `POST cron` | release + email | Reservation, ReleaseNotificationLog | cron secret / view |
| Asignar anestesistas | `AsignarAnestesistas` | GET/PUT assignments | SESPA checks | AnesthetistAssignment | anesthetist:assign |
| Mi programación | `MiProgramacion` | GET assignments + reservations | — | Assignment, Reservation | schedule:view:own |
| No disponibilidad | `SolicitarNoDisponibilidad` | **localStorage only** | storage* | — | UI only |
| Preanestesia | `ValoracionPreanestesia` | vía reservations | phase2 auto-assign | PatientInBlock | anestesista |
| Usuarios | Crear/Lista | `/api/users*` | invitation email | User | user:* |
| Normas | Normas*View | `/api/programming-rules` | programmingRules | ProgrammingRule | rules:edit / read |
| Mensajes | calendario tab | `/api/contact` | ContactMessage | ContactMessage | contact:view / public POST |
| Cuadro de mando | `CuadroDeMando` | GET reservations (+ client metrics) | `metrics/*` | — | metrics:view |
| Histórico | `HistoricoView` | datos ya cargados | — | — | por rol; anestesista stub |
| Email reservas | — | `/api/email/webhook` | `processIncomingEmail` | EmailMessage | webhook secret |
| Apertura bloque | `GestionarApertura` (huérfano) | stub 503 | always OPEN | BlockOpeningPlan | or:open_close |
| Import planificación | `/importar-planificacion` | — | preview only | — | gestor |
| PWA | manifest | — | — | — | all |

---

## 4. TOP 10 riesgos arquitectónicos

1. **Páginas dios:** `cirujano/page.tsx` (~1400), `CuadroDeMando.tsx` (~2800) — lógica + UI + estado.  
2. **Reglas de negocio en dos sitios:** constantes/`schedulingDeadline` vs normas editables en BD (no cableadas al runtime).  
3. **Auth solo en handlers** — sin middleware de rutas; UI “protege” páginas pero HTML/JS es público.  
4. **Dual storage:** crítico en BD; indisponibilidades/mensajes demo en localStorage → estados inconsistentes.  
5. **Stubs contradicen schema:** `blockOpeningPlan` API vacía; `logUserAuditEvent` no-op; modelo sí existe.  
6. **Overfetch del calendario:** GET reservas con pacientes para alimentar muchas vistas.  
7. **Métricas en cliente:** CuadroDeMando calcula en browser sobre payload grande.  
8. **Acoplamiento email↔reservas** en webhook sin cola durable.  
9. **Falta capa de dominio explícita** (casos de uso) — fácil duplicar validaciones.  
10. **Ramas/features paralelas** (`feature/cuadro-mando`, retrospective) aumentan riesgo de merge drift.

---

## 5. Acoplamiento y responsabilidades

| Hallazgo | Evidencia |
|----------|-----------|
| Lógica en React | Validaciones de duración, resolución de quirófano, cancel flows en `cirujano/page.tsx` |
| Duplicación | Transition minutes en constants + normas UI no aplicadas |
| Endpoints densos | `POST /api/reservations`, patient PATCH (overflow + circuit + txn) |
| Validación frontend-only | Algunos límites de “max 2 quirófanos” reforzados en UI; SESPA sí en server |
| N+1 potencial | Bucles de create multi-slot (N POSTs); cron libera 1 a 1 |
| Race | Check-then-act fuera de txn en empty-hold patient add |
| No atómico multi-hueco | Fallo a mitad = huecos parcialmente reservados |

---

## 6. Adequación hospitalaria

**Adecuado hoy para:** piloto controlado, pocos usuarios concurrentes, gestor central.  
**No adecuado aún para:** alta concurrencia multi-cirujano sin más locking; auditoría forense completa; multi-hospital; compliance formal sin retención/RGPD operativa.

**Recomendación arquitectónica (sin implementar):**  
mantener App Router + API routes, pero extraer **use-cases** (`ReserveSlot`, `ProgramPatients`, `CancelPatient`, `AssignAnesthetists`) con transacciones y eventos, y adelgazar shells UI a presentación.
