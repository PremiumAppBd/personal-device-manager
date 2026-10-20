package com.pdm.app.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.pdm.app.PdmApplication
import com.pdm.app.data.db.QueuedStatusEntity
import com.pdm.app.data.net.ApiException
import com.pdm.app.data.net.ReportStatusRequest
import kotlinx.serialization.json.Json

/**
 * Periodically collects a status sample, queues it locally, then drains the
 * queue to the API. Designed for Android background-execution limits: it does
 * only short, bounded work and relies on WorkManager for scheduling/retries.
 * Reports nothing sensitive; no camera or SMS access.
 */
class StatusSyncWorker(appContext: Context, params: WorkerParameters) :
    CoroutineWorker(appContext, params) {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    override suspend fun doWork(): Result {
        val container = (applicationContext as PdmApplication).container
        if (!container.config.isEnrolled()) return Result.success()

        val dao = container.database.queuedStatusDao()

        // 1) Capture a fresh sample and enqueue it durably.
        try {
            val sample = container.collector.collect(container.config.nextSequence())
            dao.insert(
                QueuedStatusEntity(
                    payloadJson = json.encodeToString(ReportStatusRequest.serializer(), sample),
                    createdAt = System.currentTimeMillis(),
                ),
            )
            dao.trimTo(MAX_QUEUE)
        } catch (_: Exception) {
            // Collection failure should not crash the worker; try draining anyway.
        }

        // 2) Drain the queue oldest-first.
        val pending = dao.oldest(MAX_DRAIN)
        for (item in pending) {
            try {
                val payload =
                    json.decodeFromString(ReportStatusRequest.serializer(), item.payloadJson)
                container.api.reportStatus(payload)
                dao.delete(item.id)
            } catch (e: ApiException) {
                when (e.code) {
                    // Device no longer valid — stop and clear local enrollment.
                    "not_enrolled", "unauthorized", "signature_invalid" -> {
                        return Result.failure()
                    }
                    // Duplicate/replayed sample already accepted server-side.
                    "replay_detected" -> dao.delete(item.id)
                    else -> return Result.retry()
                }
            } catch (_: Exception) {
                // Transport failure: retry later, keep the item queued.
                return Result.retry()
            }
        }

        // 3) Process any owner->device commands (non-sensitive only).
        try {
            processCommands(container)
        } catch (_: Exception) {
            // Command processing is best-effort; status sync already succeeded.
        }
        return Result.success()
    }

    private suspend fun processCommands(
        container: com.pdm.app.AppContainer,
    ) {
        val requests = container.api.fetchRequests()
        for (req in requests) {
            when (req.type) {
                "ping" ->
                    container.api.updateRequest(req.id, "completed", "pong")

                "refresh_status" -> {
                    val sample = container.collector.collect(container.config.nextSequence())
                    container.api.reportStatus(sample)
                    container.api.updateRequest(req.id, "completed", "status refreshed")
                }

                "sync_settings" -> {
                    container.api.fetchSettings()
                    container.api.updateRequest(req.id, "completed", "settings synced")
                }

                else ->
                    // Camera/SMS and any unknown types are not supported by this
                    // build; acknowledge as failed rather than acting on them.
                    container.api.updateRequest(
                        req.id,
                        "failed",
                        "request type not supported in this build",
                    )
            }
        }
    }

    companion object {
        private const val MAX_QUEUE = 500
        private const val MAX_DRAIN = 50
    }
}
