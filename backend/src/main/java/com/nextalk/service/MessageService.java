package com.nextalk.service;

import com.nextalk.dto.MessageDTO;
import com.nextalk.dto.UserDTO;
import com.nextalk.exception.ApiException;
import com.nextalk.model.Conversation;
import com.nextalk.model.ConversationParticipant;
import com.nextalk.model.Message;
import com.nextalk.model.User;
import com.nextalk.repository.ConversationRepository;
import com.nextalk.repository.MessageRepository;
import com.nextalk.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.List;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class MessageService {

    private static final long MAX_IMAGE_SIZE_BYTES = 5L * 1024L * 1024L;
    private static final Set<String> ALLOWED_IMAGE_EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif");

    @Autowired
    private MessageRepository messageRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ConversationService conversationService;

    @Autowired
    private ConversationRepository conversationRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Autowired
    private PushNotificationService pushNotificationService;

    @Value("${nextalk.media.root:${user.dir}/public}")
    private String mediaRoot;


    public List<MessageDTO> getConversationMessages(String conversationId, String username,
                                                    int page, int size) {
        conversationService.getAndValidateParticipant(conversationId, username);
        User currentUser = userRepository.findByUsername(username)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));

        int safeSize = Math.min(size, 100);
        return messageRepository.findByConversationIdOrderBySentAtAsc(
            conversationId,
            PageRequest.of(page, safeSize)
        ).stream()
         .filter(message -> message.getDeletedForUserIds() == null
             || !message.getDeletedForUserIds().contains(currentUser.getId()))
         .map(this::toMessageDTO)
         .collect(Collectors.toList());
    }


    public MessageDTO sendMessage(String conversationId, String senderUsername, String content) {
        return sendMessage(conversationId, senderUsername, content, null);
    }

    public MessageDTO sendMessage(String conversationId, String senderUsername, String content, String replyToMessageId) {
        Conversation conversation = conversationService.getAndValidateParticipant(conversationId, senderUsername);

        User sender = userRepository.findByUsername(senderUsername)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Sender not found"));

        String normalizedReplyToId = normalizeReplyToMessageId(replyToMessageId);
        Message replyToMessage = null;
        if (normalizedReplyToId != null) {
            replyToMessage = messageRepository.findById(normalizedReplyToId)
                    .filter(existing -> conversation.getId().equals(existing.getConversationId()))
                    .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Reply target not found"));
        }

        Message message = Message.builder()
                .conversationId(conversation.getId())
                .senderId(sender.getId())
                .content(content)
                .type(Message.MessageType.TEXT)
                .sentAt(LocalDateTime.now())
                .replyToMessageId(normalizedReplyToId)
                .replyToPreview(buildReplyPreview(replyToMessage))
                .build();
        message = messageRepository.save(message);

        MessageDTO dto = MessageDTO.from(message, UserDTO.from(sender));

        messagingTemplate.convertAndSend(
            "/topic/conversation/" + conversationId,
            dto
        );

        List<String> recipientUserIds = conversation.getParticipants().stream()
            .map(ConversationParticipant::getUserId)
            .filter(id -> !id.equals(sender.getId()))
            .collect(Collectors.toList());
        pushNotificationService.sendMessageNotificationToConversationParticipants(
            conversationId,
            sender.getDisplayName() != null ? sender.getDisplayName() : sender.getUsername(),
            recipientUserIds,
            content
        );

        return dto;
    }

    public MessageDTO sendImageMessage(String conversationId, String senderUsername, MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Image file is required");
        }
        String contentType = image.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Only image files are allowed");
        }
        if (image.getSize() > MAX_IMAGE_SIZE_BYTES) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Image exceeds 5MB limit");
        }

        Conversation conversation = conversationService.getAndValidateParticipant(conversationId, senderUsername);
        User sender = userRepository.findByUsername(senderUsername)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Sender not found"));

        String extension = getFileExtension(image.getOriginalFilename());
        if (!ALLOWED_IMAGE_EXTENSIONS.contains(extension)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported image format");
        }

        Path imageDir = Paths.get(mediaRoot, "chat-images");
        String fileName = "msg-" + conversation.getId() + "-" + UUID.randomUUID() + "." + extension;
        Path target = imageDir.resolve(fileName);

        try {
            Files.createDirectories(imageDir);
            try (InputStream inputStream = image.getInputStream()) {
                Files.copy(inputStream, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store image");
        }

        Message message = Message.builder()
                .conversationId(conversation.getId())
                .senderId(sender.getId())
                .content("/media/chat-images/" + fileName)
                .type(Message.MessageType.IMAGE)
                .sentAt(LocalDateTime.now())
                .build();
        message = messageRepository.save(message);

        MessageDTO dto = MessageDTO.from(message, UserDTO.from(sender));
        messagingTemplate.convertAndSend("/topic/conversation/" + conversationId, dto);

        List<String> recipientUserIds = conversation.getParticipants().stream()
            .map(ConversationParticipant::getUserId)
            .filter(id -> !id.equals(sender.getId()))
            .collect(Collectors.toList());
        pushNotificationService.sendMessageNotificationToConversationParticipants(
            conversationId,
            sender.getDisplayName() != null ? sender.getDisplayName() : sender.getUsername(),
            recipientUserIds,
            "Image"
        );

        return dto;
    }

    private MessageDTO toMessageDTO(Message message) {
        User sender = userRepository.findById(message.getSenderId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Sender not found"));
        return MessageDTO.from(message, UserDTO.from(sender));
    }

    public void deleteMessage(String conversationId, String messageId, String username, String scope) {
        Conversation conversation = conversationService.getAndValidateParticipant(conversationId, username);
        User requester = userRepository.findByUsername(username)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));

        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Message not found"));

        if (!conversation.getId().equals(message.getConversationId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Message does not belong to this conversation");
        }

        String normalizedScope = scope == null ? "me" : scope.trim().toLowerCase();
        if ("everyone".equals(normalizedScope)) {
            if (!requester.getId().equals(message.getSenderId())) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Only sender can delete for everyone");
            }
            message.setDeletedForEveryone(true);
            message.setContent("This message was deleted");
            messageRepository.save(message);
            messagingTemplate.convertAndSend(
                "/topic/conversation/" + conversationId,
                toMessageDTO(message)
            );
            return;
        }

        List<String> deletedForUsers = message.getDeletedForUserIds();
        if (deletedForUsers == null) {
            deletedForUsers = new ArrayList<>();
        }
        if (!deletedForUsers.contains(requester.getId())) {
            deletedForUsers.add(requester.getId());
        }
        message.setDeletedForUserIds(deletedForUsers);
        messageRepository.save(message);
    }

        public void markConversationDelivered(String conversationId, String username) {
        Conversation conversation = conversationService.getAndValidateParticipant(conversationId, username);
        User currentUser = userRepository.findByUsername(username)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));

        List<Message> candidates = messageRepository.findByConversationIdAndSenderIdNotOrderBySentAtAsc(
            conversation.getId(),
            currentUser.getId()
        );
        LocalDateTime now = LocalDateTime.now();
        List<Message> updated = candidates.stream()
            .filter(message -> !message.isDeletedForEveryone())
            .filter(message -> message.getDeletedForUserIds() == null
                || !message.getDeletedForUserIds().contains(currentUser.getId()))
            .filter(message -> message.getDeliveredAt() == null)
            .peek(message -> message.setDeliveredAt(now))
            .collect(Collectors.toList());

        if (updated.isEmpty()) {
            return;
        }
        messageRepository.saveAll(updated);
        updated.forEach(message -> messagingTemplate.convertAndSend(
            "/topic/conversation/" + conversationId,
            toMessageDTO(message)
        ));
        }

        public void markConversationRead(String conversationId, String username) {
        Conversation conversation = conversationService.getAndValidateParticipant(conversationId, username);
        User currentUser = userRepository.findByUsername(username)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found"));

        List<Message> candidates = messageRepository.findByConversationIdAndSenderIdNotOrderBySentAtAsc(
            conversation.getId(),
            currentUser.getId()
        );
        LocalDateTime now = LocalDateTime.now();
        List<Message> updated = candidates.stream()
            .filter(message -> !message.isDeletedForEveryone())
            .filter(message -> message.getDeletedForUserIds() == null
                || !message.getDeletedForUserIds().contains(currentUser.getId()))
            .filter(message -> message.getReadAt() == null)
            .peek(message -> {
                if (message.getDeliveredAt() == null) {
                message.setDeliveredAt(now);
                }
                message.setReadAt(now);
            })
            .collect(Collectors.toList());

        touchConversationLastReadAt(conversation, currentUser.getId(), now);

        if (updated.isEmpty()) {
            return;
        }
        messageRepository.saveAll(updated);
        updated.forEach(message -> messagingTemplate.convertAndSend(
            "/topic/conversation/" + conversationId,
            toMessageDTO(message)
        ));
        }

    private String getFileExtension(String filename) {
        if (filename == null || !filename.contains(".")) {
            return "png";
        }
        String ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
        if (ext.isBlank() || ext.length() > 10) {
            return "png";
        }
        return ext;
    }

    private void touchConversationLastReadAt(Conversation conversation, String userId, LocalDateTime now) {
        boolean changed = false;
        for (ConversationParticipant participant : conversation.getParticipants()) {
            if (!userId.equals(participant.getUserId())) {
                continue;
            }
            participant.setLastReadAt(now);
            changed = true;
            break;
        }
        if (changed) {
            conversationRepository.save(conversation);
        }
    }

    private String normalizeReplyToMessageId(String replyToMessageId) {
        if (replyToMessageId == null) {
            return null;
        }
        String value = replyToMessageId.trim();
        return value.isEmpty() ? null : value;
    }

    private String buildReplyPreview(Message replyTarget) {
        if (replyTarget == null) {
            return null;
        }
        if (replyTarget.getType() == Message.MessageType.IMAGE) {
            return "Image";
        }
        String content = replyTarget.getContent();
        if (content == null) {
            return null;
        }
        String compact = content.replaceAll("\\s+", " ").trim();
        if (compact.length() <= 80) {
            return compact;
        }
        return compact.substring(0, 77) + "...";
    }
}
