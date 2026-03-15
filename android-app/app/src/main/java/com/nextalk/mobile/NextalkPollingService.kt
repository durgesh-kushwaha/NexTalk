package com.nextalk.mobile

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Background polling service that checks for new messages and shows
 * system notifications even when the app is in the background.
 * FCM bypass — this is the primary notification mechanism.
 */
class NextalkPollingService : Service() {

    companion object {
        private const val TAG = "NextalkPolling"
        private const val CHANNEL_SERVICE = "nextalk_service"
        private const val CHANNEL_MESSAGES = "nextalk_messages_v2"
        private const val CHANNEL_CALLS = "nextalk_calls_v2"
        private const val SERVICE_NOTIFICATION_ID = 99999
        private const val POLL_INTERVAL_MS = 8000L // 8 seconds
        private const val PREFS_NAME = "nextalk_push_prefs"
        private const val PREF_AUTH_TOKEN = "auth_token"
        private const val PREF_BACKEND_ORIGIN = "backend_origin"
        private const val PREF_LAST_SEEN_TIMESTAMPS = "last_seen_timestamps"
        private const val PREF_CURRENT_USERNAME = "current_username"
    }

    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private var isPolling = false
    private var lastSeenTimestamps = mutableMapOf<String, String>()
    private var currentUsername = ""

