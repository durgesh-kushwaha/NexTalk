package com.nextalk.controller;

import java.security.Principal;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
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

    @GetMapping("/pending")
    public ResponseEntity<?> getPendingCall(Principal principal) {
        if (principal == null || principal.getName() == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        PendingCallService.PendingCall call = pendingCallService.consumePendingCall(principal.getName());
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
}
