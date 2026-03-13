package com.nextalk.service;

import com.nextalk.model.User;
import com.nextalk.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.user.SimpUser;
import org.springframework.messaging.simp.user.SimpUserRegistry;

import java.time.LocalDateTime;

@Service
public class PresenceService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SimpUserRegistry simpUserRegistry;

    @EventListener
    public void onSessionConnect(SessionConnectEvent event) {
        if (event.getUser() == null) {
            return;
        }
        String username = event.getUser().getName();
        userRepository.findByUsername(username).ifPresent(user -> {
            user.setStatus(User.UserStatus.ONLINE);
            user.setUpdatedAt(LocalDateTime.now());
            userRepository.save(user);
        });
    }

    @EventListener
    public void onSessionDisconnect(SessionDisconnectEvent event) {
        if (event.getUser() == null) {
            return;
        }
        String username = event.getUser().getName();
        SimpUser simpUser = simpUserRegistry.getUser(username);
        if (simpUser != null && !simpUser.getSessions().isEmpty()) {
            return;
        }
        userRepository.findByUsername(username).ifPresent(user -> {
            user.setStatus(User.UserStatus.OFFLINE);
            user.setUpdatedAt(LocalDateTime.now());
            userRepository.save(user);
        });
    }
}