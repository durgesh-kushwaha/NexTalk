package com.nextalk.controller;

import java.security.Principal;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.nextalk.service.PendingCallService;

/**
 * REST endpoint for checking pending incoming calls.
 * Used by the Android polling service when FCM is unavailable.
 */
@RestController
@RequestMapping("/api/calls")
public class PendingCallController {

    @Autowired
    private PendingCallService pendingCallService;

    /**
     * Peek at the pending call without consuming it.
     * The call stays active so subsequent polls will still see it
     * until the caller hangs up or the call is acknowledged.
     */
    @GetMapping("/pending")
    public ResponseEntity<?> getPendingCall(Principal principal) {
        if (principal == null || principal.getName() == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        PendingCallService.PendingCall call = pendingCallService.getPendingCall(principal.getName());
        if (call == null) {
            return ResponseEntity.ok(Map.of("hasPendingCall", false));
        }

        return ResponseEntity.ok(Map.of(
            "hasPendingCall", true,
            "fromUsername", call.fromUsername != null ? call.fromUsername : "",
            "videoEnabled", call.videoEnabled,
            "timestamp", call.timestamp
        ));
    }

    /**
     * Acknowledge/dismiss a pending call.
     * Called by the Android client when the user taps the call notification.
     */
    @PostMapping("/pending/acknowledge")
    public ResponseEntity<?> acknowledgePendingCall(Principal principal) {
        if (principal == null || principal.getName() == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        pendingCallService.acknowledgePendingCall(principal.getName());
        return ResponseEntity.ok(Map.of("acknowledged", true));
    }
}
