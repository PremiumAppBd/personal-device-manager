package com.pdm.app.data.net

import com.pdm.app.data.config.SecureConfigStore
import com.pdm.app.security.DeviceIdentity
import com.pdm.app.security.RequestSigner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.SecureRandom
import java.util.concurrent.TimeUnit

/**
 * Secure API client. All device-authenticated requests are signed with the
 * Keystore identity key using the canonical RequestSigner contract, including
 * a fresh nonce and current timestamp for replay protection. TLS validation is
 * never weakened. Tokens and signatures are never logged.
 */
class ApiClient(
    private val baseUrl: String,
    private val identity: DeviceIdentity,
    private val config: SecureConfigStore,
    private val appVersion: String,
) {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    private val http = OkHttpClient.Builder()
        .callTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()
    private val random = SecureRandom()

    private fun url(path: String) = "$baseUrl$API_BASE$path"

    private fun unwrap(bodyText: String, httpStatus: Int): JsonObject {
        val root = json.parseToJsonElement(bodyText).jsonObject
        val ok = root["ok"]?.jsonPrimitive?.content == "true"
        if (!ok) {
            val err = root["error"]?.jsonObject
            val code = err?.get("code")?.jsonPrimitive?.content ?: "unknown"
            val message = err?.get("message")?.jsonPrimitive?.content ?: "request failed"
            throw ApiException(code, message, httpStatus)
        }
        return root["data"]!!.jsonObject
    }

    /** Unauthenticated health probe. */
    suspend fun health(): HealthData = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url("/health")).get().build()
        http.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val data = unwrap(text, res.code)
            json.decodeFromString(HealthData.serializer(), data.toString())
        }
    }

    /** Enroll this device using a pairing code + challenge signature. */
    suspend fun enroll(
        pairingCode: String,
        challengeNonce: String,
        device: DeviceInfoDto,
    ): EnrollData = withContext(Dispatchers.IO) {
        identity.ensureKey()
        val signature = identity.sign(
            RequestSigner.buildEnrollmentSigningString(pairingCode, challengeNonce),
        )
        val payload = EnrollRequest(
            pairingCode = pairingCode,
            publicKeySpki = identity.publicKeySpkiBase64(),
            challengeSignature = signature,
            device = device,
        )
        val body = json.encodeToString(EnrollRequest.serializer(), payload)
        val req = Request.Builder()
            .url(url("/enroll"))
            .post(body.toRequestBody(jsonMedia))
            .build()
        http.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val data = unwrap(text, res.code)
            val result = json.decodeFromString(EnrollData.serializer(), data.toString())
            config.saveEnrollment(result.deviceId, result.deviceToken)
            result
        }
    }

    /** Report a non-sensitive status sample (device-authenticated). */
    suspend fun reportStatus(payload: ReportStatusRequest): Unit = withContext(Dispatchers.IO) {
        val deviceId = config.deviceId() ?: throw ApiException("not_enrolled", "device not enrolled")
        val body = json.encodeToString(ReportStatusRequest.serializer(), payload)
        signedPost("/device/status", deviceId, body)
    }

    /** Fetch owner-controlled settings for this device (device-authenticated). */
    suspend fun fetchSettings(): DeviceSettingsDto = withContext(Dispatchers.IO) {
        val deviceId = config.deviceId() ?: throw ApiException("not_enrolled", "device not enrolled")
        val data = signedGet("/device/settings", deviceId)
        json.decodeFromString(DeviceSettingsDto.serializer(), data.toString())
    }

    /** Fetch pending/acknowledged command requests for this device. */
    suspend fun fetchRequests(): List<DeviceRequestDto> = withContext(Dispatchers.IO) {
        val deviceId = config.deviceId() ?: throw ApiException("not_enrolled", "device not enrolled")
        val data = signedGet("/device/requests", deviceId)
        json.decodeFromString(DeviceRequestsResponse.serializer(), data.toString()).requests
    }

    /** Report a command request's outcome (acknowledged/completed/failed). */
    suspend fun updateRequest(
        requestId: String,
        status: String,
        resultSummary: String? = null,
    ): Unit = withContext(Dispatchers.IO) {
        val deviceId = config.deviceId() ?: throw ApiException("not_enrolled", "device not enrolled")
        val body = json.encodeToString(
            UpdateRequestBody.serializer(),
            UpdateRequestBody(status, resultSummary),
        )
        signedPost("/device/requests/$requestId", deviceId, body)
    }

    /** Whether the owner has an active camera session for this device. */
    suspend fun cameraActive(): CameraActiveDto = withContext(Dispatchers.IO) {
        val deviceId = config.deviceId() ?: throw ApiException("not_enrolled", "device not enrolled")
        val data = signedGet("/device/camera/active", deviceId)
        json.decodeFromString(CameraActiveDto.serializer(), data.toString())
    }

    /**
     * Upload a single JPEG snapshot (raw bytes) for the active camera session.
     * The lens is sent as a query param; the signature covers the path only.
     */
    suspend fun uploadSnapshot(jpeg: ByteArray, lens: String): Unit = withContext(Dispatchers.IO) {
        val deviceId = config.deviceId() ?: throw ApiException("not_enrolled", "device not enrolled")
        val query = if (lens == "front") "?lens=front" else "?lens=back"
        signedPostBytes("/device/camera/snapshot", deviceId, jpeg, "image/jpeg", query)
    }

    private fun signedPost(path: String, deviceId: String, body: String): JsonObject {
        val headers = signHeaders("POST", path, deviceId, body.toByteArray(Charsets.UTF_8))
        val builder = Request.Builder().url(url(path)).post(body.toRequestBody(jsonMedia))
        headers.forEach { (k, v) -> builder.header(k, v) }
        http.newCall(builder.build()).execute().use { res ->
            return unwrap(res.body?.string().orEmpty(), res.code)
        }
    }

    private fun signedPostBytes(
        path: String,
        deviceId: String,
        bytes: ByteArray,
        contentType: String,
        query: String = "",
    ): JsonObject {
        // Sign the path only; the query string is not part of the signature.
        val headers = signHeaders("POST", path, deviceId, bytes)
        val media = contentType.toMediaType()
        val builder = Request.Builder().url(url(path) + query).post(bytes.toRequestBody(media))
        headers.forEach { (k, v) -> builder.header(k, v) }
        http.newCall(builder.build()).execute().use { res ->
            return unwrap(res.body?.string().orEmpty(), res.code)
        }
    }

    private fun signedGet(path: String, deviceId: String): JsonObject {
        val headers = signHeaders("GET", path, deviceId, ByteArray(0))
        val builder = Request.Builder().url(url(path)).get()
        headers.forEach { (k, v) -> builder.header(k, v) }
        http.newCall(builder.build()).execute().use { res ->
            return unwrap(res.body?.string().orEmpty(), res.code)
        }
    }

    private fun signHeaders(
        method: String,
        path: String,
        deviceId: String,
        body: ByteArray,
    ): Map<String, String> {
        val timestamp = System.currentTimeMillis()
        val nonce = newNonce()
        val bodyHash = RequestSigner.sha256Hex(body)
        // The signed path must match the server's URL pathname exactly.
        val fullPath = "$API_BASE$path"
        val message = RequestSigner.buildSigningString(
            method, fullPath, deviceId, timestamp, nonce, bodyHash,
        )
        val signature = identity.sign(message)
        return mapOf(
            "x-pdm-device-id" to deviceId,
            "x-pdm-timestamp" to timestamp.toString(),
            "x-pdm-nonce" to nonce,
            "x-pdm-signature" to signature,
        )
    }

    private fun newNonce(): String {
        val bytes = ByteArray(16)
        random.nextBytes(bytes)
        return android.util.Base64.encodeToString(
            bytes,
            android.util.Base64.NO_WRAP or android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING,
        )
    }

    companion object {
        const val API_BASE = "/api/v1"
    }
}
