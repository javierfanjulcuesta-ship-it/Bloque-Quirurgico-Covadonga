export function isIsolatedDemoServerEnabled({
  runtimeServerFlag,
  buildPublicMode,
}: {
  runtimeServerFlag: string | undefined;
  buildPublicMode: string | undefined;
}): boolean {
  return runtimeServerFlag === "true" || buildPublicMode === "isolated-demo";
}

export function shouldBlockIsolatedDemoPath(
  pathname: string,
  signals: {
    runtimeServerFlag: string | undefined;
    buildPublicMode: string | undefined;
  },
): boolean {
  return (
    isIsolatedDemoServerEnabled(signals) &&
    (pathname === "/api" || pathname.startsWith("/api/"))
  );
}
