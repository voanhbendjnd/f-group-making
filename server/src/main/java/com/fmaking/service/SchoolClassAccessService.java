package com.fmaking.service;

import org.springframework.stereotype.Service;
import com.fmaking.domain.SchoolClass;
import com.fmaking.repository.UserRepository;
import com.fmaking.security.AuthoritiesConstants;
import com.fmaking.security.SecurityUtils;
import com.fmaking.web.rest.errors.ForbiddenAlertException;

import java.util.Objects;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;

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
        if (!canViewAllClasses()) {
            requireAssignedLecturer(schoolClass);
        }
    }

    public void requireWriteAccess(SchoolClass schoolClass) {
        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)) {
            requireAssignedLecturer(schoolClass);
        }
    }

    public boolean canViewAllClasses() {
        return SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)
            || SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER);
    }

    public boolean canWrite(SchoolClass schoolClass) {
        return canWrite(schoolClass.getLecturerId());
    }

    public boolean canWrite(Long lecturerId) {
        return SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)
            || Objects.equals(lecturerId, currentLecturerId());
    }

    public ClassViewScope resolveViewScope(ClassViewScope requested) {
        ClassViewScope scope = requested == null ? (canViewAllClasses() ? ClassViewScope.ALL : ClassViewScope.MINE) : requested;
        if (scope != ClassViewScope.MINE && !canViewAllClasses()) throw denied();
        return scope;
    }

    public Predicate assignmentPredicate(Path<Long> lecturerId, ClassViewScope requested, CriteriaBuilder cb) {
        return switch (resolveViewScope(requested)) {
            case ALL -> cb.conjunction();
            case MINE -> cb.equal(lecturerId, currentLecturerId());
            case OTHERS -> cb.or(cb.isNull(lecturerId), cb.notEqual(lecturerId, currentLecturerId()));
        };
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
