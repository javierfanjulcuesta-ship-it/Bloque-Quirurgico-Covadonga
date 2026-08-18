import assert from "node:assert/strict";
import test from "node:test";
import { addResponsibleSurgeonInAppNotification } from "../src/lib/notifications/responsibleSurgeonInApp";

test("routes a surgeon-targeted notice to exactly the responsible user", () => {
  const deliveries: Array<{ userId: string; title: string; message: string }> = [];

  const added = addResponsibleSurgeonInAppNotification(
    {
      responsibleUserId: "surgeon-demo-7",
      title: "Autorización denegada",
      message: "La autorización del caso programado ha sido denegada.",
    },
    (notification) => deliveries.push(notification)
  );

  assert.equal(added, true);
  assert.deepEqual(deliveries, [
    {
      userId: "surgeon-demo-7",
      title: "Autorización denegada",
      message: "La autorización del caso programado ha sido denegada.",
    },
  ]);
});

test("does not broaden a responsible-surgeon notice to any other user", () => {
  const recipients: string[] = [];

  addResponsibleSurgeonInAppNotification(
    {
      responsibleUserId: "surgeon-responsible",
      title: "Cambio de programación",
      message: "Se ha modificado la programación de un caso a tu cargo.",
    },
    (notification) => recipients.push(notification.userId)
  );

  assert.deepEqual(recipients, ["surgeon-responsible"]);
  assert.equal(recipients.includes("surgeon-other"), false);
  assert.equal(recipients.includes("gestor-demo"), false);
});

test("fails closed when recipient or visible content is missing", () => {
  let calls = 0;
  const sink = () => {
    calls += 1;
  };

  assert.equal(
    addResponsibleSurgeonInAppNotification(
      { responsibleUserId: "", title: "Aviso", message: "Contenido" },
      sink
    ),
    false
  );
  assert.equal(
    addResponsibleSurgeonInAppNotification(
      { responsibleUserId: "surgeon-demo", title: " ", message: "Contenido" },
      sink
    ),
    false
  );
  assert.equal(
    addResponsibleSurgeonInAppNotification(
      { responsibleUserId: "surgeon-demo", title: "Aviso", message: " " },
      sink
    ),
    false
  );
  assert.equal(calls, 0);
});
