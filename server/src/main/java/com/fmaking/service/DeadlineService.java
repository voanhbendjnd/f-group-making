package com.fmaking.service;

import com.fmaking.domain.Deadline;
import com.fmaking.domain.DeadlineStatus;
import com.fmaking.domain.SchoolClass;
import com.fmaking.domain.Student;
import com.fmaking.domain.User;
import com.fmaking.repository.DeadlineRepository;
import com.fmaking.repository.SchoolClassRepository;
import com.fmaking.repository.StudentRepository;
import com.fmaking.repository.UserRepository;
import com.fmaking.security.AuthoritiesConstants;
import com.fmaking.security.SecurityUtils;
import com.fmaking.service.dto.*;
import com.fmaking.service.errors.BadRequestResourceException;
import com.fmaking.service.errors.DataResourceNotFoundException;
import com.fmaking.web.rest.errors.ForbiddenAlertException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@Transactional
public class DeadlineService {

    private final DeadlineRepository deadlineRepository;
    private final SchoolClassRepository schoolClassRepository;
    private final StudentRepository studentRepository;
    private final UserRepository userRepository;
    private final SchoolClassAccessService schoolClassAccessService;
    private final ApplicationEventPublisher applicationEventPublisher;

    public DeadlineService(
            DeadlineRepository deadlineRepository,
            SchoolClassRepository schoolClassRepository,
            StudentRepository studentRepository,
            UserRepository userRepository,
            SchoolClassAccessService schoolClassAccessService,
            ApplicationEventPublisher applicationEventPublisher
    ) {
        this.deadlineRepository = deadlineRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.studentRepository = studentRepository;
        this.userRepository = userRepository;
        this.schoolClassAccessService = schoolClassAccessService;
        this.applicationEventPublisher = applicationEventPublisher;
    }

