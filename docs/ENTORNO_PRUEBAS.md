# Entorno de pruebas

La base de producción de Vercel no se usa para migrar, sembrar ni probar. Este repositorio no crea proyectos, bases ni variables en la cuenta de Vercel. Si hace falta una base de preview en esa cuenta, la tiene que crear una persona con acceso y apuntar solo el entorno Preview a una URL distinta de producción.

Hay tres sitios donde sí se pueden aplicar las migraciones.

## 1. Postgres del CI

El job `postgres` de `.github/workflows/pr-checks.yml` levanta un Postgres 16 vacío llamado `qxflow_ci`, solo dentro de GitHub Actions. Ahí corre `prisma migrate deploy`, comprueba que el esquema cuadra y lanza las pruebas de integración. No hace falta ninguna clave de Vercel. Ese job no se ejecutó en la máquina donde se escribió esta guía.

## 2. Postgres local

Ejemplo con un servidor que ya tenga en su máquina, en el puerto 5432:

```bash
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/qxflow_preview?schema=public"
export DIRECT_URL="$DATABASE_URL"
export CONFIRM_PREVIEW_DATABASE=preparar
node scripts/db/prepare-preview-database.mjs
```

El script se niega si falta la confirmación, si la URL coincide con `PRODUCTION_DATABASE_URL`, o si el host no es local y el nombre no contiene `preview`, `test`, `ci` o `local`. No ejecuta `db:seed`, `usuarios:prueba` ni `seed:showcase`.

## 3. Preview de Vercel, si usted crea la base

1. Cree una base Postgres nueva, distinta de la de producción. Puede ser un Postgres que usted administre. No reutilice `DATABASE_URL` de Production.
2. En el proyecto de Vercel, entorno **Preview** (no Production), ponga `DATABASE_URL` y `DIRECT_URL` de esa base nueva.
3. No copie esas URLs al repositorio ni a `CREDENCIALES.txt` dentro de git.
4. Desde una máquina que tenga esa URL solo en el entorno del shell, lance el mismo comando del apartado 2.

Hasta que alguien haga ese alta, la aplicación de preview seguiría sin base propia. El código no lo hace solo.

## Humo con datos ficticios

`tests/previewSmoke.test.ts` recorre, sin base de datos, la importación del Excel en memoria, las alertas, un parte de bandeja que no se guarda y la semana para imprimir. Usa `Paciente Prueba 01` y `TEST-0001`. Entra en `npm test`.

No lance este flujo contra la base de producción.
