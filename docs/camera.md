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

## Front, back, or both cameras

In the device Settings on the dashboard, set **Camera lens** to `Back`, `Front`,
or `Both`.

- `Back` or `Front`: the phone streams that one camera.
- `Both`: the phone **alternates** — it grabs a back frame, then a front frame,
  each cycle, and the dashboard shows two tiles (back and front). You get images
  from both cameras.

Note on "both": true *simultaneous* front+back capture is only supported on some
phones (Android concurrent-camera hardware). The alternating approach used here
works on any phone; the two tiles update a moment apart rather than at the exact
same instant.

## Daily use

- **View:** open the device in the dashboard. The "Live camera" card shows the
  latest frame; press **Start camera** to begin a viewing session and **Stop
  camera** to end it.
- **Stop capturing entirely:** press **Stop camera mode** on the phone (or turn
  off the camera consent setting in the dashboard).

## Permissions (one-time)

When you install the APK (sideload), Android shows the app's declared
permissions. The ones that need your explicit approval are requested once,
in-app, from the **Permission center** screen (a single "Allow all required"
button):

- **Camera** — for camera mode.
- **Notifications** — for the ongoing "camera active" / sync notifications.

Internet and network-state are normal permissions granted automatically at
install. Android does **not** allow granting camera/notification at install
time; the one-time system prompts are required and cannot be skipped. After you
allow them once, Android remembers — you will not be asked again.

On a device you own and develop on, you can pre-grant with ADB so there are zero
taps:

```bash
adb shell pm grant com.pdm.app android.permission.CAMERA
adb shell pm grant com.pdm.app android.permission.POST_NOTIFICATIONS
```

## Notes and limits

- Snapshot interval defaults to a few seconds; it is a near-live view, not
  full-motion video.
- Uploading frames continuously uses data and some battery; keep the phone on
  power for a stationary camera.
- The Android camera code targets real hardware and must be built with the
  Android SDK (it is not compiled in SDK-less environments). See
  `docs/deployment.md` for building the app.
- This is for devices you own. Do not install it on anyone else's device.
