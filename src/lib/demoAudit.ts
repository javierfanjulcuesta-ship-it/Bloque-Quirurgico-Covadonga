export type DemoAuditAction =
  | "reservation.created"
  | "reservation.cancelled"
  | "patient.updated"
  | "patient.cancelled";

export interface DemoAuditEvent {
  id: string;
  timestamp: string;
  action: DemoAuditAction;
  entityType: "reservation" | "patient";
  entityId: string;
  reservationId: string;
}

const DEMO_AUDIT_STORAGE_KEY = "qxflow:isolated-demo:v1:audit";
const MAX_DEMO_AUDIT_EVENTS = 250;
const DEMO_AUDIT_ACTIONS = new Set<DemoAuditAction>([
  "reservation.created",
  "reservation.cancelled",
  "patient.updated",
  "patient.cancelled",
]);

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function getDemoAuditEvents(): DemoAuditEvent[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(DEMO_AUDIT_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((event): event is DemoAuditEvent => {
      if (!event || typeof event !== "object") return false;
      const candidate = event as Partial<DemoAuditEvent>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.timestamp === "string" &&
        typeof candidate.action === "string" &&
        DEMO_AUDIT_ACTIONS.has(candidate.action as DemoAuditAction) &&
        (candidate.entityType === "reservation" || candidate.entityType === "patient") &&
        typeof candidate.entityId === "string" &&
        typeof candidate.reservationId === "string"
      );
    });
  } catch {
    return [];
  }
}

export function recordDemoAuditEvent(
  event: Omit<DemoAuditEvent, "id" | "timestamp">
): DemoAuditEvent | null {
  const storage = getStorage();
  if (!storage) return null;
  const next: DemoAuditEvent = {
    ...event,
    id: `demo-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
  try {
    const events = [...getDemoAuditEvents(), next].slice(-MAX_DEMO_AUDIT_EVENTS);
    storage.setItem(DEMO_AUDIT_STORAGE_KEY, JSON.stringify(events));
    return next;
  } catch {
    // La auditoría DEMO es auxiliar: una cuota/bloqueo de localStorage nunca debe romper la operación simulada.
    return null;
  }
}

export function clearDemoAuditEvents(): void {
  try {
    getStorage()?.removeItem(DEMO_AUDIT_STORAGE_KEY);
  } catch {
    // Sin efecto: la limpieza DEMO tampoco debe romper la interfaz si el almacenamiento no está disponible.
  }
}

export { DEMO_AUDIT_STORAGE_KEY };