    public DeadlineDTO createDeadline(CreateDeadlineDTO dto) {
        Instant now = Instant.now();

        if (dto.getStartTime().isAfter(dto.getEndTime()) || dto.getStartTime().equals(dto.getEndTime())) {
            throw new BadRequestResourceException("End time must be after start time", "deadline", "endTimeBeforeStartTime");
        }
        if (!dto.getEndTime().isAfter(now)) {
            throw new BadRequestResourceException("End time must be in the future", "deadline", "endTimeInPast");
        }

        List<Integer> classIds = dto.getSchoolClassIds().stream().distinct().toList();
        List<SchoolClass> classes = schoolClassRepository.findAllById(classIds);
        if (classes.size() != classIds.size()) {
            throw new BadRequestResourceException("One or more school classes not found", "deadline", "classNotFound");
        }

        // Strict Ownership Check for Lecturer
        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)) {
            Long currentLecturerId = schoolClassAccessService.currentLecturerId();
            boolean hasUnauthorizedClass = classes.stream()
                    .anyMatch(sc -> !Objects.equals(sc.getLecturerId(), currentLecturerId));
            if (hasUnauthorizedClass) {
                throw new ForbiddenAlertException("You can only create deadlines for classes that you manage.", "deadline", "accessDenied");
            }
        }

        Deadline deadline = new Deadline();
        deadline.setName(dto.getName().trim());
        deadline.setDescription(dto.getDescription());
        deadline.setStartTime(dto.getStartTime());
        deadline.setEndTime(dto.getEndTime());
        deadline.setStatus("ACTIVE");
        deadline.setSchoolClasses(new HashSet<>(classes));

        Deadline saved = deadlineRepository.save(deadline);

        // Publish event to trigger async notifications after transaction commits
        applicationEventPublisher.publishEvent(new DeadlineCreatedEvent(saved.getId(), classIds));

        return toDTO(saved);
    }

    public DeadlineDTO updateDeadline(UpdateDeadlineDTO dto) {
        Instant now = Instant.now();
        Deadline existing = deadlineRepository.findByIdWithClasses(dto.getId())
                .orElseThrow(() -> new DataResourceNotFoundException("Deadline not found", "deadline", "notFound"));

        // Strict Ownership Check on EXISTING classes in DB
        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)) {
            Long currentLecturerId = schoolClassAccessService.currentLecturerId();
            boolean hasOtherLecturerClassInExisting = existing.getSchoolClasses().stream()
                    .anyMatch(sc -> !Objects.equals(sc.getLecturerId(), currentLecturerId));
            if (hasOtherLecturerClassInExisting) {
                throw new ForbiddenAlertException("You cannot edit a shared deadline containing classes of other lecturers.", "deadline", "accessDenied");
            }

            if (dto.getSchoolClassIds() != null && !dto.getSchoolClassIds().isEmpty()) {
                List<SchoolClass> newClasses = schoolClassRepository.findAllById(dto.getSchoolClassIds());
                boolean hasUnauthorizedNewClass = newClasses.stream()
                        .anyMatch(sc -> !Objects.equals(sc.getLecturerId(), currentLecturerId));
                if (hasUnauthorizedNewClass) {
                    throw new ForbiddenAlertException("You can only assign classes that you manage.", "deadline", "accessDenied");
                }
            }
        }

        DeadlineStatus currentStatus = DeadlineStatus.calculateStatus(existing.getStartTime(), existing.getEndTime(), now);

        if (currentStatus == DeadlineStatus.ACTIVE) {
            // Immutable startTime
            dto.setStartTime(existing.getStartTime());

            // Extension only: new endTime must be strictly after old endTime AND in the future
            if (!dto.getEndTime().isAfter(existing.getEndTime()) || !dto.getEndTime().isAfter(now)) {
                throw new BadRequestResourceException("Active deadline can only be extended to a future time greater than current end time", "deadline", "invalidEndTime");
            }

            // Class list is immutable while active
            // Preserve existing classes
        } else if (currentStatus == DeadlineStatus.UPCOMING) {
            if (dto.getStartTime() == null) {
                dto.setStartTime(existing.getStartTime());
            }
            if (dto.getStartTime().isBefore(now)) {
                throw new BadRequestResourceException("Start time cannot be set in the past", "deadline", "startTimeInPast");
            }
            if (!dto.getEndTime().isAfter(dto.getStartTime())) {
                throw new BadRequestResourceException("End time must be after start time", "deadline", "endTimeBeforeStartTime");
            }

            // Updatable class list for upcoming
            if (dto.getSchoolClassIds() != null && !dto.getSchoolClassIds().isEmpty()) {
                List<Integer> newClassIds = dto.getSchoolClassIds().stream().distinct().toList();
                List<SchoolClass> newClasses = schoolClassRepository.findAllById(newClassIds);
                if (newClasses.size() != newClassIds.size()) {
                    throw new BadRequestResourceException("One or more school classes not found", "deadline", "classNotFound");
                }
                existing.setSchoolClasses(new HashSet<>(newClasses));
            }
            existing.setStartTime(dto.getStartTime());
        } else { // EXPIRED
            throw new BadRequestResourceException("Expired deadline cannot be edited directly.", "deadline", "deadlineExpired");
        }

        existing.setName(dto.getName().trim());
        existing.setDescription(dto.getDescription());
        existing.setEndTime(dto.getEndTime());

        Deadline saved = deadlineRepository.save(existing);
        return toDTO(saved);
    }

    @Transactional(readOnly = true)
    public Page<DeadlineDTO> getDeadlines(Pageable pageable) {
        if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)) {
            return deadlineRepository.findAll(pageable).map(this::toDTO);
        } else if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE)
                || SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER)) {
            Long currentLecturerId = schoolClassAccessService.currentLecturerId();
            return deadlineRepository.findAllByLecturerId(currentLecturerId, pageable).map(this::toDTO);
        } else if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.STUDENT)) {
            Long currentUserId = getCurrentUserId();
            Student student = studentRepository.findById(currentUserId)
                    .orElseThrow(() -> new DataResourceNotFoundException("Student profile not found", "student", "notFound"));
            if (student.getSchoolClassId() == null) {
                return new PageImpl<>(List.of(), pageable, 0);
            }
            List<Deadline> deadlines = deadlineRepository.findAllBySchoolClassId(student.getSchoolClassId());
            List<DeadlineDTO> dtos = deadlines.stream().map(this::toDTO).toList();
            return new PageImpl<>(dtos, pageable, dtos.size());
        } else {
            throw new ForbiddenAlertException("Access denied", "deadline", "accessDenied");
        }
    }

    @Transactional(readOnly = true)
    public DeadlineDTO getDeadlineById(Integer id) {
        Deadline deadline = deadlineRepository.findByIdWithClasses(id)
                .orElseThrow(() -> new DataResourceNotFoundException("Deadline not found", "deadline", "notFound"));

        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)) {
            if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE)
                    || SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER)) {
                Long currentLecturerId = schoolClassAccessService.currentLecturerId();
                boolean isAssociatedWithLecturer = deadline.getSchoolClasses().stream()
                        .anyMatch(sc -> Objects.equals(sc.getLecturerId(), currentLecturerId));
                if (!isAssociatedWithLecturer) {
                    throw new ForbiddenAlertException("You cannot view this deadline", "deadline", "accessDenied");
                }
            } else if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.STUDENT)) {
                Long currentUserId = getCurrentUserId();
                Student student = studentRepository.findById(currentUserId)
                        .orElseThrow(() -> new DataResourceNotFoundException("Student not found", "student", "notFound"));
                boolean isStudentClassInDeadline = deadline.getSchoolClasses().stream()
                        .anyMatch(sc -> Objects.equals(sc.getId(), student.getSchoolClassId()));
                if (!isStudentClassInDeadline) {
                    throw new ForbiddenAlertException("You cannot view this deadline", "deadline", "accessDenied");
                }
            }
        }

        return toDTO(deadline);
    }

    @Transactional(readOnly = true)
    public DeadlineValidateDTO validateDeadlineForStudent(Integer deadlineId, Integer classId) {
        if (classId == null) {
            throw new BadRequestResourceException("Class ID is required for validation", "deadline", "classIdRequired");
        }

        Long currentUserId = getCurrentUserId();
        Student student = studentRepository.findById(currentUserId)
                .orElseThrow(() -> new DataResourceNotFoundException("Student profile not found", "student", "notFound"));

        if (!Objects.equals(student.getSchoolClassId(), classId)) {
            throw new ForbiddenAlertException("You do not belong to the requested class", "deadline", "classMismatch");
        }

        Deadline deadline = deadlineRepository.findByIdWithClasses(deadlineId)
                .orElseThrow(() -> new DataResourceNotFoundException("Deadline not found", "deadline", "notFound"));

        Optional<SchoolClass> targetClassOpt = deadline.getSchoolClasses().stream()
                .filter(sc -> Objects.equals(sc.getId(), classId))
                .findFirst();

        if (targetClassOpt.isEmpty()) {
            throw new BadRequestResourceException("This class is not included in the specified deadline", "deadline", "classNotInDeadline");
        }

        Instant now = Instant.now();
        DeadlineStatus status = DeadlineStatus.calculateStatus(deadline.getStartTime(), deadline.getEndTime(), now);
        boolean isValid = (status == DeadlineStatus.ACTIVE) && !"CANCELLED".equalsIgnoreCase(deadline.getStatus());

        String message;
        if ("CANCELLED".equalsIgnoreCase(deadline.getStatus())) {
            message = "Deadline đã bị hủy.";
        } else if (status == DeadlineStatus.UPCOMING) {
            message = "Thời gian chọn nhóm chưa bắt đầu.";
        } else if (status == DeadlineStatus.EXPIRED) {
            message = "Thời hạn chọn nhóm đã kết thúc.";
        } else {
            message = "Thời hạn chọn nhóm đang mở.";
        }

        return DeadlineValidateDTO.builder()
                .valid(isValid)
                .status(status)
                .deadlineId(deadline.getId())
                .name(deadline.getName())
                .description(deadline.getDescription())
                .startTime(deadline.getStartTime())
                .endTime(deadline.getEndTime())
                .classId(classId)
                .className(targetClassOpt.get().getName())
                .message(message)
                .build();
    }

    public void cancelOrDeleteDeadline(Integer id) {
        Deadline deadline = deadlineRepository.findByIdWithClasses(id)
                .orElseThrow(() -> new DataResourceNotFoundException("Deadline not found", "deadline", "notFound"));

        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)) {
            Long currentLecturerId = schoolClassAccessService.currentLecturerId();
            boolean hasOtherLecturerClassInExisting = deadline.getSchoolClasses().stream()
                    .anyMatch(sc -> !Objects.equals(sc.getLecturerId(), currentLecturerId));
            if (hasOtherLecturerClassInExisting) {
                throw new ForbiddenAlertException("You cannot delete a shared deadline containing classes of other lecturers.", "deadline", "accessDenied");
            }
        }

        deadline.setStatus("CANCELLED");
        deadlineRepository.save(deadline);
    }

    private Long getCurrentUserId() {
        return SecurityUtils.getCurrentUserLogin()
                .flatMap(userRepository::findOneByEmail)
                .map(User::getId)
                .orElseThrow(() -> new ForbiddenAlertException("User not authenticated", "deadline", "notAuthenticated"));
    }

    private DeadlineDTO toDTO(Deadline deadline) {
        DeadlineDTO dto = new DeadlineDTO();
        dto.setId(deadline.getId());
        dto.setName(deadline.getName());
        dto.setDescription(deadline.getDescription());
        dto.setStartTime(deadline.getStartTime());
        dto.setEndTime(deadline.getEndTime());
        dto.setStatus(DeadlineStatus.calculateStatus(deadline.getStartTime(), deadline.getEndTime(), Instant.now()));
        dto.setCreatedDate(deadline.getCreatedDate());
        dto.setCreatedBy(deadline.getCreatedBy());
        dto.setLastModifiedDate(deadline.getLastModifiedDate());
        dto.setLastModifiedBy(deadline.getLastModifiedBy());

        if (deadline.getSchoolClasses() != null) {
            dto.setSchoolClassIds(deadline.getSchoolClasses().stream().map(SchoolClass::getId).toList());
            dto.setSchoolClassNames(deadline.getSchoolClasses().stream().map(SchoolClass::getName).toList());
        } else {
            dto.setSchoolClassIds(List.of());
            dto.setSchoolClassNames(List.of());
        }
        return dto;
    }
}
