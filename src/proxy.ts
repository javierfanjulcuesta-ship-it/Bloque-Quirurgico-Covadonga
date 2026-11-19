import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isIsolatedDemoRef } from "@/lib/isolatedDemoBranch";
import { shouldBlockIsolatedDemoPath } from "@/lib/isolatedDemoServerPolicy";

export function proxy(request: NextRequest) {
  const branchForcesDemo = isIsolatedDemoRef(process.env.VERCEL_GIT_COMMIT_REF);
  const shouldBlock = shouldBlockIsolatedDemoPath(request.nextUrl.pathname, {
    runtimeServerFlag: process.env.QXFLOW_ISOLATED_DEMO === "true" || branchForcesDemo ? "true" : process.env.QXFLOW_ISOLATED_DEMO,
    // Direct access is intentional: Next.js can inline NEXT_PUBLIC_* at build time,
    // keeping the server proxy boundary aligned with the client bundle mode.
    buildPublicMode: process.env.NEXT_PUBLIC_DEPLOYMENT_MODE,
  });

  if (shouldBlock) {
    return NextResponse.json(
      {
        error: "Backend deshabilitado en modo demostración aislado",
        code: "ISOLATED_DEMO_BACKEND_DISABLED",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
