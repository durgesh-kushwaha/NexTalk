package com.nextalk.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SignalMessage {

    private SignalType type;

    private String fromUsername;

    private String toUsername;

    private String data;

    private Boolean videoEnabled;


    public enum SignalType {
        CALL_REQUEST,

        CALL_ACCEPTED,

        CALL_REJECTED,

        OFFER,

        ANSWER,

        ICE_CANDIDATE,

        CALL_ENDED
    }
}
