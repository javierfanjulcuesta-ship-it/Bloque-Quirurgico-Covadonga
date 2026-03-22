# Gestión segura de baja de usuarios

## Resumen

- **Desactivación lógica** (no borrado físico)
- Solo **GESTOR** y **GESTOR_ANESTESISTA** pueden desactivar/reactivar
- Usuario desactivado: no puede hacer login, no aparece en listados normales
- Histórico preservado: reservas, asignaciones y logs intactos

---

## Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | User: isActive, deletedAt, deletedByUserId, deletionReason; UserAuditEvent |
| `src/lib/auth/permissions.ts` | user:deactivate, user:reactivate (solo GESTOR, GESTOR_ANESTESISTA) |
| `src/lib/userAudit.ts` | Nuevo: logUserAuditEvent |
| `src/app/api/users/[id]/deactivate/route.ts` | Nuevo: PATCH |
| `src/app/api/users/[id]/reactivate/route.ts` | Nuevo: PATCH |
| `src/app/api/auth/login/route.ts` | Rechaza isActive=false |
| `src/app/api/auth/session/route.ts` | Rechaza isActive=false |
| `src/app/api/users/route.ts` | GET: where isActive (o includeInactive=1 para gestores) |
| `src/app/api/cron/release-pending-reservations/route.ts` | Cirujanos: isActive: true |
| `src/app/api/anesthetist-assignments/route.ts` | Asignaciones: solo anestesistas activos |
| `src/lib/email/processIncomingEmail.ts` | Remitente: isActive: true |
| `src/lib/api/users.ts` | fetchUsers({ includeInactive }) |
| `src/lib/types.ts` | User.isActive |
| `src/components/gestor/ListaUsuariosGestor.tsx` | Nuevo: lista + Desactivar/Reactivar |
| `src/components/gestor/CrearNuevoUsuario.tsx` | Integra ListaUsuariosGestor |

---

## Modelo Prisma

```prisma
// User - campos añadidos
isActive       Boolean   @default(true)
deletedAt     DateTime?
deletedByUserId String?
deletionReason  String?   @db.Text

// UserAuditEvent - nuevo modelo
model UserAuditEvent {
  id          String   @id @default(cuid())
  userId      String
  eventType   String   // USER_DEACTIVATED | USER_REACTIVATED | USER_DELETED
  actorUserId String?
  detailsJson String?  @db.Text
  createdAt   DateTime @default(now())
  ...
}
```

---

## Permisos

| Permiso | Roles | Acción |
|---------|-------|--------|
| user:deactivate | GESTOR, GESTOR_ANESTESISTA | Desactivar usuario |
| user:reactivate | GESTOR, GESTOR_ANESTESISTA | Reactivar usuario |

Alineados con user:create (misma familia de gestión de usuarios).

---

## Protecciones

- No desactivar a sí mismo
- No desactivar al último gestor activo
- Login y sesión rechazan isActive=false
- Listados normales excluyen inactivos
- Asignar anestesistas: solo activos
- Correo de liberación: solo cirujanos activos
- Procesamiento de correos entrantes: solo remitentes activos

---

## Auditoría

Eventos en `UserAuditEvent`:
- `USER_DEACTIVATED`: userId, actorUserId, targetEmail, targetRole
- `USER_REACTIVATED`: idem

---

## Pasos para activar

```bash
npx prisma db push
# o: npx prisma migrate dev --name add_user_deactivation
```

---

## Edge cases

1. **Usuario con reservas/ asignaciones activas:** Se desactiva; las reservas y asignaciones siguen en BD (histórico intacto). El usuario ya no puede hacer login ni aparecer en selectores nuevos.
2. **Último gestor:** No se puede desactivar; el sistema requiere al menos un gestor activo.
3. **Sesión abierta al desactivar:** La sesión se invalida en la siguiente llamada a /api/auth/session (que comprueba isActive).
4. **Borrado físico:** No implementado. Si se requiere en el futuro, sería DELETE restringido a casos muy específicos (ej. RGPD) y con auditoría USER_DELETED.
