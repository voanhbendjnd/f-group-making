package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.security.AuthoritiesConstants;
import com.fmaking.security.SecurityUtils;
import com.fmaking.service.dto.*;
import com.fmaking.service.projection.StudentRow;
import com.fmaking.web.rest.errors.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
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
                        GroupEventPublisher eventPublisher, DeadlinePolicy deadlinePolicy) {
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
        DeadlineStatus deadlineStatus = deadlinePolicy.status(deadline);
        boolean isDeadlineExpired = deadlineStatus == DeadlineStatus.EXPIRED;
        boolean studentCanWrite = deadlineStatus == DeadlineStatus.ACTIVE;
        boolean canManageGroups = isLecturerOrAdmin && deadlineStatus != DeadlineStatus.CANCELLED;

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
            .deadlineEndTime(deadline.getEndTime())
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
        String cleanName = req.getName().trim();
        if (groupRepository.existsBySchoolClassIdAndDeadlineIdAndNameIgnoreCaseAndStatusNot(classId, deadlineId, cleanName, GroupStatus.DISBANDED)) {
            throw new ConflictAlertException("Tên nhóm này đã tồn tại trong lớp học.", "group", "ERR_GROUP_NAME_EXISTS");
        }

        Group group = new Group();
        group.setDeadlineId(deadlineId);
        group.setSchoolClassId(classId);
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
        saveStatusHistory(savedGroup.getId(), GroupStatus.OPEN, GroupStatus.OPEN, actor, "Lecturer created draft for allocation");

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
        deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(deadlineId));

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
        deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(deadlineId));

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
        deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(deadlineId));

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
        deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(deadlineId));

        if (!isDraft(group)) {
            throw new ConflictAlertException("Chỉ có thể nộp nhóm khi đang ở trạng thái OPEN.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        if (!Objects.equals(group.getLeaderId(), studentId)) {
            throw new ForbiddenAlertException("Chỉ trưởng nhóm mới có quyền nộp danh sách nhóm.", "group", "ERR_FORBIDDEN_NOT_LEADER");
        }

        // Validate rules
        List<GroupMember> groupMembers = groupMemberRepository.findByGroupId(groupId);
        List<StudentRow> classStudents = studentRepository.findStudentsBySchoolClassId(classId);
        Map<Long, StudentRow> studentMap = classStudents.stream().collect(Collectors.toMap(StudentRow::userId, Function.identity()));

        List<GroupMemberDTO> memberDTOs = groupMembers.stream()
            .map(m -> toMemberDTO(m, studentMap.get(m.getStudentId())))
            .toList();

        List<GroupRuleEvaluationDTO> evaluations = ruleValidationService.evaluateGroup(classId, memberDTOs);
        if (!ruleValidationService.areAllRulesPassed(evaluations)) {
            List<String> violations = evaluations.stream()
                .filter(e -> !e.isPassed())
                .map(GroupRuleEvaluationDTO::getMessage)
                .toList();
            throw new UnprocessableAlertException("Nhóm chưa thỏa mãn toàn bộ quy tắc: " + String.join(", ", violations),
                "group", "ERR_HARD_RULE_VIOLATED");
        }

        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));

        requireCompleteGroup(group);
        GroupStatus previousStatus = group.getStatus();
        group.setStatus(GroupStatus.PENDING);
        group.setSubmittedRulesVersion(schoolClass.getRulesVersion());
        group.setRulesEvaluationSnapshot(ruleValidationService.serializeSnapshot(evaluations));
        group.setRejectReason(null);
        groupRepository.save(group);

        String actor = getCurrentUserLogin();
        saveStatusHistory(groupId, previousStatus, GroupStatus.PENDING, actor, "Leader nộp danh sách nhóm lên Giảng viên");

        eventPublisher.publish("GROUP_SUBMITTED", groupId, deadlineId, classId, actor, null);

        return getGroupDetail(groupId, classId, deadlineId);
    }

    public GroupDTO cancelSubmitGroup(Integer deadlineId, Integer classId, Long groupId) {
        validateDeadlineActive(deadlineId, classId);
        Student student = getCurrentStudent(classId);
        Long studentId = student.getUserId();

        Group group = findScopedGroupForUpdate(groupId, deadlineId, classId);
        deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(deadlineId));

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
        deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(deadlineId));

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

        // Create a draft; complete rules are checked at submission and approval.
        Long leaderId = studentIds.get(0);
        Group group = new Group();
        group.setDeadlineId(deadlineId);
        group.setSchoolClassId(classId);
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

        return getGroupDetail(groupId, classId, deadlineId);
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

        return getGroupDetail(groupId, classId, deadlineId);
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
        if (group.getStatus() == GroupStatus.REVOKED) {
            deadlinePolicy.requireStudentWrite(deadlineRepository.getReferenceById(group.getDeadlineId()));
        }
    }

    private void requireCompleteGroup(Group group) {
        List<StudentRow> rows = studentRepository.findStudentsBySchoolClassId(group.getSchoolClassId());
        Map<Long, StudentRow> students = rows.stream().collect(Collectors.toMap(StudentRow::userId, Function.identity()));
        List<GroupMember> storedMembers = groupMemberRepository.findByGroupId(group.getId());
        if (storedMembers.isEmpty() || storedMembers.stream().anyMatch(member -> !students.containsKey(member.getStudentId()))
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
        group.setRulesEvaluationSnapshot(ruleValidationService.serializeSnapshot(evaluations));
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
        if (Objects.equals(sourceId, targetId)) return getGroupDetail(sourceId, classId, deadlineId);
        Group source = findScopedGroupForUpdate(sourceId, deadlineId, classId);
        Group target = findScopedGroupForUpdate(targetId, deadlineId, classId);
        requireStaffEditable(source);
        requireStaffEditable(target);
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

    private Deadline validateDeadlineExists(Integer deadlineId, Integer classId) {
        Deadline deadline = deadlineRepository.findById(deadlineId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy đợt hạn này", "deadline", "ERR_DEADLINE_NOT_FOUND"));

        long belongs = deadlineRepository.countByDeadlineIdAndClassId(deadlineId, classId);
        if (belongs == 0) {
            throw new ForbiddenAlertException("Đợt hạn không áp dụng cho lớp học này", "deadline", "ERR_DEADLINE_NOT_IN_CLASS");
        }
        return deadline;
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
        deadlinePolicy.requireStudentWrite(deadline);
        return deadline;
    }

    private Deadline validateManagementDeadline(Integer deadlineId, Integer classId) {
        schoolClassRepository.findByIdForUpdate(classId)
            .orElseThrow(() -> new NotFoundAlertException("Class not found", "schoolClass", "classNotFound"));
        SchoolClass schoolClass = schoolClassRepository.findById(classId)
            .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lớp học", "schoolClass", "classNotFound"));
        accessService.requireWriteAccess(schoolClass);
        Deadline deadline = lockDeadlineForMutation(deadlineId, classId);
        deadlinePolicy.requireNotCancelled(deadline);
        return deadline;
    }

    private Student getCurrentStudent(Integer classId) {
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

    private GroupDTO getGroupDetail(Long groupId, Integer classId, Integer deadlineId) {
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
            .majorId(student != null ? student.majorId() : null)
            .majorCode(student != null ? student.majorCode() : "")
            .majorName(student != null ? student.majorName() : "")
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
            .majorId(s.majorId())
            .majorCode(s.majorCode())
            .majorName(s.majorName())
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
