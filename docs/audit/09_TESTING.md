# Testing

**Score:** 5/100  
**Inventario:** **0** archivos `*.test.*` / `*.spec.*`. No hay script `npm test` en `package.json`.

---

## 1. Cobertura conceptual actual

| Tipo | Estado |
|------|--------|
| Unit | Ausente |
| Integration (Prisma) | Ausente |
| API route | Ausente |
| Permissions matrix | Ausente (solo docs) |
| Database constraints | Solo runtime prod |
| E2E | Ausente |
| Regression / CI | Lint en local; build Vercel implícito; sin tests |

Existe documentación de auditorías/manuales (`docs/AUDITORIA_*`, piloto) que **no sustituye** automatización.

---

## 2. TEST MATRIX (prioridad para impedir desastres)

### P0 — Debe existir antes de features nuevas

| ID | Caso | Tipo | Impide |
|----|------|------|--------|
| T01 | Dos creates paralelo mismo slot → uno OK / uno `slot_occupied` | API+DB | Doble reserva |
| T02 | Create captura P2002 | Unit/integration | Doble reserva |
| T03 | Anestesista GET `/reservations/[id]` ajeno → 403 o strip | API auth | Fuga datos |
| T04 | Cirujano GET/PATCH ajeno → 403 | API auth | Fuga/escalada |
| T05 | User deactivated + JWT viejo → 401 en mutación | API auth | Permisos |
| T06 | Cancel last patient post-deadline → RELEASED | API+DB | Programación |
| T07 | Cancel last patient pre-deadline → PENDING | API+DB | Programación |
| T08 | Overflow invade slot ocupado → rechazo | API | Pacientes |
| T09 | Cron release solo PENDING vacíos post-cierre | API | Liberación |
| T10 | Anesthetist PUT empty con filas → 409 | API | Pérdida datos |

### P1

| ID | Caso | Tipo |
|----|------|------|
| T11 | Multi-slot partial failure compensated | API |
| T12 | Concurrent add patients empty hold | API+DB |
| T13 | SESPA assignment validation | API |
| T14 | Webhook sin secret → 401 | API |
| T15 | Login rate limit | API |
| T16 | roleToFrontend unknown → deny | Unit |
| T17 | Zod patientEmail inválido | Unit |
| T18 | Phase2 no slot → deferred/event | Integration |
| T19 | Permission matrix snapshot por rol | Unit |
| T20 | migrate status / schema smoke en CI staging | Ops |

### P2 — E2E humo

| ID | Flujo |
|----|-------|
| E01 | Login gestor → calendario carga |
| E02 | Cirujano reserva + programa 1 paciente |
| E03 | Cancel paciente con confirmación |
| E04 | Gestor asigna anestesista y persiste tras reload |
| E05 | Mobile: modal programar scroll + submit |

---

## 3. Herramientas sugeridas (cuando se autorice)

- **Vitest** o **Node test** para unit (permissions, deadline, overflow puro).  
- **Supertest**-like o invocación directa de handlers + Prisma contra BD test.  
- **Playwright** para E2E smoke (pocos).  
- CI: `lint` + `tsc` + `test` en PR; E2E en nightly/staging.

No hace falta 100% coverage. **Objetivo:** red de seguridad P0 (~10–20 tests) que falle el merge si se rompe producción crítica.

---

## 4. Datos de test

- BD dedicada / Neon branch.  
- Nunca seed piloto contra prod.  
- Factories mínimas: User por rol, Reservation slot, PatientInBlock.

---

## 5. Conclusión

Sin tests, cada deploy es un experimento. El coste de la matriz P0 es bajo frente al riesgo de doble reserva o fuga clínica.
