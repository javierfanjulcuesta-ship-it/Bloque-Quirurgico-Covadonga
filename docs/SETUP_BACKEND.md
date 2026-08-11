# Setup del backend (modo real)

Guía de desarrollo para QxFlow con PostgreSQL y Prisma.

## Requisitos

- Node.js 20+
- npm
- PostgreSQL de desarrollo o staging

No usar una base de producción para desarrollo local.

## 1. Instalar dependencias

```bash
npm ci
```

## 2. Variables de entorno

Crear `.env` local fuera de Git con, como mínimo:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_USE_REAL_API=true
JWT_SECRET="secreto-local-aleatorio-de-al-menos-32-bytes"
```

`DATABASE_URL` y `DIRECT_URL` deben pertenecer al mismo entorno de desarrollo/staging.

Nunca copiar credenciales de producción a documentación, chats de issues o commits.

## 3. Prisma

Validar y generar el cliente:

```bash
npx prisma validate
npm run db:generate
```

### Desarrollo de cambios de esquema

Los cambios de modelo deben generar migraciones revisables con Prisma Migrate en una base de desarrollo:

```bash
npx prisma migrate dev --name descripcion_del_cambio
```

### Base existente / producción

No ejecutar `prisma db push` ni `migrate reset`.

Para deploy de migraciones ya revisadas:

```bash
npm run db:migrate:status
npm run db:migrate:deploy
```

El baseline histórico de la base real tiene un procedimiento específico en:

- `docs/audit/DATABASE_BASELINE_PLAN.md`
- `docs/audit/16_PRODUCTION_SCHEMA_RECONCILIATION.md`

## 4. Seeds y usuarios de prueba

No existe una contraseña común hardcodeada.

Los scripts que crean usuarios requieren credenciales por variables de entorno o generan valores seguros. Ejecutarlos únicamente en desarrollo/staging salvo procedimiento explícito de alta en producción.

Ejemplo:

```powershell
$env:GESTOR_PASSWORD="<contraseña-segura>"
$env:GESTOR_EMAIL="gestor@ejemplo.test"
$env:GESTOR_NAME="Gestor de pruebas"
npm run usuarios:gestor
```

No registrar contraseñas en logs.

## 5. Arrancar

```bash
npm run dev
```

Abrir `http://localhost:3000`.

## 6. Comprobaciones antes de commit

```bash
npm test
npx tsc --noEmit
npm run build
npm run lint
```

Si `lint` contiene deuda preexistente, no añadir errores nuevos y corregirla en el roadmap correspondiente.

## Autenticación

- contraseñas: bcrypt (coste 12);
- sesión: cookie `httpOnly` con JWT firmado;
- las rutas protegidas validan el estado actual del usuario para que una cuenta desactivada no conserve acceso mediante un JWT antiguo.

## Regla operativa

**Git + `schema.prisma` + migraciones versionadas son la fuente de verdad del esquema.** No hacer ALTER manuales improvisados en el dashboard de PostgreSQL.
