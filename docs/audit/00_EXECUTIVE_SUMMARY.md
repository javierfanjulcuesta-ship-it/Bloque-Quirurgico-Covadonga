# Auditoría técnica — Resumen ejecutivo

**Aplicación:** Bloque Quirúrgico Covadonga / Qxflow (`bloque-quirurgico-v2`)  
**Fecha de auditoría:** 2026-08-10  
**Rama analizada:** `restore-checkpoint-c905836` (checkpoint seguro)  
**Alcance:** Solo lectura. Sin cambios funcionales, sin tocar producción, Supabase ni migraciones destructivas.  
**Build verificado:** `npm run build` OK · `npx tsc --noEmit` OK · `npm run lint` FALLA (12 errors, 51 warnings) · **0 tests automatizados**

### Revalidación vs `origin/main` (2026-08-10)

| Campo | Valor |
|-------|-------|
| SHA `origin/main` | `c905836cb57c0f88350625025fde4da425ab113a` |
| Diff checkpoint ↔ main | **Vacío** (mismo commit) |
| P0 confirmados en main | **6 / 6** (todos siguen presentes) |
| P1 confirmados en main | **9 / 10** presentes; P1.10 solo parcialmente cubierto por este pack `docs/audit/` |
| Resueltos / falsos positivos / nuevos por divergencia | **0 / 0 / 0** |
| Detalle | Ver [`15_MAIN_REVALIDATION.md`](./15_MAIN_REVALIDATION.md) |

**Conclusión:** los hallazgos de c905836 aplican íntegramente al main actual. El estado global **FRÁGIL** se mantiene.

---

## 1. Estado global

### **FRÁGIL**

La aplicación es **operativa y con núcleo funcional serio** (reservas, pacientes, roles, cierre semanal, emails, cuadro de mando), pero el estado de **base de datos/migraciones**, **trazabilidad incompleta**, **ausencia de tests** y **deuda de producción** (drift Prisma, JWT sticky, IDOR anestesista) la sitúan en **FRÁGIL**, no en ACEPTABLE estable.

No es CRÍTICO en el sentido de “inusable hoy”, pero **sí es frágil para seguir desarrollando** sin un plan de baseline y hardening.

---

## 2. Scores (0–100)

| Área | Score | Comentario breve |
|------|------:|------------------|
| Arquitectura | **58** | Núcleo API + lib sólido; UI monolítica; stubs y dual demo/real |
| Seguridad | **55** | Auth JWT razonable; gaps IDOR, sesión sticky, cron preview |
| Base de datos | **35** | Historia `db push` + 2 migraciones parciales; P3005/P2022 reales |
| Permisos | **62** | RBAC centralizado bueno; inconsistencias en detalle vs listado |
| Robustez | **48** | Unique slot + txn parciales; races multi-slot y timezone |
| Tests | **5** | Sin suite unit/integration/E2E |
| UX | **52** | Desktop usable; móvil/modales/tabs densos |
| Performance | **60** | Aceptable a escala piloto; CuadroDeMando y overfetch riesgos |
| DevOps | **40** | Dos proyectos Vercel; docs orientadas a `db push`; sin pipeline de migrate |
| Mantenibilidad | **45** | Docs abundantes pero desalineadas; componentes >1000 líneas |

**Media ponderada orientativa:** ~**46 / 100**

---

## 3. TOP 10 riesgos

1. **Drift schema ↔ BD producción** (P2022 `patientEmail`, P3005 sin baseline) — riesgo de nuevos 500 en runtime.  
2. **Migraciones incompletas** — solo 2 ALTER; el resto histórico vía `db push`.  
3. **IDOR anestesista** en `GET /api/reservations/[id]` (PII clínica completa por ID).  
4. **JWT no revalidado** contra `approved`/`deletedAt`/rol hasta 3 días.  
5. **Cero tests automatizados** — regresiones de doble reserva/permisos no detectables en CI.  
6. **Proyecto Vercel duplicado** (`…-awdb`) — riesgo de deploy/variables al entorno equivocado.  
7. **`UserAuditEvent` no-op** pese a existir en schema local — falsa sensación de auditoría.  
8. **Multi-slot create no atómico** — fallos a mitad dejan reservas parciales.  
9. **Timezone inconsistente** (UTC slice vs local vs Europe/Madrid solo en preanestesia).  
10. **Datos clínicos en APIs/cliente** (nombre, NH, email, teléfono, procedimiento, mutua) sin retención automatizada.

---

## 4. TOP 10 mejoras de mayor impacto

1. **Baseline Prisma seguro** (inventario prod → diff → `migrate resolve`, sin reset).  
2. **Corregir IDOR** detalle de reserva para anestesista.  
3. **Revalidar sesión/usuario en cada API** (o middleware + check DB).  
4. **Activar `logUserAuditEvent` real** y auditar asignaciones anestésicas.  
5. **Tests críticos:** doble reserva, permisos, cancel+cierre, IDOR.  
6. **Congelar proyecto Vercel oficial** y documentar el duplicado como archivado.  
7. **Transacción / compensación** en creación multi-hueco.  
8. **Unificar timezone Europe/Madrid** en deadlines y claves de fecha.  
9. **Simplificar UX móvil** (targets táctiles, modales con sticky footer, menos tabs).  
10. **Documentación operativa canónica** (README/ARCHITECTURE/DATABASE/DEPLOY reales).

