package com.pdm.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.ui.platform.LocalContext
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import android.Manifest
import android.content.pm.PackageManager
import com.pdm.app.camera.CameraForegroundService
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

object Routes {
    const val HOME = "home"
    const val PAIRING = "pairing"
    const val DEVICE_INFO = "device_info"
    const val MONITORING = "monitoring"
    const val CAMERA_MODE = "camera_mode"
    const val PERMISSIONS = "permissions"
    const val SECURITY = "security"
}

@Composable
fun PdmApp(vm: AppViewModel, nav: NavHostController = rememberNavController()) {
    NavHost(navController = nav, startDestination = Routes.HOME) {
        composable(Routes.HOME) { HomeScreen(vm, nav) }
        composable(Routes.PAIRING) { PairingScreen(vm, nav) }
        composable(Routes.DEVICE_INFO) { DeviceInfoScreen(vm, nav) }
        composable(Routes.MONITORING) { MonitoringScreen(vm, nav) }
        composable(Routes.CAMERA_MODE) { CameraModeScreen(nav) }
        composable(Routes.PERMISSIONS) { PermissionCenterScreen(nav) }
        composable(Routes.SECURITY) { SecuritySettingsScreen(vm, nav) }
    }
}

@Composable
private fun ScreenScaffold(
    title: String,
    content: @Composable (Modifier) -> Unit,
) {
    Scaffold(topBar = { TopAppBar(title = { Text(title) }) }) { padding ->
        content(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        )
    }
}

@Composable
fun HomeScreen(vm: AppViewModel, nav: NavHostController) {
    val state by vm.state.collectAsState()
    ScreenScaffold("Personal Device Manager") { m ->
        Column(m, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        if (state.enrolled) "This device is enrolled." else "This device is not enrolled.",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    state.deviceId?.let { Text("Device ID: $it", style = MaterialTheme.typography.bodySmall) }
                    Text("API health: ${state.healthText}", style = MaterialTheme.typography.bodySmall)
                }
            }
            if (!state.enrolled) {
                Text(
                    "Onboarding: enroll this device you own by generating a pairing code in the web dashboard, then entering it here. The app creates a hardware-backed identity key and proves possession during enrollment.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Button(onClick = { nav.navigate(Routes.PAIRING) }, modifier = Modifier.fillMaxWidth()) {
                    Text("Start pairing")
                }
            } else {
                Button(onClick = { nav.navigate(Routes.MONITORING) }, modifier = Modifier.fillMaxWidth()) {
                    Text("Monitoring")
                }
                OutlinedButton(onClick = { nav.navigate(Routes.CAMERA_MODE) }, modifier = Modifier.fillMaxWidth()) {
                    Text("Camera mode")
                }
                OutlinedButton(onClick = { nav.navigate(Routes.DEVICE_INFO) }, modifier = Modifier.fillMaxWidth()) {
                    Text("Device information")
                }
            }
            OutlinedButton(onClick = { nav.navigate(Routes.PERMISSIONS) }, modifier = Modifier.fillMaxWidth()) {
                Text("Permission center")
            }
            OutlinedButton(onClick = { nav.navigate(Routes.SECURITY) }, modifier = Modifier.fillMaxWidth()) {
                Text("Security settings")
            }
            OutlinedButton(onClick = { vm.checkHealth() }, modifier = Modifier.fillMaxWidth()) {
                Text("Check API health")
            }
            state.error?.let { Text("Error: $it", color = MaterialTheme.colorScheme.error) }
            state.message?.let { Text(it) }
        }
    }
}

