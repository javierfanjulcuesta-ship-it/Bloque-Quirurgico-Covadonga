# Deploy en Vercel — QxFlow

Guía canónica para desplegar la aplicación sin provocar drift entre Prisma y PostgreSQL.

## Principio de seguridad de base de datos

**Producción nunca se evoluciona con `prisma db push`.**

Después de cerrar el baseline de la base de datos, la única vía aceptada para cambios de esquema es:

```bash
npx prisma migrate deploy
```

`npm run db:push` está deliberadamente bloqueado en `NODE_ENV=production`, Vercel y CI.

## Proyecto oficial

Antes de desplegar, confirmar que el proyecto Vercel objetivo es el proyecto oficial de QxFlow. No copiar variables entre proyectos duplicados sin revisar destino.

## Variables de entorno

Configurar en **Vercel → Project → Settings → Environment Variables**.

| Variable | Uso | Recomendación |
|---|---|---|
| `DATABASE_URL` | Prisma Client en runtime | URL PostgreSQL con pooler apropiado para serverless |
| `DIRECT_URL` | Prisma Migrate / operaciones directas | conexión directa a la misma base |
| `JWT_SECRET` | firma de sesión | secreto aleatorio >= 32 bytes; nunca en Git |
| `NEXT_PUBLIC_DEMO_MODE` | modo demo | `false` en producción |
| `NEXT_PUBLIC_USE_REAL_API` | API real | `true` en producción |

No pegar secretos en issues, logs, documentación ni commits.

## Build

El proyecto usa:

```bash
npm run build
```

que ejecuta:

```bash
prisma generate && next build
```

El build **no debe modificar la base de datos**.

## Flujo de release recomendado

1. Rama/PR revisada.
2. CI verde: tests, typecheck, Prisma validation/migrations y build.
3. Backup/snapshot de base de datos cuando el release incluye migraciones.
4. Ejecutar `prisma migrate deploy` en una etapa explícita de release, no `db push`.
5. Desplegar la aplicación.
6. Smoke tests.
7. Verificar `prisma migrate status`.

Para el baseline inicial y la reconciliación histórica, seguir exclusivamente:

- `docs/audit/DATABASE_BASELINE_PLAN.md`
- `docs/audit/16_PRODUCTION_SCHEMA_RECONCILIATION.md`

## Smoke tests mínimos tras deploy

- pantalla de acceso carga;
- login de usuario activo;
- usuario desactivado no reutiliza una sesión antigua;
- calendario lista reservas autorizadas;
- cirujano/endoscopista no accede a reservas ajenas;
- anestesista solo recibe el detalle que necesita;
- gestor puede consultar y gestionar las reservas permitidas;
- creación/edición de un paciente de prueba ficticio;
- asignación de preanestesia sin `P2022`;
- cancelación y liberación según reglas del producto.

No utilizar datos reales de pacientes para smoke tests.

## Creación de usuarios

Las contraseñas nunca deben estar hardcodeadas. Los scripts de seed/usuarios exigen variables de entorno o generan credenciales seguras según corresponda.

Ejemplo para gestor-anestesista:

```powershell
$env:GESTOR_ANESTESISTA_PASSWORD="<contraseña-segura>"
npm run usuarios:gestor-anestesista
```

No registrar ni enviar contraseñas por logs o canales inseguros.

## Operaciones prohibidas en producción

```text
prisma db push
prisma migrate reset
DROP de tablas/columnas sin plan aprobado
ALTER manual improvisado en el dashboard
force push sobre ramas de release
```

Si `migrate deploy` detecta un estado inesperado, **detener el release** y reconciliar el historial; no forzar el esquema.

## Checklist de release

- [ ] PR revisada y CI verde
- [ ] `prisma validate` OK
- [ ] migraciones revisadas
- [ ] backup si hay cambio de esquema
- [ ] `DATABASE_URL` y `DIRECT_URL` apuntan a la misma base objetivo
- [ ] `NEXT_PUBLIC_DEMO_MODE=false`
- [ ] `NEXT_PUBLIC_USE_REAL_API=true`
- [ ] `JWT_SECRET` configurado y no expuesto
- [ ] `prisma migrate deploy` completado cuando corresponda
- [ ] build/deploy completado
- [ ] smoke tests OK
- [ ] `prisma migrate status` limpio
