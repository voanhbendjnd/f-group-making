package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.security.AuthoritiesConstants;
import com.fmaking.security.SecurityUtils;
import com.fmaking.service.dto.*;
import com.fmaking.service.event.GroupReviewNotificationEvent.Kind;
import com.fmaking.service.projection.StudentRow;
import com.fmaking.web.rest.errors.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import jakarta.persistence.criteria.Predicate;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional
public class GroupService {

    private final Logger log = LoggerFactory.getLogger(GroupService.class);

    private final GroupRepository groupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final GroupMemberHistoryRepository groupMemberHistoryRepository;
    private final GroupStatusHistoryRepository groupStatusHistoryRepository;
    private final GroupRuleOverrideRepository groupRuleOverrideRepository;
    private final DeadlineRepository deadlineRepository;
    private final SchoolClassRepository schoolClassRepository;
    private final StudentRepository studentRepository;
    private final UserRepository userRepository;
    private final ClassRuleService classRuleService;
    private final GroupRuleValidationService ruleValidationService;
    private final SchoolClassAccessService accessService;
    private final GroupEventPublisher eventPublisher;
    private final DeadlinePolicy deadlinePolicy;
    private final TermService termService;
    private final GroupReviewNotificationService reviewNotifications;

    public GroupService(GroupRepository groupRepository,
                        GroupMemberRepository groupMemberRepository,
                        GroupMemberHistoryRepository groupMemberHistoryRepository,
                        GroupStatusHistoryRepository groupStatusHistoryRepository,
                        GroupRuleOverrideRepository groupRuleOverrideRepository,
                        DeadlineRepository deadlineRepository,
                        SchoolClassRepository schoolClassRepository,
                        StudentRepository studentRepository,
                        UserRepository userRepository,
                        ClassRuleService classRuleService,
                        GroupRuleValidationService ruleValidationService,
                        SchoolClassAccessService accessService,
                        GroupEventPublisher eventPublisher, DeadlinePolicy deadlinePolicy, TermService termService,
                        GroupReviewNotificationService reviewNotifications) {
        this.groupRepository = groupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.groupMemberHistoryRepository = groupMemberHistoryRepository;
        this.groupStatusHistoryRepository = groupStatusHistoryRepository;
        this.groupRuleOverrideRepository = groupRuleOverrideRepository;
        this.deadlineRepository = deadlineRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.studentRepository = studentRepository;
        this.userRepository = userRepository;
        this.classRuleService = classRuleService;
        this.ruleValidationService = ruleValidationService;
        this.accessService = accessService;
        this.eventPublisher = eventPublisher;
        this.deadlinePolicy = deadlinePolicy;
        this.termService = termService;
        this.reviewNotifications = reviewNotifications;
    }

