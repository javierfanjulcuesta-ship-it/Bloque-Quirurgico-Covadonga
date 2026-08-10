# 15 — Revalidación frente a `origin/main`

**Fecha revalidación:** 2026-08-10  
**Rama de trabajo:** `restore-checkpoint-c905836`  
**HEAD local (auditoría):** `c905836cb57c0f88350625025fde4da425ab113a`  
**SHA auditado de `origin/main`:** `c905836cb57c0f88350625025fde4da425ab113a`  
**Resultado git:** `c905836` ≡ `origin/main` ≡ `main` local — **diff vacío** (`git diff c905836..origin/main` sin cambios).  
**Alcance:** Solo lectura de código + commit documental en `docs/audit/`. Sin merge, sin prod, sin Prisma mutate.

---

## 1. Estado Git (evidencia)

| Check | Resultado |
|-------|-----------|
| `git status` | Solo untracked `docs/audit/` (antes del commit documental) |
| Rama actual | `restore-checkpoint-c905836` |
| HEAD | `c905836cb57c0f88350625025fde4da425ab113a` |
| `origin/main` tras `git fetch` | **Mismo SHA** `c905836…` |
| Commits `c905836..origin/main` | **Ninguno** |
| Commits `origin/main..c905836` | **Ninguno** |
| Cambios fuera de `docs/audit/` | **Ninguno** |

**Nota:** La rama local `debug-error-reservas` (`4674093`) está **1 commit por delante** de main y **no** está mergeada. No altera la validez de hallazgos sobre main; sí es riesgo operativo si alguien despliega esa rama por error.

---

## 2. Conclusión de aplicabilidad

Los hallazgos de la auditoría sobre `c905836` **siguen siendo 100 % aplicables a `origin/main` actual**, porque son el mismo commit. No hay hallazgos “ya resueltos en main” por evolución de código. No hay hallazgos nuevos introducidos por divergencia main↔checkpoint.

---

## 3. Tabla de revalidación P0 / P1 + checks especiales

