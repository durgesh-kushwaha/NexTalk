
CREATE DATABASE IF NOT EXISTS nextalk_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE nextalk_db;

CREATE TABLE IF NOT EXISTS users (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    username      VARCHAR(50)  NOT NULL COMMENT 'Unique login handle',
    email         VARCHAR(100) NOT NULL COMMENT 'Unique email address',
    password_hash VARCHAR(255) NOT NULL COMMENT 'BCrypt hashed password',
    display_name  VARCHAR(100)          COMMENT 'Friendly display name shown in the UI',
    avatar_url    VARCHAR(500)          COMMENT 'URL to profile picture',
    status        ENUM('ONLINE','OFFLINE','AWAY') NOT NULL DEFAULT 'OFFLINE',
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uk_username (username),
    UNIQUE KEY uk_email    (email),
    INDEX idx_username (username),
    INDEX idx_email    (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
    id         BIGINT      NOT NULL AUTO_INCREMENT,
    type       ENUM('PRIVATE','GROUP') NOT NULL DEFAULT 'PRIVATE',
    name       VARCHAR(100)           COMMENT 'Group chat name; NULL for private chats',
    created_by BIGINT                 COMMENT 'User who created this conversation',
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    INDEX idx_created_by (created_by),
    CONSTRAINT fk_conversation_creator
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_participants (
    id              BIGINT    NOT NULL AUTO_INCREMENT,
    conversation_id BIGINT    NOT NULL,
    user_id         BIGINT    NOT NULL,
    joined_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_at    TIMESTAMP          COMMENT 'Timestamp of last message seen by this user',

    PRIMARY KEY (id),
    UNIQUE KEY uk_conv_user (conversation_id, user_id),
    INDEX idx_cp_user (user_id),
    CONSTRAINT fk_cp_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_cp_user
        FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
    id              BIGINT    NOT NULL AUTO_INCREMENT,
    conversation_id BIGINT    NOT NULL,
    sender_id       BIGINT    NOT NULL,
    content         TEXT      NOT NULL COMMENT 'Message text content (or media URL for non-TEXT types)',
    type            ENUM('TEXT','IMAGE','FILE') NOT NULL DEFAULT 'TEXT',
    sent_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at         TIMESTAMP          COMMENT 'Set when all participants have read this message',

    PRIMARY KEY (id),
    INDEX idx_conversation_messages (conversation_id, sent_at),
    INDEX idx_sender                (sender_id),
    CONSTRAINT fk_message_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_message_sender
        FOREIGN KEY (sender_id)       REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

