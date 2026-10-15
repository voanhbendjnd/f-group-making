package com.fmaking.service;

import com.fmaking.repository.LecturerRepository;
import com.fmaking.repository.UserRepository;
import com.fmaking.security.SecurityUtils;
import com.fmaking.service.dto.LecturerProfileDTO;
import com.fmaking.service.errors.DataResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class LecturerProfileService {
    private final UserRepository users;
    private final LecturerRepository lecturers;

    public LecturerProfileService(UserRepository users, LecturerRepository lecturers) {
        this.users = users;
        this.lecturers = lecturers;
    }

    public LecturerProfileDTO getCurrentProfile() {
        var user = SecurityUtils.getCurrentUserLogin().flatMap(users::findOneByEmail)
                .orElseThrow(() -> new DataResourceNotFoundException("User not found", "lecturerProfile", "profileNotFound"));
        var lecturer = lecturers.findById(user.getId()).orElse(null);
        String code = lecturer == null ? null : lecturer.getCode();
        return new LecturerProfileDTO(user.getName(), code, user.getEmail(), Boolean.TRUE.equals(user.getActivated()),
                lecturer != null && code != null && !code.isBlank());
    }
}
