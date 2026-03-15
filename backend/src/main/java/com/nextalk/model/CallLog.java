package com.nextalk.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

@Document(collection = "call_logs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CallLog {

    @Id
    private String id;

    private String callerUsername;
    private String receiverUsername;

    @Builder.Default
    private CallType callType = CallType.AUDIO;

    @Builder.Default
    private CallStatus status = CallStatus.MISSED;

    private LocalDateTime startedAt;
    private LocalDateTime endedAt;

    @Builder.Default
    private int durationSeconds = 0;

    public enum CallType {
        AUDIO,
        VIDEO
    }

    public enum CallStatus {
        MISSED,
        ANSWERED,
        DECLINED,
        ENDED
    }
}
