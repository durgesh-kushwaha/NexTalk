package com.nextalk.controller;

import com.nextalk.exception.ApiException;
import com.nextalk.model.Conversation;
import com.nextalk.model.ConversationParticipant;
import com.nextalk.model.Message;
import com.nextalk.model.User;
import com.nextalk.repository.ConversationRepository;
import com.nextalk.repository.MessageRepository;
import com.nextalk.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Map;
import java.util.HashMap;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MessageRepository messageRepository;

    @Autowired
    private ConversationRepository conversationRepository;

    @Value("${nextalk.media.root:${user.dir}/public}")
    private String mediaRoot;

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats(@AuthenticationPrincipal UserDetails currentUser) {
        ensureAdmin(currentUser);
        return ResponseEntity.ok(Map.of(
                "users", userRepository.count(),
                "conversations", conversationRepository.count(),
                "messages", messageRepository.count()
        ));
    }

    @GetMapping("/users")
    public ResponseEntity<List<Map<String, Object>>> getUsers(@AuthenticationPrincipal UserDetails currentUser) {
        ensureAdmin(currentUser);
        List<Map<String, Object>> rows = userRepository.findAll().stream()
                .map(this::buildUserAdminView)
                .collect(Collectors.toList());
        return ResponseEntity.ok(rows);
    }

    @PostMapping("/users/{userId}/delete-data")
    public ResponseEntity<Map<String, Object>> deleteUserData(
            @PathVariable String userId,
            @AuthenticationPrincipal UserDetails currentUser) {
        ensureAdmin(currentUser);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
        if ("durgesh".equalsIgnoreCase(user.getUsername())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot purge admin account data");
        }
        Map<String, Object> summary = purgeUserStorageAndMessages(user);
        summary.put("userId", user.getId());
        summary.put("username", user.getUsername());
        return ResponseEntity.ok(summary);
    }

    @PostMapping("/users/{userId}/delete")
    public ResponseEntity<Map<String, Object>> deleteUser(
            @PathVariable String userId,
            @AuthenticationPrincipal UserDetails currentUser) {
        ensureAdmin(currentUser);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));
        if ("durgesh".equalsIgnoreCase(user.getUsername())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot delete admin account");
        }

        Map<String, Object> summary = purgeUserStorageAndMessages(user);

        List<Conversation> conversations = conversationRepository.findByParticipantsUserId(user.getId());
        long deletedConversations = 0;
        long updatedConversations = 0;
        for (Conversation conversation : conversations) {
            List<ConversationParticipant> kept = conversation.getParticipants().stream()
                    .filter(p -> !user.getId().equals(p.getUserId()))
                    .collect(Collectors.toList());

            if (kept.size() < 2) {
                conversationRepository.deleteById(conversation.getId());
                messageRepository.deleteByConversationId(conversation.getId());
                deletedConversations++;
                continue;
            }

            conversation.setParticipants(kept);
            conversationRepository.save(conversation);
            updatedConversations++;
        }

        userRepository.deleteById(user.getId());
        summary.put("deletedConversations", deletedConversations);
        summary.put("updatedConversations", updatedConversations);
        summary.put("deletedUser", user.getUsername());
        return ResponseEntity.ok(summary);
    }

    @PostMapping("/purge/messages")
    public ResponseEntity<Map<String, String>> purgeMessages(@AuthenticationPrincipal UserDetails currentUser) {
        ensureAdmin(currentUser);
        messageRepository.deleteAll();
        return ResponseEntity.ok(Map.of("message", "All messages deleted"));
    }

    @PostMapping("/purge/all-chats")
    public ResponseEntity<Map<String, String>> purgeAllChats(@AuthenticationPrincipal UserDetails currentUser) {
        ensureAdmin(currentUser);
        messageRepository.deleteAll();
        conversationRepository.deleteAll();
        return ResponseEntity.ok(Map.of("message", "All chats deleted"));
    }

    private void ensureAdmin(UserDetails currentUser) {
        if (currentUser == null || !"durgesh".equalsIgnoreCase(currentUser.getUsername())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Admin access required");
        }
    }

    private Map<String, Object> buildUserAdminView(User user) {
        Map<String, Object> storage = calculateUserStorage(user);
        Map<String, Object> row = new HashMap<>();
        row.put("id", user.getId());
        row.put("username", user.getUsername());
        row.put("displayName", user.getDisplayName());
        row.put("email", user.getEmail());
        row.put("status", user.getStatus() == null ? "UNKNOWN" : user.getStatus().name());
        row.putAll(storage);
        return row;
    }

    private Map<String, Object> calculateUserStorage(User user) {
        List<Message> sentMessages = messageRepository.findBySenderId(user.getId());
        long textBytes = sentMessages.stream()
                .map(Message::getContent)
                .filter(content -> content != null && !content.startsWith("/media/"))
                .mapToLong(content -> content.length())
                .sum();

        long imageBytes = sentMessages.stream()
                .map(Message::getContent)
                .filter(content -> content != null && content.startsWith("/media/"))
                .mapToLong(this::safeMediaSize)
                .sum();

        long avatarBytes = safeMediaSize(user.getAvatarUrl());
        long total = textBytes + imageBytes + avatarBytes;

        Map<String, Object> values = new HashMap<>();
        values.put("messageCount", sentMessages.size());
        values.put("storageBytes", total);
        values.put("avatarBytes", avatarBytes);
        values.put("messageMediaBytes", imageBytes);
        values.put("textBytes", textBytes);
        return values;
    }

    private Map<String, Object> purgeUserStorageAndMessages(User user) {
        List<Message> sentMessages = messageRepository.findBySenderId(user.getId());
        long removedFiles = 0;
        long freedBytes = 0;

        for (Message message : sentMessages) {
            String content = message.getContent();
            if (content == null || !content.startsWith("/media/")) {
                continue;
            }
            Path path = resolveMediaPath(content);
            if (path == null) {
                continue;
            }
            try {
                if (Files.exists(path)) {
                    freedBytes += Files.size(path);
                    Files.delete(path);
                    removedFiles++;
                }
            } catch (IOException ignored) {
            }
        }

        Path avatar = resolveMediaPath(user.getAvatarUrl());
        if (avatar != null) {
            try {
                if (Files.exists(avatar)) {
                    freedBytes += Files.size(avatar);
                    Files.delete(avatar);
                    removedFiles++;
                }
            } catch (IOException ignored) {
            }
        }

        long deletedMessages = messageRepository.deleteBySenderId(user.getId());
        user.setAvatarUrl(null);
        userRepository.save(user);

        Map<String, Object> summary = new HashMap<>();
        summary.put("deletedMessages", deletedMessages);
        summary.put("removedFiles", removedFiles);
        summary.put("freedBytes", freedBytes);
        return summary;
    }

    private long safeMediaSize(String mediaPath) {
        Path path = resolveMediaPath(mediaPath);
        if (path == null) {
            return 0;
        }
        try {
            return Files.exists(path) ? Files.size(path) : 0;
        } catch (IOException ex) {
            return 0;
        }
    }

    private Path resolveMediaPath(String mediaPath) {
        if (mediaPath == null || mediaPath.isBlank()) {
            return null;
        }
        String value = mediaPath.trim();
        if (!value.startsWith("/media/")) {
            return null;
        }
        String relative = value.substring("/media/".length());
        return Paths.get(mediaRoot).resolve(relative).normalize();
    }
}