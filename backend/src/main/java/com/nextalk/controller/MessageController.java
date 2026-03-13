package com.nextalk.controller;

import com.nextalk.dto.MessageDTO;
import com.nextalk.dto.SendMessageRequest;
import com.nextalk.service.MessageService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/conversations/{conversationId}/messages")
public class MessageController {

    @Autowired
    private MessageService messageService;

    @GetMapping
    public ResponseEntity<List<MessageDTO>> getMessages(
            @PathVariable String conversationId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @AuthenticationPrincipal UserDetails currentUser) {
        List<MessageDTO> messages = messageService.getConversationMessages(
            conversationId, currentUser.getUsername(), page, size
        );
        return ResponseEntity.ok(messages);
    }

    @PostMapping
    public ResponseEntity<MessageDTO> sendMessage(
            @PathVariable String conversationId,
            @Valid @RequestBody SendMessageRequest request,
            @AuthenticationPrincipal UserDetails currentUser) {
        MessageDTO message = messageService.sendMessage(
            conversationId, currentUser.getUsername(), request.getContent(), request.getReplyToMessageId()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(message);
    }

    @PostMapping(value = "/image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MessageDTO> sendImage(
            @PathVariable String conversationId,
            @RequestPart("image") MultipartFile image,
            @AuthenticationPrincipal UserDetails currentUser) {
        MessageDTO message = messageService.sendImageMessage(
            conversationId,
            currentUser.getUsername(),
            image
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(message);
    }

    @DeleteMapping("/{messageId}")
    public ResponseEntity<Void> deleteMessage(
            @PathVariable String conversationId,
            @PathVariable String messageId,
            @RequestParam(defaultValue = "me") String scope,
            @AuthenticationPrincipal UserDetails currentUser) {
        messageService.deleteMessage(conversationId, messageId, currentUser.getUsername(), scope);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/mark-delivered")
    public ResponseEntity<Void> markDelivered(
            @PathVariable String conversationId,
            @AuthenticationPrincipal UserDetails currentUser) {
        messageService.markConversationDelivered(conversationId, currentUser.getUsername());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/mark-read")
    public ResponseEntity<Void> markRead(
            @PathVariable String conversationId,
            @AuthenticationPrincipal UserDetails currentUser) {
        messageService.markConversationRead(conversationId, currentUser.getUsername());
        return ResponseEntity.noContent().build();
    }
}
