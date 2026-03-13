package com.nextalk.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.ArrayList;
import java.util.List;
import java.time.LocalDateTime;

@Document(collection = "messages")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Message {

    @Id
    private String id;

    @Indexed
    private String conversationId;

    private String senderId;

    private String content;

    @Builder.Default
    private MessageType type = MessageType.TEXT;

    private LocalDateTime sentAt;

    private LocalDateTime deliveredAt;

    private LocalDateTime readAt;

    private String replyToMessageId;

    private String replyToPreview;

    @Builder.Default
    private boolean deletedForEveryone = false;

    @Builder.Default
    private List<String> deletedForUserIds = new ArrayList<>();

    public enum MessageType {
        TEXT,
        IMAGE,
        FILE
    }
}
