package com.nextalk.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Restarts the NextalkPollingService after device boot or app update.
 * This ensures the user continues receiving call and message notifications
 * even after a phone reboot.
 */
class NextalkBootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "NextalkBoot"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            Log.d(TAG, "Boot/update detected, starting polling service")

            // Only start if user has logged in (auth token exists)
            val prefs = context.getSharedPreferences("nextalk_push_prefs", Context.MODE_PRIVATE)
            val authToken = prefs.getString("auth_token", "") ?: ""
            if (authToken.isBlank()) {
                Log.d(TAG, "No auth token, skipping service start")
                return
            }

            try {
                val serviceIntent = Intent(context, NextalkPollingService::class.java)
                ContextCompat.startForegroundService(context, serviceIntent)
                Log.d(TAG, "Polling service started after boot")
            } catch (e: Exception) {
                Log.d(TAG, "Failed to start service: ${e.message}")
            }
        }
    }
}
