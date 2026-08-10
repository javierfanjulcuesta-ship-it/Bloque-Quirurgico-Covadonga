# Roadmap de mejora (sin implementar)

Ordenado por prioridad. Cada ítem incluye campos pedidos.  
**Ninguno se ha implementado en esta auditoría.**

### Revalidación main (2026-08-10)

`origin/main` = `c905836cb57c0f88350625025fde4da425ab113a` (idéntico al checkpoint auditado).  
**Todos los P0 siguen presentes. Todos los P1 siguen presentes** (P1.10 solo mitigado parcialmente por la documentación de auditoría).  
Orden de reparación definitivo y tabla de evidencia: [`15_MAIN_REVALIDATION.md`](./15_MAIN_REVALIDATION.md).

---

## P0 — Riesgo inmediato / producción

### P0.1 — Baseline BD / migraciones
- **Problema:** Drift schema↔BD; P2022/P3005; ALTER manuales.  
- **Riesgo actual:** 5/5 — nuevos 500 y bloqueo de evolución.  
- **Solución:** Ejecutar `DATABASE_BASELINE_PLAN.md` en clon → prod.  
- **Archivos:** `prisma/schema.prisma`, `prisma/migrations/**`, docs deploy.  
- **Dificultad:** 4 · **Riesgo impl.:** 4 · **Beneficio:** 5  
- **Deps:** Backup, acceso staging.  
- **Tests:** Smoke reservas + patientEmail + migrate status.  
- **Rollback:** Snapshot BD.  
- **Toca BD:** Sí · **Toca prod:** Sí (fase final autorizada)

### P0.2 — IDOR anestesista en detalle reserva
- **Problema:** `hasFullReservationView` incluye anestesista.  
- **Riesgo:** 5/5 fuga PII.  
- **Solución:** Acceso solo si asignado al slot/turno o strip pacientes.  
- **Archivos:** `src/app/api/reservations/[id]/route.ts`, helpers auth.  
- **Dificultad:** 2 · **Riesgo:** 2 · **Beneficio:** 5  
- **Tests:** T03 matriz.  
- **Rollback:** Revert commit.  
- **BD/Prod:** No BD · Sí código prod

### P0.3 — Revalidar usuario activo en APIs
- **Problema:** JWT sticky tras deactivate/role change.  
- **Riesgo:** 4/5.  
- **Solución:** Check DB `approved`/`deletedAt`/role en helper sesión o por request.  
- **Archivos:** `src/lib/auth/session.ts`, `authorization.ts`, APIs.  
- **Dificultad:** 3 · **Riesgo:** 2 · **Beneficio:** 5  
- **Tests:** T05.  
- **Rollback:** Revert.  
- **BD/Prod:** No schema · Sí app

### P0.4 — Fail-closed `roleToFrontend`
- **Problema:** Default `"gestor"`.  
- **Riesgo:** 4/5.  
- **Solución:** Lanzar/retornar null y denegar.  
- **Archivos:** `src/lib/roleMapping.ts`  
- **Dificultad:** 1 · **Riesgo:** 2 · **Beneficio:** 4  
- **Tests:** T16.  
- **Rollback:** Revert.  
- **BD/Prod:** No · Sí app

### P0.5 — Congelar Vercel duplicado + documentar oficial
- **Problema:** `…-awdb` vs oficial.  
- **Riesgo:** 4/5 deploy erróneo.  
- **Solución:** Política + rename description + README; no borrar.  
- **Archivos:** README, `docs/DEPLOY-VERCEL.md`  
- **Dificultad:** 1 · **Riesgo:** 1 · **Beneficio:** 4  
- **Tests:** N/A checklist.  
- **Rollback:** N/A.  
- **BD:** No · **Prod config:** Sí (cuidadosamente)

### P0.6 — Suite tests P0 (10 casos)
- **Problema:** 0 tests.  
- **Riesgo:** 5/5 regresiones silenciosas.  
- **Solución:** Vitest/Playwright mínimos (ver `09_TESTING.md`).  
- **Archivos:** `package.json`, `tests/**`  
- **Dificultad:** 3 · **Riesgo:** 1 · **Beneficio:** 5  
- **Deps:** BD test.  
- **Rollback:** Quitar job CI.  
- **BD/Prod:** Solo test DB

---

## P1 — Importante

### P1.1 — Activar `logUserAuditEvent` real
- **Problema:** No-op.  
- **Solución:** Escribir en `UserAuditEvent` tras confirmar tabla en prod.  
- **Archivos:** `src/lib/userAudit.ts`  
- **Dif 2 · Riesgo 2 · Benef 4** · **BD:** puede requerir tabla · Tests: insert event

### P1.2 — Auditar asignaciones anestésicas
- **Problema:** Sin eventos.  
- **Solución:** `ReservationEvent` genérico o tabla assignment_events.  
- **Archivos:** `anesthetist-assignments/route.ts`  
- **Dif 3 · Riesgo 2 · Benef 4** · BD posible

