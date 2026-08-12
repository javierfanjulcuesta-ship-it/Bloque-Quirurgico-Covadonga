export type ReadinessDependencyCheck = () => Promise<void>;

/**
 * Runs a dependency check without exposing the underlying failure.
 * The caller can safely map the boolean result to a public readiness response.
 */
export async function isDependencyReady(check: ReadinessDependencyCheck): Promise<boolean> {
  try {
    await check();
    return true;
  } catch {
    return false;
  }
}
