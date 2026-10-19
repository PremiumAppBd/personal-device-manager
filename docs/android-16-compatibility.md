# Android 16 (API 36) Compatibility Analysis

This document analyzes the Android 16 platform constraints that shape PDM. It
reflects well-established Android behavior and the direction of recent releases.
Items marked **VERIFY** must be re-checked against the current official Android
documentation for API 36 before the related feature ships, because platform
details change between previews and finals, and the scaffolding environment
could not reach Android developer resources.

Phase 1 collects only non-sensitive telemetry and requests no camera or SMS
permission, so most of the hard constraints below apply to the FUTURE camera
phase and are captured here to shape its interfaces now.

## Camera foreground service restrictions

- A user-visible camera capture must run inside a foreground service typed
  `camera` (`android:foregroundServiceType="camera"`), declared in the manifest
  with the `FOREGROUND_SERVICE_CAMERA` permission. **VERIFY** the exact typed
  FGS requirements and any Android 16 tightening.
- Android restricts starting camera/microphone foreground services from the
  background. A camera session must be started from an interactive context the
  user initiated. **Design consequence**: the dashboard "request camera" action
  only creates a `camera_sessions` row in `requested` state; it never starts
  capture. The device shows a local prompt and the user must authorize on the
  device, which starts the typed foreground service. There is no hidden path.
- The OS privacy indicators (camera/mic dots) are always shown during capture
  and must not be suppressed. PDM never attempts to hide them.

## Background execution limits

- Background start of services is heavily restricted; long-running or deferred
  work belongs in WorkManager with constraints. PDM uses a `PeriodicWorkRequest`
  (15-minute platform minimum) for status sync, plus one-time expedited-free
  work for "sync now".
- The server's configured `statusIntervalSeconds` is a hint; the OS clamps
  periodic cadence. Shorter effective cadence would require the user to have the
  app in an interactive/foreground state.

## While-in-use permissions

- Camera/microphone (and location, unused here) are "while-in-use": granted only
  while the app has an eligible foreground state. **Design consequence**: camera
  sessions are inherently foreground and user-visible; there is no while-in-use
  path to silent background capture, by platform design and by PDM design.

## Android 16 job/quota behavior

- Background work is subject to app-standby buckets and quotas; frequency and
  wake budget depend on usage and battery state. **VERIFY** current quota
  specifics for API 36. PDM keeps each `StatusSyncWorker` run short and bounded
  (collect one sample, drain a capped queue) to stay within quotas.

## Camera behavior during lock screen and multitasking

- Capture during lock or split-screen is constrained and may be interrupted by
  the OS or other camera clients. **Design consequence**: the camera session
  state machine must treat interruption as a normal `ended` transition and never
  auto-restart without a fresh user authorization.

## Notification permissions

- `POST_NOTIFICATIONS` is a runtime permission (Android 13+). PDM requests it on
  first launch; foreground services (future camera) must post an ongoing
  notification. Phase 1 uses it only for WorkManager/foreground info.

## SMS runtime permissions and default-role requirements

- SMS read/receive are runtime permissions in a restricted group; `READ_SMS`
  access via Play distribution has policy constraints, and some SMS capabilities
  require being the default SMS handler (a `RoleManager` role the user grants).
  PDM is privately distributed (no Play Store), but the platform permission and
  role mechanics still apply. **Design consequence (future phase only)**: SMS is
  strictly opt-in, permission-based, and visible. **No continuous hidden SMS
  collection and no OTP interception will be implemented** — this is a hard
  product rule, not just a platform constraint.

## Battery optimization and Doze

- Doze and app-standby defer background work and network during idle. PDM relies
  on WorkManager (Doze-aware) and does not request
  `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` in Phase 1. Status latency during Doze
  is expected and acceptable for monitoring.

## Process termination

- The OS may kill the app process at any time. PDM holds no required in-memory
  state: identity is in the Keystore, config/queue are persisted (DataStore +
  Room), and WorkManager reschedules itself.

## Reboot recovery

- `RECEIVE_BOOT_COMPLETED` + `BootReceiver` reschedule periodic sync after a
  reboot. WorkManager also persists jobs across reboot; the receiver guards
  against OEMs that clear scheduled work.

## Device manufacturer differences

- Aggressive OEM battery managers (e.g. some Chinese OEM skins) may kill
  background apps or clear alarms/work more aggressively than AOSP. **Design
  consequence**: tolerate missed/late syncs; the server derives offline from
  `last_seen_at` rather than assuming a strict cadence. Document per-OEM
  allow-listing steps for the owner where needed.

## Toolchain note

`compileSdk = 36` / `targetSdk = 36` require an Android SDK with API 36 installed
and an AGP version that supports it. The versions in
`apps/android/gradle/libs.versions.toml` are representative and must be aligned
to the SDK on the build machine. The scaffolding environment had **no Android
SDK and no access to Google's Maven**, so the app was not compiled here; the
Gradle DSL parses and plugin resolution was reached. See
`implementation-roadmap.md` for the exact verification steps.
