package com.nextalk.service;

import com.nextalk.model.CallLog;
import com.nextalk.repository.CallLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

@Service
public class CallLogService {

    @Autowired
    private CallLogRepository callLogRepository;

    /**
     * Create a new call log entry when a call is initiated.
     */
    public CallLog createCallLog(String callerUsername, String receiverUsername, boolean videoEnabled) {
        CallLog callLog = CallLog.builder()
                .callerUsername(callerUsername)
                .receiverUsername(receiverUsername)
                .callType(videoEnabled ? CallLog.CallType.VIDEO : CallLog.CallType.AUDIO)
                .status(CallLog.CallStatus.MISSED)
                .startedAt(LocalDateTime.now())
                .build();
        return callLogRepository.save(callLog);
    }

    /**
     * Update call status (e.g., ANSWERED, DECLINED).
     */
    public void updateCallStatus(String callerUsername, String receiverUsername, CallLog.CallStatus status) {
        // Find the most recent call between these users
        List<CallLog> logs = callLogRepository
                .findByCallerUsernameOrReceiverUsernameOrderByStartedAtDesc(callerUsername, callerUsername);

        Optional<CallLog> recent = logs.stream()
                .filter(log -> log.getCallerUsername().equals(callerUsername)
                        && log.getReceiverUsername().equals(receiverUsername))
                .filter(log -> log.getStatus() == CallLog.CallStatus.MISSED)
                .findFirst();

        recent.ifPresent(log -> {
            log.setStatus(status);
            if (status == CallLog.CallStatus.ENDED || status == CallLog.CallStatus.DECLINED) {
                log.setEndedAt(LocalDateTime.now());
                if (log.getStartedAt() != null && log.getEndedAt() != null) {
                    log.setDurationSeconds(
                        (int) ChronoUnit.SECONDS.between(log.getStartedAt(), log.getEndedAt())
                    );
                }
            }
            callLogRepository.save(log);
        });
    }

    /**
     * Mark a call as answered and record the answer time.
     */
    public void markCallAnswered(String callerUsername, String receiverUsername) {
        updateCallStatus(callerUsername, receiverUsername, CallLog.CallStatus.ANSWERED);
    }

    /**
     * Mark a call as ended and compute duration.
     */
    public void markCallEnded(String callerUsername, String receiverUsername) {
        List<CallLog> logs = callLogRepository
                .findByCallerUsernameOrReceiverUsernameOrderByStartedAtDesc(callerUsername, callerUsername);

        Optional<CallLog> recent = logs.stream()
                .filter(log -> (log.getCallerUsername().equals(callerUsername)
                        && log.getReceiverUsername().equals(receiverUsername))
                    || (log.getCallerUsername().equals(receiverUsername)
                        && log.getReceiverUsername().equals(callerUsername)))
                .filter(log -> log.getStatus() == CallLog.CallStatus.ANSWERED
                        || log.getStatus() == CallLog.CallStatus.MISSED)
                .findFirst();

        recent.ifPresent(log -> {
            log.setStatus(CallLog.CallStatus.ENDED);
            log.setEndedAt(LocalDateTime.now());
            if (log.getStartedAt() != null) {
                log.setDurationSeconds(
                    (int) ChronoUnit.SECONDS.between(log.getStartedAt(), log.getEndedAt())
                );
            }
            callLogRepository.save(log);
        });
    }

    /**
     * Get call history for a user (as caller or receiver).
     */
    public List<CallLog> getUserCallHistory(String username) {
        return callLogRepository
                .findByCallerUsernameOrReceiverUsernameOrderByStartedAtDesc(username, username);
    }
}
