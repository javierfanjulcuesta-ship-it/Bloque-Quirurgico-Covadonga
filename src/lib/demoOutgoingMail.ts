import { safeParseJSON } from "./storageSafe";

export const DEMO_OUTGOING_MAIL_STORAGE_KEY = "qxflow_demo_outgoing_mail_v1";

export type DemoOutgoingMailCategory =
  | "NUEVA_CITA"
  | "CAMBIO"
  | "ANULACION"
  | "HUECO_LIBERADO"
  | "AUTORIZACION_DENEGADA";

export type DemoOutgoingMailState = "GENERADO" | "PREPARADO" | "ENTREGA_SIMULADA";

export interface DemoOutgoingMail {
  id: string;
  category: DemoOutgoingMailCategory;
  recipientLabel: string;
  subject: string;
  body: string;
  createdAt: string;
  state: DemoOutgoingMailState;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `demo-mail-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getDemoOutgoingMail(): DemoOutgoingMail[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParseJSON<unknown>(window.localStorage.getItem(DEMO_OUTGOING_MAIL_STORAGE_KEY), []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((value): value is DemoOutgoingMail => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const item = value as Partial<DemoOutgoingMail>;
    return typeof item.id === "string"
      && typeof item.recipientLabel === "string"
      && typeof item.subject === "string"
      && typeof item.body === "string"
      && typeof item.createdAt === "string"
      && typeof item.category === "string"
      && typeof item.state === "string";
  });
}

function save(items: DemoOutgoingMail[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_OUTGOING_MAIL_STORAGE_KEY, JSON.stringify(items));
}

export function addDemoOutgoingMail(input: Omit<DemoOutgoingMail, "id" | "createdAt" | "state">): DemoOutgoingMail {
  const item: DemoOutgoingMail = {
    ...input,
    id: randomId(),
    createdAt: new Date().toISOString(),
    state: "GENERADO",
  };
  save([item, ...getDemoOutgoingMail()].slice(0, 200));
  return item;
}

export function setDemoOutgoingMailState(id: string, state: DemoOutgoingMailState): void {
  if (!id) return;
  save(getDemoOutgoingMail().map((item) => item.id === id ? { ...item, state } : item));
}

export function clearDemoOutgoingMail(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DEMO_OUTGOING_MAIL_STORAGE_KEY);
}
