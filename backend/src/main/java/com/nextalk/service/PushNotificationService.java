package com.nextalk.service;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MulticastMessage;
import com.google.firebase.messaging.Notification;
import com.nextalk.model.User;
import com.nextalk.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.FileInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class PushNotificationService {

    private static final int MAX_TOKENS_PER_USER = 20;

    @Autowired
    private UserRepository userRepository;

    @Value("${nextalk.fcm.enabled:false}")
    private boolean fcmEnabled;

    @Value("${nextalk.fcm.service-account-path:}")
    private String serviceAccountPath;

    private FirebaseApp firebaseApp;

    @PostConstruct
    public void init() {
        if (!fcmEnabled) {
            return;
        }
        if (serviceAccountPath == null || serviceAccountPath.isBlank()) {
            return;
        }

        try (InputStream stream = new FileInputStream(serviceAccountPath)) {
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(stream))
                    .build();
            firebaseApp = FirebaseApp.initializeApp(options, "nextalk-fcm");
        } catch (Exception error) {
            firebaseApp = null;
        }
    }

    public void registerToken(String username, String token) {
        if (username == null || username.isBlank() || token == null) {
            return;
        }

        String normalizedToken = token.trim();
        if (normalizedToken.isBlank()) {
            return;
        }

        userRepository.findByUsername(username).ifPresent(user -> {
            List<String> existing = user.getFcmTokens() == null
                    ? new ArrayList<>()
                    : new ArrayList<>(user.getFcmTokens());

            existing.removeIf(item -> item == null || item.isBlank());
            existing.remove(normalizedToken);
            existing.add(0, normalizedToken);

            if (existing.size() > MAX_TOKENS_PER_USER) {
                existing = existing.subList(0, MAX_TOKENS_PER_USER);
            }

            user.setFcmTokens(existing);
            userRepository.save(user);
        });
    }

    public void sendMessageNotificationToConversationParticipants(
            String conversationId,
            String senderUsername,
            List<String> recipientUserIds,
            String bodyPreview
    ) {
        if (recipientUserIds == null || recipientUserIds.isEmpty()) {
            return;
        }

        String title = senderUsername == null || senderUsername.isBlank() ? "New message" : senderUsername;
        String body = bodyPreview == null || bodyPreview.isBlank() ? "You have a new message" : bodyPreview;

        Map<String, String> data = new HashMap<>();
        data.put("type", "message");
        data.put("conversationId", conversationId == null ? "" : conversationId);

        sendToUserIds(recipientUserIds, title, body, data);
    }

    public void sendIncomingCallNotification(String toUsername, String fromUsername, boolean videoEnabled) {
        if (toUsername == null || toUsername.isBlank()) {
            return;
        }

        userRepository.findByUsername(toUsername).ifPresent(user -> {
            String title = (fromUsername == null || fromUsername.isBlank())
                    ? "Incoming call"
                    : fromUsername;
            String body = videoEnabled ? "Incoming video call" : "Incoming audio call";

            Map<String, String> data = new HashMap<>();
            data.put("type", "call");
            data.put("videoEnabled", String.valueOf(videoEnabled));
            data.put("fromUsername", fromUsername == null ? "" : fromUsername);

            sendToTokens(user.getFcmTokens(), title, body, data);
        });
    }

    private void sendToUserIds(List<String> userIds, String title, String body, Map<String, String> data) {
        if (userIds == null || userIds.isEmpty()) {
            return;
        }

        Set<String> uniqueIds = new HashSet<>(userIds);
        List<User> users = userRepository.findByIdIn(new ArrayList<>(uniqueIds));
        List<String> tokens = users.stream()
                .flatMap(user -> {
                    List<String> list = user.getFcmTokens();
                    return list == null ? Collections.<String>emptyList().stream() : list.stream();
                })
                .filter(token -> token != null && !token.isBlank())
                .distinct()
                .collect(Collectors.toList());

        sendToTokens(tokens, title, body, data);
    }

    private void sendToTokens(List<String> tokens, String title, String body, Map<String, String> data) {
        if (tokens == null || tokens.isEmpty()) {
            return;
        }

        if (firebaseApp == null || !fcmEnabled) {
            return;
        }

        List<String> validTokens = tokens.stream()
                .filter(token -> token != null && !token.isBlank())
                .distinct()
                .collect(Collectors.toList());

        if (validTokens.isEmpty()) {
            return;
        }

        if (validTokens.size() == 1) {
            Message message = Message.builder()
                    .setToken(validTokens.get(0))
                    .setNotification(Notification.builder().setTitle(title).setBody(body).build())
                    .putAllData(data == null ? Map.of() : data)
                    .build();
            try {
                FirebaseMessaging.getInstance(firebaseApp).send(message);
            } catch (FirebaseMessagingException error) {
            }
            return;
        }

        MulticastMessage message = MulticastMessage.builder()
                .addAllTokens(validTokens)
                .setNotification(Notification.builder().setTitle(title).setBody(body).build())
                .putAllData(data == null ? Map.of() : data)
                .build();

        try {
            FirebaseMessaging.getInstance(firebaseApp).sendEachForMulticast(message);
        } catch (FirebaseMessagingException error) {
        }
    }
}
