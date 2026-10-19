package com.pdm.app.ui

import android.app.Application
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pdm.app.PdmApplication
import com.pdm.app.data.net.DeviceInfoDto
import com.pdm.app.data.net.ReportStatusRequest
import com.pdm.app.work.WorkScheduler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class UiState(
    val loading: Boolean = false,
    val enrolled: Boolean = false,
    val deviceId: String? = null,
    val lastSample: ReportStatusRequest? = null,
    val healthText: String = "unknown",
    val message: String? = null,
    val error: String? = null,
)

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val container = (app as PdmApplication).container
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val enrolled = container.config.isEnrolled()
            _state.value = _state.value.copy(
                enrolled = enrolled,
                deviceId = container.config.deviceId(),
            )
        }
    }

    fun checkHealth() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val h = container.api.health()
                _state.value = _state.value.copy(loading = false, healthText = "${h.service}: ${h.status}")
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message)
            }
        }
    }

    fun previewStatus() {
        viewModelScope.launch {
            val sample = container.collector.collect(0)
            _state.value = _state.value.copy(lastSample = sample)
        }
    }

    fun enroll(pairingCode: String, challengeNonce: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null, message = null)
            try {
                val device = DeviceInfoDto(
                    model = Build.MODEL,
                    manufacturer = Build.MANUFACTURER,
                    osVersion = Build.VERSION.RELEASE ?: "unknown",
                    sdkInt = Build.VERSION.SDK_INT,
                    installId = container.config.installId(),
                )
                val result = container.api.enroll(pairingCode.trim(), challengeNonce.trim(), device)
                WorkScheduler.schedulePeriodic(getApplication())
                WorkScheduler.syncNow(getApplication())
                _state.value = _state.value.copy(
                    loading = false,
                    enrolled = true,
                    deviceId = result.deviceId,
                    message = "Device enrolled",
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Enrollment failed")
            }
        }
    }

    fun syncNow() {
        WorkScheduler.syncNow(getApplication())
        _state.value = _state.value.copy(message = "Sync requested")
    }

    fun unenroll() {
        viewModelScope.launch {
            WorkScheduler.cancelAll(getApplication())
            container.identity.deleteKey()
            container.config.clear()
            _state.value = UiState(message = "Local enrollment cleared")
        }
    }
}
