# ADR 0001: pnpm monorepo with a shared contract package

## Status
Accepted.

## Context
The API (Worker) and dashboard (SPA) must agree on request/response shapes and
on the device signing contract, and the Android client must match that contract
too. Divergence causes signature failures and validation drift.

## Decision
Use a pnpm-workspace monorepo. A single `@pdm/shared` TypeScript package holds
domain constants, Zod schemas, API view types, and the canonical signing
functions. The API and dashboard import it directly (source TS, transpiled by
esbuild/Vite). The Android client re-implements the same signing contract in
Kotlin (`RequestSigner`) with a unit test pinned to the same vectors.

## Consequences
- One source of truth for the contract; a round-trip test guards DER↔P1363.
- Kotlin must be kept in sync manually; the shared test vectors catch drift.
- No publish step for `@pdm/shared`; it is consumed as workspace source.
