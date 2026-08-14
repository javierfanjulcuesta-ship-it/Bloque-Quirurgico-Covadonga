export function shouldForceEmailMock(vercelEnv: string | undefined): boolean {
  return vercelEnv === "preview";
}

export function isEmailMockAllowed(
  nodeEnv: string | undefined,
  vercelEnv: string | undefined = process.env.VERCEL_ENV,
): boolean {
  return shouldForceEmailMock(vercelEnv) || nodeEnv !== "production";
}

export function emailProviderUnavailableMessage(provider?: "smtp" | "graph"): string {
  if (provider === "smtp") return "El proveedor SMTP no está disponible";
  if (provider === "graph") return "Microsoft Graph no está disponible";
  return "No hay ningún proveedor de correo real configurado";
}
