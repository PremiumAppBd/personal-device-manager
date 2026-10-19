# ADR 0003: shadcn-style UI primitives without the generator

## Status
Accepted.

## Context
The stack specifies shadcn/ui. The shadcn CLI copies component source via an
interactive init and pulls Radix dependencies, which is heavier than Phase 1
needs and awkward to run non-interactively in CI/scaffolding.

## Decision
Implement a small, dependency-free set of UI primitives (`Button`, `Card`,
`Badge`, `Input`, `Meter`, `Spinner`, error/empty states) as Tailwind utility
compositions in the shadcn visual style. Keep the door open to adopt the full
shadcn/ui + Radix set later without changing call sites materially.

## Consequences
- Smaller dependency surface and a clean, fast build now.
- If richer primitives (dialogs, menus) are needed, adopt shadcn/ui then.
