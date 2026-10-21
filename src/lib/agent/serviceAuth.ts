import { bearerToken, secretsEqual } from "@/lib/security/secrets";

const MIN_TOKEN_LENGTH = 24;

export function agentServiceToken(): string | null {
  const token = process.env.AGENT_SERVICE_TOKEN?.trim();
  if (!token || token.length < MIN_TOKEN_LENGTH) return null;
  return token;
}

export function hasAgentServiceToken(request: Request): boolean {
  const expected = agentServiceToken();
  if (!expected) return false;
  return secretsEqual(bearerToken(request.headers.get("authorization")), expected);
}
