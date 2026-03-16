package com.nextalk.mobile

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Handles Answer/Decline action buttons from the call notification.
 * When user interacts with notification actions (instead of the full-screen UI),
 * this receiver routes the actions appropriately.
 */
class CallActionReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "CallAction"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val callerUsername = intent.getStringExtra(IncomingCallActivity.EXTRA_CALLER) ?: "Unknown"
        val videoEnabled = intent.getBooleanExtra(IncomingCallActivity.EXTRA_VIDEO, false)

        Log.d(TAG, "Received action: $action from $callerUsername")

        // Cancel the notification
        val notificationId = ("poll-call-$callerUsername".hashCode()) and 0x7fffffff
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        notificationManager?.cancel(notificationId)

        when (action) {
            IncomingCallActivity.ACTION_ANSWER -> {
                // Launch MainActivity with call extras
                val mainIntent = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_CLEAR_TOP or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP
                    putExtra("nextalk_incoming_call", true)
                    putExtra("nextalk_call_from", callerUsername)
                    putExtra("nextalk_call_video", videoEnabled)
                }
                context.startActivity(mainIntent)

                // Close any existing IncomingCallActivity
                sendFinishBroadcast(context)
            }
            IncomingCallActivity.ACTION_DECLINE -> {
                // Acknowledge call on backend
                acknowledgeCallAsync(context)

                // Close any existing IncomingCallActivity
                sendFinishBroadcast(context)
            }
        }
    }

    private fun sendFinishBroadcast(context: Context) {
        // Send a broadcast to close the IncomingCallActivity if it's open
        val finishIntent = Intent("com.nextalk.mobile.FINISH_INCOMING_CALL")
        finishIntent.setPackage(context.packageName)
        context.sendBroadcast(finishIntent)
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
