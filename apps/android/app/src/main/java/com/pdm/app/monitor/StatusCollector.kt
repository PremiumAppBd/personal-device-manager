package com.pdm.app.monitor

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Environment
import android.os.StatFs
import com.pdm.app.data.net.BatteryDto
import com.pdm.app.data.net.NetworkDto
import com.pdm.app.data.net.ReportStatusRequest
import com.pdm.app.data.net.StorageDto
import java.time.Instant

/**
 * Collects non-sensitive device telemetry using standard Android APIs. No
 * permission is required for battery or storage; network state uses
 * ACCESS_NETWORK_STATE. Nothing here touches camera, location, or SMS.
 */
class StatusCollector(private val context: Context, private val appVersion: String) {

    fun collect(sequence: Long): ReportStatusRequest = ReportStatusRequest(
        capturedAt = Instant.now().toString(),
        battery = battery(),
        storage = storage(),
        network = network(),
        sequence = sequence,
        appVersion = appVersion,
    )

    private fun battery(): BatteryDto {
        val intent: Intent? =
            context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val pct = if (level >= 0 && scale > 0) (level * 100) / scale else 0
        val statusValue = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val charging = statusValue == BatteryManager.BATTERY_STATUS_CHARGING ||
            statusValue == BatteryManager.BATTERY_STATUS_FULL
        val temp = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
        return BatteryDto(
            level = pct.coerceIn(0, 100),
            charging = charging,
            temperatureDeciC = if (temp != null && temp != Int.MIN_VALUE) temp else null,
        )
    }

    private fun storage(): StorageDto {
        val stat = StatFs(Environment.getDataDirectory().path)
        val total = stat.blockCountLong * stat.blockSizeLong
        val free = stat.availableBlocksLong * stat.blockSizeLong
        return StorageDto(totalBytes = total, freeBytes = free)
    }

    private fun network(): NetworkDto {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.activeNetwork?.let { cm.getNetworkCapabilities(it) }
        val type = when {
            caps == null -> "none"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "unknown"
        }
        val metered = if (caps == null) null else cm.isActiveNetworkMetered
        return NetworkDto(type = type, metered = metered)
    }
}
