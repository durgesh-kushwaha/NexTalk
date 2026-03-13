package com.nextalk.repository;

import com.nextalk.model.Conversation;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ConversationRepository extends MongoRepository<Conversation, String> {

    List<Conversation> findByParticipantsUserIdOrderByCreatedAtDesc(String userId);

    List<Conversation> findByParticipantsUserId(String userId);

    List<Conversation> findByTypeAndParticipantsUserId(
        Conversation.ConversationType type,
        String userId
    );
}
