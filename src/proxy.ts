import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { shouldBlockIsolatedDemoPath } from "@/lib/isolatedDemoServerPolicy";

export function proxy(request: NextRequest) {
  if (shouldBlockIsolatedDemoPath(request.nextUrl.pathname)) {
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
