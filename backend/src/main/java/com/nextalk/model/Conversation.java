package com.nextalk.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "conversations")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Conversation {

    @Id
    private String id;

    @Builder.Default
    private ConversationType type = ConversationType.PRIVATE;

    private String name;

    private String createdById;

    private LocalDateTime createdAt;

    @Builder.Default
    private List<ConversationParticipant> participants = new ArrayList<>();

    @Builder.Default
    private boolean accepted = true;

    public enum ConversationType {
        PRIVATE,
        GROUP
    }
}
