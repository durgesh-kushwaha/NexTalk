package com.nextalk.service;

import com.nextalk.dto.UserDTO;
import com.nextalk.dto.UpdateProfileRequest;
import com.nextalk.exception.ApiException;
import com.nextalk.model.User;
import com.nextalk.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Stream;
import java.util.stream.Collectors;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Value("${nextalk.media.root:${user.dir}/public}")
    private String mediaRoot;


    public List<UserDTO> getAllUsers() {
        return userRepository.findAll().stream()
                .map(UserDTO::from)
                .collect(Collectors.toList());
    }

    public UserDTO getUserById(String id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ApiException(
                    HttpStatus.NOT_FOUND, "User not found with id: " + id));
        return UserDTO.from(user);
    }

    public List<UserDTO> searchUsers(String query) {
        return userRepository
                .findTop20ByUsernameContainingIgnoreCaseOrDisplayNameContainingIgnoreCase(query, query)
                .stream()
                .map(UserDTO::from)
                .collect(Collectors.toList());
    }


    public void updateUserStatus(String username, User.UserStatus status) {
        userRepository.findByUsername(username).ifPresent(user -> {
            user.setStatus(status);
            user.setUpdatedAt(LocalDateTime.now());
            userRepository.save(user);
        });
    }

    public User getUserEntityByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new ApiException(
                    HttpStatus.NOT_FOUND, "User not found: " + username));
    }

    public UserDTO updateCurrentUser(String username, UpdateProfileRequest request) {
        User user = getUserEntityByUsername(username);

        if (request.getDisplayName() != null) {
            String displayName = request.getDisplayName().trim();
            user.setDisplayName(displayName.isEmpty() ? user.getUsername() : displayName);
        }
        if (request.getAvatarUrl() != null) {
            String avatar = request.getAvatarUrl().trim();
            user.setAvatarUrl(avatar.isEmpty() ? null : avatar);
        }
        if (request.getBio() != null) {
            String bio = request.getBio().trim();
            user.setBio(bio.isEmpty() ? null : bio);
        }

        user.setUpdatedAt(LocalDateTime.now());
        User saved = userRepository.save(user);
        return UserDTO.from(saved);
    }

    public UserDTO updateAvatar(String username, MultipartFile avatar) {
        if (avatar == null || avatar.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Avatar file is required");
        }
        if (avatar.getContentType() == null || !avatar.getContentType().startsWith("image/")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Avatar must be an image file");
        }

        User user = getUserEntityByUsername(username);
        Path avatarDir = Paths.get(mediaRoot, "avatars");
        try {
            Files.createDirectories(avatarDir);
            String extension = getFileExtension(avatar.getOriginalFilename());
            String baseName = "user-" + user.getId() + "-avatar";

            try (Stream<Path> files = Files.list(avatarDir)) {
                files.filter(path -> path.getFileName().toString().startsWith(baseName + "."))
                        .forEach(path -> {
                            try {
                                Files.deleteIfExists(path);
                            } catch (IOException ignored) {
                            }
                        });
            }

            Path target = avatarDir.resolve(baseName + "." + extension);
            Files.copy(avatar.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);

            user.setAvatarUrl("/media/avatars/" + target.getFileName());
            user.setUpdatedAt(LocalDateTime.now());
            User saved = userRepository.save(user);
            return UserDTO.from(saved);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store avatar");
        }
    }

    private String getFileExtension(String filename) {
        if (filename == null || !filename.contains(".")) {
            return "jpg";
        }
        String ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
        if (ext.isBlank() || ext.length() > 8) {
            return "jpg";
        }
        return ext;
    }
}
