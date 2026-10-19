package com.pdm.app.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.pdm.app.work.WorkScheduler

/**
 * Reschedules the status-sync work after a reboot so monitoring resumes without
 * the user reopening the app. WorkManager persists its own jobs across reboots,
 * but this guards against OEMs that clear scheduled work.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            WorkScheduler.schedulePeriodic(context.applicationContext)
        }
    }
}
