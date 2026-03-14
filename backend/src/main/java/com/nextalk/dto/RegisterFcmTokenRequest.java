package com.nextalk.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class RegisterFcmTokenRequest {

    @NotBlank
    private String token;
}
