/**
 * Sistema centralizado de permisos explícitos.
 * Jerarquía: ANESTESISTA < GESTOR < GESTOR_ANESTESISTA
 * CIRUJANO/ENDOSCOPISTA: permisos limitados.
 * Validación siempre en backend. No confiar en el frontend.
 */

/** Permisos explícitos por string. Diseño tipo RBAC hospitalario. */
export type Permission =
  | "booking:create"
  | "booking:update"
  | "booking:cancel"
  | "booking:view:all"
  | "booking:view:own"
  | "patient:create"
  | "patient:update"
  | "patient:cancel"
  | "schedule:view:all"
  | "schedule:view:own"
  | "anesthetist:assign"
  | "metrics:view"
  | "user:create"
  | "user:list"
  | "user:deactivate"
  | "user:reactivate"
  | "user:update"
  | "user:approve"
  | "or:open_close"
  | "contact:view"
  | "rules:edit";

/** Rol normalizado (formato sesión). Compatible con Prisma UserRole. */
export type Role =
  | "gestor"
  | "gestor-anestesista"
  | "anestesista"
  | "cirujano"
  | "endoscopista";

/** Normaliza string de sesión a Role. Devuelve null si inválido. */
export function normalizeRole(raw: string | undefined): Role | null {
  if (!raw || typeof raw !== "string") return null;
  const r = raw.trim().toLowerCase();
  const valid: Role[] = ["gestor", "gestor-anestesista", "anestesista", "cirujano", "endoscopista"];
  if (valid.includes(r as Role)) return r as Role;
  if (r === "gestor_anestesista") return "gestor-anestesista";
  return null;
}

/** Permisos base por rol. GESTOR_ANESTESISTA hereda de GESTOR + extras. */
const ROLE_PERMISSIONS_BASE: Record<Role, Permission[]> = {
  cirujano: [
    "booking:create",
    "booking:update",
    "booking:cancel",
    "booking:view:own",
    "patient:create",
    "patient:update",
    "patient:cancel",
    "schedule:view:own",
  ],
  endoscopista: [
    "booking:create",
    "booking:update",
    "booking:cancel",
    "booking:view:own",
    "patient:create",
    "patient:update",
    "patient:cancel",
    "schedule:view:own",
  ],
  anestesista: [
    "booking:view:own",
    "schedule:view:own",
  ],
  gestor: [
    "booking:create",
    "booking:update",
    "booking:cancel",
    "booking:view:all",
    "patient:create",
    "patient:update",
    "patient:cancel",
    "schedule:view:all",
    "anesthetist:assign",
    "metrics:view",
    "user:create",
    "user:list",
    "user:update",
    "user:approve",
    "user:deactivate",
    "user:reactivate",
    "or:open_close",
    "contact:view",
    "rules:edit",
  ],
  "gestor-anestesista": [
    // Hereda todos los de GESTOR (definidos arriba)
    "booking:create",
    "booking:update",
    "booking:cancel",
    "booking:view:all",
    "patient:create",
    "patient:update",
    "patient:cancel",
    "schedule:view:all",
    "anesthetist:assign",
    "metrics:view",
    "user:create",
    "user:list",
    "user:update",
    "user:approve",
    "user:deactivate",
    "user:reactivate",
    "or:open_close",
    "contact:view",
    "rules:edit",
    // Extras de anestesista (herencia)
    "booking:view:own",
    "schedule:view:own",
  ],
};

/** Mapa de permisos por rol (referencia; usar hasPermission). */
export const ROLE_PERMISSIONS = ROLE_PERMISSIONS_BASE;

/** Cache de permisos computados (incluye herencia). */
let _permissionsCache: Map<Role, Set<Permission>> | null = null;

function buildPermissionsCache(): Map<Role, Set<Permission>> {
  if (_permissionsCache) return _permissionsCache;
  const m = new Map<Role, Set<Permission>>();
  for (const role of Object.keys(ROLE_PERMISSIONS_BASE) as Role[]) {
    const perms = new Set<Permission>(ROLE_PERMISSIONS_BASE[role]);
    m.set(role, perms);
  }
  _permissionsCache = m;
  return m;
}

/**
 * Comprueba si un rol tiene un permiso.
 * Roles inválidos: denegación por defecto.
 */
export function hasPermission(role: Role | string | null | undefined, permission: Permission): boolean {
  const r = typeof role === "string" ? normalizeRole(role) : null;
  if (!r) return false;
  const cache = buildPermissionsCache();
  return cache.get(r)?.has(permission) ?? false;
}

/** Comprueba si el rol tiene al menos uno de los permisos. */
export function hasAnyPermission(
  role: Role | string | null | undefined,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}
