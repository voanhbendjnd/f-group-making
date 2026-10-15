package com.fmaking.service;

import org.springframework.stereotype.Service;
import com.fmaking.domain.SchoolClass;
import com.fmaking.repository.UserRepository;
import com.fmaking.security.AuthoritiesConstants;
import com.fmaking.security.SecurityUtils;
import com.fmaking.web.rest.errors.ForbiddenAlertException;

import java.util.Objects;

@Service
public class SchoolClassAccessService {
    private final UserRepository userRepository;

    public SchoolClassAccessService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public Long currentLecturerId() {
        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)
                && !SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE)
                && !SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER)) {
            throw denied();
        }
        // Resolve the authenticated subject, never a user ID supplied by the client.
        return SecurityUtils.getCurrentUserLogin()
                .flatMap(userRepository::findOneByEmail)
                .map(user -> user.getId())
                .orElseThrow(SchoolClassAccessService::denied);
    }

    public void requireReadAccess(SchoolClass schoolClass) {
        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)
                && !SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER)) {
            requireAssignedLecturer(schoolClass);
        }
    }

    public void requireWriteAccess(SchoolClass schoolClass) {
        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)
                && !SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER)) {
            requireAssignedLecturer(schoolClass);
        }
    }

    public void requireAssignedLecturer(SchoolClass schoolClass) {
        if (!Objects.equals(schoolClass.getLecturerId(), currentLecturerId())) {
            throw denied();
        }
    }

    private static ForbiddenAlertException denied() {
        return new ForbiddenAlertException("You cannot manage this class.", "schoolClass", "classAccessDenied");
    }
}
