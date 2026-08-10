# DevOps / Deploy

**Score:** 40/100

---

## 1. Inventario

| Pieza | Detalle |
|-------|---------|
| GitHub | `javierfanjulcuesta-ship-it/Bloque-Quirurgico-Covadonga` |
| Rama auditada | `restore-checkpoint-c905836` (tracks origin) |
| Otras ramas | `main`, `debug-error-reservas`, `feature/cuadro-mando`, `feature/retrospective-analysis` |
| Vercel oficial | `bloque-quirurgico-covadonga` (según brief) |
| Vercel duplicado | `bloque-quirurgico-covadonga-awdb` — **no eliminar**; aislar |
| BD | PostgreSQL vía Supabase/Neon (`DATABASE_URL`, `DIRECT_URL`) |
| Build | `prisma generate && next build` — **OK** en esta auditoría |
| `vercel.json` | No presente en repo |
| Migraciones en deploy | **No** automatizadas; docs históricos dicen `db push` |

---

## 2. Riesgos de los dos proyectos Vercel

| Riesgo | Impacto |
|--------|---------|
| Deploy al proyecto equivocado | Prod “fantasma” o datos/env distintos |
| Variables distintas | JWT distinto, BD distinta, demo flags |
| Production Branch distinta | `main` vs checkpoint vs feature |
| Preview vs Production | Preview sin `CRON_SECRET` abierto; schema distinto |
| Schema/DB distinta | P2022 en un entorno y no en otro |
| Secretos en ambos | Superficie doble; rotación incompleta |

**Acción recomendada (sin borrar awdb):**  
1) Marcar awdb como “ARCHIVED / DO NOT DEPLOY” en nombre/description.  
2) Quitar production domain si lo tuviera.  
3) Documentar en README el project ID/nombre oficial.  
4) Un solo Git integration productivo.

---

## 3. Flujo futuro propuesto

```
DEV (local + Neon branch)
  → migrate dev / tests
TEST (CI + BD efímera/staging)
  → lint + tsc + tests P0 + migrate deploy staging
PREVIEW (Vercel Preview = PR)
  → env preview → BD staging/branch
  → smoke manual
PRODUCTION (solo proyecto oficial)
  → merge main
  → migrate deploy (job explícito o step)
  → smoke checklist
  → rollback = redeploy previous + migrate down solo si existe y es seguro
```

### Rollback sencillo
- **App:** redeploy deployment anterior en Vercel (segundos).  
- **DB:** solo forward-fix migrations; rollback de datos vía backup/PITR, no `migrate reset`.  
- Mantener checkpoint git (`restore-checkpoint-*`) como referencia, no como prod permanente sin política.

---

## 4. Variables de entorno críticas

| Variable | Prod |
|----------|------|
| `DATABASE_URL` (pooler) | Obligatoria |
| `DIRECT_URL` | Obligatoria para migrate |
| `JWT_SECRET` ≥32 | Obligatoria |
| `NEXT_PUBLIC_DEMO_MODE=false` | Obligatoria |
| `CRON_SECRET` | Obligatoria si cron expuesto |
| `EMAIL_WEBHOOK_SECRET` | Si webhook |
| SMTP o AZURE_* | Si email real |
| `NEXT_PUBLIC_APP_URL` | Invitaciones |
| `NEXT_PUBLIC_RESERVATIONS_DEBUG` | Debe ser 0 / ausente en prod |
| `NEXT_PUBLIC_ECONOMIA_ENABLED` | Control consciente |

---

## 5. Git higiene

- Checkpoint actual es bueno como **punto de restauración de código**.  
- `debug-error-reservas`: no mergear a main sin limpia.  
- Evitar force push.  
- Proteger `main` con reviews + status checks cuando haya tests.

---

## 6. Conclusión

DevOps es el **segundo mayor riesgo** después del baseline DB. Dos proyectos Vercel + `db push` cultural = incidentes repetibles. Formalizar un solo camino DEV→PROD antes de más features.
