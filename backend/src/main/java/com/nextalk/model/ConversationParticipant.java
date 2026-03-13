package com.nextalk.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConversationParticipant {

    private String userId;

    private LocalDateTime joinedAt;

    private LocalDateTime lastReadAt;
}
