export function shouldForceEmailMock(
  vercelEnv: string | undefined,
  deploymentMode: string | undefined = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE,
): boolean {
  return vercelEnv === "preview" || deploymentMode === "isolated-demo";
}

export function isEmailMockAllowed(
  nodeEnv: string | undefined,
  vercelEnv: string | undefined = process.env.VERCEL_ENV,
  deploymentMode: string | undefined = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE,
): boolean {
  return shouldForceEmailMock(vercelEnv, deploymentMode) || nodeEnv !== "production";
}

export function emailProviderUnavailableMessage(provider?: "smtp" | "graph"): string {
  if (provider === "smtp") return "El proveedor SMTP no está disponible";
  if (provider === "graph") return "Microsoft Graph no está disponible";
  return "No hay ningún proveedor de correo real configurado";
}
