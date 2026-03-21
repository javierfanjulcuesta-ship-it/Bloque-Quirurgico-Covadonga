# Piloto real online – Bloque Quirúrgico Covadonga

Guía para desplegar la aplicación, crear usuarios reales y arrancar el piloto controlado.

---

## 1. Estado actual para despliegue

| Verificación | Estado |
|--------------|--------|
| PostgreSQL (Neon) | OK – `provider = "postgresql"` en Prisma |
| `NEXT_PUBLIC_DEMO_MODE=false` | Obligatorio en Vercel |
| Autenticación real | OK – login email+contraseña, cookie httpOnly |
| Build | OK – `prisma generate && next build` |

### Variables necesarias en Vercel

| Variable | Valor | Obligatorio |
|----------|-------|-------------|
| `DATABASE_URL` | URL PostgreSQL (Neon/Supabase) | **Sí** |
| `NEXT_PUBLIC_DEMO_MODE` | `false` | **Sí** |
| `JWT_SECRET` | Mín. 32 caracteres | **Sí** |

---

## 2. Pasos exactos para deploy en Vercel

### Paso 1: Base de datos

1. En [neon.tech](https://neon.tech) crear o usar un proyecto.
2. Copiar la **connection string** (Pooler).
3. Añadir `?sslmode=require` al final si no está.

### Paso 2: Proyecto en Vercel

1. [vercel.com](https://vercel.com) → Add New → Project.
2. Importar el repositorio.
3. **Settings** → **Environment Variables**:
   - `DATABASE_URL` = (URL PostgreSQL)
   - `NEXT_PUBLIC_DEMO_MODE` = `false`
   - `JWT_SECRET` = (generar con `openssl rand -base64 32`)
4. Deploy (o Redeploy tras configurar variables).

### Paso 3: Esquema y usuarios (después del deploy)

En tu máquina, con `DATABASE_URL` en `.env` (la misma que en Vercel):

```bash
npx prisma db push
```

Luego crear tu usuario gestor-anestesista (ver sección 3).

---

## 3. Crear usuario gestor-anestesista real (forma segura)

**No pongas la contraseña en el código ni en el repositorio.**

### Opción A: variable de entorno (recomendada)

```bash
# Linux/Mac
GESTOR_ANESTESISTA_PASSWORD=tu-contraseña-segura npx tsx scripts/crear-usuario-gestor-anestesista.ts

# Windows PowerShell
$env:GESTOR_ANESTESISTA_PASSWORD="tu-contraseña-segura"; npx tsx scripts/crear-usuario-gestor-anestesista.ts
```

O con npm:

```bash
GESTOR_ANESTESISTA_PASSWORD=tu-contraseña-segura npm run usuarios:gestor-anestesista
```

Crea o actualiza: `javier.fanjul.cuesta@gmail.com` con rol **GESTOR_ANESTESISTA** y `approved: true`.

### Opción B: desde la app (si ya tienes otro gestor)

1. Iniciar sesión con un gestor existente (ej. del seed).
2. **Crear usuario** → email `javier.fanjul.cuesta@gmail.com`, rol **Gestor/Anestesista**.
3. Comunicar la contraseña temporal por un canal seguro.
4. Cambiar la contraseña en **Mi perfil** al primer acceso.

---

## 4. Crear los dos anestesistas reales

### Opción A: script (recomendada para piloto)

1. Editar `scripts/emails-anestesistas.txt` y añadir un email por línea:

   ```
   anestesista1@hospital.es
   anestesista2@hospital.es
   ```

2. Ejecutar:

   ```bash
   npx tsx scripts/crear-usuarios-desde-lista.ts anestesistas
   ```

3. El script imprime las contraseñas temporales. Enviar cada contraseña al anestesista correspondiente por un canal seguro.

### Opción B: desde la app

1. Iniciar sesión como gestor-anestesista.
2. **Crear usuario** → email y rol **Anestesista**.
3. Copiar la contraseña temporal y enviarla al anestesista.

---

## 5. Flujo de uso del piloto

| Rol | Puede hacer | Evitar en esta fase |
|-----|-------------|---------------------|
| **Gestor-anestesista** | Ver calendario, asignar anestesistas, crear usuarios, cargar programación | — |
| **Anestesistas** | Ver Mi programación, Mi semana, pacientes atendidos, calendario (consulta) | Programar, reservar, editar |
| **Cirujanos** | Reservar (si aplica) | — |

Los anestesistas usan la app en **modo consulta**: visualización sin edición. El gestor introduce la programación.

---

## 6. Qué comprobar antes de dar acceso a los anestesistas

- [ ] Esquema aplicado (`npx prisma db push`).
- [ ] Usuario gestor-anestesista creado y probado.
- [ ] Asignaciones cargadas para las semanas relevantes.
- [ ] Login como anestesista de prueba (Mi programación, calendario).
- [ ] Contraseñas entregadas por canal seguro (no por correo sin cifrar, si es posible).

---

## 7. Posibles riesgos del piloto

| Riesgo | Mitigación |
|--------|------------|
| Pérdida de datos | Hacer copias de seguridad de la BD con regularidad. |
| Uso de credenciales | Entregar contraseñas por canal seguro; pedir cambio en el primer acceso. |
| No disponibilidad local | Las solicitudes de no disponibilidad solo se guardan en el navegador; documentado. |
| Sin rate limiting | Aceptable en un piloto pequeño; valorar para producción. |
| Contacto público | `/api/contact` es público; hay validación básica de campos. |

---

## Resumen de comandos

```bash
# Esquema en la BD
npx prisma db push

# Tu usuario gestor-anestesista (contraseña por variable de entorno)
GESTOR_ANESTESISTA_PASSWORD=xxx npx tsx scripts/crear-usuario-gestor-anestesista.ts

# Anestesistas desde lista (emails en scripts/emails-anestesistas.txt)
npx tsx scripts/crear-usuarios-desde-lista.ts anestesistas

# Usuarios de prueba (solo si la BD está vacía)
npx prisma db seed
```
