# QxFlow workflow audit: preanesthesia and released-slot notifications

This note records the behavior currently implemented in `hardening/integration`. It is descriptive, not a new clinical or business rule.

## Automatic preanesthesia assignment

For an elective patient created inside an active reservation, the patient-circuit phase runs in the same business transaction as patient creation.

Current implemented rules:

- Time zone: `Europe/Madrid`.
- Eligible weekdays: Monday and Thursday.
- Appointment window: 10:00–12:30 start times.
- Slot duration/granularity: 10 minutes.
- Capacity represented by the scheduler: 16 starts per eligible day.
- The appointment must be on a natural day strictly before the surgery date.
- The first available eligible slot is selected.
- Assignment is serialized with a PostgreSQL advisory transaction lock so concurrent requests cannot select the same slot from the same occupancy snapshot.
- If no eligible slot exists before the surgery deadline, the patient remains without an automatic appointment and an audit event records the no-slot condition.
- Deferred urgency bypasses automatic preanesthesia assignment and is marked for manual review.

### Notification state

The patient notification associated with an automatically assigned preanesthesia appointment is currently recorded as a dry-run audit event. It does not send a real patient email from this flow.

Vercel Preview deployments force the email adapter to mock mode, preventing real outbound email during preview testing even if provider credentials were accidentally inherited.

## Released-slot notification

The automatic pending-reservation release flow revalidates every candidate under the same scheduling-context lock used by reservation mutations. Only a reservation that is still pending, has no patients and is beyond the configured retention deadline is actually released.

After at least one reservation has been confirmed as released:

- recipients are queried from users with role `CIRUJANO`;
- `approved` must be `true`;
- `deletedAt` must be `null`;
- empty or malformed email addresses are removed before sending;
- one release notification is attempted per resulting recipient email;
- a release-notification log stores released count, released reservation IDs, slot details, recipient count and send outcome;
- if no reservation is actually released after revalidation, no release email is sent.

This matches the approved product rule: a slot that is actually released to the common pool is notified to all approved surgeons, and not to other roles.

## Safety boundary for DEMO / isolated-demo

`isolated-demo` must continue to block `/api/*` server access. Any visible DEMO behavior for these workflows must use fictitious/local state only. No real email should be sent from isolated-demo or Vercel Preview.
