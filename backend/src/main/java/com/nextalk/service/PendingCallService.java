package com.nextalk.service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

/**
 * In-memory store for pending incoming calls.
 * When a CALL_REQUEST signal is sent, the call is stored here temporarily.
 * The Android polling service checks this endpoint to show call notifications
 * when FCM is unavailable.
 * Entries expire after 30 seconds.
 */
@Service
public class PendingCallService {

    private static final long EXPIRY_MS = 30_000; // 30 seconds

    private final Map<String, PendingCall> pendingCalls = new ConcurrentHashMap<>();

    public void storePendingCall(String toUsername, String fromUsername, boolean videoEnabled) {
        if (toUsername == null || toUsername.isBlank()) {
            return;
        }
        pendingCalls.put(toUsername.toLowerCase(), new PendingCall(
            fromUsername,
            videoEnabled,
            Instant.now().toEpochMilli()
        ));
    }

    public PendingCall consumePendingCall(String username) {
        if (username == null || username.isBlank()) {
            return null;
        }
        PendingCall call = pendingCalls.remove(username.toLowerCase());
        if (call == null) {
            return null;
        }
        // Check if expired
        if (Instant.now().toEpochMilli() - call.timestamp > EXPIRY_MS) {
            return null;
        }
        return call;
    }

    public void clearPendingCall(String username) {
        if (username != null) {
            pendingCalls.remove(username.toLowerCase());
        }
    }

    public static class PendingCall {
        public final String fromUsername;
        public final boolean videoEnabled;
        public final long timestamp;

        public PendingCall(String fromUsername, boolean videoEnabled, long timestamp) {
            this.fromUsername = fromUsername;
            this.videoEnabled = videoEnabled;
            this.timestamp = timestamp;
        }
    }
}
