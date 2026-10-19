package com.pdm.app.data.config

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private val Context.dataStore by preferencesDataStore(name = "pdm_secure_config")

/**
 * Persistent encrypted configuration.
 *
 * Secrets (the device enrollment token) are encrypted with an AES-256-GCM key
 * held in the Android Keystore, then stored (ciphertext + IV, base64) in a
 * DataStore. The raw token is never written to disk in plaintext and never
 * logged. Non-secret values (deviceId, installId) are stored as-is.
 */
class SecureConfigStore(private val context: Context) {

    private val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun secretKey(): SecretKey {
        (keyStore.getEntry(AES_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let {
            return it.secretKey
        }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                AES_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val iv = cipher.iv
        val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        val combined = ByteArray(iv.size + ct.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(ct, 0, combined, iv.size, ct.size)
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    private fun decrypt(encoded: String): String {
        val combined = Base64.decode(encoded, Base64.NO_WRAP)
        val iv = combined.copyOfRange(0, GCM_IV_LENGTH)
        val ct = combined.copyOfRange(GCM_IV_LENGTH, combined.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
        return String(cipher.doFinal(ct), Charsets.UTF_8)
    }

    suspend fun saveEnrollment(deviceId: String, deviceToken: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_DEVICE_ID] = deviceId
            prefs[KEY_DEVICE_TOKEN_ENC] = encrypt(deviceToken)
        }
    }

    suspend fun deviceId(): String? =
        context.dataStore.data.map { it[KEY_DEVICE_ID] }.first()

    suspend fun deviceToken(): String? =
        context.dataStore.data.map { it[KEY_DEVICE_TOKEN_ENC] }.first()?.let(::decrypt)

    suspend fun isEnrolled(): Boolean = deviceId() != null

    suspend fun installId(): String {
        val existing = context.dataStore.data.map { it[KEY_INSTALL_ID] }.first()
        if (existing != null) return existing
        val generated = java.util.UUID.randomUUID().toString()
        context.dataStore.edit { it[KEY_INSTALL_ID] = generated }
        return generated
    }

    /** Monotonically increasing status sequence number. */
    suspend fun nextSequence(): Long {
        var next = 0L
        context.dataStore.edit { prefs ->
            next = (prefs[KEY_SEQUENCE] ?: 0L) + 1L
            prefs[KEY_SEQUENCE] = next
        }
        return next
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val AES_ALIAS = "pdm_config_aes_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_IV_LENGTH = 12
        private const val GCM_TAG_BITS = 128
        private val KEY_DEVICE_ID = stringPreferencesKey("device_id")
        private val KEY_DEVICE_TOKEN_ENC = stringPreferencesKey("device_token_enc")
        private val KEY_INSTALL_ID = stringPreferencesKey("install_id")
        private val KEY_SEQUENCE = longPreferencesKey("status_sequence")
    }
}