### P1.3 — Multi-slot atómico / compensación
- **Problema:** Reservas parciales.  
- **Solución:** API batch + txn o compensating cancel.  
- **Archivos:** `createReservationInDb.ts`, `cirujano/page.tsx`, API  
- **Dif 4 · Riesgo 3 · Benef 5** · Tests T11/T12

### P1.4 — Race empty-hold patients
- **Solución:** Lock/conditional update dentro de txn.  
- **Archivos:** `createReservationInDb.ts`  
- **Dif 3 · Riesgo 3 · Benef 4**

### P1.5 — Timezone Europe/Madrid
- **Problema:** Deadlines/calendar keys inconsistentes.  
- **Archivos:** `schedulingDeadline.ts`, `WeekCalendar.tsx`, utils fecha  
- **Dif 3 · Riesgo 3 · Benef 4** · **Maintenance:** validar borde jueves

### P1.6 — UX modal programar (soft-fail + sticky)
- **Archivos:** `ProgramarPacientesModal.tsx`, `cirujano/page.tsx`  
- **Dif 2 · Riesgo 1 · Benef 4**

### P1.7 — Targets táctiles móvil cirujano
- **Archivos:** `SlotCell.tsx`, `WeekGridCalendar.tsx`  
- **Dif 2 · Riesgo 1 · Benef 3**

### P1.8 — CRON_SECRET en todos los entornos alcanzables + health
- **Dif 1 · Riesgo 1 · Benef 3** · Prod config

### P1.9 — Lint errors P0 de hooks
- **Problema:** `npm run lint` rojo.  
- **Dif 2 · Riesgo 2 · Benef 3** · No acoplar a features

### P1.10 — Docs canónicas (README + ARCHITECTURE + DATABASE + DEPLOY)
- **Dif 2 · Riesgo 1 · Benef 4**

---

## P2 — Mejora

| ID | Ítem | Dif | Riesgo | Benef | BD |
|----|------|-----|--------|-------|----|
| P2.1 | Dynamic import CuadroDeMando / xlsx | 2 | 1 | 3 | No |
| P2.2 | Cablear normas BD a motor o UI read-only runtime | 4 | 3 | 3 | No/sí |
| P2.3 | Histórico desde ReservationEvent | 3 | 2 | 3 | No |
| P2.4 | Rate limit contact + Redis login | 3 | 2 | 3 | No |
| P2.5 | CSP headers | 2 | 2 | 3 | No |
| P2.6 | PWA iconos + InstallPrompt | 2 | 1 | 2 | No |
| P2.7 | First-login password change | 3 | 2 | 3 | Sí |
| P2.8 | Selects minimizados por rol | 3 | 2 | 4 | No |
| P2.9 | Partir `CuadroDeMando` / `cirujano/page` | 4 | 3 | 3 | No |
| P2.10 | Guard scripts destructivos (`NODE_ENV`/flag) | 1 | 1 | 4 | No |

---

## P3 — Nice-to-have

| ID | Ítem |
|----|------|
| P3.1 | Apertura de bloque real (`BlockOpeningPlan`) |
| P3.2 | Service worker offline selectivo |
| P3.3 | E2E Playwright amplio |
| P3.4 | Anonimización/retención automática PII |
| P3.5 | Circuito preanestesia con emails reales |
| P3.6 | Eliminar `/registro` y UI huérfana |
| P3.7 | Métricas server-side / materializadas |

---

## Quick wins (reconfirmados)

1. P0.2 IDOR  
2. P0.4 role mapping  
3. P0.5 documentar Vercel  
4. P1.6 modal soft-fail  
5. P2.10 guards scripts  
6. Activar audit users tras confirmar tabla (P1.1)

---

## Cambios que exigen controles especiales

| Control | Ítems |
|---------|-------|
| BACKUP | P0.1, cualquier migración P1/P2 con schema |
| MIGRATION | P0.1, P1.1 si falta tabla, P2.7 |
| TESTING | P0.2–P0.4, P0.6, P1.3–P1.5 |
| MAINTENANCE WINDOW | P0.1 fase prod (posiblemente corta); P1.5 si se cambia lógica de cierre en semana activa |

---

## Orden sugerido de ejecución (cuando se autorice)

```
1) Acordar conclusiones
2) P0.5 Vercel hygiene (sin código)
3) P0.2 + P0.4 + P0.3 (security hotfixes)
4) P0.6 tests mínimos en paralelo
5) P0.1 baseline BD (staging→prod)
6) P1 audits + multi-slot + timezone + UX modal
7) P2/P3 según negocio
```

---

## Nota final

Este roadmap es un **menú autorizado**, no un backlog ya en curso.  
Ningún cambio de código funcional forma parte de la Fase 1 de auditoría.
