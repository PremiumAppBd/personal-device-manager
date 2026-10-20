package com.pdm.app.camera

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.pdm.app.PdmApplication
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * VISIBLE foreground camera service for own-device camera mode.
 *
 * This is overt by design and must stay that way:
 *   - it runs as a foreground service typed `camera`, so Android shows the
 *     persistent notification below and the system camera indicator while the
 *     camera is bound;
 *   - it starts ONLY when the owner explicitly enables camera mode in the app;
 *   - it uploads a frame only while the owner has an active session on the
 *     dashboard, and it never hides its state.
 *
 * Do not add any path that captures without the notification + indicator, and
 * do not hide the app or this service. That would make it covert surveillance.
 *
 * NOTE: this code targets real device hardware and was not compiled in the
 * scaffolding environment (no Android SDK). Build and verify it on a device.
 */
class CameraForegroundService : LifecycleService() {

    private val analysisExecutor = Executors.newSingleThreadExecutor()
    private lateinit var imageCapture: ImageCapture
    private var provider: ProcessCameraProvider? = null
    private var boundFront: Boolean? = null

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        startAsForeground("Starting camera…")
        startCaptureLoop()
        return START_STICKY
    }

    private fun startAsForeground(text: String) {
        val channelId = ensureChannel()
        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Camera active")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIF_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA,
            )
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private suspend fun ensureProvider(): ProcessCameraProvider = withContext(Dispatchers.Main) {
        provider ?: suspendCancellableCoroutine { cont ->
            val future = ProcessCameraProvider.getInstance(this@CameraForegroundService)
            future.addListener(
                { cont.resume(future.get()) },
                ContextCompat.getMainExecutor(this@CameraForegroundService),
            )
        }.also { provider = it }
    }

    /** Bind the requested lens (rebinding only when the lens changes). */
    private suspend fun bindLens(front: Boolean) = withContext(Dispatchers.Main) {
        val cp = ensureProvider()
        if (boundFront == front && ::imageCapture.isInitialized) return@withContext
        imageCapture = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build()
        val selector =
            if (front) CameraSelector.DEFAULT_FRONT_CAMERA
            else CameraSelector.DEFAULT_BACK_CAMERA
        cp.unbindAll()
        cp.bindToLifecycle(this@CameraForegroundService, selector, imageCapture)
        boundFront = front
    }

    private fun startCaptureLoop() {
        val container = (application as PdmApplication).container
        lifecycleScope.launch {
            while (isActive) {
                var waitSeconds = 3
                try {
                    val active = container.api.cameraActive()
                    waitSeconds = active.intervalSeconds.coerceIn(1, 60)
                    if (active.active && active.lenses.isNotEmpty()) {
                        for (lens in active.lenses) {
                            bindLens(lens == "front")
                            val jpeg = captureJpeg()
                            if (jpeg != null) container.api.uploadSnapshot(jpeg, lens)
                        }
                        updateNotification("Streaming (${active.lenses.joinToString("+")})")
                    } else {
                        updateNotification("Camera on • idle (no active viewer)")
                    }
                } catch (_: Exception) {
                    // Transient network/camera error; keep trying.
                }
                delay(waitSeconds * 1000L)
            }
        }
    }

    private suspend fun captureJpeg(): ByteArray? = withContext(Dispatchers.Main) {
        suspendCancellableCoroutine { cont ->
            imageCapture.takePicture(
                analysisExecutor,
                object : ImageCapture.OnImageCapturedCallback() {
                    override fun onCaptureSuccess(image: ImageProxy) {
                        try {
                            val buffer = image.planes[0].buffer
                            val bytes = ByteArray(buffer.remaining())
                            buffer.get(bytes)
                            cont.resume(bytes)
                        } catch (e: Exception) {
                            cont.resumeWithException(e)
                        } finally {
                            image.close()
                        }
                    }

                    override fun onError(exception: ImageCaptureException) {
                        cont.resume(null)
                    }
                },
            )
        }
    }

    private fun updateNotification(text: String) {
        val channelId = ensureChannel()
        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val n = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Camera active")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .build()
        mgr.notify(NOTIF_ID, n)
    }

    private fun ensureChannel(): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
                mgr.createNotificationChannel(
                    NotificationChannel(
                        CHANNEL_ID,
                        "Camera",
                        NotificationManager.IMPORTANCE_LOW,
                    ).apply { description = "Shown while this device is acting as a camera" },
                )
            }
        }
        return CHANNEL_ID
    }

    override fun onDestroy() {
        super.onDestroy()
        provider?.unbindAll()
        analysisExecutor.shutdown()
    }

    companion object {
        private const val CHANNEL_ID = "pdm_camera"
        private const val NOTIF_ID = 42

        /** Lens selection (back/front/both) is driven by the server settings. */
        fun start(context: Context) {
            val intent = Intent(context, CameraForegroundService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, CameraForegroundService::class.java))
        }
    }
}
