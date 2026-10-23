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

    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager entityManager;
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

    public DeadlineDTO ensureGroupingSession(Integer classId, Integer termId) {
        SchoolClass schoolClass = schoolClassRepository.findByIdForUpdate(classId)
            .orElseThrow(() -> new DataResourceNotFoundException("Class not found", "schoolClass", "classNotFound"));
        schoolClassAccessService.requireWriteAccess(schoolClass);
        termService.validateTerm(termId);
        if (termId != null && !Objects.equals(schoolClass.getTermId(), termId)) {
            throw new BadRequestResourceException("Class does not belong to selected term", "schoolClass", "classNotInTerm");
        }
        List<Deadline> sessions = deadlineRepository.findAllBySchoolClassId(classId);
        if (sessions.size() > 1) {
            throw new com.fmaking.web.rest.errors.ConflictAlertException("Select a specific grouping session", "group", "allocationMultipleSessions");
        }
        if (!sessions.isEmpty()) return toDTO(sessions.getFirst());
        Deadline session = new Deadline();
        session.setName(schoolClass.getName());
        session.setStatus("UNSCHEDULED");
        session.setSchoolClasses(new HashSet<>(List.of(schoolClass)));
        return toDTO(deadlineRepository.saveAndFlush(session));
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
            List<Deadline> sessions = deadlineRepository.findAllBySchoolClassId(classId);
            if (classIds.size() == 1 && sessions.size() == 1 && policy.status(sessions.getFirst()) == DeadlineStatus.UNSCHEDULED) {
                schoolClassAccessService.requireWriteAccess(classes.getFirst());
                Deadline existing = deadlineRepository.findForUpdate(sessions.getFirst().getId()).orElseThrow();
                return schedule(existing, dto.getName(), dto.getDescription(), dto.getStartTime(), dto.getEndTime());
            }
            if (!sessions.isEmpty()) {
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
        checkVersion(existing, dto.getExpectedVersion());
        Instant now = clock.instant();
        Set<Integer> all = existing.getSchoolClasses().stream().map(SchoolClass::getId).collect(Collectors.toSet());
        if (dto.getSchoolClassIds() != null && !all.equals(new HashSet<>(dto.getSchoolClassIds()))) {
            throw new BadRequestResourceException("Session classes cannot be changed", "deadline", "immutableClasses");
        }
        Set<Integer> targets;
        if ("SELECTED".equals(dto.getScope())) {
            targets = dto.getTargetClassIds() == null ? Set.of() : new HashSet<>(dto.getTargetClassIds());
        } else {
            targets = new HashSet<>(all);
        }
        if (targets.isEmpty() || !all.containsAll(targets)) {
            throw new BadRequestResourceException("Select valid classes in this deadline", "deadline", "invalidTargetClasses");
        }
        List<SchoolClass> selected = existing.getSchoolClasses().stream().filter(c -> targets.contains(c.getId())).toList();
        selected.forEach(schoolClassAccessService::requireWriteAccess);
        confirmScope(targets, dto.getConfirmedClassIds());
        if (policy.status(existing) == DeadlineStatus.UNSCHEDULED) {
            if (!targets.equals(all) || !canManage(existing)) {
                throw new ForbiddenAlertException("Schedule all classes in this session", "deadline", "accessDenied");
            }
            return schedule(existing, dto.getName(), dto.getDescription(),
                dto.getStartTime() == null ? now : dto.getStartTime(), dto.getEndTime());
        }
        boolean changesMetadata = !Objects.equals(existing.getName(), dto.getName().trim())
            || !Objects.equals(description(existing.getDescription()), description(dto.getDescription()));
        if (changesMetadata && !canManage(existing)) {
            throw new ForbiddenAlertException("Only the manager of every class may edit shared metadata", "deadline", "accessDenied");
        }
        boolean upcoming = !"CANCELLED".equalsIgnoreCase(existing.getStatus()) && existing.getStartTime().isAfter(now);
        Instant start = existing.getStartTime();
        if (dto.getStartTime() != null && !dto.getStartTime().equals(start)) {
            if (!upcoming || !targets.equals(all) || !canManage(existing) || dto.getStartTime().isBefore(now)) {
                throw new BadRequestResourceException("Start time is fixed except for all upcoming classes", "deadline", "startTimeInPast");
            }
            start = dto.getStartTime();
        }
        if (!dto.getEndTime().isAfter(now) || !dto.getEndTime().isAfter(start)) {
            throw new BadRequestResourceException("Deadline must end in the future and after its start", "deadline", "invalidEndTime");
        }
        boolean reopening = false;
        for (SchoolClass c : selected) {
            DeadlineStatus state = policy.status(existing, c.getId());
            if (state == DeadlineStatus.ACTIVE && !dto.getEndTime().isAfter(existing.endTimeFor(c.getId()))) {
                throw new BadRequestResourceException("Active class deadline can only be extended", "deadline", "invalidEndTime");
            }
            reopening |= state == DeadlineStatus.EXPIRED;
        }
        // Normalize legacy cancelled sessions without reopening unselected classes.
        if ("CANCELLED".equalsIgnoreCase(existing.getStatus())) {
            Instant closed = existing.getCancelledAt() == null ? now : existing.getCancelledAt();
            if (closed.isAfter(now)) closed = now;
            existing.setEndTime(closed);
            if (existing.getStartTime().isAfter(closed)) existing.setStartTime(closed);
            for (DeadlineClassWindow w : existing.getClassWindows()) w.setEndTimeOverride(null);
            existing.setStatus("ACTIVE");
        } else {
            existing.setStartTime(start);
        }
        if (targets.equals(all)) {
            existing.setEndTime(dto.getEndTime());
            existing.getClassWindows().forEach(w -> w.setEndTimeOverride(null));
        } else {
            for (Integer classId : targets) {
                DeadlineClassWindow window = existing.getClassWindows().stream()
                    .filter(w -> w.getSchoolClassId().equals(classId)).findFirst().orElseGet(() -> {
                        var row = entityManager.find(DeadlineClassWindow.class, new DeadlineClassWindow.Key(existing.getId(), classId));
                        if (row == null) throw new IllegalStateException("Missing class/deadline link");
                        existing.getClassWindows().add(row);
                        return row;
                    });
                window.setEndTimeOverride(dto.getEndTime());
            }
        }
        existing.setName(dto.getName().trim());
        existing.setDescription(description(dto.getDescription()));
        existing.touchSchedule();
        Deadline saved = deadlineRepository.saveAndFlush(existing);
        deadlineEvents.publishForClasses(reopening ? "DEADLINE_REOPENED" : upcoming ? "DEADLINE_UPDATED" : "DEADLINE_EXTENDED", saved, targets);
        return toDTO(saved);
    }

    private DeadlineDTO schedule(Deadline deadline, String name, String description, Instant start, Instant end) {
        if (start == null || end == null || !end.isAfter(start) || !end.isAfter(clock.instant())) {
            throw new BadRequestResourceException("Deadline must end in the future and after its start", "deadline", "invalidEndTime");
        }
        deadline.setName(name.trim());
        deadline.setDescription(description(description));
        deadline.setStartTime(start);
        deadline.setEndTime(end);
        deadline.setStatus("ACTIVE");
        deadline.touchSchedule();
        Deadline saved = deadlineRepository.saveAndFlush(deadline);
        deadlineEvents.publish("DEADLINE_CREATED", saved, List.of());
        applicationEventPublisher.publishEvent(new DeadlineCreatedEvent(saved.getId(),
            saved.getSchoolClasses().stream().map(SchoolClass::getId).toList()));
        return toDTO(saved);
    }

    private void checkVersion(Deadline deadline, Long expected) {
        if (expected != null && expected != deadline.getVersion()) {
            throw new com.fmaking.web.rest.errors.ConflictAlertException("Deadline changed; refresh and try again", "deadline", "deadlineVersionConflict");
        }
    }

    private String description(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private void confirmScope(Set<Integer> targets, List<Integer> confirmed) {
        if (targets.size() > 1 && (confirmed == null || !targets.equals(new HashSet<>(confirmed)))) {
            throw new BadRequestResourceException("Confirm every affected class", "deadline", "confirmClassesRequired");
        }
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

        DeadlineStatus status = policy.status(deadline, classId);
        boolean isValid = status == DeadlineStatus.ACTIVE;

        String message;
        if ("CANCELLED".equalsIgnoreCase(deadline.getStatus())) {
            message = "Deadline đã kết thúc; có thể được mở lại bởi giáo viên.";
        } else if (status == DeadlineStatus.UNSCHEDULED) {
            message = "Lớp chưa mở thời gian chọn nhóm.";
        } else if (status == DeadlineStatus.UPCOMING) {
            message = "Thời gian chọn nhóm chưa bắt đầu.";
        } else if (status == DeadlineStatus.EXPIRED) {
            message = "Deadline chọn nhóm đã kết thúc.";
        } else {
            message = "Deadline chọn nhóm đang mở.";
        }

        return DeadlineValidateDTO.builder()
                .valid(isValid)
                .status(status)
                .deadlineId(deadline.getId())
                .name(deadline.getName())
                .description(deadline.getDescription())
                .startTime(deadline.getStartTime())
                .endTime(deadline.endTimeFor(classId))
                .classId(classId)
                .className(targetClassOpt.get().getName())
                .message(message)
                .build();
    }

    public void cancelOrDeleteDeadline(Integer id) {
        closeDeadline(id, new CloseDeadlineDTO());
    }

    public DeadlineDTO closeDeadline(Integer id, CloseDeadlineDTO request) {
        Deadline deadline = deadlineRepository.findForUpdate(id)
            .orElseThrow(() -> new DataResourceNotFoundException("Deadline not found", "deadline", "notFound"));
        checkVersion(deadline, request.getExpectedVersion());
        deadline.getSchoolClasses().forEach(schoolClassAccessService::requireWriteAccess);
        Set<Integer> scope = deadline.getSchoolClasses().stream().map(SchoolClass::getId).collect(Collectors.toSet());
        confirmScope(scope, request.getConfirmedClassIds());
        boolean active = scope.stream().anyMatch(idOfClass -> policy.status(deadline, idOfClass) == DeadlineStatus.ACTIVE);
        if (!active) {
            if (scope.stream().anyMatch(idOfClass -> policy.status(deadline, idOfClass) == DeadlineStatus.UPCOMING)) {
                throw new BadRequestResourceException("An upcoming deadline cannot be closed", "deadline", "deadlineNotActive");
            }
            return toDTO(deadline);
        }
        deadline.setEndTime(clock.instant());
        deadline.getClassWindows().forEach(w -> w.setEndTimeOverride(null));
        deadline.touchSchedule();
        deadlineRepository.saveAndFlush(deadline);
        deadlineEvents.publish("DEADLINE_CLOSED", deadline, List.of());
        return toDTO(deadline);
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
                    DeadlineStatus status = policy.status(deadline, classId);

                    StudentDeadlineActivityDTO.StudentDeadlineActivityDTOBuilder builder = StudentDeadlineActivityDTO.builder()
                            .deadlineId(deadline.getId())
                            .deadlineName(deadline.getName())
                            .deadlineDescription(deadline.getDescription())
                            .startTime(deadline.getStartTime())
                            .endTime(deadline.endTimeFor(classId))
                            .status(status)
                            .schoolClassId(classId)
                            .schoolClassName(className)
                            .hasGroup(false);

                    Optional<GroupMember> memberOpt = groupMemberRepository.findByStudentIdAndDeadlineId(currentUserId, deadline.getId());
                    if (memberOpt.isPresent()) {
                        GroupMember member = memberOpt.get();
                        Group group = groupRepository.findById(member.getGroupId()).orElse(null);
                        if (group != null && group.getStatus() != GroupStatus.DISBANDED
                                && Objects.equals(member.getSchoolClassId(), classId)
                                && Objects.equals(group.getSchoolClassId(), classId)
                                && Objects.equals(group.getDeadlineId(), deadline.getId())) {
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
        List<DeadlineClassDTO> windows = deadline.getSchoolClasses().stream().sorted(Comparator.comparing(SchoolClass::getId))
            .map(c -> new DeadlineClassDTO(c.getId(), c.getName(), deadline.getStartTime(), deadline.endTimeFor(c.getId()),
                policy.status(deadline, c.getId()), canManageClass(c))).toList();
        dto.setClassWindows(windows);
        dto.setMixedClassWindows(windows.stream().map(DeadlineClassDTO::endTime).distinct().count() > 1
            || windows.stream().map(DeadlineClassDTO::status).distinct().count() > 1);
        dto.setCanClose(manages && windows.stream().anyMatch(w -> w.status() == DeadlineStatus.ACTIVE));
        dto.setCanCancel(dto.isCanClose());
        dto.setCanEdit(windows.stream().anyMatch(DeadlineClassDTO::canEdit));
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
        if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.STUDENT)
                && !SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)
                && !SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE)
                && !SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER)) {
            studentsClassTime(deadline, dto);
        }
        return dto;
    }

    private void studentsClassTime(Deadline deadline, DeadlineDTO dto) {
        studentRepository.findById(getCurrentUserId()).ifPresent(student -> {
            dto.setEndTime(deadline.endTimeFor(student.getSchoolClassId()));
            dto.setStatus(policy.status(deadline, student.getSchoolClassId()));
            dto.setClassWindows(dto.getClassWindows().stream().filter(w -> w.schoolClassId().equals(student.getSchoolClassId())).toList());
            dto.setMixedClassWindows(false);
        });
    }

    private boolean canManageClass(SchoolClass schoolClass) {
        if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)) return true;
        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE)
                && !SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER)) return false;
        return Objects.equals(schoolClass.getLecturerId(), schoolClassAccessService.currentLecturerId());
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
