package com.nextalk;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@TestPropertySource(properties = {
    "spring.data.mongodb.uri=mongodb://localhost:27017/nextalk_test",
    "nextalk.jwt.secret=dGVzdFNlY3JldEtleUZvck5leHRhbGtUZXN0aW5nT25seTIwMjQ=",
    "nextalk.jwt.expiration=3600000"
})
class NexTalkApplicationTests {

    @Test
    void contextLoads() {
    }
}
