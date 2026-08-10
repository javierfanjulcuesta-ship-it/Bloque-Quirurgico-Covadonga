# Deuda técnica y calidad de build

---

## 1. Resultados de calidad (esta auditoría)

| Comando | Resultado |
|---------|-----------|
| `npx tsc --noEmit` | **OK** (exit 0) |
| `npm run build` | **OK** (Next.js 16.1.6) |
| `npm run lint` | **FAIL** — 12 errors, 51 warnings |
| `npm test` | **No existe** |

### ERROR (lint) — categorías
- Conditional `useMemo` (rules-of-hooks) en componentes calendario/gestor.
- `setState` síncrono en effects (`AuthContext`, otros) — regla React 19.
- Dependency list no simple / memoization skipped (React Compiler eslint).
- `no-explicit-any` en `importPlanningPreview.ts`.
- `prefer-const` en `patientCircuitPhase2.ts`.

### WARNING
- exhaustive-deps varios.
- unused vars (`_params` en userAudit no-op, adapters email, blockOpeningPlan stubs).
- Código muerto implícito por stubs.

### DEBT (estructura)

| Ítem | Severidad |
|------|-----------|
| Historia `db push` vs migrate | Crítica |
| `userAudit` no-op vs modelo en schema | Alta |
| Block opening stub vs UI/permiso | Media |
| Componentes 1000–2800 líneas | Alta |
| Dual demo/localStorage leftovers | Media |
| Docs stale (README create-next-app; SETUP menciona SQLite) | Alta |
| `/registro` dead | Baja |
| `InstallPrompt` no montado; iconos PWA ausentes | Media |
| `GestionarApertura` huérfano | Baja |
| Showcase scripts sin guard prod | Alta |
| `roleToFrontend` default gestor | Alta |
| Instrumentación debug reservas | Env example aún menciona flags; código limpio en src |
| Ramas feature/debug abiertas | Media |
| Sin tests | Crítica |
| `next.config.ts` vacío (sin headers seguridad) | Media |
| Password seed hardcoded | Media (SECRET_PRESENT) |

---

## 2. Marcadores de código

| Patrón | Observación |
|--------|-------------|
| TODO/FIXME | Presentes en docs más que en src crítico |
| eslint-disable | Puntuales |
| console.log | Email adapters, CrearNuevoUsuario error front |
| any | Import PDF preview |
| Código experimental | importar-planificación, economía flag, circuit dry-run |
| Legacy | storage* localStorage paths; blockOpening disabled comments contradict schema |

---

## 3. Dependencias

| Lib | Nota |
|-----|------|
| next 16 / react 19 | Actual |
| prisma 6 | OK |
| xlsx / pdfjs | Pesadas; scope import |
| nodemailer / azure graph | Dual email |
| No test runner | Gap |
| `npm audit` | No ejecutado en esta pasada |

---

## 4. Documentación existente vs necesaria

Hay **muchos** docs en `/docs` (auditorías previas, piloto, email, normas). Falta un set **canónico y actualizado**:

| Necesario | Hoy |
|-----------|-----|
| README operativo | Solo boilerplate Next |
| ARCHITECTURE | Fragmentado |
| DATABASE | No canónico; este audit + baseline plan |
| DEPLOYMENT | DEPLOY-VERCEL orientado a push |
| PERMISSIONS | AUTORIZACION.md + este audit |
| SECURITY | SEGURIDAD-PILOTO.md útil pero parcial |
| OPERATIONS | Disperso |
| TESTING | Ausente |
| DISASTER_RECOVERY | Ausente canónico |

**Para otro desarrollador:** hoy tardaría demasiado en saber “cuál es la verdad” entre docs contradictorios (SQLite vs Postgres, push vs migrate, features stub).

---

## 5. Prioridad de pago de deuda

1. Baseline DB + docs deploy.  
2. Tests P0 + hacer lint enforceable en CI (o baseline ignore temporal documentado).  
3. Seguridad P0 (IDOR, sesión, role mapping).  
4. Activar audits reales.  
5. Partir componentes dios.  
6. Limpiar stubs/nav muertos.
