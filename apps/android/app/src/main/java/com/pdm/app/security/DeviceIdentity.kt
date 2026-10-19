package com.pdm.app.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.ECPublicKey

/**
 * Device identity backed by the Android Keystore.
 *
 * An EC P-256 key pair is generated inside the Keystore (hardware-backed where
 * available). The private key never leaves the Keystore and is non-exportable;
 * all signing happens via the Keystore. The public key (X.509 SubjectPublicKeyInfo,
 * base64) is what the server enrolls as the device's verified identity.
 *
 * Signatures are "SHA256withECDSA", which the JCA encodes as ASN.1 DER; the
 * server converts DER -> IEEE P1363 before WebCrypto verification.
 */
class DeviceIdentity(private val keyAlias: String = DEFAULT_ALIAS) {

    private val keyStore: KeyStore =
        KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    fun hasKey(): Boolean = keyStore.containsAlias(keyAlias)

    /** Create the identity key if absent. Idempotent. */
    fun ensureKey() {
        if (hasKey()) return
        val generator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            ANDROID_KEYSTORE,
        )
        val spec = KeyGenParameterSpec.Builder(
            keyAlias,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
        )
            .setAlgorithmParameterSpec(java.security.spec.ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            // Not requiring user auth for signing keeps background status sync
            // working; this is device identity, not a user-presence assertion.
            .setUserAuthenticationRequired(false)
            .build()
        generator.initialize(spec)
        generator.generateKeyPair()
    }

    /** Public key as base64 X.509 SPKI DER, for enrollment. */
    fun publicKeySpkiBase64(): String {
        val cert = keyStore.getCertificate(keyAlias)
            ?: error("device identity key missing")
        val pub = cert.publicKey as ECPublicKey
        return Base64.encodeToString(pub.encoded, Base64.NO_WRAP)
    }

    /** Sign a message; returns base64url (no padding) of the DER signature. */
    fun sign(message: String): String {
        val entry = keyStore.getEntry(keyAlias, null) as? KeyStore.PrivateKeyEntry
            ?: error("device identity key missing")
        val privateKey: PrivateKey = entry.privateKey
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(privateKey)
        signer.update(message.toByteArray(Charsets.UTF_8))
        val der = signer.sign()
        return Base64.encodeToString(der, Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING)
    }

    /** Permanently delete the identity (e.g. on reset/unenroll). */
    fun deleteKey() {
        if (keyStore.containsAlias(keyAlias)) keyStore.deleteEntry(keyAlias)
    }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val DEFAULT_ALIAS = "pdm_device_identity_ec_p256"
    }
}
