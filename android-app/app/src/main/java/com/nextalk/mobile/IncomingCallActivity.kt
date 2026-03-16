package com.nextalk.mobile

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Full-screen Activity for incoming calls.
 *
 * Shows over the lock screen with system ringtone + vibration.
 * Provides Answer and Decline buttons.
 * Auto-dismisses after 60 seconds timeout.
 */
class IncomingCallActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_CALLER = "incoming_caller"
        const val EXTRA_VIDEO = "incoming_video"
        const val ACTION_ANSWER = "com.nextalk.mobile.ACTION_ANSWER_CALL"
        const val ACTION_DECLINE = "com.nextalk.mobile.ACTION_DECLINE_CALL"
        private const val TIMEOUT_MS = 60_000L
        private const val PREFS_NAME = "nextalk_push_prefs"
    }

    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private val networkExecutor = Executors.newSingleThreadExecutor()

    private var callerUsername: String = "Unknown"
    private var videoEnabled: Boolean = false

    private val timeoutRunnable = Runnable {
        declineCall()
    }

    // Receiver to close this activity when user interacts via notification
    private val finishReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            stopRingtone()
            stopVibration()
            handler.removeCallbacks(timeoutRunnable)
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Enable showing over lock screen & turning screen on
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            keyguardManager?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }

        // Keep screen on
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContentView(R.layout.activity_incoming_call)

        // Parse intent
        callerUsername = intent.getStringExtra(EXTRA_CALLER) ?: "Unknown"
        videoEnabled = intent.getBooleanExtra(EXTRA_VIDEO, false)

        // Set UI
        findViewById<TextView>(R.id.callerName).text = callerUsername
        findViewById<TextView>(R.id.callTypeLabel).text =
            if (videoEnabled) "Incoming video call" else "Incoming audio call"

        // Buttons
        findViewById<ImageButton>(R.id.btnAnswer).setOnClickListener { answerCall() }
        findViewById<ImageButton>(R.id.btnDecline).setOnClickListener { declineCall() }

        // Acquire wake lock
        acquireWakeLock()

        // Start ringtone + vibration
        startRingtone()
        startVibration()

        // Auto-timeout after 60s
        handler.postDelayed(timeoutRunnable, TIMEOUT_MS)

        // Register receiver so CallActionReceiver can close us
        val filter = IntentFilter("com.nextalk.mobile.FINISH_INCOMING_CALL")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(finishReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(finishReceiver, filter)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // If user taps notification action while activity is already shown
        val action = intent.action
        when (action) {
            ACTION_ANSWER -> answerCall()
            ACTION_DECLINE -> declineCall()
        }
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(finishReceiver)
        } catch (_: Exception) {
        }
        handler.removeCallbacks(timeoutRunnable)
        stopRingtone()
        stopVibration()
        releaseWakeLock()
        networkExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun answerCall() {
        stopRingtone()
        stopVibration()
        handler.removeCallbacks(timeoutRunnable)

        // Cancel the call notification
        val notificationId = ("poll-call-$callerUsername".hashCode()) and 0x7fffffff
        val notificationManager = getSystemService(android.app.NotificationManager::class.java)
        notificationManager?.cancel(notificationId)

        // Launch MainActivity with incoming call extras
        val mainIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("nextalk_incoming_call", true)
            putExtra("nextalk_call_from", callerUsername)
            putExtra("nextalk_call_video", videoEnabled)
        }
        startActivity(mainIntent)
        finish()
    }

    private fun declineCall() {
        stopRingtone()
        stopVibration()
        handler.removeCallbacks(timeoutRunnable)

        // Cancel the call notification
        val notificationId = ("poll-call-$callerUsername".hashCode()) and 0x7fffffff
        val notificationManager = getSystemService(android.app.NotificationManager::class.java)
        notificationManager?.cancel(notificationId)

        // Acknowledge call on backend (decline it)
        acknowledgeCallOnBackend()

        finish()
    }

    private fun startRingtone() {
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE) ?: return
            ringtone = RingtoneManager.getRingtone(applicationContext, uri)?.apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    isLooping = true
                }
                audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                play()
            }
        } catch (_: Exception) {
        }
    }

    private fun stopRingtone() {
        try {
            ringtone?.stop()
            ringtone = null
        } catch (_: Exception) {
        }
    }

    private fun startVibration() {
        try {
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }

            val pattern = longArrayOf(0, 1000, 1000) // vibrate 1s, pause 1s, repeat
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = VibrationEffect.createWaveform(pattern, 0) // repeat from index 0
                val audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .build()
                vibrator?.vibrate(effect, audioAttributes)
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (_: Exception) {
        }
    }

    private fun stopVibration() {
        try {
            vibrator?.cancel()
            vibrator = null
        } catch (_: Exception) {
        }
    }

    private fun acquireWakeLock() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
            wakeLock = powerManager?.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "NexTalk::IncomingCallWakeLock"
            )?.apply {
                acquire(TIMEOUT_MS + 5000)
            }
        } catch (_: Exception) {
        }
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                }
            }
            wakeLock = null
        } catch (_: Exception) {
        }
    }

    private fun acknowledgeCallOnBackend() {
        networkExecutor.execute {
            try {
                val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                val authToken = prefs.getString("auth_token", "") ?: ""
                val backendOrigin = prefs.getString("backend_origin", "") ?: ""
                if (authToken.isBlank() || backendOrigin.isBlank()) return@execute

                val url = URL("$backendOrigin/api/calls/pending/acknowledge")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Authorization", "Bearer $authToken")
                connection.setRequestProperty("Content-Type", "application/json")
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                connection.doOutput = true
                connection.outputStream.use { it.write("{}".toByteArray()) }
                connection.responseCode
                connection.disconnect()
            } catch (_: Exception) {
            }
        }
    }
}
