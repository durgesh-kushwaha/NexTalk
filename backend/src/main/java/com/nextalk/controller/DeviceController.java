package com.nextalk.controller;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.nextalk.dto.RegisterFcmTokenRequest;
import com.nextalk.service.PushNotificationService;

import jakarta.annotation.PostConstruct;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {

    private static final Logger log = LoggerFactory.getLogger(DeviceController.class);

    @Autowired
    private PushNotificationService pushNotificationService;

    @PostConstruct
    public void onInit() {
        log.info("DeviceController initialized with routes: /api/devices/fcm-token, /api/devices/fcm-debug");
    }

    @PostMapping("/fcm-token")
    public ResponseEntity<Void> registerFcmToken(
            @Valid @RequestBody RegisterFcmTokenRequest request,
            @AuthenticationPrincipal UserDetails currentUser
    ) {
        if (currentUser == null || currentUser.getUsername() == null || currentUser.getUsername().isBlank()) {
            return ResponseEntity.status(401).build();
        }
        pushNotificationService.registerToken(currentUser.getUsername(), request.getToken());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/fcm-debug")
    public ResponseEntity<Map<String, Object>> getFcmDebug(
            @AuthenticationPrincipal UserDetails currentUser
    ) {
        if (currentUser == null || currentUser.getUsername() == null || currentUser.getUsername().isBlank()) {
            return ResponseEntity.status(401).build();
        }
        String username = currentUser.getUsername();
        int tokenCount = pushNotificationService.getRegisteredTokenCount(username);
        Map<String, Object> diagnostics = pushNotificationService.getFcmDiagnostics();
        diagnostics.put("username", username);
        diagnostics.put("fcmReady", pushNotificationService.isFcmReady());
        diagnostics.put("tokenCount", tokenCount);
        return ResponseEntity.ok(diagnostics);
    }
}
