# Automatic preanesthesia appointment flow

This document records the current QxFlow scheduling behavior so future changes do not silently alter the approved preanesthesia rules.

## Scope

The flow applies to newly persisted elective surgical patients created through the shared reservation transaction. Deferred urgencies are excluded from automatic assignment and are routed to manual review.

## Current scheduling rules

- Time zone: `Europe/Madrid`.
- Eligible consultation days: Monday and Thursday only.
- Daily appointment starts: every 10 minutes from 10:00 through 12:30 inclusive.
- Capacity: 16 appointment starts per eligible day.
- Search order: chronological from the current Madrid calendar date, then earliest free time within each eligible day.
- Deadline: the appointment must be on a natural calendar day strictly before the surgery date. Same-day preanesthesia is not assigned automatically.
- Occupancy source: persisted patients with `preanesthesiaStatus = SCHEDULED` and a non-null appointment.
- Concurrency: assignment is serialized with a PostgreSQL transaction-scoped advisory lock. Occupancy is reloaded only after the lock is acquired.
- Idempotency: if a patient is already `SCHEDULED` with an appointment, the existing appointment is preserved.
- No available slot: the patient remains with the default pending preanesthesia state and `preanesthesiaAppointmentAt = null`; QxFlow must not invent an appointment.
- Deferred urgency: automatic assignment is skipped, `workflowStatus` becomes `MANUAL_REVIEW_REQUIRED`, and the case remains pending for preanesthesia.

## Transaction boundary

For normal reservation creation, patient persistence, automatic preanesthesia assignment, audit events, and creation of the management-notification outbox entry occur inside the same business transaction. The management email is queued only after every patient has reached its final persisted phase-2 state. External email delivery is not part of the scheduling transaction.

## Notification behavior

The configured management mailbox receives the durable programmed-patient notification payload only after the scheduling/preanesthesia result is known. If no appointment was assigned, the notification must state that explicitly. Technical IDs, credentials, secrets, and unrelated audit metadata are excluded from the public email payload.

Preview and `isolated-demo` remain mock-only for email delivery. `isolated-demo` also keeps the `/api` backend boundary blocked.

## Change-control rule

Do not change the eligible weekdays, 10-minute cadence, 10:00–12:30 window, capacity of 16/day, chronological first-free policy, or requirement that preanesthesia occur before the surgery date without an explicit business/clinical decision from Javier.
