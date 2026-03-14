package com.nextalk.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SendVideoNoticeRequest {

    @NotBlank(message = "Video name is required")
    private String fileName;

    private long fileSize;
}