@Composable
fun PairingScreen(vm: AppViewModel, nav: NavHostController) {
    val state by vm.state.collectAsState()
    var code by remember { mutableStateOf("") }
    var nonce by remember { mutableStateOf("") }
    ScreenScaffold("Pair device") { m ->
        Column(m, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "Enter the pairing code and challenge shown in the web dashboard. " +
                    "QR camera scanning is intentionally NOT included in this phase so the " +
                    "app requests no camera permission; enter the values manually.",
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedTextField(
                value = code,
                onValueChange = { code = it },
                label = { Text("Pairing code") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = nonce,
                onValueChange = { nonce = it },
                label = { Text("Challenge nonce") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { vm.enroll(code, nonce) },
                enabled = !state.loading && code.isNotBlank() && nonce.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (state.loading) "Enrolling..." else "Enroll this device")
            }
            state.error?.let { Text("Error: $it", color = MaterialTheme.colorScheme.error) }
            if (state.enrolled) {
                Text("Enrolled. You can return home.")
                OutlinedButton(onClick = { nav.popBackStack() }, modifier = Modifier.fillMaxWidth()) {
                    Text("Done")
                }
            }
        }
    }
}

@Composable
fun DeviceInfoScreen(vm: AppViewModel, @Suppress("UNUSED_PARAMETER") nav: NavHostController) {
    val state by vm.state.collectAsState()
    ScreenScaffold("Device information") { m ->
        Column(m, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row2("Model", android.os.Build.MODEL)
            Row2("Manufacturer", android.os.Build.MANUFACTURER)
            Row2("Android", android.os.Build.VERSION.RELEASE ?: "?")
            Row2("API level", android.os.Build.VERSION.SDK_INT.toString())
            Row2("Enrolled", state.enrolled.toString())
            state.deviceId?.let { Row2("Device ID", it) }
        }
    }
}

@Composable
fun MonitoringScreen(vm: AppViewModel, @Suppress("UNUSED_PARAMETER") nav: NavHostController) {
    val state by vm.state.collectAsState()
    ScreenScaffold("Monitoring") { m ->
        Column(m, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "Non-sensitive status (battery, storage, network) is collected and synced " +
                    "periodically via WorkManager. Nothing here uses the camera or reads messages.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Button(onClick = { vm.previewStatus() }, modifier = Modifier.fillMaxWidth()) {
                Text("Preview current status")
            }
            state.lastSample?.let { s ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row2("Battery", "${s.battery.level}% ${if (s.battery.charging) "(charging)" else ""}")
                        Row2("Storage free", "${s.storage.freeBytes / 1_000_000_000} GB")
                        Row2("Network", s.network.type)
                        Row2("Captured", s.capturedAt)
                    }
                }
            }
            OutlinedButton(onClick = { vm.syncNow() }, modifier = Modifier.fillMaxWidth()) {
                Text("Sync now")
            }
            state.message?.let { Text(it) }
        }
    }
}

@Composable
fun PermissionCenterScreen(@Suppress("UNUSED_PARAMETER") nav: NavHostController) {
    ScreenScaffold("Permission center") { m ->
        Column(m, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "This phase requests only the minimum permissions: network access and " +
                    "notifications. Camera and SMS permissions are NOT requested and their " +
                    "features are disabled.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Divider()
            Row2("Internet / network state", "Granted at install (normal)")
            Row2("Notifications", "Requested when needed (Android 13+)")
            Row2("Camera", "Not requested in this phase")
            Row2("SMS", "Not requested in this phase")
        }
    }
}

@Composable
fun SecuritySettingsScreen(vm: AppViewModel, @Suppress("UNUSED_PARAMETER") nav: NavHostController) {
    val state by vm.state.collectAsState()
    ScreenScaffold("Security settings") { m ->
        Column(m, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "Device identity is an EC P-256 key generated in the Android Keystore and " +
                    "never leaves the device. Requests are signed per-call. The enrollment " +
                    "token is stored encrypted with a Keystore AES key.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Row2("Identity key", "AndroidKeyStore EC P-256")
            Row2("Transport", "TLS only (cleartext disabled)")
            if (state.enrolled) {
                OutlinedButton(onClick = { vm.unenroll() }, modifier = Modifier.fillMaxWidth()) {
                    Text("Reset / unenroll this device")
                }
            }
        }
    }
}

@Composable
fun CameraModeScreen(@Suppress("UNUSED_PARAMETER") nav: NavHostController) {
    val context = LocalContext.current
    var running by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            CameraForegroundService.start(context)
            running = true
            note = "Camera mode started. A persistent notification is shown while active."
        } else {
            note = "Camera permission is required to use camera mode."
        }
    }

    fun startCamera() {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            CameraForegroundService.start(context)
            running = true
            note = "Camera mode started. A persistent notification is shown while active."
        } else {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    ScreenScaffold("Camera mode") { m ->
        Column(m, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "Use this device you own as a private camera. While active, the " +
                    "system shows a camera indicator and this app keeps an ongoing " +
                    "notification. Frames upload only while you have an active viewer " +
                    "on your dashboard, and the camera owner enabled the camera " +
                    "setting there. Nothing is hidden.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                "Which camera to use (back, front, or both) is chosen in the " +
                    "dashboard device settings.",
                style = MaterialTheme.typography.bodySmall,
            )
            if (!running) {
                Button(onClick = { startCamera() }, modifier = Modifier.fillMaxWidth()) {
                    Text("Start camera mode")
                }
            } else {
                OutlinedButton(
                    onClick = {
                        CameraForegroundService.stop(context)
                        running = false
                        note = "Camera mode stopped."
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Stop camera mode")
                }
            }
            note?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun Row2(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Text(value, style = MaterialTheme.typography.bodyLarge)
    }
}
