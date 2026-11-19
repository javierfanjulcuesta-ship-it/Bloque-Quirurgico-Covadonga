import type { NextConfig } from "next";
import { execSync } from "node:child_process";

import { isIsolatedDemoRef } from "./src/lib/isolatedDemoBranch";

function currentGitRef(): string | undefined {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_REF?.trim();
  if (fromVercel) return fromVercel;
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

const forceIsolatedDemo =
  process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === "isolated-demo" || isIsolatedDemoRef(currentGitRef());

if (forceIsolatedDemo) {
  process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "isolated-demo";
  process.env.QXFLOW_ISOLATED_DEMO = "true";
}

const nextConfig: NextConfig = {
  env: forceIsolatedDemo
    ? {
        NEXT_PUBLIC_DEPLOYMENT_MODE: "isolated-demo",
        QXFLOW_ISOLATED_DEMO: "true",
      }
    : undefined,
};

export default nextConfig;
