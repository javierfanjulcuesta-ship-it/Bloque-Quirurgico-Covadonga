# 16 — Implementación preparada del baseline de base de datos

**Rama:** `hardening/p0-database-baseline`  
**Producción modificada:** NO  
**Supabase modificado:** NO  
**Objetivo:** convertir el estado actual de `prisma/schema.prisma` en una cadena de migraciones reproducible sin ejecutar el baseline sobre la BD existente.

## Estado preparado

1. Se generó SQL desde una base vacía con la versión Prisma 6 instalada por el lockfile:

```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

2. El SQL revisado está en:

```text
prisma/migrations/0_baseline_current/migration.sql
```

3. Las dos migraciones incrementales históricas se conservaron como evidencia en:

```text
docs/audit/legacy-migrations/
```

Se retiraron de la cadena activa porque presuponen una BD previa y, tras un baseline completo, intentarían volver a añadir campos/enum/index ya existentes.

4. La cadena activa se valida en CI contra PostgreSQL 16 vacío:

- `prisma validate`
- generación independiente del SQL esperado desde `schema.prisma`
- comprobación de una única migración activa
- `prisma migrate deploy` sobre PostgreSQL vacío
- `prisma migrate status`
- `prisma migrate diff` BD resultante ↔ `schema.prisma`
- `prisma generate`

5. Se añadió un script de inspección de producción de **solo lectura**:

```text
scripts/db/schema-audit-readonly.sql
```

6. `prisma db push` queda protegido por un guard para impedir su uso accidental en producción/Vercel/CI y exige confirmación explícita incluso en desarrollo local. Se añaden scripts canónicos `db:migrate:status` y `db:migrate:deploy`.

## Por qué no se puede marcar aún el baseline en producción

El baseline representa el **schema esperado por Git**. Antes de decirle a Prisma que `0_baseline_current` ya está aplicado en una BD con datos, hay que demostrar que la estructura real de esa BD coincide con el baseline o identificar el delta exacto.

Hay evidencia histórica de drift (P3005/P2022 y `patientEmail` añadida manualmente), por lo que saltarse esta comparación convertiría una inconsistencia conocida en una migración falsamente declarada como aplicada.

## Puerta de seguridad antes de producción

No ejecutar ninguno de estos pasos hasta superar todos los checks:

- [ ] Ejecutar `scripts/db/schema-audit-readonly.sql` sobre la **Primary Database** correcta.
- [ ] Comparar tablas, columnas, enums, índices y FK contra `0_baseline_current`.
- [ ] Confirmar estado de `_prisma_migrations`.
- [ ] Identificar cualquier objeto esperado que falte.
- [ ] Crear y ensayar en clon/staging cualquier SQL delta necesario.
- [ ] Verificar backup/snapshot restaurable.
- [ ] Ensayar en clon: delta → `migrate resolve --applied 0_baseline_current` → `migrate status` → smoke tests.
- [ ] Solo entonces autorizar el mismo procedimiento en producción.

## Procedimiento futuro si producción coincide exactamente

**NO EJECUTAR TODAVÍA.** Referencia para la ventana autorizada:

```bash
npx prisma migrate resolve --applied 0_baseline_current
npx prisma migrate status
```

`migrate resolve` registra el baseline como aplicado; no debe ejecutar el SQL `CREATE` sobre las tablas existentes.

## Procedimiento si producción NO coincide

1. No marcar baseline.
2. Clasificar cada diferencia.
3. Preparar un delta SQL explícito e idempotente cuando sea posible.
4. Aplicarlo primero a una copia restaurada de producción.
5. Ejecutar pruebas de aplicación sobre el clon.
6. Solo tras quedar estructuralmente equivalente, marcar `0_baseline_current` como aplicado.

## Rollback

Hasta este punto todo son cambios en Git/CI: rollback = abandonar la rama. No se ha escrito nada en la BD.

Cuando exista una intervención futura sobre producción, el rollback obligatorio será el snapshot/backup previo más el runbook aprobado para esa intervención concreta.
