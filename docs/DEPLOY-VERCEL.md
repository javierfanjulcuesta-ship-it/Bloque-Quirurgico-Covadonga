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

Configurar en **Vercel → Project → Settings → Environment Variables**. No copiar valores de esta documentación: aquí solo se documentan nombres y requisitos.

### Núcleo de aplicación

| Variable | Uso | Recomendación |
|---|---|---|
| `DATABASE_URL` | Prisma Client en runtime | URL PostgreSQL con pooler apropiado para serverless |
| `DIRECT_URL` | Prisma Migrate / operaciones directas | conexión directa a la misma base |
| `JWT_SECRET` | firma de sesión | secreto aleatorio >= 32 bytes; nunca en Git |
| `GESTOR_EMAIL` | buzón de coordinación usado por la app | configurar explícitamente por entorno; nunca hardcodear una dirección real |
| `NEXT_PUBLIC_APP_URL` | URL pública usada en enlaces/correos | HTTPS y dominio del entorno correcto; preferida sobre `NEXTAUTH_URL` |
| `NEXTAUTH_URL` | fallback de URL pública | usar solo si no se configura `NEXT_PUBLIC_APP_URL`; HTTPS en producción |
| `NEXT_PUBLIC_DEMO_MODE` | modo demo | `false` en producción |
| `NEXT_PUBLIC_USE_REAL_API` | API real | `true` en producción |

La aplicación rechaza en producción URLs públicas ausentes, no HTTPS o que apunten a localhost cuando necesita generar enlaces.

### Proveedor de correo saliente

Producción no debe degradar silenciosamente al adaptador mock. Configurar **uno** de estos proveedores y validar envío antes del go-live:

**SMTP**

| Variable | Uso |
|---|---|
| `SMTP_USER` | usuario/remitente SMTP |
| `SMTP_PASS` | credencial SMTP |
| `SMTP_HOST` | host SMTP; tiene default de Gmail si se omite |
| `SMTP_PORT` | puerto SMTP; tiene default seguro según implementación |
| `SMTP_SECURE` | permite ajustar TLS según proveedor |

**Microsoft Graph**

| Variable | Uso |
|---|---|
| `AZURE_CLIENT_ID` | aplicación registrada en Microsoft Entra ID |
| `AZURE_CLIENT_SECRET` | secreto de aplicación |
| `AZURE_TENANT_ID` | tenant de Microsoft 365 |
| `GESTOR_EMAIL` | buzón desde el que Graph envía |

No configurar a medias un proveedor. Si SMTP está configurado, tiene prioridad sobre Graph.

### Endpoints automatizados / integraciones

| Variable | Uso | Requisito |
|---|---|---|
| `EMAIL_WEBHOOK_SECRET` | autentica el webhook de correo entrante | mínimo 24 caracteres; enviar solo por header `x-email-webhook-secret` |
| `CRON_SECRET` | autentica la liberación automática de reservas | mínimo 24 caracteres; enviar como `Authorization: Bearer ...` |

El repositorio **no define actualmente un `vercel.json` con una programación de Vercel Cron**. Por tanto, la existencia del endpoint de liberación automática no garantiza que se ejecute solo. Antes de activar esta función en producción hay que verificar explícitamente qué scheduler será el oficial y que invoque el endpoint con `CRON_SECRET`. Esta guía no fija frecuencia ni horario porque eso pertenece a la configuración operativa, no al código.

No pegar secretos ni datos personales de contacto en issues, logs, documentación ni commits.

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
6. Comprobar `/api/health/readiness`: debe devolver estado OK sin exponer detalles de base de datos.
7. Smoke tests.
8. Verificar `prisma migrate status`.

Para el baseline inicial y la reconciliación histórica, seguir exclusivamente:

- `docs/audit/DATABASE_BASELINE_PLAN.md`
- `docs/audit/16_PRODUCTION_SCHEMA_RECONCILIATION.md`

## Smoke tests mínimos tras deploy

- pantalla de acceso carga;
- `/api/health/readiness` devuelve `200`/`ok`;
- login de usuario activo;
- usuario desactivado no reutiliza una sesión antigua;
- calendario lista reservas autorizadas;
- cirujano/endoscopista no accede a reservas ajenas;
- anestesista solo recibe el detalle que necesita;
- gestor puede consultar y gestionar las reservas permitidas;
- creación/edición de un paciente de prueba ficticio;
- asignación de preanestesia sin `P2022`;
- cancelación y liberación según reglas del producto;
- si habrá correo real: enviar una invitación de prueba a una cuenta controlada y confirmar recepción;
- si habrá webhook: comprobar rechazo sin secreto y aceptación con secreto correcto usando contenido ficticio;
- si habrá liberación automática: verificar manualmente la autenticación del endpoint y después el scheduler oficial, siempre con datos ficticios.

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
reset:showcase / seed de showcase
scripts de usuarios de prueba
DROP de tablas/columnas sin plan aprobado
ALTER manual improvisado en el dashboard
force push sobre ramas de release
```

Si `migrate deploy` detecta un estado inesperado, **detener el release** y reconciliar el historial; no forzar el esquema.

## Checklist de release

- [ ] proyecto Vercel oficial identificado; no se está desplegando accidentalmente en un duplicado
- [ ] PR revisada y CI verde
- [ ] `prisma validate` OK
- [ ] migraciones revisadas
- [ ] backup si hay cambio de esquema
- [ ] `DATABASE_URL` y `DIRECT_URL` apuntan a la misma base objetivo
- [ ] `NEXT_PUBLIC_DEMO_MODE=false`
- [ ] `NEXT_PUBLIC_USE_REAL_API=true`
- [ ] `JWT_SECRET` configurado y no expuesto
- [ ] `GESTOR_EMAIL` configurado en el entorno correcto y no hardcodeado
- [ ] `NEXT_PUBLIC_APP_URL` o `NEXTAUTH_URL` apunta al dominio HTTPS correcto
- [ ] proveedor de correo real elegido y sus variables completas, si se usará correo
- [ ] `EMAIL_WEBHOOK_SECRET` configurado y probado, si se habilita correo entrante
- [ ] `CRON_SECRET` configurado y scheduler oficial verificado, si se habilita liberación automática
- [ ] `prisma migrate deploy` completado cuando corresponda
- [ ] build/deploy completado
- [ ] `/api/health/readiness` OK
- [ ] smoke tests OK
- [ ] `prisma migrate status` limpio
