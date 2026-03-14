package com.nextalk.mobile

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class NextalkFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val CHANNEL_MESSAGES = "nextalk_messages"
        private const val CHANNEL_CALLS = "nextalk_calls"
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        if (MainActivity.isAppInForeground) {
            return
        }

        ensureChannels()

        val data = message.data
        val type = data["type"] ?: "message"
        val title = message.notification?.title ?: data["title"] ?: if (type == "call") "Incoming call" else "New message"
        val body = message.notification?.body ?: data["body"] ?: if (type == "call") "Someone is calling you" else "You have a new message"

        showNotification(type, title, body)
    }

    private fun ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val manager = getSystemService(NotificationManager::class.java) ?: return

        val messageChannel = NotificationChannel(
            CHANNEL_MESSAGES,
            "NexTalk Messages",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "NexTalk chat message notifications"
        }

        val callChannel = NotificationChannel(
            CHANNEL_CALLS,
            "NexTalk Calls",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "NexTalk incoming call notifications"
        }

        manager.createNotificationChannels(listOf(messageChannel, callChannel))
    }

    private fun showNotification(type: String, title: String, body: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                return
            }
        }

        val channelId = if (type == "call") CHANNEL_CALLS else CHANNEL_MESSAGES
        val notificationId = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            notificationId,
            intent,
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

        if (type == "call") {
            builder
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setFullScreenIntent(pendingIntent, true)
        } else {
            builder.setCategory(NotificationCompat.CATEGORY_MESSAGE)
        }

        NotificationManagerCompat.from(this).notify(notificationId, builder.build())
    }
}
