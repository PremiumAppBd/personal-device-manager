package com.pdm.app.security

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pure-JVM tests for the signing contract. These must agree with the server
 * (packages/shared/src/signing.test.ts). Runs under `./gradlew test` with the
 * Android SDK present.
 */
class RequestSignerTest {

    @Test
    fun signingStringMatchesContract() {
        val s = RequestSigner.buildSigningString(
            method = "post",
            path = "/api/v1/devices/abc/status",
            deviceId = "abc",
            timestampMs = 1700000000000L,
            nonce = "n1",
            bodyHashHex = "deadbeef",
        )
        assertEquals(
            listOf(
                "PDM-v1",
                "POST",
                "/api/v1/devices/abc/status",
                "abc",
                "1700000000000",
                "n1",
                "deadbeef",
            ).joinToString("\n"),
            s,
        )
    }

    @Test
    fun enrollmentStringMatchesContract() {
        assertEquals(
            "PDM-enroll-v1\nCODE123\nnonceXYZ",
            RequestSigner.buildEnrollmentSigningString("CODE123", "nonceXYZ"),
        )
    }

    @Test
    fun sha256OfEmptyMatchesKnownVector() {
        assertEquals(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            RequestSigner.sha256Hex(ByteArray(0)),
        )
    }
}
