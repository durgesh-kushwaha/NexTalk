package com.nextalk.dto;

import com.nextalk.model.Message;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MessageDTO {

    private String id;

    private String conversationId;

    private UserDTO sender;

    private String content;

    private Message.MessageType type;

    private LocalDateTime sentAt;

    private LocalDateTime deliveredAt;

    private LocalDateTime readAt;

    private String replyToMessageId;

    private String replyToPreview;

    private boolean deletedForEveryone;

    public static MessageDTO from(Message message, UserDTO sender) {
        return MessageDTO.builder()
                .id(message.getId())
                .conversationId(message.getConversationId())
                .sender(sender)
                .content(message.getContent())
                .type(message.getType())
                .sentAt(message.getSentAt())
                .deliveredAt(message.getDeliveredAt())
                .readAt(message.getReadAt())
                .replyToMessageId(message.getReplyToMessageId())
                .replyToPreview(message.getReplyToPreview())
                .deletedForEveryone(message.isDeletedForEveryone())
                .build();
    }
}
