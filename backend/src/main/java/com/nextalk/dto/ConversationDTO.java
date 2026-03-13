package com.nextalk.dto;

import com.nextalk.model.Conversation;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConversationDTO {

    private String id;
    private Conversation.ConversationType type;

    private String name;

    private List<UserDTO> participants;

    private String lastMessage;

    private LocalDateTime lastMessageAt;

    private LocalDateTime createdAt;

        public static ConversationDTO from(
            Conversation conversation,
            List<UserDTO> participantDTOs,
            String lastMsg,
            LocalDateTime lastMsgAt
        ) {
        return ConversationDTO.builder()
                .id(conversation.getId())
                .type(conversation.getType())
                .name(conversation.getName())
                .participants(participantDTOs)
                .lastMessage(lastMsg)
                .lastMessageAt(lastMsgAt)
                .createdAt(conversation.getCreatedAt())
                .build();
    }
}
