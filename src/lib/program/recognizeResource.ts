/**
 * Reconocimiento de sala. Si el texto no corresponde a un recurso conocido,
 * el resultado es null: nunca se sustituye por Q1.
 */

export const RECOGNIZED_RESOURCE_IDS = [
  "Q1",
  "Q2",
  "Q3",
  "procedimientos-menores",
  "tecnicas-dolor",
] as const;

export type RecognizedResourceId = (typeof RECOGNIZED_RESOURCE_IDS)[number];

const RECOGNIZED = new Set<string>(RECOGNIZED_RESOURCE_IDS);

export function recognizeResourceId(value: string | null | undefined): RecognizedResourceId | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!RECOGNIZED.has(trimmed)) return null;
  return trimmed as RecognizedResourceId;
}

/** Decisión de entrada: una sala no reconocida queda pendiente y no se convierte en Q1. */
export function decideIncomingResource(
  resourceId: string | null | undefined,
): { action: "use"; resourceId: RecognizedResourceId } | { action: "pending" } {
  const recognized = recognizeResourceId(resourceId);
  if (!recognized) return { action: "pending" };
  return { action: "use", resourceId: recognized };
}

export function missingFieldsLeaveRoomPending(missingFields: string[] | undefined): boolean {
  if (!missingFields || missingFields.length !== 1) return false;
  return /quir[oó]fano|recurso/i.test(missingFields[0] ?? "");
}
