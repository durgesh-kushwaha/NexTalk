package com.nextalk.repository;

import com.nextalk.model.CallLog;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CallLogRepository extends MongoRepository<CallLog, String> {

    List<CallLog> findByCallerUsernameOrReceiverUsernameOrderByStartedAtDesc(
        String callerUsername, String receiverUsername
    );
}
