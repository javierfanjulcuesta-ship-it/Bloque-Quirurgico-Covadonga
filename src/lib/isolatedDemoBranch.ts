/**
 * Ramas que se construyen siempre como demostración aislada.
 * No hace falta ninguna variable de entorno: aunque el proyecto de Vercel
 * tenga DATABASE_URL de otro entorno, estas ramas no abren la base de datos.
 * El resto de ramas (producción, hardening) no entran aquí.
 */
export const ISOLATED_DEMO_REFS = ["cursor/demo-aislada-a622", "demo"] as const;

export function isIsolatedDemoRef(ref: string | undefined | null): boolean {
  if (!ref) return false;
  const name = ref.trim();
  if (!name || name === "HEAD") return false;
  return (ISOLATED_DEMO_REFS as readonly string[]).includes(name);
}
