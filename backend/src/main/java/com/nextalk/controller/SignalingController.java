package com.nextalk.controller;

import com.nextalk.dto.MessageDTO;
import com.nextalk.dto.SendMessageRequest;
import com.nextalk.dto.SignalMessage;
import com.nextalk.service.MessageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.SubscribeMapping;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
public class SignalingController {

    @Autowired
    private MessageService messageService;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;


    @MessageMapping("/chat/{conversationId}")
    public void handleChatMessage(
            @DestinationVariable String conversationId,
            @Payload SendMessageRequest request,
            Principal principal
    ) {
        messageService.sendMessage(
            conversationId,
            principal.getName(),
            request.getContent(),
            request.getReplyToMessageId()
        );

    }


    @MessageMapping("/signal")
    public void handleSignal(@Payload SignalMessage signal, Principal principal) {
        if (principal == null || principal.getName() == null || principal.getName().isBlank()) {
            return;
        }
        if (signal.getToUsername() == null || signal.getToUsername().isBlank()) {
            return;
        }
        signal.setFromUsername(principal.getName());

        messagingTemplate.convertAndSendToUser(
            signal.getToUsername(),
            "/queue/signals",
            signal
        );
        messagingTemplate.convertAndSend(
            "/topic/signals/" + signal.getToUsername(),
            signal
        );
    }
}