    // ==========================================
    // 1. WORKSPACE QUERY
    // ==========================================
    @Transactional(readOnly = true)
    public WorkspaceDTO getWorkspace(Integer deadlineId, Integer classId) {
        Deadline deadline = validateDeadlineExists(deadlineId, classId);
        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));

        boolean isLecturerOrAdmin = SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)
            || SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER)
            || SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE);

        Long currentUserId = resolveCurrentUserId();
        Student currentStudent = null;
        if (!isLecturerOrAdmin) {
            currentStudent = studentRepository.findById(currentUserId)
                .orElseThrow(() -> new ForbiddenAlertException("Không tìm thấy thông tin sinh viên", "group", "ERR_STUDENT_NOT_FOUND"));
            if (!Objects.equals(currentStudent.getSchoolClassId(), classId)) {
                throw new ForbiddenAlertException("Bạn không thuộc danh sách lớp học này", "group", "ERR_FORBIDDEN_NOT_IN_CLASS");
            }
        }

        if (isLecturerOrAdmin) accessService.requireReadAccess(schoolClass);
        DeadlineStatus deadlineStatus = deadlinePolicy.status(deadline, classId);
        boolean isDeadlineExpired = deadlineStatus == DeadlineStatus.EXPIRED;
        boolean studentCanWrite = deadlineStatus == DeadlineStatus.ACTIVE;
        boolean canManageGroups = isLecturerOrAdmin
            && (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)
                || Objects.equals(schoolClass.getLecturerId(), currentUserId));

        // Get all students of this class
        List<StudentRow> classStudents = studentRepository.findStudentsBySchoolClassId(classId);
        Map<Long, StudentRow> studentMap = classStudents.stream()
            .collect(Collectors.toMap(StudentRow::userId, Function.identity()));

        // Get groups of this class and deadline
        List<Group> groups = groupRepository.findBySchoolClassIdAndDeadlineId(classId, deadlineId);
        List<Long> groupIds = groups.stream().map(Group::getId).toList();

        List<GroupMember> allMembers = groupMemberRepository.findByGroupIdIn(groupIds);
        Map<Long, List<GroupMember>> membersByGroupId = allMembers.stream()
            .collect(Collectors.groupingBy(GroupMember::getGroupId));

        int maxMembersLimit = ruleValidationService.getMaxMembers(classId);

        List<GroupDTO> groupDTOs = new ArrayList<>();
        GroupDTO myGroupDTO = null;
        boolean userIsLeader = false;

        for (Group g : groups) {
            if (g.getStatus() == GroupStatus.DISBANDED) {
                continue; // Do not show disbanded groups in active workspace
            }
            List<GroupMember> groupMembers = membersByGroupId.getOrDefault(g.getId(), Collections.emptyList());
            List<GroupMemberDTO> memberDTOs = groupMembers.stream()
                .map(m -> toMemberDTO(m, studentMap.get(m.getStudentId())))
                .sorted(Comparator.comparing((GroupMemberDTO m) -> m.getRole() == GroupMemberRole.LEADER ? 0 : 1)
                    .thenComparing(GroupMemberDTO::getJoinedAt))
                .toList();

            List<GroupRuleEvaluationDTO> evaluations = ruleValidationService.evaluateGroup(classId, memberDTOs);
            boolean allPassed = ruleValidationService.areAllRulesPassed(evaluations);
            boolean hasHardViolations = ruleValidationService.hasHardRuleViolations(evaluations);

            String leaderName = studentMap.containsKey(g.getLeaderId())
                ? studentMap.get(g.getLeaderId()).fullName() : "N/A";

            GroupDTO dto = GroupDTO.builder()
                .id(g.getId())
                .deadlineId(g.getDeadlineId())
                .schoolClassId(g.getSchoolClassId())
                .sequenceNo(g.getSequenceNo())
                .name(g.getName())
                .leaderId(g.getLeaderId())
                .leaderName(leaderName)
                .status(g.getStatus())
                .memberCount(memberDTOs.size())
                .maxMembers(maxMembersLimit)
                .rejectReason(g.getRejectReason())
                .submittedRulesVersion(g.getSubmittedRulesVersion())
                .isLecturerCreated(g.getIsLecturerCreated())
                .version(g.getVersion())
                .createdDate(g.getCreatedDate())
                .members(memberDTOs)
                .ruleEvaluations(evaluations)
                .allRulesPassed(allPassed)
                .hasHardRuleViolations(hasHardViolations)
                .build();

            groupDTOs.add(dto);

            if (currentStudent != null) {
                boolean inThisGroup = groupMembers.stream()
                    .anyMatch(m -> m.getStudentId().equals(currentUserId));
                if (inThisGroup) {
                    myGroupDTO = dto;
                    userIsLeader = Objects.equals(g.getLeaderId(), currentUserId);
                }
            }
        }

        // Assigned student IDs
        Set<Long> assignedStudentIds = allMembers.stream()
            .map(GroupMember::getStudentId)
            .collect(Collectors.toSet());

        // Unassigned students
        List<GroupMemberDTO> unassigned = classStudents.stream()
            .filter(s -> !assignedStudentIds.contains(s.userId()))
            .map(s -> toMemberDTOFromRow(s, classId, deadlineId))
            .sorted(Comparator.comparing(GroupMemberDTO::getRollNumber))
            .toList();

        // Rules of class
        List<GroupingRuleDTO> classRules = ruleValidationService.getClassRules(classId);

        boolean canCreate = studentCanWrite && myGroupDTO == null && !isLecturerOrAdmin;
        boolean canJoin = studentCanWrite && myGroupDTO == null && !isLecturerOrAdmin;

        return WorkspaceDTO.builder()
            .deadlineId(deadline.getId())
            .deadlineName(deadline.getName())
            .deadlineDescription(deadline.getDescription())
            .deadlineStatus(deadlineStatus.name())
            .deadlineStartTime(deadline.getStartTime())
            .deadlineEndTime(deadline.endTimeFor(classId))
            .deadlineExpired(isDeadlineExpired)
            .readOnlyReason((isLecturerOrAdmin ? !canManageGroups : !studentCanWrite) ? deadlineStatus.name() : null)
            .canManageGroups(canManageGroups)
            .schoolClassId(schoolClass.getId())
            .schoolClassName(schoolClass.getName())
            .lecturerId(schoolClass.getLecturerId())
            .rulesVersion(schoolClass.getRulesVersion())
            .myGroup(myGroupDTO)
            .isLeader(userIsLeader)
            .groups(groupDTOs)
            .unassignedStudents(unassigned)
            .rules(classRules)
            .canCreateGroup(canCreate)
            .canJoinGroup(canJoin)
            .isLecturer(isLecturerOrAdmin)
            .build();
    }

    @Transactional(readOnly = true)
    public ResultPaginationDTO getMyGroupReviews(Integer termId, Integer classId, GroupStatus status, String search,
                                                 Pageable pageable) {
        Long lecturerId = accessService.currentLecturerId();
        termService.validateTerm(termId);
        if (classId != null) {
            SchoolClass schoolClass = schoolClassRepository.findById(classId)
                .orElseThrow(() -> new NotFoundAlertException("Class not found", "schoolClass", "classNotFound"));
            accessService.requireAssignedLecturer(schoolClass);
            if (!Objects.equals(schoolClass.getTermId(), termId)) {
                throw new BadRequestAlertException("Class does not belong to selected term", "schoolClass", "classNotInTerm");
            }
        }
        String text = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
        Specification<Group> specification = (root, query, cb) -> {
            var scope = query.subquery(Integer.class);
            var schoolClass = scope.from(SchoolClass.class);
            scope.select(schoolClass.get("id")).where(cb.equal(schoolClass.get("lecturerId"), lecturerId), cb.equal(schoolClass.get("termId"), termId));
            var predicates = new ArrayList<Predicate>();
            predicates.add(root.get("schoolClassId").in(scope));
            predicates.add(cb.notEqual(root.get("status"), GroupStatus.DISBANDED));
            if (classId != null) predicates.add(cb.equal(root.get("schoolClassId"), classId));
            if (status != null) predicates.add(cb.equal(root.get("status"), status));
            if (!text.isEmpty()) {
                String pattern = "%" + text.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
                var leaders = query.subquery(Long.class); var student = leaders.from(Student.class);
                leaders.select(student.get("userId")).where(cb.like(cb.lower(student.get("fullName")), pattern, '!'));
                predicates.add(cb.or(cb.like(cb.lower(root.get("name")), pattern, '!'), root.get("leaderId").in(leaders)));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        var paging = PageRequest.of(pageable.getPageNumber(), Math.min(pageable.getPageSize(), 50),
            Sort.by("id").descending());
        var page = groupRepository.findAll(specification, paging);
        var result = page.getContent().stream().map(group -> {
            var schoolClass = schoolClassRepository.findById(group.getSchoolClassId()).orElseThrow();
            var deadline = validateDeadlineExists(group.getDeadlineId(), group.getSchoolClassId());
            boolean eligible;
            try { evaluateCompleteGroup(group); eligible = true; }
            catch (ConflictAlertException | UnprocessableAlertException exception) { eligible = false; }
            boolean writable = deadlineRepository.findAllBySchoolClassId(schoolClass.getId()).size() == 1;
            var submittedAt = groupStatusHistoryRepository.findByGroupIdOrderByCreatedAtDesc(group.getId()).stream()
                .filter(history -> history.getToStatus() == GroupStatus.PENDING).map(GroupStatusHistory::getCreatedAt).findFirst().orElse(null);
            GroupDTO detail = getGroupDetail(group.getId(), group.getSchoolClassId(), group.getDeadlineId());
            List<GroupRuleEvaluationDTO> evaluations = new ArrayList<>(detail.getRuleEvaluations());
            int groupCount = (int) groupRepository.findBySchoolClassIdAndDeadlineId(group.getSchoolClassId(), group.getDeadlineId())
                .stream().filter(value -> value.getStatus() != GroupStatus.DISBANDED).count();
            for (GroupingRuleDTO rule : ruleValidationService.getClassRules(group.getSchoolClassId())) {
                if (rule.status() && (rule.code() == GroupingRuleCode.MIN_GROUPS_PER_CLASS || rule.code() == GroupingRuleCode.MAX_GROUPS_PER_CLASS)) {
                    boolean passed = rule.code() == GroupingRuleCode.MIN_GROUPS_PER_CLASS ? groupCount >= rule.value() : groupCount <= rule.value();
                    evaluations.add(GroupRuleEvaluationDTO.builder().code(rule.code()).ruleName(rule.code().name())
                        .targetValue(rule.value()).actualValue(groupCount).passed(passed).hardRule(false).build());
                }
            }
            detail.setRuleEvaluations(evaluations);
            detail.setAllRulesPassed(eligible);
            return new GroupReviewDTO(detail,
                schoolClass.getName(), submittedAt, deadlinePolicy.status(deadline, group.getSchoolClassId()).name(), eligible,
                writable && group.getStatus() == GroupStatus.PENDING, writable && group.getStatus() == GroupStatus.ACCEPTED);
        }).toList();
        return ResultPaginationDTO.builder().result(result).meta(ResultPaginationDTO.Meta.builder()
            .page(paging.getPageNumber() + 1).pageSize(paging.getPageSize()).total(page.getTotalElements()).pages(page.getTotalPages()).build()).build();
    }

    // ==========================================
    // 2. STUDENT OPERATIONS
    // ==========================================
    public GroupDTO createGroup(Integer deadlineId, Integer classId, CreateGroupRequest req) {
        validateDeadlineActive(deadlineId, classId);
        Student student = getCurrentStudent(classId);
        Long studentId = student.getUserId();

        // Check if student already in any active group in this deadline
        groupMemberRepository.findByStudentIdAndDeadlineId(studentId, deadlineId).ifPresent(gm -> {
            throw new ConflictAlertException("Bạn đã tham gia một nhóm khác trong đợt hạn này.", "group", "ERR_ALREADY_IN_GROUP");
        });

        // Check unique group name
        requireGroupCapacity(classId, deadlineId);
        String cleanName = req.getName().trim();
        if (groupRepository.existsBySchoolClassIdAndDeadlineIdAndNameIgnoreCaseAndStatusNot(classId, deadlineId, cleanName, GroupStatus.DISBANDED)) {
            throw new ConflictAlertException("Tên nhóm này đã tồn tại trong lớp học.", "group", "ERR_GROUP_NAME_EXISTS");
        }

        Group group = new Group();
        group.setDeadlineId(deadlineId);
        group.setSchoolClassId(classId);
        group.setSequenceNo(compactGroupSequence(classId, deadlineId) + 1);
        group.setName(cleanName);
        group.setLeaderId(studentId);
        group.setStatus(GroupStatus.OPEN);
        group.setIsLecturerCreated(false);
        group.setVersion(0L);
        Group savedGroup = groupRepository.save(group);

        GroupMember leaderMember = new GroupMember();
        leaderMember.setGroupId(savedGroup.getId());
        leaderMember.setStudentId(studentId);
        leaderMember.setDeadlineId(deadlineId);
        leaderMember.setSchoolClassId(classId);
        leaderMember.setRole(GroupMemberRole.LEADER);
        leaderMember.setJoinedAt(Instant.now());
        groupMemberRepository.save(leaderMember);

        // Audit logs
        String actor = getCurrentUserLogin();
        saveMemberHistory(savedGroup.getId(), studentId, deadlineId, GroupMemberAction.JOINED, actor, "Tạo nhóm và làm Leader");
        saveStatusHistory(savedGroup.getId(), GroupStatus.OPEN, GroupStatus.OPEN, actor, "Student created draft group");

        eventPublisher.publish("GROUP_CREATED", savedGroup.getId(), deadlineId, classId, actor, null);

        return getGroupDetail(savedGroup.getId(), classId, deadlineId);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public GroupDTO joinGroup(Integer deadlineId, Integer classId, Long groupId) {
        validateDeadlineActive(deadlineId, classId);
        Student student = getCurrentStudent(classId);
        Long studentId = student.getUserId();

        // 1. Acquire pessimistic write lock
        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);
        deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(deadlineId), classId);

        if (!Objects.equals(group.getSchoolClassId(), classId) || !Objects.equals(group.getDeadlineId(), deadlineId)) {
            throw new ForbiddenAlertException("Nhóm không thuộc đợt hạn hoặc lớp học này", "group", "ERR_FORBIDDEN_NOT_IN_CLASS");
        }

        // 2. Check group status must be OPEN
        if (!isDraft(group)) {
            throw new ConflictAlertException("Nhóm hiện không ở trạng thái mở để tham gia.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        // 3. Check if student already in any group
        if (groupMemberRepository.findByStudentIdAndDeadlineId(studentId, deadlineId).isPresent()) {
            throw new ConflictAlertException("Bạn đã tham gia một nhóm khác trong đợt hạn này.", "group", "ERR_ALREADY_IN_GROUP");
        }

        // 4. Check max members
        long currentCount = groupMemberRepository.countByGroupId(groupId);
        int maxMembersLimit = ruleValidationService.getMaxMembers(classId);
        if (currentCount >= maxMembersLimit) {
            throw new ConflictAlertException("Nhóm đã đủ số lượng thành viên tối đa.", "group", "ERR_GROUP_FULL");
        }

        requireFormationRules(group, studentId);

        // 5. Add member
        GroupMember member = new GroupMember();
        member.setGroupId(groupId);
        member.setStudentId(studentId);
        member.setDeadlineId(deadlineId);
        member.setSchoolClassId(classId);
        member.setRole(GroupMemberRole.MEMBER);
        member.setJoinedAt(Instant.now());
        groupMemberRepository.save(member);

        String actor = getCurrentUserLogin();
        saveMemberHistory(groupId, studentId, deadlineId, GroupMemberAction.JOINED, actor, "Tham gia nhóm trực tiếp");

        eventPublisher.publish("MEMBER_JOINED", groupId, deadlineId, classId, actor, null);

        return getGroupDetail(groupId, classId, deadlineId);
    }

    public void leaveGroup(Integer deadlineId, Integer classId, Long groupId) {
        validateDeadlineActive(deadlineId, classId);
        Student student = getCurrentStudent(classId);
        Long studentId = student.getUserId();

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);
        deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(deadlineId), classId);

        if (!isDraft(group)) {
            throw new ConflictAlertException("Không thể rời nhóm khi nhóm không ở trạng thái OPEN.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        GroupMember member = groupMemberRepository.findByGroupIdAndStudentId(groupId, studentId)
            .orElseThrow(() -> new NotFoundAlertException("Bạn không phải thành viên của nhóm này", "group", "ERR_NOT_MEMBER"));

        long memberCount = groupMemberRepository.countByGroupId(groupId);

        if (member.getRole() == GroupMemberRole.LEADER) {
            if (memberCount > 1) {
                throw new ConflictAlertException("Trưởng nhóm phải chuyển giao quyền Leader trước khi rời nhóm.", "group", "ERR_LEADER_CANNOT_LEAVE");
            } else {
                // If leader is the only member, leaving disbands the group
                groupMemberRepository.deleteByGroupIdAndStudentId(groupId, studentId);
                GroupStatus previousStatus = group.getStatus();
                group.setStatus(GroupStatus.DISBANDED);
                groupRepository.save(group);
                compactGroupSequence(classId, deadlineId);

                String actor = getCurrentUserLogin();
                saveMemberHistory(groupId, studentId, deadlineId, GroupMemberAction.LEFT, actor, "Rời nhóm (nhóm bị giải tán)");
                saveStatusHistory(groupId, previousStatus, GroupStatus.DISBANDED, actor, "Nhóm giải tán do Leader rời nhóm");
                eventPublisher.publish("GROUP_DISBANDED", groupId, deadlineId, classId, actor, null);
                return;
            }
        }

        groupMemberRepository.deleteByGroupIdAndStudentId(groupId, studentId);
        String actor = getCurrentUserLogin();
        saveMemberHistory(groupId, studentId, deadlineId, GroupMemberAction.LEFT, actor, "Thành viên tự rời nhóm");

        eventPublisher.publish("MEMBER_LEFT", groupId, deadlineId, classId, actor, null);
    }

    public GroupDTO transferLeader(Integer deadlineId, Integer classId, Long groupId, TransferLeaderRequest req) {
        validateDeadlineActive(deadlineId, classId);
        Student student = getCurrentStudent(classId);
        Long studentId = student.getUserId();

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);
        deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(deadlineId), classId);

        if (!isDraft(group)) {
            throw new ConflictAlertException("Chỉ có thể chuyển quyền Leader khi nhóm ở trạng thái OPEN.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        if (!Objects.equals(group.getLeaderId(), studentId)) {
            throw new ForbiddenAlertException("Chỉ trưởng nhóm mới có quyền chuyển giao vai trò Leader.", "group", "ERR_FORBIDDEN_NOT_LEADER");
        }

        Long newLeaderId = req.getNewLeaderId();
        if (Objects.equals(studentId, newLeaderId)) {
            return getGroupDetail(groupId, classId, deadlineId);
        }

        GroupMember newLeaderMember = groupMemberRepository.findByGroupIdAndStudentId(groupId, newLeaderId)
            .orElseThrow(() -> new NotFoundAlertException("Thành viên được chỉ định không thuộc nhóm này", "group", "ERR_MEMBER_NOT_FOUND"));

        GroupMember oldLeaderMember = groupMemberRepository.findByGroupIdAndStudentId(groupId, studentId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy thông tin Leader hiện tại", "group", "ERR_MEMBER_NOT_FOUND"));

        oldLeaderMember.setRole(GroupMemberRole.MEMBER);
        newLeaderMember.setRole(GroupMemberRole.LEADER);
        groupMemberRepository.save(oldLeaderMember);
        groupMemberRepository.save(newLeaderMember);

        group.setLeaderId(newLeaderId);
        groupRepository.save(group);

        String actor = getCurrentUserLogin();
        saveMemberHistory(groupId, newLeaderId, deadlineId, GroupMemberAction.TRANSFERRED_LEADER, actor, "Được bổ nhiệm làm Leader mới");

        eventPublisher.publish("LEADER_CHANGED", groupId, deadlineId, classId, actor, null);

        return getGroupDetail(groupId, classId, deadlineId);
    }

    public GroupDTO submitGroup(Integer deadlineId, Integer classId, Long groupId) {
        validateDeadlineActive(deadlineId, classId);
        Student student = getCurrentStudent(classId);
        Long studentId = student.getUserId();

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);
        deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(deadlineId), classId);

        if (!isDraft(group)) {
            throw new ConflictAlertException("Chỉ có thể nộp nhóm khi đang ở trạng thái OPEN.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        if (!Objects.equals(group.getLeaderId(), studentId)) {
            throw new ForbiddenAlertException("Chỉ trưởng nhóm mới có quyền nộp danh sách nhóm.", "group", "ERR_FORBIDDEN_NOT_LEADER");
        }

        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));

        requireCompleteGroup(group);
        GroupStatus previousStatus = group.getStatus();
        group.setStatus(GroupStatus.PENDING);
        group.setSubmittedRulesVersion(schoolClass.getRulesVersion());
        group.setRejectReason(null);
        groupRepository.save(group);

        String actor = getCurrentUserLogin();
        saveStatusHistory(groupId, previousStatus, GroupStatus.PENDING, actor, "Leader nộp danh sách nhóm lên Giảng viên");

        eventPublisher.publish("GROUP_SUBMITTED", groupId, deadlineId, classId, actor, null);

        GroupDTO result = getGroupDetail(groupId, classId, deadlineId);
        reviewNotifications.publish(Kind.SUBMITTED, result, schoolClass, actor);
        return result;
    }

    public GroupDTO cancelSubmitGroup(Integer deadlineId, Integer classId, Long groupId) {
        validateDeadlineActive(deadlineId, classId);
        Student student = getCurrentStudent(classId);
        Long studentId = student.getUserId();

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);
        deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(deadlineId), classId);

        if (group.getStatus() != GroupStatus.PENDING) {
            throw new ConflictAlertException("Chỉ có thể hủy nộp khi nhóm đang ở trạng thái PENDING.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        if (!Objects.equals(group.getLeaderId(), studentId)) {
            throw new ForbiddenAlertException("Chỉ trưởng nhóm mới có quyền hủy nộp nhóm.", "group", "ERR_FORBIDDEN_NOT_LEADER");
        }

        GroupStatus draftStatus = wasApprovalRevoked(group) ? GroupStatus.REVOKED : GroupStatus.OPEN;
        group.setStatus(draftStatus);
        groupRepository.save(group);

        String actor = getCurrentUserLogin();
        saveStatusHistory(groupId, GroupStatus.PENDING, draftStatus, actor, "Leader hủy nộp nhóm");

        eventPublisher.publish("GROUP_CANCEL_SUBMIT", groupId, deadlineId, classId, actor, null);

        return getGroupDetail(groupId, classId, deadlineId);
    }

    public void disbandGroup(Integer deadlineId, Integer classId, Long groupId) {
        validateDeadlineActive(deadlineId, classId);
        Student student = getCurrentStudent(classId);
        Long studentId = student.getUserId();

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);
        deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(deadlineId), classId);

        if (!isDraft(group)) {
            throw new ConflictAlertException("Chỉ có thể giải tán nhóm khi ở trạng thái OPEN.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        if (!Objects.equals(group.getLeaderId(), studentId)) {
            throw new ForbiddenAlertException("Chỉ trưởng nhóm mới có quyền giải tán nhóm.", "group", "ERR_FORBIDDEN_NOT_LEADER");
        }

        long count = groupMemberRepository.countByGroupId(groupId);
        if (count > 1) {
            throw new ConflictAlertException("Nhóm chỉ có thể giải tán khi không còn thành viên nào khác ngoài Leader.", "group", "ERR_DISBAND_NOT_EMPTY");
        }

        groupMemberRepository.deleteByGroupId(groupId);
        GroupStatus previousStatus = group.getStatus();
        group.setStatus(GroupStatus.DISBANDED);
        groupRepository.save(group);
        compactGroupSequence(classId, deadlineId);

        String actor = getCurrentUserLogin();
        saveMemberHistory(groupId, studentId, deadlineId, GroupMemberAction.LEFT, actor, "Leader giải tán nhóm");
        saveStatusHistory(groupId, previousStatus, GroupStatus.DISBANDED, actor, "Leader giải tán nhóm");

        eventPublisher.publish("GROUP_DISBANDED", groupId, deadlineId, classId, actor, null);
    }

    // ==========================================
    // 3. LECTURER OPERATIONS
    // ==========================================
    public GroupDTO lecturerCreateGroup(Integer deadlineId, Integer classId, LecturerCreateGroupRequest req) {
        validateManagementDeadline(deadlineId, classId);
        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));
        accessService.requireWriteAccess(schoolClass);

        requireGroupCapacity(classId, deadlineId);
        String cleanName = req.getName().trim();
        if (groupRepository.existsBySchoolClassIdAndDeadlineIdAndNameIgnoreCaseAndStatusNot(classId, deadlineId, cleanName, GroupStatus.DISBANDED)) {
            throw new ConflictAlertException("Tên nhóm này đã tồn tại trong lớp học.", "group", "ERR_GROUP_NAME_EXISTS");
        }

        List<Long> studentIds = req.getStudentIds();
        if (studentIds == null || studentIds.isEmpty()) {
            throw new BadRequestAlertException("Danh sách sinh viên không được rỗng", "group", "ERR_EMPTY_STUDENTS");
        }

        // Verify all students belong to this class and are unassigned
        List<StudentRow> classStudents = studentRepository.findStudentsBySchoolClassId(classId);
        Map<Long, StudentRow> studentMap = classStudents.stream().collect(Collectors.toMap(StudentRow::userId, Function.identity()));

        for (Long sid : studentIds) {
            if (!studentMap.containsKey(sid)) {
                throw new BadRequestAlertException("Sinh viên ID " + sid + " không thuộc lớp học này", "group", "ERR_STUDENT_NOT_IN_CLASS");
            }
            if (groupMemberRepository.findByStudentIdAndDeadlineId(sid, deadlineId).isPresent()) {
                throw new ConflictAlertException("Sinh viên " + studentMap.get(sid).fullName() + " đã thuộc nhóm khác.", "group", "ERR_ALREADY_IN_GROUP");
            }
        }

        // Validate rules
        List<GroupMemberDTO> proposedMembers = studentIds.stream()
            .map(sid -> toMemberDTOFromRow(studentMap.get(sid), classId, deadlineId))
            .toList();

        List<GroupRuleEvaluationDTO> evaluations = ruleValidationService.evaluateGroup(classId, proposedMembers);
        if (new HashSet<>(studentIds).size() != studentIds.size()) {
            throw new BadRequestAlertException("Duplicate students", "group", "ERR_ALREADY_IN_GROUP");
        }
        if (studentIds.size() > ruleValidationService.getMaxMembers(classId)) {
            throw new ConflictAlertException("Group is full", "group", "ERR_GROUP_FULL");
        }

        if (!ruleValidationService.areFormationRulesPassed(classId, proposedMembers)) {
            throw new UnprocessableAlertException("Draft exceeds active maximum rules", "group", "ERR_HARD_RULE_VIOLATED");
        }

        // Create a draft; complete rules are checked at submission and approval.
        Long leaderId = studentIds.get(0);
        Group group = new Group();
        group.setDeadlineId(deadlineId);
        group.setSchoolClassId(classId);
        group.setSequenceNo(compactGroupSequence(classId, deadlineId) + 1);
        group.setName(cleanName);
        group.setLeaderId(leaderId);
        group.setStatus(GroupStatus.OPEN);
        group.setIsLecturerCreated(true);
        group.setSubmittedRulesVersion(schoolClass.getRulesVersion());
        group.setRulesEvaluationSnapshot(ruleValidationService.serializeSnapshot(evaluations));
        Group savedGroup = groupRepository.save(group);

        // Save members
        for (int i = 0; i < studentIds.size(); i++) {
            Long sid = studentIds.get(i);
            GroupMember member = new GroupMember();
            member.setGroupId(savedGroup.getId());
            member.setStudentId(sid);
            member.setDeadlineId(deadlineId);
            member.setSchoolClassId(classId);
            member.setRole(i == 0 ? GroupMemberRole.LEADER : GroupMemberRole.MEMBER);
            member.setJoinedAt(Instant.now());
            groupMemberRepository.save(member);

            saveMemberHistory(savedGroup.getId(), sid, deadlineId, GroupMemberAction.ASSIGNED_BY_LECTURER,
                getCurrentUserLogin(), "Giảng viên phân công vào nhóm");
        }

        String actor = getCurrentUserLogin();
        saveStatusHistory(savedGroup.getId(), GroupStatus.OPEN, GroupStatus.OPEN, actor, "Lecturer created draft for allocation");

        eventPublisher.publish("GROUP_CREATED", savedGroup.getId(), deadlineId, classId, actor, null);


        return getGroupDetail(savedGroup.getId(), classId, deadlineId);
    }

    public GroupDTO acceptGroup(Integer deadlineId, Integer classId, Long groupId) {
        validateManagementDeadline(deadlineId, classId);
        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));
        accessService.requireWriteAccess(schoolClass);

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);

        if (group.getStatus() != GroupStatus.PENDING) {
            throw new ConflictAlertException("Chỉ có thể phê duyệt nhóm đang ở trạng thái PENDING.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        requireCompleteGroup(group);
        group.setSubmittedRulesVersion(schoolClass.getRulesVersion());
        group.setStatus(GroupStatus.ACCEPTED);
        group.setRejectReason(null);
        groupRepository.save(group);

        String actor = getCurrentUserLogin();
        saveStatusHistory(groupId, GroupStatus.PENDING, GroupStatus.ACCEPTED, actor, "Giảng viên chấp thuận cơ cấu thành viên nhóm");

        eventPublisher.publish("GROUP_ACCEPTED", groupId, deadlineId, classId, actor, null);

        GroupDTO result = getGroupDetail(groupId, classId, deadlineId);
        reviewNotifications.publish(Kind.ACCEPTED, result, schoolClass, actor);
        return result;
    }

    public GroupDTO rejectGroup(Integer deadlineId, Integer classId, Long groupId, RejectGroupRequest req) {
        validateManagementDeadline(deadlineId, classId);
        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));
        accessService.requireWriteAccess(schoolClass);

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);

        if (group.getStatus() != GroupStatus.PENDING) {
            throw new ConflictAlertException("Chỉ có thể từ chối nhóm đang ở trạng thái PENDING.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        String reason = req.getReason().trim();
        GroupStatus draftStatus = wasApprovalRevoked(group) ? GroupStatus.REVOKED : GroupStatus.OPEN;
        group.setStatus(draftStatus);
        group.setRejectReason(reason);
        groupRepository.save(group);

        String actor = getCurrentUserLogin();
        saveStatusHistory(groupId, GroupStatus.PENDING, draftStatus, actor, "Giảng viên từ chối: " + reason);

        eventPublisher.publish("GROUP_REJECTED", groupId, deadlineId, classId, actor, reason);

        GroupDTO result = getGroupDetail(groupId, classId, deadlineId);
        reviewNotifications.publish(Kind.REJECTED, result, schoolClass, actor);
        return result;
    }

    public GroupDTO revokeGroup(Integer deadlineId, Integer classId, Long groupId) {
        validateManagementDeadline(deadlineId, classId);
        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));
        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)) accessService.requireAssignedLecturer(schoolClass);

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);

        if (group.getStatus() != GroupStatus.ACCEPTED) {
            throw new ConflictAlertException("Chỉ có thể thu hồi phê duyệt nhóm đang ở trạng thái ACCEPTED.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        group.setStatus(GroupStatus.REVOKED);
        groupRepository.save(group);

        String actor = getCurrentUserLogin();
        saveStatusHistory(groupId, GroupStatus.ACCEPTED, GroupStatus.REVOKED, actor, "Giảng viên thu hồi quyết định phê duyệt");

        eventPublisher.publish("GROUP_UPDATED", groupId, deadlineId, classId, actor, null);

        return getGroupDetail(groupId, classId, deadlineId);
    }

    public GroupDTO lecturerAddMember(Integer deadlineId, Integer classId, Long groupId, Long studentId) {
        validateManagementDeadline(deadlineId, classId);
        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));
        accessService.requireWriteAccess(schoolClass);

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);
        requireStaffEditable(group);

        if (group.getStatus() == GroupStatus.DISBANDED) {
            throw new ConflictAlertException("Nhóm đã bị giải tán.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        Student student = studentRepository.findById(studentId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy sinh viên", "student", "ERR_STUDENT_NOT_FOUND"));

        if (!Objects.equals(student.getSchoolClassId(), classId)) {
            throw new BadRequestAlertException("Sinh viên không thuộc lớp học này", "student", "ERR_STUDENT_NOT_IN_CLASS");
        }

        // Check if student already in any group in this deadline
        groupMemberRepository.findByStudentIdAndDeadlineId(studentId, deadlineId).ifPresent(gm -> {
            throw new ConflictAlertException("Sinh viên " + student.getFullName() + " đã thuộc nhóm khác.", "group", "ERR_ALREADY_IN_GROUP");
        });

        if (groupMemberRepository.countByGroupId(groupId) >= ruleValidationService.getMaxMembers(classId)) {
            throw new ConflictAlertException("Group is full", "group", "ERR_GROUP_FULL");
        }
        requireFormationRules(group, studentId);
        // Add member
        GroupMember member = new GroupMember();
        member.setGroupId(groupId);
        member.setStudentId(studentId);
        member.setDeadlineId(deadlineId);
        member.setSchoolClassId(classId);
        member.setRole(GroupMemberRole.MEMBER);
        member.setJoinedAt(Instant.now());
        groupMemberRepository.save(member);

        String actor = getCurrentUserLogin();
        saveMemberHistory(groupId, studentId, deadlineId, GroupMemberAction.ASSIGNED_BY_LECTURER, actor, "Giảng viên thêm vào nhóm");

        eventPublisher.publish("GROUP_UPDATED", groupId, deadlineId, classId, actor, null);
        return getGroupDetail(groupId, classId, deadlineId);
    }

    public GroupDTO lecturerRemoveMember(Integer deadlineId, Integer classId, Long groupId, Long studentId) {
        validateManagementDeadline(deadlineId, classId);
        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));
        accessService.requireWriteAccess(schoolClass);

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);
        requireStaffEditable(group);

        GroupMember member = groupMemberRepository.findByGroupIdAndStudentId(groupId, studentId)
            .orElseThrow(() -> new NotFoundAlertException("Sinh viên không thuộc nhóm này", "group", "ERR_MEMBER_NOT_IN_GROUP"));

        if (groupMemberRepository.countByGroupId(groupId) <= 1) {
            throw new ConflictAlertException("Disband the group to remove its final member", "group", "ERR_DISBAND_REQUIRED");
        }
        groupMemberRepository.deleteByGroupIdAndStudentId(groupId, studentId);

        String actor = getCurrentUserLogin();
        saveMemberHistory(groupId, studentId, deadlineId, GroupMemberAction.REMOVED_BY_LECTURER, actor, "Giảng viên xóa khỏi nhóm");

        // If removed member was Leader, assign a remaining member as new leader
        if (member.getRole() == GroupMemberRole.LEADER) {
            List<GroupMember> remaining = groupMemberRepository.findByGroupId(groupId);
            if (!remaining.isEmpty()) {
                GroupMember newLeader = remaining.get(0);
                newLeader.setRole(GroupMemberRole.LEADER);
                groupMemberRepository.save(newLeader);
                group.setLeaderId(newLeader.getStudentId());
                groupRepository.save(group);
                saveMemberHistory(groupId, newLeader.getStudentId(), deadlineId, GroupMemberAction.TRANSFERRED_LEADER, actor, "Tự động đổi Trưởng nhóm mới");
            }
        }

        eventPublisher.publish("GROUP_UPDATED", groupId, deadlineId, classId, actor, null);
        return getGroupDetail(groupId, classId, deadlineId);
    }

    public GroupDTO lecturerSetLeader(Integer deadlineId, Integer classId, Long groupId, Long newLeaderId) {
        validateManagementDeadline(deadlineId, classId);
        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));
        accessService.requireWriteAccess(schoolClass);

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);
        requireStaffEditable(group);

        GroupMember newLeader = groupMemberRepository.findByGroupIdAndStudentId(groupId, newLeaderId)
            .orElseThrow(() -> new NotFoundAlertException("Sinh viên không thuộc nhóm này", "group", "ERR_MEMBER_NOT_IN_GROUP"));

        // Demote old leader
        groupMemberRepository.findByGroupIdAndRole(groupId, GroupMemberRole.LEADER).ifPresent(old -> {
            old.setRole(GroupMemberRole.MEMBER);
            groupMemberRepository.save(old);
        });

        newLeader.setRole(GroupMemberRole.LEADER);
        groupMemberRepository.save(newLeader);

        group.setLeaderId(newLeaderId);
        groupRepository.save(group);

        String actor = getCurrentUserLogin();
        saveMemberHistory(groupId, newLeaderId, deadlineId, GroupMemberAction.TRANSFERRED_LEADER, actor, "Giảng viên chỉ định làm Trưởng nhóm");

        eventPublisher.publish("GROUP_UPDATED", groupId, deadlineId, classId, actor, null);
        return getGroupDetail(groupId, classId, deadlineId);
    }

    public void lecturerDisbandGroup(Integer deadlineId, Integer classId, Long groupId) {
        validateManagementDeadline(deadlineId, classId);
        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));
        accessService.requireWriteAccess(schoolClass);

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);
        requireStaffEditable(group);

        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        String actor = getCurrentUserLogin();
        for (GroupMember m : members) {
            saveMemberHistory(groupId, m.getStudentId(), deadlineId, GroupMemberAction.LEFT, actor, "Giảng viên giải tán nhóm");
        }

        groupMemberRepository.deleteByGroupId(groupId);
        GroupStatus previousStatus = group.getStatus();
        group.setStatus(GroupStatus.DISBANDED);
        groupRepository.save(group);
        compactGroupSequence(classId, deadlineId);

        saveStatusHistory(groupId, previousStatus, GroupStatus.DISBANDED, actor, "Giảng viên giải tán nhóm");
        eventPublisher.publish("GROUP_DISBANDED", groupId, deadlineId, classId, actor, null);
    }

    // ==========================================
    // 4. HELPER METHODS
    // ==========================================

    private boolean wasApprovalRevoked(Group group) {
        return groupStatusHistoryRepository.existsByGroupIdAndToStatus(group.getId(), GroupStatus.REVOKED);
    }

    private boolean isDraft(Group group) {
        return group.getStatus() == GroupStatus.OPEN || group.getStatus() == GroupStatus.REVOKED;
    }

    private void requireStaffEditable(Group group) {
        if (!isDraft(group)) {
            throw new ConflictAlertException("Only draft groups can be edited. Unlock approved groups or reject pending groups first.", "group", "ERR_GROUP_STATE_CONFLICT");
        }
    }

    private void requireGroupCapacity(Integer classId, Integer deadlineId) {
        long count = groupRepository.findBySchoolClassIdAndDeadlineId(classId, deadlineId).stream()
            .filter(group -> group.getStatus() != GroupStatus.DISBANDED).count();
        boolean full = ruleValidationService.getClassRules(classId).stream()
            .anyMatch(rule -> rule.code() == GroupingRuleCode.MAX_GROUPS_PER_CLASS && rule.status() && count >= rule.value());
        if (full) {
            throw new UnprocessableAlertException("Class reached its configured group maximum", "group", "ERR_HARD_RULE_VIOLATED");
        }
    }

    private void requireFormationRules(Group group, Long studentId) {
        Map<Long, StudentRow> students = studentRepository.findStudentsBySchoolClassId(group.getSchoolClassId()).stream()
            .collect(Collectors.toMap(StudentRow::userId, Function.identity()));
        List<GroupMemberDTO> proposed = new ArrayList<>(groupMemberRepository.findByGroupId(group.getId()).stream()
            .map(member -> toMemberDTO(member, students.get(member.getStudentId()))).toList());
        proposed.add(toMemberDTOFromRow(students.get(studentId), group.getSchoolClassId(), group.getDeadlineId()));
        if (!ruleValidationService.areFormationRulesPassed(group.getSchoolClassId(), proposed)) {
            throw new UnprocessableAlertException("Draft exceeds active maximum rules", "group", "ERR_HARD_RULE_VIOLATED");
        }
    }

    private void requireCompleteGroup(Group group) {
        group.setRulesEvaluationSnapshot(ruleValidationService.serializeSnapshot(evaluateCompleteGroup(group)));
    }

    private List<GroupRuleEvaluationDTO> evaluateCompleteGroup(Group group) {
        List<StudentRow> rows = studentRepository.findStudentsBySchoolClassId(group.getSchoolClassId());
        Map<Long, StudentRow> students = rows.stream().collect(Collectors.toMap(StudentRow::userId, Function.identity()));
        List<GroupMember> storedMembers = groupMemberRepository.findByGroupId(group.getId());
        if (storedMembers.isEmpty() || storedMembers.stream().anyMatch(member -> !students.containsKey(member.getStudentId())
                    || !Objects.equals(member.getSchoolClassId(), group.getSchoolClassId())
                    || !Objects.equals(member.getDeadlineId(), group.getDeadlineId()))
                || storedMembers.stream().map(GroupMember::getStudentId).distinct().count() != storedMembers.size()
                || storedMembers.stream().filter(member -> member.getRole() == GroupMemberRole.LEADER).count() != 1
                || storedMembers.stream().noneMatch(member -> member.getRole() == GroupMemberRole.LEADER && Objects.equals(member.getStudentId(), group.getLeaderId()))) {
            throw new ConflictAlertException("Invalid group membership or leader", "group", "ERR_GROUP_STATE_CONFLICT");
        }
        List<GroupMemberDTO> members = storedMembers.stream()
            .map(member -> toMemberDTO(member, students.get(member.getStudentId()))).toList();
        var evaluations = ruleValidationService.evaluateGroup(group.getSchoolClassId(), members);
        if (!ruleValidationService.areAllRulesPassed(evaluations)) {
            throw new UnprocessableAlertException("Group rules must pass before submission or approval", "group", "ERR_HARD_RULE_VIOLATED");
        }
        long groupCount = groupRepository.findBySchoolClassIdAndDeadlineId(group.getSchoolClassId(), group.getDeadlineId()).stream()
            .filter(value -> value.getStatus() != GroupStatus.DISBANDED).count();
        for (GroupingRuleDTO rule : ruleValidationService.getClassRules(group.getSchoolClassId())) {
            if (rule.status() && ((rule.code() == GroupingRuleCode.MIN_GROUPS_PER_CLASS && groupCount < rule.value())
                    || (rule.code() == GroupingRuleCode.MAX_GROUPS_PER_CLASS && groupCount > rule.value()))) {
                throw new UnprocessableAlertException("Class group count violates active rules", "group", "ERR_HARD_RULE_VIOLATED");
            }
        }
        return evaluations;
    }

    public GroupDTO lecturerSubmitGroup(Integer deadlineId, Integer classId, Long groupId) {
        validateManagementDeadline(deadlineId, classId);
        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);
        requireStaffEditable(group);
        requireCompleteGroup(group);
        GroupStatus previous = group.getStatus();
        group.setStatus(GroupStatus.PENDING);
        group.setSubmittedRulesVersion(schoolClassRepository.findById(classId).orElseThrow().getRulesVersion());
        group.setRejectReason(null);
        groupRepository.save(group);
        saveStatusHistory(groupId, previous, GroupStatus.PENDING, getCurrentUserLogin(), "Submitted for review by lecturer");
        eventPublisher.publish("GROUP_SUBMITTED", groupId, deadlineId, classId, getCurrentUserLogin(), null);
        return getGroupDetail(groupId, classId, deadlineId);
    }

    public GroupDTO lecturerMoveMember(Integer deadlineId, Integer classId, Long sourceId, Long targetId, Long studentId) {
        validateManagementDeadline(deadlineId, classId);
        Group source = findScopedGroupForUpdate(sourceId, deadlineId, classId);
        Group target = findScopedGroupForUpdate(targetId, deadlineId, classId);
        requireStaffEditable(source);
        requireStaffEditable(target);
        if (Objects.equals(sourceId, targetId)) return getGroupDetail(sourceId, classId, deadlineId);
        if (groupMemberRepository.countByGroupId(sourceId) == 1) {
            groupMemberRepository.findByGroupIdAndStudentId(sourceId, studentId)
                .orElseThrow(() -> new ConflictAlertException("Not a member", "group", "ERR_MEMBER_NOT_IN_GROUP"));
            lecturerDisbandGroup(deadlineId, classId, sourceId);
        } else {
            lecturerRemoveMember(deadlineId, classId, sourceId, studentId);
        }
        groupMemberRepository.flush();
        return lecturerAddMember(deadlineId, classId, targetId, studentId);
    }

    /** Invitation mutations serialize with membership/review/allocation on the class row. */
    public void lockStudentSession(Integer deadlineId, Integer classId, boolean active) {
        schoolClassRepository.findByIdForUpdate(classId)
            .orElseThrow(() -> new NotFoundAlertException("Class not found", "schoolClass", "classNotFound"));
        getCurrentStudent(classId);
        Deadline deadline = lockDeadlineForMutation(deadlineId, classId);
        if (active) deadlinePolicy.requireStudentWrite(deadline, classId);
    }

    public record MaterializedAllocation(List<AllocationPreviewDTO.GroupView> groups, Map<String, Long> createdGroupIds) {}

    /** Called only inside Atomic Apply, after scope/data locks and the live fingerprint check. */
    public MaterializedAllocation materializeAllocationGroups(Integer deadlineId, Integer classId,
                                                               List<AllocationPreviewDTO.GroupView> plan) {
        validateManagementDeadline(deadlineId, classId);
        List<Group> existing = groupRepository.findBySchoolClassIdAndDeadlineId(classId, deadlineId).stream()
            .filter(group -> group.getStatus() != GroupStatus.DISBANDED).toList();
        long newCount = plan.stream().filter(AllocationPreviewDTO.GroupView::newGroup).count();
        if (newCount != Math.max(0, plan.size() - existing.size())
                || plan.stream().map(AllocationPreviewDTO.GroupView::key).distinct().count() != plan.size()) throw allocationConflict();
        if (newCount == 0) return new MaterializedAllocation(plan, Map.of());
        int nextSequence = compactGroupSequence(classId, deadlineId);
        Map<String, Long> created = new LinkedHashMap<>();
        List<AllocationPreviewDTO.GroupView> resolved = new ArrayList<>();
        String actor = getCurrentUserLogin();
        for (var proposed : plan) {
            if (!proposed.newGroup()) { resolved.add(proposed); continue; }
            String name = proposed.name() == null ? "" : proposed.name().trim();
            if (proposed.groupId() != null || proposed.protectedGroup() || proposed.status() != GroupStatus.OPEN
                    || proposed.planGroupKey() == null || !proposed.planGroupKey().startsWith("new:")
                    || name.length() < 2 || name.length() > 100 || proposed.members().isEmpty()
                    || !Objects.equals(proposed.leaderId(), proposed.members().stream().map(GroupMemberDTO::getStudentId).min(Long::compareTo).orElseThrow())
                    || groupRepository.existsBySchoolClassIdAndDeadlineIdAndNameIgnoreCaseAndStatusNot(classId, deadlineId, name, GroupStatus.DISBANDED))
                throw allocationConflict();
            Group group = new Group(); group.setSchoolClassId(classId); group.setDeadlineId(deadlineId);
            group.setSequenceNo(++nextSequence); group.setName(name); group.setLeaderId(proposed.leaderId());
            group.setStatus(GroupStatus.OPEN); group.setIsLecturerCreated(true);
            group = groupRepository.saveAndFlush(group);
            created.put(proposed.key(), group.getId());
            saveStatusHistory(group.getId(), GroupStatus.OPEN, GroupStatus.OPEN, actor, "Automatic allocation created draft group");
            eventPublisher.publish("GROUP_CREATED", group.getId(), deadlineId, classId, actor, null);
            resolved.add(new AllocationPreviewDTO.GroupView(group.getId(), name, GroupStatus.OPEN, proposed.leaderId(), proposed.leaderName(),
                false, proposed.members(), proposed.score(), proposed.rules(), proposed.allRulesPassed(), proposed.key(), true));
        }
        return new MaterializedAllocation(List.copyOf(resolved), Collections.unmodifiableMap(created));
    }

    /** Internal atomic allocation path: domain checks precede writes and ordinary submit/accept enforce completion. */
    public List<Long> applyAllocationPlan(Integer deadlineId, Integer classId, List<AllocationPreviewDTO.GroupView> plan) {
        validateManagementDeadline(deadlineId, classId);
        List<Group> existing = groupRepository.findBySchoolClassIdAndDeadlineId(classId, deadlineId).stream()
            .filter(group -> group.getStatus() != GroupStatus.DISBANDED).toList();
        Map<Long, Group> byId = existing.stream().collect(Collectors.toMap(Group::getId, Function.identity()));
        Map<Long, StudentRow> students = studentRepository.findStudentsBySchoolClassId(classId).stream()
            .collect(Collectors.toMap(StudentRow::userId, Function.identity()));
        Set<Long> seen = new HashSet<>(), kept = new HashSet<>();
        Map<Long, GroupMember> current = groupMemberRepository.findBySchoolClassIdAndDeadlineId(classId, deadlineId).stream()
            .collect(Collectors.toMap(GroupMember::getStudentId, Function.identity()));
        for (var proposed : plan) {
            Group group = byId.get(proposed.groupId());
            if (group == null || !kept.add(group.getId()) || group.getStatus() != proposed.status()) throw allocationConflict();
            boolean fixed = group.getStatus() == GroupStatus.PENDING || group.getStatus() == GroupStatus.ACCEPTED;
            if (fixed != proposed.protectedGroup() || proposed.members().isEmpty()) throw allocationConflict();
            long leaders = 0;
            List<GroupMemberDTO> actualMembers = new ArrayList<>();
            for (var member : proposed.members()) {
                if (!students.containsKey(member.getStudentId()) || !seen.add(member.getStudentId())) throw allocationConflict();
                if (member.getRole() == GroupMemberRole.LEADER) {
                    leaders++;
                    if (!Objects.equals(member.getStudentId(), proposed.leaderId())) throw allocationConflict();
                } else if (member.getRole() != GroupMemberRole.MEMBER) throw allocationConflict();
                GroupMember old = current.get(member.getStudentId());
                if (fixed && (old == null || !old.getGroupId().equals(group.getId()) || old.getRole() != member.getRole())) throw allocationConflict();
                if (!fixed && old != null && byId.containsKey(old.getGroupId())
                    && (byId.get(old.getGroupId()).getStatus() == GroupStatus.PENDING || byId.get(old.getGroupId()).getStatus() == GroupStatus.ACCEPTED)) throw allocationConflict();
                actualMembers.add(toMemberDTOFromRow(students.get(member.getStudentId()), classId, deadlineId));
            }
            if (leaders != 1) throw allocationConflict();
            if (fixed) {
                if (!Objects.equals(group.getLeaderId(), proposed.leaderId())
                    || groupMemberRepository.countByGroupId(group.getId()) != proposed.members().size()) throw allocationConflict();
            } else {
                requireStaffEditable(group);
                if (!ruleValidationService.areAllRulesPassed(ruleValidationService.evaluateGroup(classId, actualMembers))) throw allocationConflict();
            }
        }
        if (!seen.equals(students.keySet())) throw allocationConflict();
        for (var rule : ruleValidationService.getClassRules(classId)) {
            if (rule.status() && ((rule.code() == GroupingRuleCode.MIN_GROUPS_PER_CLASS && plan.size() < rule.value())
                || (rule.code() == GroupingRuleCode.MAX_GROUPS_PER_CLASS && plan.size() > rule.value()))) throw allocationConflict();
        }
        for (var group : existing) if (!kept.contains(group.getId())) requireStaffEditable(group);

        String actor = getCurrentUserLogin();
        for (var proposed : plan) {
            if (proposed.protectedGroup()) continue;
            Group group = byId.get(proposed.groupId());
            for (var member : proposed.members()) {
                GroupMember row = current.get(member.getStudentId());
                if (row == null) {
                    row = new GroupMember(); row.setStudentId(member.getStudentId()); row.setSchoolClassId(classId);
                    row.setDeadlineId(deadlineId); row.setJoinedAt(Instant.now());
                    saveMemberHistory(group.getId(), member.getStudentId(), deadlineId, GroupMemberAction.ASSIGNED_BY_LECTURER, actor, "Automatic allocation");
                } else if (!row.getGroupId().equals(group.getId())) {
                    saveMemberHistory(row.getGroupId(), member.getStudentId(), deadlineId, GroupMemberAction.REMOVED_BY_LECTURER, actor, "Automatic allocation transfer");
                    saveMemberHistory(group.getId(), member.getStudentId(), deadlineId, GroupMemberAction.ASSIGNED_BY_LECTURER, actor, "Automatic allocation transfer");
                    row.setJoinedAt(Instant.now());
                }
                row.setGroupId(group.getId()); row.setRole(member.getRole()); groupMemberRepository.save(row);
            }
            if (!Objects.equals(group.getLeaderId(), proposed.leaderId())) saveMemberHistory(group.getId(), proposed.leaderId(), deadlineId,
                GroupMemberAction.TRANSFERRED_LEADER, actor, "Automatic allocation leader");
            group.setLeaderId(proposed.leaderId()); groupRepository.save(group);
        }
        groupMemberRepository.flush();
        for (var group : existing) if (!kept.contains(group.getId())) lecturerDisbandGroup(deadlineId, classId, group.getId());
        List<Long> approved = new ArrayList<>();
        for (var proposed : plan) if (!proposed.protectedGroup()) {
            lecturerSubmitGroup(deadlineId, classId, proposed.groupId());
            acceptGroup(deadlineId, classId, proposed.groupId());
            approved.add(proposed.groupId());
        }
        return List.copyOf(approved);
    }

    private ConflictAlertException allocationConflict() {
        return new ConflictAlertException("Allocation plan no longer satisfies domain rules", "allocation", "allocationPlanConflict");
    }

    private Deadline validateDeadlineExists(Integer deadlineId, Integer classId) {
        Deadline deadline = deadlineRepository.findById(deadlineId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy đợt hạn này", "deadline", "ERR_DEADLINE_NOT_FOUND"));

        long belongs = deadlineRepository.countByDeadlineIdAndClassId(deadlineId, classId);
        if (belongs == 0) {
            throw new ForbiddenAlertException("Đợt hạn không áp dụng cho lớp học này", "deadline", "ERR_DEADLINE_NOT_IN_CLASS");
        }
        return deadline;
    }

    /** Caller holds the class write lock. Release changed slots before reusing them, because
     * Hibernate may flush updates by entity ID rather than by sequence number. */
    private int compactGroupSequence(Integer classId, Integer deadlineId) {
        List<Group> groups = groupRepository.findBySchoolClassIdAndDeadlineId(classId, deadlineId);
        Map<Group, Integer> changes = new LinkedHashMap<>();
        int sequence = 0;
        for (Group group : groups) {
            Integer target = group.getStatus() == GroupStatus.DISBANDED ? null : ++sequence;
            if (!Objects.equals(group.getSequenceNo(), target)) changes.put(group, target);
        }
        if (!changes.isEmpty()) {
            changes.keySet().forEach(group -> group.setSequenceNo(null));
            groupRepository.flush();
            changes.forEach(Group::setSequenceNo);
            groupRepository.flush();
        }
        return sequence;
    }

    private Group findScopedGroupForUpdate(Long groupId, Integer deadlineId, Integer classId) {
        Group group = groupRepository.findByIdForUpdate(groupId)
            .orElseThrow(() -> new NotFoundAlertException("Group not found", "group", "ERR_GROUP_NOT_FOUND"));
        if (!Objects.equals(group.getDeadlineId(), deadlineId) || !Objects.equals(group.getSchoolClassId(), classId)) {
            throw new ForbiddenAlertException("Group does not belong to this deadline and class", "group", "ERR_FORBIDDEN_NOT_IN_CLASS");
        }
        return group;
    }

    private Deadline lockDeadlineForMutation(Integer deadlineId, Integer classId) {
        if (deadlineRepository.findAllBySchoolClassId(classId).size() > 1) {
            throw new ConflictAlertException("Class has multiple historical grouping sessions; review data before writing", "group", "ERR_GROUP_STATE_CONFLICT");
        }
        Deadline deadline = deadlineRepository.findForShare(deadlineId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy đợt hạn này", "deadline", "ERR_DEADLINE_NOT_FOUND"));
        if (deadlineRepository.countByDeadlineIdAndClassId(deadlineId, classId) == 0) {
            throw new ForbiddenAlertException("Đợt hạn không áp dụng cho lớp học này", "deadline", "ERR_DEADLINE_NOT_IN_CLASS");
        }
        return deadline;
    }

    private Deadline validateDeadlineActive(Integer deadlineId, Integer classId) {
        schoolClassRepository.findByIdForUpdate(classId)
            .orElseThrow(() -> new NotFoundAlertException("Class not found", "schoolClass", "classNotFound"));
        getCurrentStudent(classId);
        Deadline deadline = lockDeadlineForMutation(deadlineId, classId);
        deadlinePolicy.requireStudentWrite(deadline, classId);
        return deadline;
    }

    private Deadline validateManagementDeadline(Integer deadlineId, Integer classId) {
        schoolClassRepository.findByIdForUpdate(classId)
            .orElseThrow(() -> new NotFoundAlertException("Class not found", "schoolClass", "classNotFound"));
        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));
        accessService.requireWriteAccess(schoolClass);
        Deadline deadline = lockDeadlineForMutation(deadlineId, classId);
        return deadline;
    }

    private Student getCurrentStudent(Integer classId) {
        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.STUDENT)) {
            throw new ForbiddenAlertException("Student role required", "student", "ERR_FORBIDDEN_NOT_IN_CLASS");
        }
        Long currentUserId = resolveCurrentUserId();
        Student student = studentRepository.findById(currentUserId)
            .orElseThrow(() -> new ForbiddenAlertException("Không tìm thấy thông tin sinh viên", "student", "ERR_STUDENT_NOT_FOUND"));

        if (!Objects.equals(student.getSchoolClassId(), classId)) {
            throw new ForbiddenAlertException("Bạn không thuộc danh sách lớp học này", "student", "ERR_FORBIDDEN_NOT_IN_CLASS");
        }
        return student;
    }

    private Long resolveCurrentUserId() {
        return SecurityUtils.getCurrentUserLogin()
            .flatMap(userRepository::findOneByEmail)
            .map(User::getId)
            .orElseThrow(() -> new UnauthorizedAlertException("Bạn cần đăng nhập để thực hiện thao tác này", "account", "ERR_UNAUTHORIZED"));
    }

    private String getCurrentUserLogin() {
        return SecurityUtils.getCurrentUserLogin().orElse("system");
    }

    public GroupDTO getGroupDetail(Long groupId, Integer classId, Integer deadlineId) {
        Group g = groupRepository.findById(groupId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy nhóm", "group", "ERR_GROUP_NOT_FOUND"));

        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        List<StudentRow> classStudents = studentRepository.findStudentsBySchoolClassId(classId);
        Map<Long, StudentRow> studentMap = classStudents.stream().collect(Collectors.toMap(StudentRow::userId, Function.identity()));

        List<GroupMemberDTO> memberDTOs = members.stream()
            .map(m -> toMemberDTO(m, studentMap.get(m.getStudentId())))
            .sorted(Comparator.comparing((GroupMemberDTO m) -> m.getRole() == GroupMemberRole.LEADER ? 0 : 1)
                .thenComparing(GroupMemberDTO::getJoinedAt))
            .toList();

        List<GroupRuleEvaluationDTO> evaluations = ruleValidationService.evaluateGroup(classId, memberDTOs);

        String leaderName = studentMap.containsKey(g.getLeaderId())
            ? studentMap.get(g.getLeaderId()).fullName() : "N/A";

        return GroupDTO.builder()
            .id(g.getId())
            .deadlineId(g.getDeadlineId())
            .schoolClassId(g.getSchoolClassId())
            .sequenceNo(g.getSequenceNo())
            .name(g.getName())
            .leaderId(g.getLeaderId())
            .leaderName(leaderName)
            .status(g.getStatus())
            .memberCount(memberDTOs.size())
            .maxMembers(ruleValidationService.getMaxMembers(classId))
            .rejectReason(g.getRejectReason())
            .submittedRulesVersion(g.getSubmittedRulesVersion())
            .isLecturerCreated(g.getIsLecturerCreated())
            .version(g.getVersion())
            .createdDate(g.getCreatedDate())
            .members(memberDTOs)
            .ruleEvaluations(evaluations)
            .allRulesPassed(ruleValidationService.areAllRulesPassed(evaluations))
            .hasHardRuleViolations(ruleValidationService.hasHardRuleViolations(evaluations))
            .build();
    }

    private GroupMemberDTO toMemberDTO(GroupMember gm, StudentRow student) {
        return GroupMemberDTO.builder()
            .id(gm.getId())
            .groupId(gm.getGroupId())
            .studentId(gm.getStudentId())
            .rollNumber(student != null ? student.rollNumber() : "")
            .fullName(student != null ? student.fullName() : "")
            .email(student != null ? student.email() : "")
            .memberCode(student != null ? student.memberCode() : "")
            .cohort(student != null ? student.cohort() : null)
            .slotType(student != null ? student.slotType() : null)
            .majorId(student != null ? student.majorId() : null)
            .majorCode(student != null ? student.majorCode() : "")
            .majorName(student != null ? student.majorName() : "")
            .selfDescription(student != null ? student.selfDescription() : null)
            .role(gm.getRole())
            .joinedAt(gm.getJoinedAt())
            .build();
    }

    private GroupMemberDTO toMemberDTOFromRow(StudentRow s, Integer classId, Integer deadlineId) {
        return GroupMemberDTO.builder()
            .studentId(s.userId())
            .rollNumber(s.rollNumber())
            .fullName(s.fullName())
            .email(s.email())
            .memberCode(s.memberCode())
            .cohort(s.cohort())
            .slotType(s.slotType())
            .majorId(s.majorId())
            .majorCode(s.majorCode())
            .majorName(s.majorName())
            .selfDescription(s.selfDescription())
            .role(GroupMemberRole.MEMBER)
            .build();
    }

    private void saveMemberHistory(Long groupId, Long studentId, Integer deadlineId,
                                   GroupMemberAction action, String performedBy, String note) {
        GroupMemberHistory history = new GroupMemberHistory();
        history.setGroupId(groupId);
        history.setStudentId(studentId);
        history.setDeadlineId(deadlineId);
        history.setAction(action);
        history.setPerformedBy(performedBy);
        history.setNote(note);
        history.setCreatedAt(Instant.now());
        groupMemberHistoryRepository.save(history);
    }

    private void saveStatusHistory(Long groupId, GroupStatus fromStatus, GroupStatus toStatus,
                                   String changedBy, String reason) {
        GroupStatusHistory history = new GroupStatusHistory();
        history.setGroupId(groupId);
        history.setFromStatus(fromStatus);
        history.setToStatus(toStatus);
        history.setChangedBy(changedBy);
        history.setReason(reason);
        history.setCreatedAt(Instant.now());
        groupStatusHistoryRepository.save(history);
    }
}
