package com.nextalk.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.ArrayList;
import java.util.List;
import java.time.LocalDateTime;

@Document(collection = "users")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    private String id;

    @Indexed(unique = true)
    private String username;

    @Indexed(unique = true)
    private String email;

    @JsonIgnore
    private String passwordHash;

    private String displayName;

    private String avatarUrl;

    private String bio;

    @Builder.Default
    private UserStatus status = UserStatus.OFFLINE;

    @Builder.Default
    private List<String> fcmTokens = new ArrayList<>();

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;


    public enum UserStatus {
        ONLINE,
        OFFLINE,
        AWAY
    }
}
