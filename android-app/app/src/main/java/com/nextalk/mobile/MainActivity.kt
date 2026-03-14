package com.nextalk.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.app.PictureInPictureParams
import android.util.Rational
import org.json.JSONArray
import org.json.JSONObject
import android.webkit.JavascriptInterface
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import com.google.firebase.messaging.FirebaseMessaging
import android.provider.ContactsContract
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    companion object {
        private const val CHANNEL_MESSAGES = "nextalk_messages"
        private const val CHANNEL_CALLS = "nextalk_calls"
        private const val PREFS_NAME = "nextalk_push_prefs"
        private const val PREF_AUTH_TOKEN = "auth_token"
        private const val PREF_BACKEND_ORIGIN = "backend_origin"
        @Volatile
        var isAppInForeground: Boolean = false

        fun loadPushRegistrationContext(context: Context): Pair<String, String> {
            val prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            val token = prefs.getString(PREF_AUTH_TOKEN, "") ?: ""
            val origin = prefs.getString(PREF_BACKEND_ORIGIN, "") ?: ""
            return Pair(token, origin)
        }
    }

    private lateinit var webView: WebView
    private lateinit var audioManager: AudioManager
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var incomingRingtone: Ringtone? = null
    private var videoCallActive: Boolean = false
    private val networkExecutor = Executors.newSingleThreadExecutor()

    inner class AndroidBridge {
        @JavascriptInterface
        fun showNotification(title: String?, body: String?, tag: String?, kind: String?) {
            runOnUiThread {
                showNativeNotification(title, body, tag, kind)
            }
        }

        @JavascriptInterface
        fun playNotificationTone(kind: String?) {
            runOnUiThread {
                playNativeTone(kind)
            }
        }

        @JavascriptInterface
        fun startIncomingRingtone() {
            runOnUiThread {
                startIncomingRingtoneInternal()
            }
        }

        @JavascriptInterface
        fun stopIncomingRingtone() {
            runOnUiThread {
                stopIncomingRingtoneInternal()
            }
        }

        @JavascriptInterface
        fun isNotificationPermissionGranted(): Boolean {
            return hasNotificationPermission()
        }

        @JavascriptInterface
        fun requestNotificationPermission() {
            runOnUiThread {
                if (hasNotificationPermission()) {
                    emitNativeNotificationPermissionResult(true)
                    return@runOnUiThread
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                } else {
                    emitNativeNotificationPermissionResult(true)
                }
            }
        }

        @JavascriptInterface
        fun getAudioOutputDevices(): String {
            return runCatching { buildAudioOutputDevicesJson() }.getOrDefault("[]")
        }

        @JavascriptInterface
        fun setAudioOutputDevice(deviceId: String?): Boolean {
            val id = deviceId?.toIntOrNull() ?: return false
            return runCatching { setCommunicationAudioOutput(id) }.getOrDefault(false)
        }

        @JavascriptInterface
        fun setVideoCallState(active: Boolean) {
            videoCallActive = active
        }

        @JavascriptInterface
        fun enterPictureInPicture() {
            runOnUiThread {
                enterVideoPipIfPossible()
            }
        }

        @JavascriptInterface
        fun registerFcmToken(authToken: String?, backendOrigin: String?) {
            val tokenValue = authToken?.trim().orEmpty()
            val originValue = backendOrigin?.trim().orEmpty().trimEnd('/')
            if (tokenValue.isBlank() || originValue.isBlank()) {
                return
            }

            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(PREF_AUTH_TOKEN, tokenValue)
                .putString(PREF_BACKEND_ORIGIN, originValue)
                .apply()

            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { fcmToken ->
                    if (fcmToken.isNullOrBlank()) {
                        return@addOnSuccessListener
                    }
                    postFcmTokenToBackend(originValue, tokenValue, fcmToken)
                }
        }

        @JavascriptInterface
        fun pickContact() {
            runOnUiThread {
                val granted = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.READ_CONTACTS
                ) == PackageManager.PERMISSION_GRANTED
                if (!granted) {
                    permissionLauncher.launch(arrayOf(Manifest.permission.READ_CONTACTS))
                    emitNativeContactPicked(null, null)
                    return@runOnUiThread
                }
                contactPickerLauncher.launch(null)
            }
        }

        @JavascriptInterface
        fun onCallAudioStart() {
            runOnUiThread {
                startCallAudioSession()
            }
        }

        @JavascriptInterface
        fun onCallAudioEnd() {
            runOnUiThread {
                endCallAudioSession()
            }
        }
    }

    private val runtimePermissions = buildList {
        add(Manifest.permission.CAMERA)
        add(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }.toTypedArray()

    private val contactPickerLauncher =
        registerForActivityResult(ActivityResultContracts.PickContact()) { uri ->
            if (uri == null) {
                emitNativeContactPicked(null, null)
                return@registerForActivityResult
            }

            var pickedName: String? = null
            var pickedPhone: String? = null

            try {
                contentResolver.query(
                    uri,
                    arrayOf(
                        ContactsContract.Contacts._ID,
                        ContactsContract.Contacts.DISPLAY_NAME
                    ),
                    null,
                    null,
                    null
                )?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val id = cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.Contacts._ID))
                        pickedName = cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME))

                        contentResolver.query(
                            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                            arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
                            "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID}=?",
                            arrayOf(id),
                            null
                        )?.use { phoneCursor ->
                            if (phoneCursor.moveToFirst()) {
                                pickedPhone = phoneCursor.getString(
                                    phoneCursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)
                                )
                            }
                        }
                    }
                }
            } catch (_: Exception) {
            }

            emitNativeContactPicked(pickedName, pickedPhone)
        }

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            val granted = result.values.all { it }
            if (granted) {
                pendingWebPermissionRequest?.grant(
                    pendingWebPermissionRequest?.resources ?: emptyArray()
                )
            } else {
                pendingWebPermissionRequest?.deny()
            }
            pendingWebPermissionRequest = null
        }

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            emitNativeNotificationPermissionResult(granted)
        }

    private val filePickerLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileChooserCallback
            fileChooserCallback = null

            if (callback == null) {
                return@registerForActivityResult
            }

            if (result.resultCode != RESULT_OK || result.data == null) {
                callback.onReceiveValue(null)
                return@registerForActivityResult
            }

            val data = result.data!!
            val uris = mutableListOf<Uri>()

            data.data?.let { uris.add(it) }
            val clipData = data.clipData
            if (clipData != null) {
                for (index in 0 until clipData.itemCount) {
                    val item = clipData.getItemAt(index)
                    item.uri?.let { uris.add(it) }
                }
            }

            callback.onReceiveValue(uris.distinct().toTypedArray())
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        audioManager = getSystemService(AudioManager::class.java)

        createNotificationChannels()

        webView = findViewById(R.id.mainWebView)
        configureWebView(webView)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!::webView.isInitialized) {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    return
                }

                webView.evaluateJavascript(
                    "window.nextalkHandleNativeBack && window.nextalkHandleNativeBack();"
                ) { result ->
                    val handled = result == "true"
                    if (handled) {
                        return@evaluateJavascript
                    }
                    if (webView.canGoBack()) {
                        webView.goBack()
                        return@evaluateJavascript
                    }
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        requestMissingRuntimePermissions()
        webView.loadUrl(BuildConfig.APP_URL)
    }

    override fun onDestroy() {
        stopIncomingRingtoneInternal()
        networkExecutor.shutdownNow()
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        isAppInForeground = true
        triggerNativePushRegistrationInWebView()
    }

    override fun onPause() {
        isAppInForeground = false
        super.onPause()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        enterVideoPipIfPossible()
    }

    @Suppress("SetJavaScriptEnabled")
    private fun configureWebView(view: WebView) {
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(view, true)

        view.settings.javaScriptEnabled = true
        view.settings.domStorageEnabled = true
        view.settings.mediaPlaybackRequiresUserGesture = false
        view.settings.allowFileAccess = true
        view.settings.allowContentAccess = true
        view.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                return false
            }
        }

        view.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) {
                    return
                }

                val required = mutableListOf<String>()
                request.resources?.forEach { resource ->
                    if (resource == PermissionRequest.RESOURCE_AUDIO_CAPTURE) {
                        required.add(Manifest.permission.RECORD_AUDIO)
                    }
                    if (resource == PermissionRequest.RESOURCE_VIDEO_CAPTURE) {
                        required.add(Manifest.permission.CAMERA)
                    }
                }

                val hasPermissions = required.all { permission ->
                    ContextCompat.checkSelfPermission(this@MainActivity, permission) == PackageManager.PERMISSION_GRANTED
                }

                if (hasPermissions) {
                    request.grant(request.resources)
                } else {
                    pendingWebPermissionRequest = request
                    permissionLauncher.launch(required.distinct().toTypedArray())
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback

                val chooserIntent = fileChooserParams?.createIntent() ?: return false
                filePickerLauncher.launch(chooserIntent)
                return true
            }
        }
    }

    private fun requestMissingRuntimePermissions() {
        val missingPermissions = runtimePermissions.filter { permission ->
            ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED
        }

        if (missingPermissions.isNotEmpty()) {
            permissionLauncher.launch(missingPermissions.toTypedArray())
        }
    }

    private fun hasNotificationPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true
        }
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val manager = getSystemService(NotificationManager::class.java) ?: return

        val messageSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val messageAudio = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val callSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        val callAudio = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val messageChannel = NotificationChannel(
            CHANNEL_MESSAGES,
            "NexTalk Messages",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Message notifications"
            enableVibration(true)
            setSound(messageSound, messageAudio)
        }

        val callChannel = NotificationChannel(
            CHANNEL_CALLS,
            "NexTalk Calls",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Incoming call alerts"
            enableVibration(true)
            setSound(callSound, callAudio)
        }

        manager.createNotificationChannels(listOf(messageChannel, callChannel))
    }

    @SuppressLint("MissingPermission")
    private fun showNativeNotification(title: String?, body: String?, tag: String?, kind: String?) {
        if (!hasNotificationPermission()) {
            return
        }

        val channelId = if (kind == "call") CHANNEL_CALLS else CHANNEL_MESSAGES
        val notificationId = (tag?.hashCode() ?: System.currentTimeMillis().toInt()) and 0x7fffffff

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
            .setContentTitle(title?.takeIf { it.isNotBlank() } ?: "NexTalk")
            .setContentText(body?.takeIf { it.isNotBlank() } ?: "You have a new notification")
            .setStyle(
                NotificationCompat.BigTextStyle().bigText(
                    body?.takeIf { it.isNotBlank() } ?: "You have a new notification"
                )
            )
            .setPriority(
                if (kind == "call") {
                    NotificationCompat.PRIORITY_HIGH
                } else {
                    NotificationCompat.PRIORITY_DEFAULT
                }
            )
            .setCategory(
                if (kind == "call") {
                    NotificationCompat.CATEGORY_CALL
                } else {
                    NotificationCompat.CATEGORY_MESSAGE
                }
            )
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setDefaults(NotificationCompat.DEFAULT_ALL)

        NotificationManagerCompat.from(this).notify(notificationId, builder.build())
    }

    private fun playNativeTone(kind: String?) {
        val toneType = if (kind == "call") {
            RingtoneManager.TYPE_RINGTONE
        } else {
            RingtoneManager.TYPE_NOTIFICATION
        }
        val uri = RingtoneManager.getDefaultUri(toneType) ?: return
        val tone = RingtoneManager.getRingtone(applicationContext, uri) ?: return
        tone.play()
    }

    private fun startIncomingRingtoneInternal() {
        if (incomingRingtone?.isPlaying == true) {
            return
        }

        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE) ?: return
        incomingRingtone = RingtoneManager.getRingtone(applicationContext, uri)?.apply {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                isLooping = true
            }
            play()
        }
    }

    private fun stopIncomingRingtoneInternal() {
        incomingRingtone?.stop()
        incomingRingtone = null
    }

    private fun enterVideoPipIfPossible() {
        if (!videoCallActive) {
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        if (isInPictureInPictureMode) {
            return
        }

        val params = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(16, 9))
            .build()

        enterPictureInPictureMode(params)
    }

    private fun buildAudioOutputDevicesJson(): String {
        val devicesArray = JSONArray()
        val outputs = getOutputDevices()
        val selectedId = getSelectedOutputId(outputs)

        outputs.forEach { device ->
            val item = JSONObject()
            item.put("id", device.id)
            item.put("label", getOutputLabel(device))
            item.put("kind", getOutputKind(device))
            item.put("selected", device.id == selectedId)
            devicesArray.put(item)
        }

        return devicesArray.toString()
    }

    private fun getOutputDevices(): List<AudioDeviceInfo> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audioManager.availableCommunicationDevices
        } else {
            audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
        }
    }

    private fun getSelectedOutputId(outputs: List<AudioDeviceInfo>): Int {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return audioManager.communicationDevice?.id ?: outputs.firstOrNull()?.id ?: -1
        }

        if (audioManager.isBluetoothScoOn) {
            return outputs.firstOrNull { isBluetoothType(it.type) }?.id ?: -1
        }
        if (audioManager.isSpeakerphoneOn) {
            return outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }?.id ?: -1
        }
        return outputs.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }?.id
            ?: outputs.firstOrNull()?.id
            ?: -1
    }

    private fun setCommunicationAudioOutput(deviceId: Int): Boolean {
        val outputs = getOutputDevices()
        val target = outputs.firstOrNull { it.id == deviceId } ?: return false

        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return audioManager.setCommunicationDevice(target)
        }

        when {
            target.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> {
                audioManager.stopBluetoothSco()
                audioManager.isBluetoothScoOn = false
                audioManager.isSpeakerphoneOn = true
                return true
            }

            isBluetoothType(target.type) -> {
                audioManager.isSpeakerphoneOn = false
                audioManager.startBluetoothSco()
                audioManager.isBluetoothScoOn = true
                return true
            }

            else -> {
                audioManager.stopBluetoothSco()
                audioManager.isBluetoothScoOn = false
                audioManager.isSpeakerphoneOn = false
                return true
            }
        }
    }

    private fun getOutputLabel(device: AudioDeviceInfo): String {
        val product = device.productName?.toString()?.trim().orEmpty()
        if (product.isNotBlank()) {
            return product
        }
        return when {
            device.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Speaker"
            device.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "Phone"
            device.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || device.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "Wired headset"
            isBluetoothType(device.type) -> "Bluetooth"
            else -> "Output"
        }
    }

    private fun getOutputKind(device: AudioDeviceInfo): String {
        return when {
            device.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
            device.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
            device.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || device.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired"
            isBluetoothType(device.type) -> "bluetooth"
            else -> "other"
        }
    }

    private fun isBluetoothType(type: Int): Boolean {
        if (type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
            return true
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                type == AudioDeviceInfo.TYPE_BLE_SPEAKER ||
                type == AudioDeviceInfo.TYPE_BLE_BROADCAST
        }
        return false
    }

    private fun emitNativeContactPicked(name: String?, phone: String?) {
        val payload = JSONObject().apply {
            put("name", name ?: "")
            put("phone", phone ?: "")
        }.toString()

        val js = "window.onNativeContactPicked && window.onNativeContactPicked(${JSONObject.quote(payload)});"
        webView.post {
            webView.evaluateJavascript(js, null)
        }
    }

    private fun emitNativeFcmRegisterResult(success: Boolean, statusCode: Int) {
        val payload = JSONObject().apply {
            put("success", success)
            put("status", statusCode)
        }.toString()
        val js = "window.onNativeFcmRegisterResult && window.onNativeFcmRegisterResult(${JSONObject.quote(payload)});"
        webView.post {
            webView.evaluateJavascript(js, null)
        }
    }

    private fun emitNativeNotificationPermissionResult(granted: Boolean) {
        val payload = JSONObject().apply {
            put("granted", granted)
        }.toString()
        val js = "window.onNativeNotificationPermissionResult && window.onNativeNotificationPermissionResult(${JSONObject.quote(payload)});"
        webView.post {
            webView.evaluateJavascript(js, null)
        }
    }

    private fun triggerNativePushRegistrationInWebView() {
        if (!::webView.isInitialized) {
            return
        }
        webView.post {
            webView.evaluateJavascript(
                "window.__nextalkTriggerPushRegistration && window.__nextalkTriggerPushRegistration();",
                null
            )
        }
    }

    private fun startCallAudioSession() {
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            audioManager.isSpeakerphoneOn = false
        }
    }

    private fun endCallAudioSession() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audioManager.clearCommunicationDevice()
        } else {
            audioManager.stopBluetoothSco()
            audioManager.isBluetoothScoOn = false
            audioManager.isSpeakerphoneOn = false
        }
        audioManager.mode = AudioManager.MODE_NORMAL
    }

    private fun postFcmTokenToBackend(baseOrigin: String, authToken: String, fcmToken: String) {
        networkExecutor.execute {
            var connection: HttpURLConnection? = null
            var statusCode = 0
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

                statusCode = connection.responseCode
                emitNativeFcmRegisterResult(statusCode in 200..299, statusCode)
            } catch (_: Exception) {
                emitNativeFcmRegisterResult(false, statusCode)
            } finally {
                connection?.disconnect()
            }
        }
    }

}
