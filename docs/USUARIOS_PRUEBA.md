# Usuarios de prueba – Modo real

Usuarios en base de datos para desarrollo y pruebas con `NEXT_PUBLIC_DEMO_MODE=false`.

---

## Credenciales

**Contraseña inicial para todos: `123`**

| Perfil | Email | Rol en BD |
|--------|-------|-----------|
| Gestor | `gestor@prueba.test` | GESTOR |
| Cirujano | `cirujano@prueba.test` | CIRUJANO |
| Anestesista | `anestesista@prueba.test` | ANESTESISTA |
| Endoscopista | `endoscopista@prueba.test` | ENDOSCOPISTA |
| Gestor Anestesista | `gestor-anest@prueba.test` | GESTOR_ANESTESISTA |

Dominio `@prueba.test` para identificar claramente como entorno de pruebas internas.

---

## Uso

1. `.env` con `NEXT_PUBLIC_DEMO_MODE=false`
2. Base de datos: `npx prisma db push` (si hay cambios de schema)
3. Crear/actualizar usuarios: `npm run usuarios:reset`
4. Servidor: `npm run dev`
5. Acceso: http://localhost:3000 → login con email y contraseña `123`

---

## Flujos verificados

| Flujo | Estado |
|-------|--------|
| Login real (email + contraseña) | ✅ |
| Cambio de contraseña (Mi Perfil) | ✅ |
| Reserva desde cirujano (API) | ✅ |
| Calendario gestor (API) | ✅ |
| Acceso por rol (cirujano → /cirujano, gestor → /calendario) | ✅ |

---

## Notas

- Usuarios creados con `approved=true` para acceso inmediato.
- Para resetear contraseñas a `123`: `npm run usuarios:reset`
- El script `seed-usuarios-prueba.ts` solo añade si no existen; `reset-usuarios-prueba.ts` hace upsert y fuerza contraseña.
