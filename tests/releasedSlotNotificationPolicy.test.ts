import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("released-slot notifications target approved non-deleted surgeons only", () => {
  const source = readFileSync("src/app/api/cron/release-pending-reservations/route.ts", "utf8");
  const releaseGuard = source.indexOf("if (actuallyReleased.length === 0)");
  const recipientsQuery = source.indexOf("const cirujanos = await prisma.user.findMany");
  const roleFilter = source.indexOf('role: "CIRUJANO"', recipientsQuery);
  const approvedFilter = source.indexOf("approved: true", recipientsQuery);
  const deletedFilter = source.indexOf("deletedAt: null", recipientsQuery);
  const sendCall = source.indexOf("sendReleaseNotificationToSurgeons", recipientsQuery);

  assert.ok(releaseGuard >= 0, "missing no-release guard");
  assert.ok(recipientsQuery > releaseGuard, "recipient query must occur only after actual releases exist");
  assert.ok(roleFilter > recipientsQuery, "recipient query must filter CIRUJANO role");
  assert.ok(approvedFilter > recipientsQuery, "recipient query must require approved users");
  assert.ok(deletedFilter > recipientsQuery, "recipient query must exclude deleted users");
  assert.ok(sendCall > recipientsQuery, "release email send must use the filtered recipient set");
});
