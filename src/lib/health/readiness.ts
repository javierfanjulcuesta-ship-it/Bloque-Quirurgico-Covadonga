export type ReadinessDependencyCheck = () => Promise<void>;

export const DEFAULT_READINESS_TIMEOUT_MS = 2_000;

/**
 * Runs a dependency check without exposing the underlying failure.
 * The caller can safely map the boolean result to a public readiness response.
 *
 * Readiness must also fail closed when a dependency stalls indefinitely: a
 * hanging database/socket check must not leave the probe request pending until
 * the hosting platform kills it.
 */
export async function isDependencyReady(
  check: ReadinessDependencyCheck,
  timeoutMs = DEFAULT_READINESS_TIMEOUT_MS,
): Promise<boolean> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return false;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      check().then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
