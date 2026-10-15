package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
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
import java.time.Clock;
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
    private final GroupMemberRepository groupMemberRepository;
    private final GroupRepository groupRepository;
    private final GroupRuleValidationService ruleValidationService;
    private final SchoolClassAccessService schoolClassAccessService;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final DeadlinePolicy policy;
    private final DeadlineEventPublisher deadlineEvents;
    private final Clock clock;
    private final TermService termService;

    public DeadlineService(
            DeadlineRepository deadlineRepository,
            SchoolClassRepository schoolClassRepository,
            StudentRepository studentRepository,
            UserRepository userRepository,
            GroupMemberRepository groupMemberRepository,
            GroupRepository groupRepository,
            GroupRuleValidationService ruleValidationService,
            SchoolClassAccessService schoolClassAccessService,
            ApplicationEventPublisher applicationEventPublisher,
            DeadlinePolicy policy, DeadlineEventPublisher deadlineEvents, Clock clock, TermService termService
    ) {
        this.deadlineRepository = deadlineRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.studentRepository = studentRepository;
        this.userRepository = userRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.groupRepository = groupRepository;
        this.ruleValidationService = ruleValidationService;
        this.schoolClassAccessService = schoolClassAccessService;
        this.applicationEventPublisher = applicationEventPublisher;
        this.policy = policy;
        this.deadlineEvents = deadlineEvents;
        this.clock = clock;
        this.termService = termService;
    }

    public DeadlineDTO createDeadline(CreateDeadlineDTO dto) {
        Instant now = clock.instant();

        if (dto.getStartTime().isAfter(dto.getEndTime()) || dto.getStartTime().equals(dto.getEndTime())) {
            throw new BadRequestResourceException("End time must be after start time", "deadline", "endTimeBeforeStartTime");
        }
        if (!dto.getEndTime().isAfter(now)) {
            throw new BadRequestResourceException("End time must be in the future", "deadline", "endTimeInPast");
        }

        List<Integer> classIds = dto.getSchoolClassIds().stream().distinct().toList();
        List<SchoolClass> classes = classIds.stream().sorted().map(id -> schoolClassRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new BadRequestResourceException("Class not found", "deadline", "classNotFound"))).toList();
        for (Integer classId : classIds) {
            if (!deadlineRepository.findAllBySchoolClassId(classId).isEmpty()) {
                throw new BadRequestResourceException("This class already has a group formation session. Extend or reopen that session.", "deadline", "sessionAlreadyExists");
            }
        }
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

        Deadline saved = deadlineRepository.saveAndFlush(deadline);
        deadlineEvents.publish("DEADLINE_CREATED", saved, List.of());

        // Publish event to trigger async notifications after transaction commits
        applicationEventPublisher.publishEvent(new DeadlineCreatedEvent(saved.getId(), classIds));

        return toDTO(saved);
    }

    public DeadlineDTO updateDeadline(UpdateDeadlineDTO dto) {
        Deadline existing = deadlineRepository.findForUpdate(dto.getId())
                .orElseThrow(() -> new DataResourceNotFoundException("Deadline not found", "deadline", "notFound"));
        Instant now = clock.instant();
        Set<SchoolClass> previousClasses = new HashSet<>(existing.getSchoolClasses());

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

        policy.requireNotCancelled(existing);
        DeadlineStatus currentStatus = policy.status(existing);
        Set<Integer> scope = existing.getSchoolClasses().stream().map(SchoolClass::getId).collect(Collectors.toSet());
        if (dto.getSchoolClassIds() != null && !scope.equals(new HashSet<>(dto.getSchoolClassIds()))) {
            throw new BadRequestResourceException("Session classes cannot be changed", "deadline", "immutableClasses");
        }
        if (scope.size() > 1 && (dto.getConfirmedClassIds() == null || !scope.equals(new HashSet<>(dto.getConfirmedClassIds())))) {
            throw new BadRequestResourceException("Confirm every affected class", "deadline", "confirmClassesRequired");
        }

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
            if (!dto.getEndTime().isAfter(now) || !dto.getEndTime().isAfter(existing.getEndTime())) {
                throw new BadRequestResourceException("Reopened deadline must end in the future", "deadline", "invalidEndTime");
            }
            dto.setStartTime(existing.getStartTime());
        }

        existing.setName(dto.getName().trim());
        existing.setDescription(dto.getDescription());
        existing.setEndTime(dto.getEndTime());

        Deadline saved = deadlineRepository.saveAndFlush(existing);
        deadlineEvents.publish(currentStatus == DeadlineStatus.EXPIRED ? "DEADLINE_REOPENED" : currentStatus == DeadlineStatus.ACTIVE ? "DEADLINE_EXTENDED" : "DEADLINE_UPDATED", saved, previousClasses);
        return toDTO(saved);
    }

    @Transactional(readOnly = true)
    public Page<DeadlineDTO> getDeadlines(Pageable pageable) {
        return getDeadlines(pageable, null);
    }

    @Transactional(readOnly = true)
    public Page<DeadlineDTO> getDeadlines(Pageable pageable, Integer termId) {
        termService.validateTerm(termId);
        org.springframework.data.jpa.domain.Specification<Deadline> scope = (root, query, cb) -> {
            if (termId == null) return cb.conjunction();
            var classes = query.subquery(Integer.class);
            var schoolClass = classes.from(SchoolClass.class);
            var deadline = classes.correlate(root);
            var appliedClass = deadline.join("schoolClasses");
            classes.select(schoolClass.get("id")).where(cb.equal(schoolClass.get("id"), appliedClass.get("id")), cb.equal(schoolClass.get("termId"), termId));
            return cb.exists(classes);
        };
        if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)) {
            return deadlineRepository.findAll(scope, pageable).map(this::toDTO);
        } else if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE)
                || SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER)) {
            Long currentLecturerId = schoolClassAccessService.currentLecturerId();
            return deadlineRepository.findAll(scope.and((root, query, cb) -> {
                query.distinct(true);
                return cb.equal(root.join("schoolClasses").get("lecturerId"), currentLecturerId);
            }), pageable).map(this::toDTO);
        } else if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.STUDENT)) {
            Long currentUserId = getCurrentUserId();
            Student student = studentRepository.findById(currentUserId)
                    .orElseThrow(() -> new DataResourceNotFoundException("Student profile not found", "student", "notFound"));
            if (student.getSchoolClassId() == null) {
                return new PageImpl<>(List.of(), pageable, 0);
            }
            List<Deadline> deadlines = deadlineRepository.findAllBySchoolClassId(student.getSchoolClassId());
            List<DeadlineDTO> dtos = deadlines.stream()
                    .filter(d -> termId == null || d.getSchoolClasses().stream().anyMatch(c -> Objects.equals(c.getTermId(), termId) && Objects.equals(c.getId(), student.getSchoolClassId())))
                    .map(this::toDTO).toList();
            int start = (int) Math.min(pageable.getOffset(), dtos.size());
            return new PageImpl<>(dtos.subList(start, Math.min(start + pageable.getPageSize(), dtos.size())), pageable, dtos.size());
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

        DeadlineStatus status = policy.status(deadline);
        boolean isValid = status == DeadlineStatus.ACTIVE;

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
        Deadline deadline = deadlineRepository.findForUpdate(id)
                .orElseThrow(() -> new DataResourceNotFoundException("Deadline not found", "deadline", "notFound"));

        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)) {
            Long currentLecturerId = schoolClassAccessService.currentLecturerId();
            boolean hasOtherLecturerClassInExisting = deadline.getSchoolClasses().stream()
                    .anyMatch(sc -> !Objects.equals(sc.getLecturerId(), currentLecturerId));
            if (hasOtherLecturerClassInExisting) {
                throw new ForbiddenAlertException("You cannot delete a shared deadline containing classes of other lecturers.", "deadline", "accessDenied");
            }
        }

        if (policy.status(deadline) == DeadlineStatus.CANCELLED) return;
        deadline.setStatus("CANCELLED");
        deadline.setCancelledAt(clock.instant());
        deadline.setCancelledBy(SecurityUtils.getCurrentUserLogin().orElseThrow());
        deadlineRepository.saveAndFlush(deadline);
        deadlineEvents.publish("DEADLINE_CANCELLED", deadline, List.of());
    }

    @Transactional(readOnly = true)
    public List<StudentDeadlineActivityDTO> getMyActivities() {
        Long currentUserId = getCurrentUserId();
        Student student = studentRepository.findById(currentUserId)
                .orElseThrow(() -> new DataResourceNotFoundException("Student profile not found", "student", "notFound"));

        if (student.getSchoolClassId() == null) {
            return Collections.emptyList();
        }

        Integer classId = student.getSchoolClassId();
        SchoolClass schoolClass = schoolClassRepository.findById(classId).orElse(null);
        String className = schoolClass != null ? schoolClass.getName() : "Lớp học";

        List<Deadline> deadlines = deadlineRepository.findAllBySchoolClassId(classId);

        return deadlines.stream()
                .map(deadline -> {
                    DeadlineStatus status = policy.status(deadline);

                    StudentDeadlineActivityDTO.StudentDeadlineActivityDTOBuilder builder = StudentDeadlineActivityDTO.builder()
                            .deadlineId(deadline.getId())
                            .deadlineName(deadline.getName())
                            .deadlineDescription(deadline.getDescription())
                            .startTime(deadline.getStartTime())
                            .endTime(deadline.getEndTime())
                            .status(status)
                            .schoolClassId(classId)
                            .schoolClassName(className)
                            .hasGroup(false);

                    Optional<GroupMember> memberOpt = groupMemberRepository.findByStudentIdAndDeadlineId(currentUserId, deadline.getId());
                    if (memberOpt.isPresent()) {
                        GroupMember member = memberOpt.get();
                        Group group = groupRepository.findById(member.getGroupId()).orElse(null);
                        if (group != null && group.getStatus() != GroupStatus.DISBANDED) {
                            int memberCount = (int) groupMemberRepository.countByGroupId(group.getId());
                            int maxMembers = ruleValidationService.getMaxMembers(classId);
                            builder.hasGroup(true)
                                    .groupId(group.getId())
                                    .groupName(group.getName())
                                    .groupStatus(group.getStatus().name())
                                    .memberCount(memberCount)
                                    .maxMembers(maxMembers)
                                    .isLeader(member.getRole() == GroupMemberRole.LEADER);
                        }
                    }

                    return builder.build();
                })
                .sorted(Comparator.comparing((StudentDeadlineActivityDTO dto) -> {
                    if (dto.getStatus() == DeadlineStatus.ACTIVE) return 0;
                    if (dto.getStatus() == DeadlineStatus.UPCOMING) return 1;
                    return 2;
                }).thenComparing(StudentDeadlineActivityDTO::getEndTime, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
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
        dto.setStatus(policy.status(deadline));
        dto.setVersion(deadline.getVersion());
        dto.setCancelledAt(deadline.getCancelledAt());
        dto.setCancelledBy(deadline.getCancelledBy());
        boolean manages = canManage(deadline);
        dto.setCanCancel(manages && dto.getStatus() != DeadlineStatus.CANCELLED);
        dto.setCanEdit(manages && (dto.getStatus() == DeadlineStatus.ACTIVE || dto.getStatus() == DeadlineStatus.UPCOMING || dto.getStatus() == DeadlineStatus.EXPIRED));
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

    private boolean canManage(Deadline deadline) {
        if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)) return true;
        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE)
                && !SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER)) return false;
        Long lecturerId = schoolClassAccessService.currentLecturerId();
        return !deadline.getSchoolClasses().isEmpty() && deadline.getSchoolClasses().stream()
            .allMatch(c -> Objects.equals(c.getLecturerId(), lecturerId));
    }
}
