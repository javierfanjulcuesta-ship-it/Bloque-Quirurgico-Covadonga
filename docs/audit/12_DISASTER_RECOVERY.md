# Disaster Recovery / Backup

**Score orientativo:** 30/100 (poco definido en código; depende de proveedor)

---

## 1. Qué existe hoy

| Mecanismo | En código/docs | Notas |
|-----------|----------------|-------|
| Backups automáticos BD | No en repo | Depende de Supabase/Neon PITR/snapshots |
| Scripts restore | No | |
| Rollback deploy | Vercel UI (operativo) | No documentado como runbook único |
| Checkpoint git | Sí (`restore-checkpoint-c905836`) | Solo código, no datos |
| Showcase reset | `reset:showcase` | **Destructivo** — no usar en prod |
| Seed | `db:seed` | No ejecutar en BD con datos reales |
| Runbook DR | Parcial en docs varios | No hay `DISASTER_RECOVERY.md` canónico |

**Esta auditoría no ejecutó ningún backup ni restore.**

---

## 2. Amenazas relevantes ya vistas

- Schema drift → 500 en reservas.  
- Supabase pausado → app caída.  
- Deploy defectuoso a proyecto Vercel equivocado.  
- `db push` / migrate mal aplicado.  
- Borrado accidental vía scripts showcase/reset usuarios.  
- Cancel force / cascade pacientes.

---

## 3. Protocolo mínimo propuesto (NO ejecutado)

### A. Prevención
1. Snapshot/PITR verificado en proveedor BD.  
2. Un solo proyecto Vercel prod.  
3. Proteger main; prohibir reset scripts en prod (env guard).  
4. Baseline migraciones (ver plan).  

### B. Backup
1. Snapshot diario + retención ≥ 14–30 días (ajustar con DPO).  
2. Antes de cualquier migración prod: snapshot manual nombrado.  
3. Export lógico trimestral (`pg_dump`) a almacenamiento controlado.

### C. Detección
1. Uptime check `/api/auth/session` o health simple.  
2. Alerta errores 5xx Vercel.  
3. `migrate status` semanal.

### D. Recuperación
| Escenario | Acción |
|-----------|--------|
| Deploy malo | Redeploy previous en Vercel |
| Migración mala | Restaurar snapshot BD; redeploy app compatible |
| BD corrupta/pérdida | PITR / restore dump a nueva URL; actualizar env; smoke |
| Proyecto Vercel equivocado | Pausar deploys awdb; apuntar DNS al oficial |
| Secret leaked | Rotar JWT/DB/email secrets; invalidar sesiones (cambiar JWT_SECRET) |

### E. Drill
- Una vez: restaurar backup a staging y arrancar app.  
- Documentar tiempo real (RTO/RPO observados).

---

## 4. RTO/RPO objetivo sugerido (piloto hospitalario)

| Métrica | Objetivo inicial |
|---------|------------------|
| RPO | ≤ 24 h (mejor: ≤ 1 h con PITR) |
| RTO | ≤ 2 h (redeploy + restore) |

---

## 5. Conclusión

Sin runbook y sin drill, la recuperación es **artesanal**. Antes de más desarrollo: confirmar backups del proveedor y escribir un runbook de una página con teléfonos/responsables.
