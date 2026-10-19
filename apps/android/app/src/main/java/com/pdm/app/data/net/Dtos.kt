package com.pdm.app.data.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Request/response DTOs mirroring the @pdm/shared contract. */

@Serializable
data class DeviceInfoDto(
    val model: String,
    val manufacturer: String,
    val osVersion: String,
    val sdkInt: Int,
    val installId: String,
)

@Serializable
data class EnrollRequest(
    val pairingCode: String,
    val publicKeySpki: String,
    val challengeSignature: String,
    val device: DeviceInfoDto,
)

@Serializable
data class DeviceSettingsDto(
    val statusIntervalSeconds: Int = 900,
    val cameraFeatureEnabled: Boolean = false,
    val smsFeatureEnabled: Boolean = false,
    val diagnosticsEnabled: Boolean = true,
)

@Serializable
data class EnrollData(
    val deviceId: String,
    val status: String,
    val deviceToken: String,
    val settings: DeviceSettingsDto,
)

@Serializable
data class BatteryDto(
    val level: Int,
    val charging: Boolean,
    val temperatureDeciC: Int? = null,
)

@Serializable
data class StorageDto(val totalBytes: Long, val freeBytes: Long)

@Serializable
data class NetworkDto(val type: String, val metered: Boolean? = null)

@Serializable
data class ReportStatusRequest(
    val capturedAt: String,
    val battery: BatteryDto,
    val storage: StorageDto,
    val network: NetworkDto,
    val sequence: Long,
    val appVersion: String,
)

@Serializable
data class ApiErrorDto(val code: String, val message: String)

/** Thrown for a structured, non-ok API response or transport failure. */
class ApiException(val code: String, message: String, val httpStatus: Int = 0) :
    Exception(message)

@Serializable
data class HealthData(
    val service: String,
    val status: String,
    @SerialName("environment") val environment: String? = null,
)
