package com.pdm.app

import android.app.Application
import androidx.room.Room
import com.pdm.app.data.config.SecureConfigStore
import com.pdm.app.data.db.PdmDatabase
import com.pdm.app.data.net.ApiClient
import com.pdm.app.monitor.StatusCollector
import com.pdm.app.security.DeviceIdentity

/** Process-wide singletons (manual dependency container — no DI framework). */
class AppContainer(app: Application) {
    val config = SecureConfigStore(app)
    val identity = DeviceIdentity()
    val database: PdmDatabase =
        Room.databaseBuilder(app, PdmDatabase::class.java, "pdm.db").build()
    val collector = StatusCollector(app, BuildConfig.VERSION_NAME)
    val api = ApiClient(
        baseUrl = BuildConfig.API_BASE_URL,
        identity = identity,
        config = config,
        appVersion = BuildConfig.VERSION_NAME,
    )
}

class PdmApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
