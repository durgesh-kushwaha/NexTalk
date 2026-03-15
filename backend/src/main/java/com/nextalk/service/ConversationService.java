package com.nextalk.service;

import com.nextalk.dto.ConversationDTO;
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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
public class ConversationService {

    @Autowired
    private ConversationRepository conversationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MessageRepository messageRepository;


    public List<ConversationDTO> getUserConversations(String username) {
        User user = getUserEntity(username);
        List<Conversation> conversations = conversationRepository.findByParticipantsUserIdOrderByCreatedAtDesc(user.getId());

        return conversations.stream()
                .map(conv -> {
                    Message lastMessage = messageRepository.findFirstByConversationIdOrderBySentAtDesc(conv.getId());
                    String lastMsg = lastMessage == null ? null : lastMessage.getContent();
                    LocalDateTime lastMsgAt = lastMessage == null ? null : lastMessage.getSentAt();

                    return toConversationDTO(conv, lastMsg, lastMsgAt);
                })
                .collect(Collectors.toList());
    }

    public ConversationDTO getConversationById(String conversationId, String username) {
        Conversation conversation = getAndValidateParticipant(conversationId, username);
        return toConversationDTO(conversation, null, null);
    }


    public ConversationDTO getOrCreatePrivateConversation(String requestingUsername, String targetUserId) {
        User requestingUser = getUserEntity(requestingUsername);
        User targetUser = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Target user not found"));

        if (requestingUser.getId().equals(targetUser.getId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot create a conversation with yourself");
        }

        Conversation existing = conversationRepository
                .findByTypeAndParticipantsUserId(Conversation.ConversationType.PRIVATE, requestingUser.getId())
                .stream()
                .filter(conversation -> conversation.getParticipants().size() == 2)
                .filter(conversation -> conversation.getParticipants().stream()
                        .map(ConversationParticipant::getUserId)
                        .collect(Collectors.toSet())
                        .containsAll(List.of(requestingUser.getId(), targetUser.getId())))
                .findFirst()
                .orElse(null);

        if (existing != null) {
            return toConversationDTO(existing, null, null);
        }

        Conversation conversation = Conversation.builder()
                .type(Conversation.ConversationType.PRIVATE)
                .createdById(requestingUser.getId())
                .createdAt(LocalDateTime.now())
                .accepted(false)
                .participants(List.of(
                    buildParticipant(requestingUser),
                    buildParticipant(targetUser)
                ))
                .build();
        conversation = conversationRepository.save(conversation);

        return toConversationDTO(conversation, null, null);
    }

    public ConversationDTO createGroupConversation(String creatorUsername, String groupName, List<String> participantIds) {
        User creator = getUserEntity(creatorUsername);

        if (groupName == null || groupName.trim().isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Group name is required");
        }
        if (participantIds == null || participantIds.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "At least one participant is required");
        }

        List<ConversationParticipant> participants = new ArrayList<>();
        participants.add(buildParticipant(creator));

        for (String userId : participantIds) {
            if (userId.equals(creator.getId())) {
                continue;
            }
            User member = userRepository.findById(userId)
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found: " + userId));
            participants.add(buildParticipant(member));
        }

        Conversation conversation = Conversation.builder()
                .type(Conversation.ConversationType.GROUP)
                .name(groupName.trim())
                .createdById(creator.getId())
                .createdAt(LocalDateTime.now())
                .accepted(true)
                .participants(participants)
                .build();
        conversation = conversationRepository.save(conversation);

        return toConversationDTO(conversation, null, null);
    }

    public void acceptConversation(String conversationId) {
        Conversation conversation = conversationRepository.findById(conversationId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Conversation not found"));
        if (!conversation.isAccepted()) {
            conversation.setAccepted(true);
            conversationRepository.save(conversation);
        }
    }


    public Conversation getAndValidateParticipant(String conversationId, String username) {
        User user = getUserEntity(username);
        Conversation conversation = conversationRepository.findById(conversationId)
                .orElseThrow(() -> new ApiException(
                    HttpStatus.NOT_FOUND, "Conversation not found: " + conversationId));

        boolean isParticipant = conversation.getParticipants().stream()
        .anyMatch(p -> p.getUserId().equals(user.getId()));

        if (!isParticipant) {
            throw new ApiException(HttpStatus.FORBIDDEN, "You are not a member of this conversation");
        }

        return conversation;
    }

        private ConversationParticipant buildParticipant(User user) {
        return ConversationParticipant.builder()
            .userId(user.getId())
            .joinedAt(LocalDateTime.now())
            .build();
        }

        private ConversationDTO toConversationDTO(Conversation conversation, String lastMessage, LocalDateTime lastMessageAt) {
        List<String> userIds = conversation.getParticipants().stream()
            .map(ConversationParticipant::getUserId)
            .toList();

        Map<String, UserDTO> usersById = userRepository.findByIdIn(userIds).stream()
            .map(UserDTO::from)
            .collect(Collectors.toMap(UserDTO::getId, user -> user));

        List<UserDTO> participants = userIds.stream()
            .map(usersById::get)
            .filter(Objects::nonNull)
            .collect(Collectors.toList());

        return ConversationDTO.from(conversation, participants, lastMessage, lastMessageAt);
    }

    private User getUserEntity(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "User not found: " + username));
    }
}
