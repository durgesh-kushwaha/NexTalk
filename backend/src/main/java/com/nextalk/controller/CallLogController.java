package com.nextalk.controller;

import com.nextalk.model.CallLog;
import com.nextalk.service.CallLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/calls")
public class CallLogController {

    @Autowired
    private CallLogService callLogService;

    @GetMapping("/history")
    public ResponseEntity<List<CallLog>> getCallHistory(
            @AuthenticationPrincipal UserDetails currentUser) {
        List<CallLog> history = callLogService.getUserCallHistory(currentUser.getUsername());
        return ResponseEntity.ok(history);
    }
}
