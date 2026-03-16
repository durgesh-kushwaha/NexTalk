package com.nextalk.controller;

import com.nextalk.dto.ConversationDTO;
import com.nextalk.service.ConversationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    @Autowired
    private ConversationService conversationService;

    @GetMapping
    public ResponseEntity<List<ConversationDTO>> getUserConversations(
            @AuthenticationPrincipal UserDetails currentUser) {
        List<ConversationDTO> conversations = conversationService.getUserConversations(
            currentUser.getUsername()
        );
        return ResponseEntity.ok(conversations);
    }

    @GetMapping("/{id:[a-f0-9]{24}}")
    public ResponseEntity<ConversationDTO> getConversation(
            @PathVariable String id,
            @AuthenticationPrincipal UserDetails currentUser) {
        ConversationDTO conversation = conversationService.getConversationById(
            id, currentUser.getUsername()
        );
        return ResponseEntity.ok(conversation);
    }

    @PostMapping("/private/{targetUserId}")
    public ResponseEntity<ConversationDTO> getOrCreatePrivate(
            @PathVariable String targetUserId,
            @AuthenticationPrincipal UserDetails currentUser) {
        ConversationDTO conversation = conversationService.getOrCreatePrivateConversation(
            currentUser.getUsername(), targetUserId
        );
        return ResponseEntity.status(HttpStatus.OK).body(conversation);
    }

    @SuppressWarnings("unchecked")
    @PostMapping({"/group", "/groups"})
    public ResponseEntity<ConversationDTO> createGroup(
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserDetails currentUser) {
        String groupName = (String) body.get("name");
        List<String> participantIds = (List<String>) body.get("participantIds");
        ConversationDTO conversation = conversationService.createGroupConversation(
            currentUser.getUsername(), groupName, participantIds
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(conversation);
    }
}

