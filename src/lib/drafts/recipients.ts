export interface RecipientUser {
  id: string;
  name: string;
  email?: string | null;
}

export interface StoredMailTeam {
  name: string;
  userIds: string[];
}

export const MAIL_TEAM_CATALOG: readonly { name: string; nameTokens: string[] }[] = [
  { name: "Burgos y La Jara", nameTokens: ["burgos", "jara"] },
];

function tokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function matchesToken(name: string, token: string): boolean {
  return tokens(name).includes(token);
}

export function isEndoscopyCase(resourceId: string | null | undefined, procedure?: string | null): boolean {
  if (resourceId === "endoscopias") return true;
  return /endoscop/i.test(procedure ?? "") || /endoscop/i.test(resourceId ?? "");
}

export interface ResolvedRecipients {
  userIds: string[];
  warning?: string;
}

/**
 * Equipos y endoscopista configurado. No envía correo.
 * Los datos de equipo viven en la base o, si no hay fila, en el catálogo.
 */
export function resolveParteRecipients(input: {
  surgeonId: string;
  surgeonName: string;
  resourceId?: string | null;
  procedure?: string | null;
  users: RecipientUser[];
  teams: StoredMailTeam[];
  endoscopyUserId?: string | null;
}): ResolvedRecipients {
  if (isEndoscopyCase(input.resourceId, input.procedure)) {
    if (!input.endoscopyUserId || !input.users.some((user) => user.id === input.endoscopyUserId)) {
      return { userIds: [], warning: "Falta el endoscopista configurado. No se envía a la UCE ni al cirujano." };
    }
    return { userIds: [input.endoscopyUserId] };
  }

  const team = input.teams.find((item) => item.userIds.includes(input.surgeonId));
  if (team) return { userIds: [...new Set(team.userIds)] };

  const catalog = MAIL_TEAM_CATALOG.find((item) => item.nameTokens.some((token) => matchesToken(input.surgeonName, token)));
  if (catalog) {
    const members = input.users.filter((user) => catalog.nameTokens.some((token) => matchesToken(user.name, token)));
    if (members.length > 0) return { userIds: members.map((user) => user.id) };
  }

  return { userIds: [input.surgeonId] };
}
