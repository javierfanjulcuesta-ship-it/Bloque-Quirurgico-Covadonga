export function isIsolatedDemoServerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.QXFLOW_ISOLATED_DEMO === "true" ||
    env.NEXT_PUBLIC_DEPLOYMENT_MODE === "isolated-demo"
  );
}

export function shouldBlockIsolatedDemoPath(
  pathname: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isIsolatedDemoServerEnabled(env) &&
    (pathname === "/api" || pathname.startsWith("/api/"));
}
