package com.nextalk.repository;

import com.nextalk.model.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MessageRepository extends MongoRepository<Message, String> {

    List<Message> findByConversationIdOrderBySentAtAsc(String conversationId, Pageable pageable);

    List<Message> findByConversationIdOrderBySentAtAsc(String conversationId);

    List<Message> findByConversationIdAndSenderIdNotOrderBySentAtAsc(String conversationId, String senderId);

    List<Message> findBySenderId(String senderId);

    long deleteBySenderId(String senderId);

    long deleteByConversationId(String conversationId);

    Message findFirstByConversationIdOrderBySentAtDesc(String conversationId);

    long countByConversationId(String conversationId);
}
