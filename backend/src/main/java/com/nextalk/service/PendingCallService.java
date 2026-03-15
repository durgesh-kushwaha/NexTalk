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
 * Entries expire after 60 seconds.
 */
@Service
public class PendingCallService {

    private static final long EXPIRY_MS = 60_000; // 60 seconds

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

    /**
     * Peek at the pending call without removing it.
     * The call stays in the store so subsequent polls still see it.
     * Returns null if no pending call or if the call has expired.
     */
    public PendingCall getPendingCall(String username) {
        if (username == null || username.isBlank()) {
            return null;
        }
        PendingCall call = pendingCalls.get(username.toLowerCase());
        if (call == null) {
            return null;
        }
        // Check if expired — auto-cleanup
        if (Instant.now().toEpochMilli() - call.timestamp > EXPIRY_MS) {
            pendingCalls.remove(username.toLowerCase());
            return null;
        }
        return call;
    }

    /**
     * Explicitly acknowledge/dismiss a pending call.
     * Called when user taps the notification or the call is answered/rejected.
     */
    public void acknowledgePendingCall(String username) {
        if (username != null) {
            pendingCalls.remove(username.toLowerCase());
        }
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
