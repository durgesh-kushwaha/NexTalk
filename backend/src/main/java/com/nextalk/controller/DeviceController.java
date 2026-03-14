package com.nextalk.controller;

import com.nextalk.dto.RegisterFcmTokenRequest;
import com.nextalk.service.PushNotificationService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {

    @Autowired
    private PushNotificationService pushNotificationService;

    @PostMapping("/fcm-token")
    public ResponseEntity<Void> registerFcmToken(
            @Valid @RequestBody RegisterFcmTokenRequest request,
            @AuthenticationPrincipal UserDetails currentUser
    ) {
        pushNotificationService.registerToken(currentUser.getUsername(), request.getToken());
        return ResponseEntity.noContent().build();
    }
}
