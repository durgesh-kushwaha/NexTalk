package com.nextalk.mobile

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Handles Answer/Decline action buttons from the call notification.
 * All actions are wrapped in try-catch to prevent crash from BroadcastReceiver context.
 *
 * On Android 10+ starting an Activity from a BroadcastReceiver is restricted,
 * so we use PendingIntent.send() for reliability.
 */
class CallActionReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "CallAction"
    }

    override fun onReceive(context: Context, intent: Intent) {
        try {
            val action = intent.action ?: return
            val callerUsername = intent.getStringExtra(IncomingCallActivity.EXTRA_CALLER) ?: "Unknown"
            val videoEnabled = intent.getBooleanExtra(IncomingCallActivity.EXTRA_VIDEO, false)

            Log.d(TAG, "Received action: $action from $callerUsername")

            // Cancel the call notification (try both tag formats for safety)
            cancelCallNotification(context, callerUsername)

            // Close the IncomingCallActivity if it's visible
            sendFinishBroadcast(context)

            when (action) {
                IncomingCallActivity.ACTION_ANSWER -> {
                    launchMainActivityForCall(context, callerUsername, videoEnabled)
                }
                IncomingCallActivity.ACTION_DECLINE -> {
                    acknowledgeCallAsync(context)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "onReceive error: ${e.message}", e)
        }
    }

    private fun cancelCallNotification(context: Context, callerUsername: String) {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            // Cancel using the poll-call tag (used by NextalkPollingService)
            val pollNotificationId = ("poll-call-$callerUsername".hashCode()) and 0x7fffffff
            notificationManager?.cancel(pollNotificationId)
        } catch (e: Exception) {
            Log.e(TAG, "Cancel notification error: ${e.message}", e)
        }
    }

    private fun launchMainActivityForCall(context: Context, callerUsername: String, videoEnabled: Boolean) {
        try {
            val mainIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("nextalk_incoming_call", true)
                putExtra("nextalk_call_from", callerUsername)
                putExtra("nextalk_call_video", videoEnabled)
            }

            // Use PendingIntent.send() for reliability on Android 10+
            // Direct startActivity() from BroadcastReceiver crashes
            val pendingIntent = PendingIntent.getActivity(
                context,
                System.currentTimeMillis().toInt(),
                mainIntent,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )
            pendingIntent.send()
        } catch (e: Exception) {
            Log.e(TAG, "Launch MainActivity error: ${e.message}", e)
            // Fallback: try direct startActivity as last resort
            try {
                val fallbackIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_CLEAR_TOP or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP
                    putExtra("nextalk_incoming_call", true)
                    putExtra("nextalk_call_from", callerUsername)
                    putExtra("nextalk_call_video", videoEnabled)
                }
                context.startActivity(fallbackIntent)
            } catch (fallbackError: Exception) {
                Log.e(TAG, "Fallback launch also failed: ${fallbackError.message}", fallbackError)
            }
        }
    }

    private fun sendFinishBroadcast(context: Context) {
        try {
            val finishIntent = Intent("com.nextalk.mobile.FINISH_INCOMING_CALL")
            finishIntent.setPackage(context.packageName)
            context.sendBroadcast(finishIntent)
        } catch (e: Exception) {
            Log.e(TAG, "sendFinishBroadcast error: ${e.message}", e)
        }
    }

    private fun acknowledgeCallAsync(context: Context) {
        Thread {
            try {
                val prefs = context.getSharedPreferences("nextalk_push_prefs", Context.MODE_PRIVATE)
                val authToken = prefs.getString("auth_token", "") ?: ""
                val backendOrigin = prefs.getString("backend_origin", "") ?: ""
                if (authToken.isBlank() || backendOrigin.isBlank()) return@Thread

                val url = java.net.URL("$backendOrigin/api/calls/pending/acknowledge")
                val connection = url.openConnection() as java.net.HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Authorization", "Bearer $authToken")
                connection.setRequestProperty("Content-Type", "application/json")
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                connection.doOutput = true
                connection.outputStream.use { it.write("{}".toByteArray()) }
                connection.responseCode
                connection.disconnect()
            } catch (e: Exception) {
                Log.d(TAG, "Acknowledge error: ${e.message}")
            }
        }.start()
    }
}