---

## 5. Qué NO tocar todavía

- Producción / Supabase / Neon con `migrate reset`, `db push` ciego o DROP.  
- Refactors masivos de `CuadroDeMando` o shells de calendario/cirujano.  
- Eliminar el proyecto Vercel `bloque-quirurgico-covadonga-awdb`.  
- Force push / borrado de ramas (`debug-error-reservas`, `feature/*`, checkpoint).  
- Rotación masiva de secretos sin protocolo (salvo confirmación de exposición viva).  
- Ampliar circuito preanestesia real (emails reales) antes de baseline + permisos.  
- Unificar demo/real de golpe.

---

## 6. Qué arreglar por horizonte

### HOY (sin tocar prod)
- Revisar este paquete `/docs/audit/` y acordar roadmap.  
- Confirmar qué Vercel project es Production Branch = `main`.  
- Confirmar si `CRON_SECRET` y `JWT_SECRET` están en Production.  
- No añadir columnas a mano.

### ESTA SEMANA
- Inventario schema prod (solo lectura: `db pull` a archivo scratch / dump schema-only).  
- Ejecutar `DATABASE_BASELINE_PLAN.md` **fase 0–2** en staging/clon, no en prod.  
- Fix IDOR `GET /api/reservations/[id]`.  
- Revalidación de usuario activo en APIs críticas.  
- Smoke checklist manual de reservas/cancel/cierre.

### ESTE MES
- Baseline completo + dejar de usar `db push` en prod.  
- Suite mínima de tests de regresiones P0.  
- Activar auditoría de usuarios/asignaciones.  
- UX móvil de flujos cirujano (slots + modales).  
- Unificar timezone Madrid.  
- Política clara preview vs production.

### MÁS ADELANTE
- Apertura de bloque real (`BlockOpeningPlan`).  
- Histórico anestesista + eventos como fuente de verdad.  
- PWA completa (SW, iconos, InstallPrompt).  
- Rate limit distribuido, CSP, retención RGPD automatizada.  
- Refactor de componentes gigantes.

---

## 7. Quick wins (alto impacto · bajo riesgo · bajo esfuerzo)

| Quick win | Por qué |
|-----------|---------|
| Restringir `hasFullReservationView` (quitar anestesista o filtrar pacientes) | Cierra IDOR; cambio localizado |
| Revalidar `approved`/`deletedAt` en `getSessionFromCookie` o helper API | Cierra sesión sticky |
| Documentar Vercel oficial vs `awdb` en README | Reduce risk de deploy erróneo |
| Activar escritura real en `logUserAuditEvent` (modelo ya en schema) | Trazabilidad sin rediseño |
| Deshabilitar botón confirm de AsignarAnestesistas mientras `saving` | Evita doble submit |
| No cerrar `ProgramarPacientesModal` en soft-fail | UX crítica, 1 condición |
| Añadir iconos PWA en `public/` o quitar referencias rotas | Evita install rota |
| Marcar `db push` como **prohibido en prod** en docs | Alinea equipo |

---

## 8. Cambios que requieren BACKUP / MIGRATION / TESTING / MAINTENANCE WINDOW

| Tipo | Ejemplos |
|------|----------|
| **BACKUP** | Cualquier ALTER en prod; baseline; activación de FKs; limpieza de datos huérfanos |
| **MIGRATION** | Baseline squash; columnas phase1/2 si faltan; índices nuevos; `UserAuditEvent` si falta en prod |
| **TESTING** | IDOR fix; cambios createReservation; cierre/cron; permisos; timezone deadline |
| **MAINTENANCE WINDOW** | Solo si hace falta lock breve para marcar migraciones aplicadas + verificar `_prisma_migrations`; idealmente sin downtime si es solo `migrate resolve` |

---

## Inventario rápido del repo

| Elemento | Estado |
|----------|--------|
| Páginas | `/`, `/calendario`, `/cirujano`, `/registro` (redirect), `/importar-planificacion` |
| API routes | 27 |
| Middleware | **No existe** |
| Server actions | **Ninguna** |
| Prisma models | User, Reservation, PatientInBlock, ReservationEvent, AnesthetistAssignment, Email*, ContactMessage, ReleaseNotificationLog, BlockOpeningPlan, ProgrammingRule, UserAuditEvent |
| Migraciones SQL | 2 (phase1, phase2) |
| Tests | **0** |
| PWA | manifest; sin SW; iconos ausentes en `public/` |
| Email | SMTP → Graph → mock; webhook inbound |
| Cron | `POST /api/cron/release-pending-reservations` |
| Secretos SUPABASE_SERVICE_ROLE en repo | **SECRET_NOT_PRESENT** |
| Password seed hardcoded | **SECRET_PRESENT** (`prisma/seed.ts`) |

---

## Veredicto operativo

**Seguir desarrollando features nuevas sobre este estado es arriesgado.**  
Prioridad: **baseline BD + cerrar gaps de seguridad P0 + tests mínimos**, luego roadmap funcional.

---

*Siguiente paso humano: revisar roadmap en `14_IMPROVEMENT_ROADMAP.md` y autorizar únicamente los ítems P0 acordados.*