    private val pollRunnable = object : Runnable {
        override fun run() {
            if (!isPolling) return
            executor.execute { pollForNewMessages() }
            handler.postDelayed(this, POLL_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createServiceChannel()
        loadLastSeenTimestamps()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildServiceNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(SERVICE_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(SERVICE_NOTIFICATION_ID, notification)
        }
        startPolling()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopPolling()
        super.onDestroy()
    }

    private fun startPolling() {
        if (isPolling) return
        isPolling = true
        handler.post(pollRunnable)
        Log.d(TAG, "Polling started")
    }

    private fun stopPolling() {
        isPolling = false
        handler.removeCallbacks(pollRunnable)
        Log.d(TAG, "Polling stopped")
    }

    private fun createServiceChannel() {
        val manager = getSystemService(NotificationManager::class.java)

        // Silent service channel — invisible to user
        val serviceChannel = NotificationChannel(
            CHANNEL_SERVICE,
            "NexTalk Background",
            NotificationManager.IMPORTANCE_NONE
        ).apply {
            description = "Background connection"
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_SECRET
        }
        manager.createNotificationChannel(serviceChannel)

        // Message notification channel — high priority
        val msgChannel = NotificationChannel(
            CHANNEL_MESSAGES,
            "Messages",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "New message notifications"
            enableVibration(true)
            enableLights(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(msgChannel)

        // Call notification channel
        val callChannel = NotificationChannel(
            CHANNEL_CALLS,
            "Calls",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Incoming call notifications"
            enableVibration(true)
            enableLights(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(callChannel)
    }

    private fun buildServiceNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setContentTitle("NexTalk")
            .setContentText("Running")
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_DEFERRED)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun pollForNewMessages() {
        try {
            val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            val authToken = prefs.getString(PREF_AUTH_TOKEN, "") ?: ""
            val backendOrigin = prefs.getString(PREF_BACKEND_ORIGIN, "") ?: ""
            currentUsername = prefs.getString(PREF_CURRENT_USERNAME, "") ?: ""

            if (authToken.isBlank() || backendOrigin.isBlank()) {
                Log.d(TAG, "No auth token or backend origin, skipping poll")
                return
            }

            // Don't poll when app is in foreground (WebView handles it)
            if (MainActivity.isAppInForeground) {
                return
            }

            // Poll for new messages
            pollMessages(backendOrigin, authToken)

            // Poll for pending calls
            pollPendingCalls(backendOrigin, authToken)
        } catch (e: Exception) {
            Log.d(TAG, "Poll error: ${e.message}")
        }
    }

    private fun pollMessages(backendOrigin: String, authToken: String) {
        try {
            val url = URL("$backendOrigin/api/conversations")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.setRequestProperty("Authorization", "Bearer $authToken")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.connectTimeout = 8000
            connection.readTimeout = 8000

            val responseCode = connection.responseCode
            if (responseCode != 200) {
                connection.disconnect()
                return
            }

            val reader = BufferedReader(InputStreamReader(connection.inputStream))
            val response = reader.readText()
            reader.close()
            connection.disconnect()

            processConversations(response)
        } catch (e: Exception) {
            Log.d(TAG, "Message poll error: ${e.message}")
        }
    }

    private fun pollPendingCalls(backendOrigin: String, authToken: String) {
        try {
            val url = URL("$backendOrigin/api/calls/pending")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.setRequestProperty("Authorization", "Bearer $authToken")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.connectTimeout = 5000
            connection.readTimeout = 5000

            val responseCode = connection.responseCode
            if (responseCode != 200) {
                connection.disconnect()
                return
            }

            val reader = BufferedReader(InputStreamReader(connection.inputStream))
            val response = reader.readText()
            reader.close()
            connection.disconnect()

            val json = JSONObject(response)
            val hasPendingCall = json.optBoolean("hasPendingCall", false)
            if (hasPendingCall) {
                val fromUsername = json.optString("fromUsername", "Unknown")
                val videoEnabled = json.optBoolean("videoEnabled", false)
                showCallNotification(fromUsername, videoEnabled)
            }
        } catch (e: Exception) {
            Log.d(TAG, "Call poll error: ${e.message}")
        }
    }

    private fun showCallNotification(fromUsername: String, videoEnabled: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }

        val notificationId = ("poll-call-$fromUsername".hashCode()) and 0x7fffffff
        val callType = if (videoEnabled) "video" else "audio"

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("nextalk_incoming_call", true)
            putExtra("nextalk_call_from", fromUsername)
            putExtra("nextalk_call_video", videoEnabled)
        }

        val pendingIntent = PendingIntent.getActivity(
            this, notificationId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_CALLS)
            .setSmallIcon(android.R.drawable.stat_sys_phone_call)
            .setContentTitle(fromUsername)
            .setContentText("Incoming $callType call")
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)

        try {
            NotificationManagerCompat.from(this).notify(notificationId, builder.build())
            Log.d(TAG, "Call notification: $fromUsername ($callType)")
        } catch (e: SecurityException) {
            Log.d(TAG, "Notification permission denied")
        }
    }

    private fun processConversations(json: String) {
        try {
            val conversations = JSONArray(json)
            for (i in 0 until conversations.length()) {
                val conv = conversations.getJSONObject(i)
                val convId = conv.optString("id", "")
                val lastMessageAt = conv.optString("lastMessageAt", "")
                // Correct field name from ConversationDTO
                val lastMessage = conv.optString("lastMessage", "")

                if (convId.isBlank() || lastMessageAt.isBlank()) continue

                val previousTimestamp = lastSeenTimestamps[convId]
                if (previousTimestamp == null) {
                    // First time seeing this conversation, just record it
                    lastSeenTimestamps[convId] = lastMessageAt
                    continue
                }

                if (lastMessageAt != previousTimestamp) {
                    // New message detected!
                    lastSeenTimestamps[convId] = lastMessageAt

                    val convName = getConversationDisplayName(conv)
                    val preview = if (lastMessage.isNotBlank()) lastMessage else "New message"
                    showMessageNotification(convName, preview, convId)
                }
            }
            saveLastSeenTimestamps()
        } catch (e: Exception) {
            Log.d(TAG, "Parse error: ${e.message}")
        }
    }

    private fun getConversationDisplayName(conv: JSONObject): String {
        // Try conversation name first (for group chats)
        val name = conv.optString("name", "")
        if (name.isNotBlank() && name != "null") return name

        // For private chats, get the OTHER participant's name
        val participants = conv.optJSONArray("participants") ?: return "NexTalk"
        val myUsername = currentUsername.lowercase()

        for (i in 0 until participants.length()) {
            val p = participants.optJSONObject(i) ?: continue
            val username = p.optString("username", "")
            // Skip self
            if (username.lowercase() == myUsername && myUsername.isNotBlank()) continue
            val displayName = p.optString("displayName", "")
            val resolvedName = if (displayName.isNotBlank() && displayName != "null") displayName else username
            if (resolvedName.isNotBlank() && resolvedName != "null") return resolvedName
        }

        // Fallback: return first participant's name
        for (i in 0 until participants.length()) {
            val p = participants.optJSONObject(i) ?: continue
            val displayName = p.optString("displayName", "")
            val username = p.optString("username", "")
            val resolvedName = if (displayName.isNotBlank() && displayName != "null") displayName else username
            if (resolvedName.isNotBlank() && resolvedName != "null") return resolvedName
        }

        return "NexTalk"
    }

    private fun showMessageNotification(title: String, body: String, conversationId: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }

        val notificationId = ("poll-msg-$conversationId".hashCode()) and 0x7fffffff

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this, notificationId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_MESSAGES)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        try {
            NotificationManagerCompat.from(this).notify(notificationId, builder.build())
            Log.d(TAG, "Notification: $title — $body")
        } catch (e: SecurityException) {
            Log.d(TAG, "Notification permission denied")
        }
    }

    private fun loadLastSeenTimestamps() {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val data = prefs.getString(PREF_LAST_SEEN_TIMESTAMPS, "") ?: ""
        if (data.isBlank()) return
        try {
            val json = JSONObject(data)
            json.keys().forEach { key ->
                lastSeenTimestamps[key] = json.optString(key, "")
            }
        } catch (_: Exception) {}
    }

    private fun saveLastSeenTimestamps() {
        val json = JSONObject()
        lastSeenTimestamps.forEach { (key, value) ->
            json.put(key, value)
        }
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .putString(PREF_LAST_SEEN_TIMESTAMPS, json.toString())
            .apply()
    }
}