| ID | Severidad | Hallazgo original | Estado en main | Archivo actual | Evidencia | Acción recomendada |
|----|-----------|-------------------|----------------|----------------|-----------|-------------------|
| P0.1 | P0 | Drift Prisma / migraciones incompletas / P3005–P2022 | **SIGUE PRESENTE EN MAIN** | `prisma/schema.prisma`, `prisma/migrations/*` (solo 2 ALTER), docs deploy | Solo phase1+phase2; sin CREATE baseline; `package.json` sigue con `db:push` | Ejecutar `DATABASE_BASELINE_PLAN.md` en clon→prod cuando se autorice |
| P0.2 | P0 | IDOR `GET /api/reservations/[id]` (anestesista = vista completa) | **SIGUE PRESENTE EN MAIN** | `src/app/api/reservations/[id]/route.ts` | `hasFullReservationView` incluye `"anestesista"` L25–27, L48 | Restringir a asignación/ownership o strip PII |
| P0.3 | P0 | JWT sticky: APIs no revalidan `approved`/`deletedAt` | **SIGUE PRESENTE EN MAIN** | `src/lib/auth/session.ts`; contraste `src/app/api/auth/session/route.ts` | `getSessionFromCookie` solo `jwtVerify`; revalidación DB **solo** en `/api/auth/session` | Helper `requireActiveUser` en mutaciones/APIs |
| P0.4 | P0 | `roleToFrontend` fail-open → `"gestor"` | **SIGUE PRESENTE EN MAIN** | `src/lib/roleMapping.ts` | `return "gestor"` L28 ante rol desconocido | Fail-closed (null/deny) |
| P0.5 | P0 | Proyecto Vercel duplicado `…-awdb` | **SIGUE PRESENTE EN MAIN** (riesgo operativo; no verificable en Git) | Brief + `docs/audit/11_DEVOPS.md` | No hay evidencia en repo que lo elimine; riesgo de proceso | Documentar/congelar awdb; no borrar |
| P0.6 | P0 | Ausencia de tests automatizados | **SIGUE PRESENTE EN MAIN** | `package.json` (sin script `test`) | Glob `*.{test,spec}.*` → **0 archivos** | Suite P0 (matriz `09_TESTING.md`) |
| P1.1 | P1 | `logUserAuditEvent` no-op | **SIGUE PRESENTE EN MAIN** | `src/lib/userAudit.ts` | Comentario “no existe en schema desplegado”; función vacía | Activar write a `UserAuditEvent` tras confirmar tabla |
| P1.2 | P1 | Sin auditoría de asignaciones anestésicas | **SIGUE PRESENTE EN MAIN** | `src/app/api/anesthetist-assignments/route.ts` | PUT replace sin `logReservationEvent` / audit | Emitir eventos who/what/when |
| P1.3 | P1 | Multi-slot create no atómico | **SIGUE PRESENTE EN MAIN** | `src/app/cirujano/page.tsx`, `createReservationInDb.ts` | N POSTs secuenciales desde UI; no batch API | API batch + txn/compensación |
| P1.4 | P1 | Race empty-hold add patients | **SIGUE PRESENTE EN MAIN** | `src/lib/reservations/createReservationInDb.ts` | `patientCount` vía `count` **fuera** de txn (L145–173) | Count/lock dentro de txn |
| P1.5 | P1 | Timezone inconsistente (deadline/calendar) | **SIGUE PRESENTE EN MAIN** | `schedulingDeadline.ts`, `WeekCalendar.tsx`, `preanesthesiaAutoAssign.ts` | Preanestesia usa Madrid; deadlines/local/`toISOString` mezclados | Unificar Europe/Madrid |
| P1.6 | P1 | Modal programar: soft-fail cierra modal | **SIGUE PRESENTE EN MAIN** | `ProgramarPacientesModal.tsx`, `cirujano/page.tsx` | Soft `return` sin throw → `onClose` | No cerrar si soft-fail; sticky footer |
| P1.7 | P1 | Targets táctiles móviles pequeños | **SIGUE PRESENTE EN MAIN** | `SlotCell.tsx`, `WeekGridCalendar.tsx` | Compact cells / ~36px (doc mobile + código) | Modo touch ≥44px |
| P1.8 | P1 | Cron: secret condicional; preview abierto si falta | **SIGUE PRESENTE EN MAIN** | `src/app/api/cron/release-pending-reservations/route.ts` | Exige secret en production; si no hay secret fuera de prod, no 401 | `CRON_SECRET` en todos los envs alcanzables |
| P1.9 | P1 | Lint en rojo (hooks/React 19) | **SIGUE PRESENTE EN MAIN** | Varios (`AuthContext`, calendario, etc.) | Auditoría: 12 errors / 51 warnings; código sin cambios | Corregir errors P0 de hooks en PR dedicado |
| P1.10 | P1 | Docs canónicas ausentes/stale | **PARCIALMENTE MITIGADO (solo audit pack)** | `docs/audit/*` nuevo; `README.md` sigue boilerplate | Audit pack no sustituye README/DEPLOY canónicos | Actualizar README + DEPLOY cuando se autorice docs ops |
| S01 | P0 | Contraseña hardcodeada en seed | **SIGUE PRESENTE EN MAIN** | `prisma/seed.ts` | `PASSWORD = "Piloto2024!"` | Env-only; no seed en prod; rotar si se usó |
| S02 | P0 | Uso cultural/scripts de `prisma db push` | **SIGUE PRESENTE EN MAIN** | `package.json` `db:push` / `db:setup` | Scripts presentes; docs históricos push | Prohibir en prod; migrate deploy |
| S03 | P1 | Estado operativo en localStorage (indisponibilidad; demo paths) | **SIGUE PRESENTE EN MAIN** | `storageAnesthetistUnavailability.ts`, `SolicitarNoDisponibilidad.tsx` | Indisponibilidad **solo** localStorage; reservas real→API | Persistencia server + enforcement |
| S04 | P1 | Reemplazo completo asignaciones (`deleteMany` + recreate) | **SIGUE PRESENTE EN MAIN** | `anesthetist-assignments/route.ts` L230–231 | Txn con `deleteMany({})` total; hay guard wipe vacío | Versionado/ETag; auditar; limitar scope |
| S05 | P0/P1 | Concurrencia reservas (unique OK; races parciales) | **SIGUE PRESENTE EN MAIN** | `createReservationInDb.ts` + schema unique | P2002 cubre doble slot; empty-hold/multi-slot no | Ver P1.3/P1.4 |
| S06 | P1 | Concurrencia preanestesia (slot sin unique) | **SIGUE PRESENTE EN MAIN** | `preanesthesiaAutoAssign.ts`, `patientCircuitPhase2.ts` | Load occupied → update sin unique en `preanesthesiaAppointmentAt` | Unique/constraint o lock + recheck |
| S07 | P1 | Cron liberación PENDING | **SIGUE PRESENTE EN MAIN** | `cron/release-pending-reservations/route.ts` | Loop secuencial + eventos; auth según CRON_SECRET | Secret obligatorio; txn/lote |
| S08 | P1 | Auditoría usuarios/reservas incompleta | **SIGUE PRESENTE EN MAIN** | `userAudit.ts`, `logReservationEvent.ts` | ReservationEvent sí; UserAudit no-op; sin assignment events | P1.1 + P1.2 |
| S09 | P1 | Fallback email → mock si falla SMTP/Graph | **SIGUE PRESENTE EN MAIN** | `src/lib/email/outlookService.ts` | Catch → `_adapterMode = "mock"` + warn | Fail loud en prod; métrica/alerta |
| S10 | P0 | Ausencia tests | **SIGUE PRESENTE EN MAIN** | — | = P0.6 | = P0.6 |
| S11 | P1 | Errores lint | **SIGUE PRESENTE EN MAIN** | — | = P1.9 | = P1.9 |

