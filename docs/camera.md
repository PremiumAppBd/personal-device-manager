# Camera mode (use your own phone as a camera)

This turns a phone **you own** into a private camera you view from your
dashboard. It is overt on the device by design: while active, Android shows the
system camera indicator and the app keeps an ongoing notification. There is no
hidden or background capture, and the app does not hide itself.

Remote viewing is **snapshot-based**: the phone captures a JPEG every few
seconds and uploads it to your private storage; the dashboard shows the latest
frame and refreshes it. This gives a near-live view. (Full real-time video via
WebRTC is a possible later addition that requires building/testing on a real
device.)

## How it works

```
Dashboard (you)                 API + R2                 Phone (your camera)
   |  Start camera  ───────────────>  session=active
   |                                        <────  "am I active?"  (phone polls)
   |                                  snapshot stored  <──  JPEG upload (every Ns)
   |  latest frame  <───────────────  R2 object
```

1. The phone only captures while **you** have pressed Start on the dashboard.
2. Snapshots are stored privately in Cloudflare R2 and served only to you
   (owner-authenticated, ownership-checked).

## One-time setup

1. **Enroll the phone** as a device (see the README pairing steps).
2. In the dashboard, open the device and turn on **Camera (own-device mode)**
   in Settings. This records your consent; without it the phone will not
   capture.
3. On the phone, open the app, go to **Camera mode**, and press **Start camera
   mode**. Grant the camera permission when asked. Pick front or back camera.
   The phone now shows a persistent "Camera active" notification.

## Daily use

- **View:** open the device in the dashboard. The "Live camera" card shows the
  latest frame; press **Start camera** to begin a viewing session and **Stop
  camera** to end it.
- **Stop capturing entirely:** press **Stop camera mode** on the phone (or turn
  off the camera consent setting in the dashboard).

## Notes and limits

- Snapshot interval defaults to a few seconds; it is a near-live view, not
  full-motion video.
- Uploading frames continuously uses data and some battery; keep the phone on
  power for a stationary camera.
- The Android camera code targets real hardware and must be built with the
  Android SDK (it is not compiled in SDK-less environments). See
  `docs/deployment.md` for building the app.
- This is for devices you own. Do not install it on anyone else's device.
