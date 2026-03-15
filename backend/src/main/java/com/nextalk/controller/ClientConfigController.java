package com.nextalk.controller;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/config")
public class ClientConfigController {

    private static final List<Map<String, Object>> DEFAULT_ICE_SERVERS = List.of(
            Map.of("urls", "stun:stun.l.google.com:19302"),
            Map.of("urls", "stun:stun1.l.google.com:19302"),
            Map.of("urls", "stun:stun2.l.google.com:19302")
    );

    private final ObjectMapper objectMapper;

    @Value("${nextalk.webrtc.ice-servers-json:[]}")
    private String iceServersJson;

    public ClientConfigController(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @GetMapping("/client")
    public ResponseEntity<Map<String, Object>> getClientConfig(@AuthenticationPrincipal UserDetails currentUser) {
        if (currentUser == null || currentUser.getUsername() == null || currentUser.getUsername().isBlank()) {
            return ResponseEntity.status(401).build();
        }

        return ResponseEntity.ok(Map.of(
                "iceServers", resolveIceServers()
        ));
    }

    private List<Map<String, Object>> resolveIceServers() {
        String raw = iceServersJson == null ? "" : iceServersJson.trim();
        if (raw.isBlank()) {
            return DEFAULT_ICE_SERVERS;
        }

        try {
            List<Map<String, Object>> parsed = objectMapper.readValue(raw, new TypeReference<>() {});
            List<Map<String, Object>> sanitized = new ArrayList<>();
            for (Map<String, Object> server : parsed) {
                if (server == null) {
                    continue;
                }
                Object urls = server.get("urls");
                if (urls == null) {
                    continue;
                }
                String normalizedUrls = String.valueOf(urls).trim();
                if (normalizedUrls.isBlank()) {
                    continue;
                }

                Map<String, Object> item = new LinkedHashMap<>();
                item.put("urls", urls);

                Object username = server.get("username");
                if (username != null && !String.valueOf(username).isBlank()) {
                    item.put("username", String.valueOf(username));
                }

                Object credential = server.get("credential");
                if (credential != null && !String.valueOf(credential).isBlank()) {
                    item.put("credential", String.valueOf(credential));
                }

                sanitized.add(item);
            }

            return sanitized.isEmpty() ? DEFAULT_ICE_SERVERS : sanitized;
        } catch (IOException ignored) {
            return DEFAULT_ICE_SERVERS;
        }
    }
}
