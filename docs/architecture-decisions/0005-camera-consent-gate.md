# ADR 0005: Camera/SMS are consent-gated and never covert

## Status
Accepted (binding product rule for all phases).

## Context
PDM manages devices the operator owns, with consent. Remote camera and SMS are
powerful capabilities that must not become covert surveillance.

## Decision
- Phase 1 implements neither camera capture nor SMS access. Their request types
  and consent flags exist in the schema but are gated off (`feature_disabled`).
- When built (future phases):
  - Camera capture runs only inside a user-visible, typed `camera` foreground
    service, started by an on-device authorization the user performs. The
    dashboard can only *request* a session (`camera_sessions.requested`); it can
    never start capture. OS privacy indicators are never suppressed.
  - SMS is opt-in, permission-based, and visible. No continuous hidden
    collection and no OTP interception will be implemented.
- The app never hides itself or evades detection.

## Consequences
- Some "instant remote capture" flows are intentionally impossible; this is by
  design. Interfaces (state machines, bindings) are shaped around a mandatory
  authorization step so the rule is structural, not just procedural.
