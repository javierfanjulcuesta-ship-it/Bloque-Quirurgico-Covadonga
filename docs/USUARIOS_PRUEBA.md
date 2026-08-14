# Usuarios de prueba – Modo real

Usuarios ficticios en base de datos para desarrollo y pruebas con `NEXT_PUBLIC_DEMO_MODE=false`.

> **Solo desarrollo/pruebas.** No ejecute los scripts de usuarios de prueba contra producción ni contra una base de datos que contenga información real.

---

## Credenciales

La contraseña de prueba **no está incluida en el repositorio**. Debe definirse mediante la variable de entorno `TEST_USERS_PASSWORD` y tener al menos 12 caracteres.

| Perfil | Email | Rol en BD |
|--------|-------|-----------|
| Gestor | `gestor@prueba.test` | GESTOR |
| Cirujano | `cirujano@prueba.test` | CIRUJANO |
| Anestesista | `anestesista@prueba.test` | ANESTESISTA |
| Endoscopista | `endoscopista@prueba.test` | ENDOSCOPISTA |
| Gestor Anestesista | `gestor-anest@prueba.test` | GESTOR_ANESTESISTA |

El dominio `@prueba.test` identifica claramente estas cuentas como ficticias de pruebas internas.

---

## Preparación segura

1. Configure un entorno local/no productivo con `NEXT_PUBLIC_DEMO_MODE=false` y una `DATABASE_URL` de desarrollo.
2. Si necesita sincronizar el esquema en una base local de desarrollo, use el wrapper protegido del proyecto. Requiere la confirmación explícita `ALLOW_PRISMA_DB_PUSH=I_UNDERSTAND_DB_PUSH_IS_DEV_ONLY` y ejecuta `npm run db:push`. No utilice `prisma db push` directamente contra producción.
3. Para crear o actualizar los usuarios ficticios, defina:
   - `ALLOW_TEST_USER_SEED=I_UNDERSTAND_TEST_USERS_ONLY`
   - `TEST_USERS_PASSWORD=<contraseña de prueba de al menos 12 caracteres>`
4. Ejecute `npm run usuarios:reset`.
5. Inicie el servidor con `npm run dev` e inicie sesión usando uno de los correos `@prueba.test` y la contraseña definida en `TEST_USERS_PASSWORD`.

Los scripts bloquean su ejecución cuando detectan producción/Vercel y no imprimen la contraseña en los logs. Aun así, compruebe siempre que `DATABASE_URL` apunta al entorno de desarrollo correcto antes de ejecutar una operación de seed/reset.

### Dataset showcase de reservas

`npm run seed:showcase` es únicamente para una base de desarrollo/preproducción sin actividad real. Antes de ejecutarlo debe definir `ALLOW_SHOWCASE_SEED=I_UNDERSTAND_SHOWCASE_DATA_ONLY`.

El comando está bloqueado en producción/Vercel y pasa por un entrypoint de seguridad antes de cargar el dataset. Aun así, es una operación destructiva dentro de su semana objetivo: elimina las reservas existentes de Q1, Q2 y Q3 en ese intervalo antes de insertar los casos ficticios de showcase.

No ejecute `seed:showcase` contra una base que contenga programación quirúrgica real, pacientes reales o cualquier otro dato asistencial. Compruebe siempre la `DATABASE_URL` y `SHOWCASE_WEEK_MONDAY` antes de confirmar la operación.

---

## Flujos verificados

| Flujo | Estado |
|-------|--------|
| Login real (email + contraseña) | ✅ |
| Cambio de contraseña (Mi Perfil) | ✅ |
| Reserva desde cirujano (API) | ✅ |
| Calendario gestor (API) | ✅ |
| Acceso por rol (cirujano → `/cirujano`, gestor → `/calendario`) | ✅ |

---

## Notas

- Los usuarios de prueba se crean con `approved=true` para acceso inmediato en el entorno de desarrollo.
- `npm run usuarios:reset` hace `upsert` de las cuentas ficticias y establece la contraseña indicada por `TEST_USERS_PASSWORD`.
- `scripts/seed-usuarios-prueba.ts` solo añade cuentas si no existen; `scripts/reset-usuarios-prueba.ts` hace `upsert` y actualiza su contraseña.
- No reutilice contraseñas reales, de producción o personales como `TEST_USERS_PASSWORD`.
