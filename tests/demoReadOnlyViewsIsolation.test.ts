import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guardedViews = [
  {
    path: "src/components/cirujano/NormasProgramacionView.tsx",
    endpoint: 'fetch("/api/programming-rules"',
  },
  {
    path: "src/components/cirujano/UltimasLiberacionesView.tsx",
    endpoint: 'fetch("/api/common-pool-releases"',
  },
];

for (const { path, endpoint } of guardedViews) {
  test(`${path} exits the effect in demo before the real API call`, () => {
    const source = readFileSync(path, "utf8");
    const guardIndex = source.indexOf("if (modoDemo) return;");
    const fetchIndex = source.indexOf(endpoint);

    assert.ok(source.includes('import { modoDemo } from "@/lib/config";'));
    assert.ok(guardIndex >= 0, "missing demo early-return guard");
    assert.ok(fetchIndex >= 0, "expected real-mode endpoint is missing");
    assert.ok(guardIndex < fetchIndex, "demo guard must execute before the API call");
    assert.ok(source.includes("No disponible en modo demostración."));
  });
}
