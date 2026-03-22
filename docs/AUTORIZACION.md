# Capa de autorización – Bloque Quirúrgico

Sistema centralizado de permisos para Next.js App Router. **Siempre validar en backend.**

---

## Estructura de archivos

```
src/lib/auth/
├── index.ts          # Barrel export
├── permissions.ts    # Permission, ROLE_PERMISSIONS, hasPermission, hasAnyPermission
├── authorization.ts  # requireAuth, requireRole, requirePermission, canAccess*
├── session.ts        # JWT, getSessionFromCookie (existente)
└── ...
```

---

## Permisos disponibles

| Permiso | Descripción |
|---------|-------------|
| booking:create | Crear reservas |
| booking:update | Editar reservas |
| booking:cancel | Cancelar reservas |
| booking:view:all | Ver todas las reservas |
| booking:view:own | Ver reservas propias |
| patient:create | Crear pacientes en bloque |
| patient:update | Editar pacientes |
| schedule:view:all | Ver programación completa |
| schedule:view:own | Ver programación asignada |
| anesthetist:assign | Asignar anestesistas |
| metrics:view | Ver métricas |
| user:create | Crear usuarios |
| user:update | Editar usuarios |
| user:approve | Aprobar usuarios |
| or:open_close | Gestionar apertura bloque |
| contact:view | Ver mensajes de contacto |

---

## Jerarquía de roles

ANESTESISTA < GESTOR < GESTOR_ANESTESISTA

- **GESTOR_ANESTESISTA**: hereda todos los permisos de GESTOR + extras de anestesista.
- **CIRUJANO / ENDOSCOPISTA**: no pueden editar ni cancelar reservas.

---

## Uso en route handlers

### Ejemplo 1: Exigir autenticación y permiso

```typescript
// app/api/reservations/route.ts
import { getSessionFromCookie } from "@/lib/auth/session";
import {
  toAuthSession,
  requireAuth,
  requirePermission,
  hasPermission,
} from "@/lib/auth";

export async function POST(request: Request) {
  const session = toAuthSession(await getSessionFromCookie());
  const denyAuth = requireAuth(session);
  if (denyAuth) return denyAuth;

  const denyPerm = requirePermission(session!, "booking:create");
  if (denyPerm) return denyPerm;

  // ... lógica de negocio
}
```

### Ejemplo 2: Exigir uno de varios permisos

```typescript
const denyPerm = requireAnyPermission(session!, ["booking:view:own", "booking:view:all"]);
if (denyPerm) return denyPerm;
```

### Ejemplo 3: Evitar IDOR con canAccessBooking

```typescript
// GET /api/reservations/[id] – acceder a una reserva concreta
import { canAccessBooking, toAuthSession } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = toAuthSession(await getSessionFromCookie());
  const deny = requireAuth(session);
  if (deny) return deny;

  const { id } = await params;
  const booking = await prisma.reservation.findUnique({
    where: { id },
    include: { patients: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const bookingLike = {
    id: booking.id,
    surgeonId: booking.surgeonId,
    createdByUserId: booking.createdByUserId,
  };

  if (!canAccessBooking(session!, bookingLike, "booking:view:own")) {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  return NextResponse.json({ reservation: toApiReservation(booking) });
}
```

### Ejemplo 4: PATCH con canAccessBooking para update/cancel

```typescript
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = toAuthSession(await getSessionFromCookie());
  const deny = requireAuth(session);
  if (deny) return deny;

  const booking = await prisma.reservation.findUnique({ where: { id: (await params).id } });
  if (!booking) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const access = canAccessBooking(session!, booking, "booking:update");
  if (!access) {
    return NextResponse.json({ error: "No puede editar esta reserva" }, { status: 403 });
  }

  // ... actualizar
}
```

---

## Decisiones de seguridad

1. **Denegar por defecto**: roles inválidos o ausentes → sin acceso.
2. **Validación en backend**: no confiar en permisos del frontend.
3. **IDOR**: usar `canAccessBooking`, `canAccessSchedule`, `canAccessPatient` para recursos concretos.
4. **401 vs 403**: 401 sin sesión, 403 con sesión pero sin permiso.
