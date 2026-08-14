import { assertSeedAllowed, requireSeedConfirmation } from "./lib/seedSafety";

async function main() {
  assertSeedAllowed("carga del dataset showcase");
  requireSeedConfirmation("ALLOW_SHOWCASE_SEED", "I_UNDERSTAND_SHOWCASE_DATA_ONLY");
  await import("./lib/seedShowcaseImplementation");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
