package com.pdm.app.security

import java.security.MessageDigest

/**
 * Canonical request-signing strings. These MUST byte-for-byte match the server
 * and shared-package contract in packages/shared/src/signing.ts. Any change
 * here must be mirrored there, or signatures will fail to verify.
 */
object RequestSigner {

    /** Canonical per-request signing string. */
    fun buildSigningString(
        method: String,
        path: String,
        deviceId: String,
        timestampMs: Long,
        nonce: String,
        bodyHashHex: String,
    ): String = listOf(
        "PDM-v1",
        method.uppercase(),
        path,
        deviceId,
        timestampMs.toString(),
        nonce,
        bodyHashHex,
    ).joinToString("\n")

    /** Canonical enrollment signing string (proves key possession at pairing). */
    fun buildEnrollmentSigningString(pairingCode: String, nonce: String): String =
        listOf("PDM-enroll-v1", pairingCode, nonce).joinToString("\n")

    /** Lowercase hex SHA-256 of the raw request body bytes. */
    fun sha256Hex(body: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(body)
        val sb = StringBuilder(digest.size * 2)
        for (b in digest) {
            val v = b.toInt() and 0xff
            sb.append(HEX[v ushr 4])
            sb.append(HEX[v and 0x0f])
        }
        return sb.toString()
    }

    private val HEX = "0123456789abcdef".toCharArray()
}