### Leyenda de estados usados
- **SIGUE PRESENTE EN MAIN** — confirmado en SHA `c905836` (= main)  
- **YA RESUELTO** — ninguno en esta revalidación  
- **CAMBIADO / REQUIERE REAUDITORÍA** — ninguno por diff de código; P1.10 solo añadido pack audit (docs)  
- **FALSO POSITIVO** — ninguno confirmado

---

## 4. Contadores

| Métrica | Valor |
|---------|------:|
| P0 del roadmap (P0.1–P0.6) confirmados presentes | **6 / 6** |
| Checks especiales P0-equivalentes (S01, S02, S05-parte, S10) | Confirmados |
| P1 del roadmap (P1.1–P1.10) confirmados presentes | **9 / 10** presentes; **P1.10 parcialmente mitigado** solo con `docs/audit/` |
| Ya resueltos | **0** |
| Falsos positivos | **0** |
| Nuevos por divergencia main | **0** |
| Desaparecidos | **0** |

---

## 5. Orden definitivo de reparación (cuando se autorice)

1. **P0.5** — Congelar/documentar Vercel oficial vs awdb (sin tocar código app).  
2. **P0.2** — Cerrar IDOR detalle reserva.  
3. **P0.4** — Fail-closed `roleToFrontend`.  
4. **P0.3** — Revalidar usuario activo en APIs.  
5. **P0.6 / S10** — Tests P0 mínimos (pueden ir en paralelo tras 2–4).  
6. **P0.1 / S02** — Baseline BD (staging → prod) según `DATABASE_BASELINE_PLAN.md`.  
7. **S01** — Eliminar/aislar password seed + política no-seed-prod.  
8. **P1.1 + P1.2 / S08** — Auditoría usuarios + asignaciones.  
9. **P1.4 + P1.3 / S05** — Races reservas + multi-slot atómico.  
10. **S06** — Concurrencia preanestesia.  
11. **P1.8 / S07** — Cron secret + robustez liberación.  
12. **S09** — Email mock fail-loud en producción.  
13. **P1.5** — Timezone Madrid.  
14. **P1.6 + P1.7 + S03** — UX modal/móvil + indisponibilidad server-side.  
15. **P1.9 / S11** — Lint errors.  
16. **P1.10** — Docs canónicas README/DEPLOY (ampliar más allá de audit pack).  
17. **S04** — Endurecer PUT asignaciones (versionado + audit; ya parcialmente protegido wipe).

---

## 6. Qué NO hacer aún

- Merge a main de cambios funcionales.  
- `prisma db push` / migrate contra producción.  
- Modificar Vercel/prod.  
- Implementar hotfixes sin autorización explícita tras revisar este documento.

---

## 7. Impacto en scores / roadmap

Al ser **main ≡ checkpoint auditado**, no se rebajan ni se cierran ítems P0/P1 por evidencia de código nuevo.  
Se actualizan `00_EXECUTIVE_SUMMARY.md` y `14_IMPROVEMENT_ROADMAP.md` únicamente con **nota de revalidación** y puntero a este archivo.
