# Deploy en Vercel – Guía paso a paso

Guía para dejar la app online hoy.

---

## 1. Verificación previa

### Estado del proyecto

| Verificación | Estado |
|--------------|--------|
| Next.js 16 + App Router | OK |
| Prisma + PostgreSQL | OK – esquema listo |
| API routes (auth, reservations, anesthetist-assignments, users) | OK |
| Build script | `prisma generate && next build` |

### Prisma en Vercel

- **Connection pooling**: Usar la **connection string pooled** de Neon (host con `-pooler`). En el dashboard Neon: **Connect** → activar **Connection pooling** → copiar URL.
- **Esquema**: No hace falta `postinstall`. El script `build` ya ejecuta `prisma generate`.
- **Conexión**: Prisma usa singleton (`lib/db/prisma.ts`). Adecuado para serverless.

### localStorage en modo real (`NEXT_PUBLIC_DEMO_MODE=false`)

| Dato | En modo real | Nota |
|-----|--------------|------|
| Auth | Cookie httpOnly vía `/api/auth/*` | No depende de localStorage |
| Reservas | API → Neon | OK |
| Asignaciones anestesistas | API → Neon | OK |
| Mensajes, notificaciones, no disponibilidad | Siguen en localStorage | Solo UI auxiliar; no impide el piloto |

---

## 2. Pasos exactos para subir y conectar

### Opción A: Desde GitHub (recomendado)

1. Sube el proyecto a GitHub:
   - Crea un repo en github.com
   - En la carpeta del proyecto:
     ```bash
     git init
     git add .
     git commit -m "Piloto listo para deploy"
     git branch -M main
     git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
     git push -u origin main
     ```

2. En Vercel:
   - [vercel.com](https://vercel.com) → **Add New** → **Project**
   - **Import Git Repository** → elige tu repo
   - **Deploy** (aún sin variables; fallará hasta que las añadas)

### Opción B: Cli Vercel (sin GitHub)

1. Instala: `npm i -g vercel`
2. En la carpeta del proyecto:
   ```bash
   vercel
   ```
3. Responde: proyecto nuevo, directorio actual, sin override de settings.

### Opciones en el wizard de Vercel

- **Framework Preset**: Next.js (detección automática)
- **Root Directory**: `./` (dejar vacío o `.`)
- **Build Command**: `prisma generate && next build` (o el que tenga por defecto el `package.json`)
- **Output Directory**: (auto)
- **Install Command**: `npm install`

---

## 3. Variables de entorno en Vercel

En el proyecto: **Settings** → **Environment Variables**. Añade:

| Variable | Valor | Entornos |
|----------|-------|----------|
| `DATABASE_URL` | Tu URL de Neon con **pooler** | Production, Preview |
| `NEXT_PUBLIC_DEMO_MODE` | `false` | Production, Preview |
| `JWT_SECRET` | Ver abajo | Production, Preview |

### DATABASE_URL (Neon)

1. [console.neon.tech](https://console.neon.tech) → tu proyecto
2. **Connect** → activar **Connection pooling**
3. Copiar la URL (debe contener `-pooler` en el host)
4. Formato: `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`

### JWT_SECRET

Generar uno seguro (cualquier opción):

**Node (todas las plataformas):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**PowerShell (Windows):**
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

Mínimo 32 caracteres. No compartir ni subir a Git.

---

## 4. Problemas típicos de build y cómo resolverlos

### Prisma generate falla

- **Error**: `Error: EPERM` o similar en Windows local  
  - En local puede ser antivirus o proceso bloqueando. En Vercel no suele pasar.
- **Error en Vercel**: `prisma generate` no encuentra el schema  
  - Verifica que `prisma/schema.prisma` exista. El comando `prisma generate` se ejecuta antes de `next build`.

### Error de engine o binarios

- Si falla por Node: en Vercel **Settings** → **General** → **Node.js Version** → `20.x`.
- Prisma descarga binarios automáticamente. Sin cambios extra.

### Rutas API y cookies

- Las rutas están en `src/app/api/`. Vercel las detecta como serverless.
- Cookies: `sameSite`, `secure` y `httpOnly` ya configurados en `lib/auth/session.ts` para producción.

### Build exitoso pero 404 al acceder

- Comprueba que la raíz tenga `src/app/page.tsx` o `app/page.tsx`. En tu caso está en `src/app/`.

---

## 5. Primer deploy

1. Configura las 3 variables (paso 3).
2. **Deployments** → **Redeploy** (o nuevo deploy si acabas de añadir variables).
3. Tras el deploy: **Visit** o la URL tipo `https://bloque-quirurgico-xxx.vercel.app`.

---

## 6. Verificación tras deploy

### Checklist

1. **Acceso**
   - Abre la URL. Debe mostrarse la pantalla de login / acceso.

2. **Login**
   - Tras crear usuarios (paso 7), prueba login con email y contraseña.
   - Si no hay usuarios, verás "Credenciales inválidas".

3. **Datos en Neon**
   - Crea una reserva o asignación como gestor.
   - Abre Neon SQL Editor y comprueba:
     ```sql
     SELECT * FROM "Reservation" LIMIT 5;
     SELECT * FROM "AnesthetistAssignment" LIMIT 5;
     ```

4. **Calendario y reservas**
   - Como gestor: calendario, asignar anestesistas, ver reservas.
   - Como anestesista: Mi programación, ver asignaciones.

---

## 7. Crear usuarios (después de que todo funcione)

### 7.1 Esquema en la BD

En tu máquina (misma `DATABASE_URL` que Vercel):

```bash
cd "c:\Users\usuario\Desktop\Ribera\Aplicacion V2\bloque-quirurgico-v2"
npx prisma db push
```

### 7.2 Usuario gestor-anestesista

```powershell
$env:GESTOR_ANESTESISTA_PASSWORD="TU_CONTRASEÑA_SEGURA"
npx tsx scripts/crear-usuario-gestor-anestesista.ts
```

O:

```powershell
$env:GESTOR_ANESTESISTA_PASSWORD="TU_CONTRASEÑA_SEGURA"
npm run usuarios:gestor-anestesista
```

### 7.3 Dos anestesistas

1. Edita `scripts/emails-anestesistas.txt` (un email por línea).
2. Ejecuta:
   ```bash
   npx tsx scripts/crear-usuarios-desde-lista.ts anestesistas
   ```
3. Copia las contraseñas temporales y envíalas por un canal seguro.

---

## 8. Checklist final piloto

- [ ] Deploy en Vercel completado
- [ ] URL pública accesible
- [ ] `NEXT_PUBLIC_DEMO_MODE=false`
- [ ] Login con email y contraseña funciona
- [ ] Esquema aplicado (`npx prisma db push`)
- [ ] Usuario gestor-anestesista creado y probado
- [ ] Dos anestesistas creados
- [ ] Asignaciones visibles en "Asignar anestesistas" y en "Mi programación"
- [ ] Reservas visibles en calendario
- [ ] Contraseñas entregadas por canal seguro

---

## Resumen de URLs y comandos

| Acción | Comando / URL |
|--------|----------------|
| Deploy | Vercel importa desde GitHub o `vercel` |
| Variables | `DATABASE_URL`, `NEXT_PUBLIC_DEMO_MODE=false`, `JWT_SECRET` |
| Esquema | `npx prisma db push` |
| Gestor | `$env:GESTOR_ANESTESISTA_PASSWORD="xxx"; npm run usuarios:gestor-anestesista` |
| Anestesistas | Añadir emails en `scripts/emails-anestesistas.txt` y `npx tsx scripts/crear-usuarios-desde-lista.ts anestesistas` |
