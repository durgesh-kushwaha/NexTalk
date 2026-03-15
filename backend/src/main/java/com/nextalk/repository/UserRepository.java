package com.nextalk.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import com.nextalk.model.User;

@Repository
public interface UserRepository extends MongoRepository<User, String> {

    Optional<User> findByUsername(String username);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    List<User> findTop20ByUsernameContainingIgnoreCaseOrDisplayNameContainingIgnoreCase(
        String usernameQuery, String displayQuery
    );

    List<User> findByIdIn(List<String> ids);

    List<User> findByFcmTokensContaining(String token);
}
