# Seguridad – Piloto real

Revisión práctica y plan de endurecimiento para la app con datos operativos sensibles.

---

## 1. Riesgos priorizados

| # | Riesgo | Severidad | Estado |
|---|--------|-----------|--------|
| 1 | Brute force en login | Alta | **Mitigado** – rate limit 5 intentos / 15 min |
| 2 | Contraseñas débiles | Media | **Mitigado** – validación letra + número + 8 chars |
| 3 | Anestesista ve asignaciones de otros | Alta | **Corregido** – filtro forzado a session.userId |
| 4 | Sesión demasiado larga | Media | **Mitigado** – 3 días (antes 7) |
| 5 | Webhook sin autenticación | Alta | OK – requiere EMAIL_WEBHOOK_SECRET |
| 6 | Contact POST sin rate limit | Baja | Pendiente Fase 2 |
| 7 | Logs con datos sensibles | Baja | **Mitigado** – no se loguea objeto err completo en login |
| 8 | Contraseña obligatoria al primer acceso | Media | Pendiente Fase 2 (campo BD) |
| 9 | Auditoría de acciones sensibles | Media | Parcial – ReservationEvent existe; usuarios/asignaciones pendiente |

---

## 2. Cambios implementados (Fase 1)

### Autenticación
- **Contraseñas**: Validación en cambio, creación y registro – mínimo 8 caracteres, al menos una letra y un número
- **Hash**: bcrypt 12 rounds (ya existía)
- **Sesión**: Cookie httpOnly, secure en producción, SameSite lax
- **Expiración**: 3 días (antes 7)
- **Logout**: Cookie eliminada en servidor (ya existía)

### Protección contra ataques de login
- **Rate limiting**: 5 intentos por IP en 15 minutos → bloqueo 15 min
- **Mensajes**: "Credenciales inválidas" (no revela si el email existe)

### Autorización
- **Anesthetist-assignments GET**: Anestesistas solo ven sus propias asignaciones (no pueden consultar por otro anesthetistId)
- **Endpoints**: Todos requieren sesión excepto `/api/contact` POST y `/api/auth/login`
- **Webhook**: Requiere `EMAIL_WEBHOOK_SECRET` en header; bypass solo en desarrollo

### Logs
- Login: no se loguea el objeto `err` completo (solo mensaje)

---

## 3. Pendiente Fase 2

| Mejora | Esfuerzo | Descripción |
|--------|----------|-------------|
| Rate limit en `/api/contact` POST | Bajo | Evitar spam del formulario público |
| `passwordChangeRequired` en User | Medio | Campo BD + flujo que obligue a cambiar al primer login |
| Auditoría de creación de usuarios | Bajo | Tabla AuditLog o evento al crear usuario |
| Auditoría de asignaciones | Medio | Registrar quién modificó asignaciones y cuándo |
| Rate limit con Redis/KV | Medio | Para múltiples instancias serverless |
| CSP / headers de seguridad | Bajo | Content-Security-Policy, X-Frame-Options |

---

## 4. Secretos y configuración

| Verificación | Estado |
|--------------|--------|
| `.env` en .gitignore | OK |
| JWT_SECRET solo en servidor | OK |
| DATABASE_URL solo en servidor | OK |
| AZURE_* solo en servidor | OK |
| EMAIL_WEBHOOK_SECRET solo en servidor | OK |
| Seed/scripts con contraseñas | seed.ts y seed-usuarios-prueba usan contraseñas fijas – solo para BD vacía o pruebas |
| .env.example | No contiene valores reales |

**Recomendación**: No ejecutar `prisma db seed` en producción si hay datos reales. Usar scripts `crear-usuario-gestor-anestesista` y `crear-usuarios-desde-lista` con variables de entorno.

---

## 5. Exposición de datos por rol

| Rol | Datos que ve |
|-----|--------------|
| Gestor / Gestor-anestesista | Reservas, asignaciones, usuarios, mensajes contacto |
| Anestesista | Solo sus asignaciones y reservas donde está asignado |
| Cirujano / Endoscopista | Solo sus reservas |

**localStorage (modo real)**: Solo mensajes, notificaciones, no disponibilidad – datos auxiliares de UI. Datos críticos van a Neon.

---

## 6. Checklist seguridad mínima antes de ampliar usuarios

- [ ] JWT_SECRET ≥ 32 caracteres en Vercel
- [ ] DATABASE_URL con connection pooling (Neon)
- [ ] NEXT_PUBLIC_DEMO_MODE=false
- [ ] No ejecutar seed en BD de producción
- [ ] EMAIL_WEBHOOK_SECRET ≥ 16 chars si se usa webhook
- [ ] Contraseñas entregadas por canal seguro
- [ ] Pedir cambio de contraseña al primer acceso (operativo, no técnico)
