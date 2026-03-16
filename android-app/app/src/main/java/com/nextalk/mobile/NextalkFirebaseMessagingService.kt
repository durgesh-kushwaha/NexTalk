package com.nextalk.mobile

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import org.json.JSONObject

/**
 * Handles FCM push messages for chat messages ONLY.
 *
 * Call notifications are handled entirely by NextalkPollingService
 * to avoid duplicate/conflicting call UIs.
 *
 * All methods are wrapped in try-catch to prevent any FCM error
 * from crashing the host application.
 */
class NextalkFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "NextalkFCM"
        private const val CHANNEL_MESSAGES = "nextalk_messages_v2"
        private const val DEDUPE_WINDOW_MS = 3000L
        private val recentMessageSignals = ConcurrentHashMap<String, Long>()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        try {
            super.onMessageReceived(message)
            ensureChannels()

            val data = message.data
            val type = data["type"] ?: "message"

            // Skip call notifications — NextalkPollingService handles those
            if (type == "call") {
                Log.d(TAG, "Ignoring call FCM — polling service handles calls")
                return
            }

            val title = data["title"]?.takeIf { it.isNotBlank() }
                ?: message.notification?.title
                ?: "New message"
            val body = data["body"]?.takeIf { it.isNotBlank() }
                ?: message.notification?.body
                ?: "You have a new message"
            val notificationTag = "msg-${data["conversationId"] ?: "default"}"

            val dedupeId = message.messageId
                ?: data["messageId"]
                ?: "$notificationTag|$title|$body"

            if (shouldSkipDuplicate(dedupeId)) {
                return
            }

            showMessageNotification(title, body, notificationTag, data)
        } catch (e: Exception) {
            Log.e(TAG, "onMessageReceived error: ${e.message}", e)
        }
    }

    override fun onNewToken(token: String) {
        try {
            super.onNewToken(token)
            if (token.isBlank()) return

            val (authToken, backendOrigin) = MainActivity.loadPushRegistrationContext(applicationContext)
            if (authToken.isBlank() || backendOrigin.isBlank()) return

            postToken(backendOrigin.trimEnd('/'), authToken, token)
        } catch (e: Exception) {
            Log.e(TAG, "onNewToken error: ${e.message}", e)
        }
    }

    private fun ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            val manager = getSystemService(NotificationManager::class.java) ?: return
            val messageChannel = NotificationChannel(
                CHANNEL_MESSAGES,
                "NexTalk Messages",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "NexTalk chat message notifications"
            }
            manager.createNotificationChannel(messageChannel)
        } catch (e: Exception) {
            Log.e(TAG, "ensureChannels error: ${e.message}", e)
        }
    }

    private fun shouldSkipDuplicate(key: String): Boolean {
        val now = SystemClock.elapsedRealtime()
        val previous = recentMessageSignals[key] ?: 0L
        recentMessageSignals[key] = now

        if (recentMessageSignals.size > 150) {
            recentMessageSignals.entries.removeIf { now - it.value > DEDUPE_WINDOW_MS * 4 }
        }

        return previous > 0L && (now - previous) < DEDUPE_WINDOW_MS
    }

    private fun showMessageNotification(title: String, body: String, tag: String, data: Map<String, String>) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val granted = ContextCompat.checkSelfPermission(
                    this, Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
                if (!granted) return
            }

            val channelId = data["channelId"]?.takeIf { it.isNotBlank() } ?: CHANNEL_MESSAGES
            val notificationId = (tag.hashCode() and 0x7fffffff)

            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("nextalk_notification_type", "message")
                putExtra("nextalk_notification_tag", tag)
                putExtra("nextalk_notification_conversation", data["conversationId"] ?: "")
                putExtra("nextalk_notification_from", data["fromUsername"] ?: "")
            }

            val pendingIntent = PendingIntent.getActivity(
                this, notificationId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val builder = NotificationCompat.Builder(this, channelId)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setOnlyAlertOnce(true)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)

            NotificationManagerCompat.from(this).notify(notificationId, builder.build())
        } catch (e: Exception) {
            Log.e(TAG, "showMessageNotification error: ${e.message}", e)
        }
    }

    private fun postToken(baseOrigin: String, authToken: String, fcmToken: String) {
        Thread {
            var connection: HttpURLConnection? = null
            try {
                val url = URL("$baseOrigin/api/devices/fcm-token")
                connection = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = 12000
                    readTimeout = 12000
                    setRequestProperty("Authorization", "Bearer $authToken")
                    setRequestProperty("Content-Type", "application/json")
                }

                val payload = JSONObject().put("token", fcmToken).toString()
                connection.outputStream.use { output ->
                    output.write(payload.toByteArray(Charsets.UTF_8))
                }

                connection.responseCode
            } catch (_: Exception) {
            } finally {
                connection?.disconnect()
            }
        }.start()
    }
}
