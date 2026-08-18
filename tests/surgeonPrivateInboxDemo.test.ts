import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addResponsibleSurgeonInAppNotification } from "../src/lib/notifications/responsibleSurgeonInApp";

test("responsible-surgeon helper emits exactly one notification to the resolved user", () => {
  const captured: Array<{ userId: string; title: string; message: string }> = [];
  const ok = addResponsibleSurgeonInAppNotification(
    {
      responsibleUserId: "surgeon-a",
      title: "Autorización denegada",
      message: "Paciente sintético · intervención de prueba",
    },
    (notice) => captured.push(notice),
  );

  assert.equal(ok, true);
  assert.deepEqual(captured, [{
    userId: "surgeon-a",
    title: "Autorización denegada",
    message: "Paciente sintético · intervención de prueba",
  }]);
  assert.equal(captured.some((notice) => notice.userId === "surgeon-b"), false);
});

test("private inbox reads only notifications scoped to the signed-in user", () => {
  const source = readFileSync("src/app/cirujano/notificaciones/page.tsx", "utf8");
  assert.match(source, /getNotificationsForUser\(user\.id\)/);
  assert.doesNotMatch(source, /getNotifications\(\)/);
  assert.match(source, /user\?\.role === "cirujano" \|\| user\?\.role === "endoscopista"/);
});

test("surgeon workspace exposes a private unread badge without any API call in isolated demo", () => {
  const source = readFileSync("src/app/cirujano/layout.tsx", "utf8");
  assert.match(source, /getNotificationsForUser\(user\.id\)/);
  assert.match(source, /router\.push\("\/cirujano\/notificaciones"\)/);
  assert.match(source, /modoDemo/);
  assert.doesNotMatch(source, /fetch\s*\(/);
});

test("real-mode inbox fails closed until durable persistence is wired", () => {
  const source = readFileSync("src/app/cirujano/notificaciones/page.tsx", "utf8");
  assert.match(source, /if \(!modoDemo\)/);
  assert.match(source, /persistencia real todavía no está conectada/);
});
