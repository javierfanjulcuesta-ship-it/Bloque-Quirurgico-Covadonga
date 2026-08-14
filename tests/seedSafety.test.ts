import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertSeedAllowed, requireSecretEnv, requireSeedConfirmation } from "../scripts/lib/seedSafety";

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const previous: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("seed operations are blocked in production", () => {
  withEnv({ NODE_ENV: "production", VERCEL: undefined }, () => {
    assert.throws(() => assertSeedAllowed("showcase"), /bloqueado en producción\/Vercel/);
  });
});

test("seed operations are blocked on Vercel", () => {
  withEnv({ NODE_ENV: "test", VERCEL: "1" }, () => {
    assert.throws(() => assertSeedAllowed("showcase"), /bloqueado en producción\/Vercel/);
  });
});

test("showcase seed requires the exact destructive-operation confirmation", () => {
  withEnv({ ALLOW_SHOWCASE_SEED: "yes" }, () => {
    assert.throws(
      () => requireSeedConfirmation("ALLOW_SHOWCASE_SEED", "I_UNDERSTAND_SHOWCASE_DATA_ONLY"),
      /I_UNDERSTAND_SHOWCASE_DATA_ONLY/,
    );
  });

  withEnv({ ALLOW_SHOWCASE_SEED: "I_UNDERSTAND_SHOWCASE_DATA_ONLY" }, () => {
    assert.doesNotThrow(() =>
      requireSeedConfirmation("ALLOW_SHOWCASE_SEED", "I_UNDERSTAND_SHOWCASE_DATA_ONLY"),
    );
  });
});

test("test credentials must meet the minimum length", () => {
  withEnv({ TEST_USERS_PASSWORD: "short-pass" }, () => {
    assert.throws(() => requireSecretEnv("TEST_USERS_PASSWORD", 12), /al menos 12 caracteres/);
  });

  withEnv({ TEST_USERS_PASSWORD: "123456789012" }, () => {
    assert.equal(requireSecretEnv("TEST_USERS_PASSWORD", 12), "123456789012");
  });
});

test("npm showcase seed uses the canonical guarded entrypoint", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.["seed:showcase"], "npx tsx scripts/seedShowcase.ts");
});

test("canonical showcase entrypoint guards before loading destructive implementation", () => {
  const source = readFileSync("scripts/seedShowcase.ts", "utf8");
  const allowedIndex = source.indexOf("assertSeedAllowed");
  const confirmationIndex = source.indexOf("requireSeedConfirmation");
  const importIndex = source.indexOf('import("./lib/seedShowcaseImplementation")');

  assert.ok(allowedIndex >= 0, "canonical entrypoint must check environment safety");
  assert.ok(confirmationIndex > allowedIndex, "confirmation must follow environment safety check");
  assert.ok(importIndex > confirmationIndex, "destructive implementation must load only after both guards");
});
