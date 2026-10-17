package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.security.SecurityUtils;
import com.fmaking.service.dto.*;
import com.fmaking.service.projection.StudentRow;
import com.fmaking.web.rest.errors.ConflictAlertException;
import com.fmaking.web.rest.errors.ForbiddenAlertException;
import com.fmaking.web.rest.errors.NotFoundAlertException;
import com.fmaking.web.rest.errors.UnprocessableAlertException;
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
public class GroupInvitationService {

    private final Logger log = LoggerFactory.getLogger(GroupInvitationService.class);

    private final GroupInvitationRepository groupInvitationRepository;
    private final GroupRepository groupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final GroupMemberHistoryRepository groupMemberHistoryRepository;
    private final StudentRepository studentRepository;
    private final UserRepository userRepository;
    private final DeadlineRepository deadlineRepository;
    private final SchoolClassRepository schoolClassRepository;
    private final GroupRuleValidationService ruleValidationService;
    private final GroupRecommendationService recommendationService;
    private final DeadlinePolicy deadlinePolicy;
    private final GroupEventPublisher eventPublisher;
    private final GroupService groupService;

    public GroupInvitationService(
            GroupInvitationRepository groupInvitationRepository,
            GroupRepository groupRepository,
            GroupMemberRepository groupMemberRepository,
            GroupMemberHistoryRepository groupMemberHistoryRepository,
            StudentRepository studentRepository,
            UserRepository userRepository,
            DeadlineRepository deadlineRepository,
            SchoolClassRepository schoolClassRepository,
            GroupRuleValidationService ruleValidationService,
            GroupRecommendationService recommendationService,
            DeadlinePolicy deadlinePolicy,
            GroupEventPublisher eventPublisher,
            GroupService groupService
    ) {
        this.groupInvitationRepository = groupInvitationRepository;
        this.groupRepository = groupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.groupMemberHistoryRepository = groupMemberHistoryRepository;
        this.studentRepository = studentRepository;
        this.userRepository = userRepository;
        this.deadlineRepository = deadlineRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.ruleValidationService = ruleValidationService;
        this.recommendationService = recommendationService;
        this.deadlinePolicy = deadlinePolicy;
        this.eventPublisher = eventPublisher;
        this.groupService = groupService;
    }

    /**
     * Tìm kiếm sinh viên theo email / mã / tên để mời vào nhóm, đồng thời kiểm tra tính hợp lệ về rule.
     */
    @Transactional(readOnly = true)
    public List<StudentSearchForInviteDTO> searchStudentsForInvite(Integer deadlineId, Integer classId, Long groupId, String query) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy nhóm", "group", "groupNotFound"));

        if (!Objects.equals(group.getSchoolClassId(), classId) || !Objects.equals(group.getDeadlineId(), deadlineId)) {
            throw new ForbiddenAlertException("Nhóm không thuộc đợt hạn hoặc lớp học này", "group", "ERR_FORBIDDEN_NOT_IN_CLASS");
        }

        // Lấy tất cả sinh viên trong lớp
        List<StudentRow> classStudents = studentRepository.findStudentsBySchoolClassId(classId);

        // Lọc theo query nếu có
        String cleanQuery = (query != null ? query.trim().toLowerCase(Locale.ROOT) : "");
        List<StudentRow> filtered = classStudents.stream()
                .filter(s -> {
                    if (cleanQuery.isEmpty()) return true;
                    boolean matchEmail = s.email() != null && s.email().toLowerCase(Locale.ROOT).contains(cleanQuery);
                    boolean matchName = s.fullName() != null && s.fullName().toLowerCase(Locale.ROOT).contains(cleanQuery);
                    boolean matchRoll = s.rollNumber() != null && s.rollNumber().toLowerCase(Locale.ROOT).contains(cleanQuery);
                    boolean matchCode = s.memberCode() != null && s.memberCode().toLowerCase(Locale.ROOT).contains(cleanQuery);
                    return matchEmail || matchName || matchRoll || matchCode;
                })
                .toList();

        // Lấy danh sách thành viên các nhóm trong deadline này
        List<GroupMember> allDeadlineMembers = groupMemberRepository.findBySchoolClassIdAndDeadlineId(classId, deadlineId);
        Map<Long, Long> studentGroupIdMap = allDeadlineMembers.stream()
                .collect(Collectors.toMap(GroupMember::getStudentId, GroupMember::getGroupId, (a, b) -> a));

        // Lấy tên các nhóm
        Set<Long> groupIds = new HashSet<>(studentGroupIdMap.values());
        Map<Long, String> groupNames = groupRepository.findAllById(groupIds).stream()
                .collect(Collectors.toMap(Group::getId, Group::getName));

        // Lấy các lời mời PENDING hiện tại của nhóm này
        List<GroupInvitation> pendingInvitations = groupInvitationRepository.findByGroupIdAndStatus(groupId, GroupInvitationStatus.PENDING);
        Map<Long, GroupInvitation> pendingMap = pendingInvitations.stream()
                .collect(Collectors.toMap(GroupInvitation::getStudentId, Function.identity(), (a, b) -> a));

        // Thành viên hiện tại của nhóm này
        List<GroupMember> currentMembers = groupMemberRepository.findByGroupId(groupId);
        int maxMembersLimit = ruleValidationService.getMaxMembers(classId);

        Map<Long, StudentRow> studentRowMap = classStudents.stream()
                .collect(Collectors.toMap(StudentRow::userId, Function.identity(), (a, b) -> a));

        List<GroupMemberDTO> currentMemberDTOs = currentMembers.stream()
                .map(m -> toMemberDTO(m, studentRowMap.get(m.getStudentId())))
                .toList();

        List<StudentSearchForInviteDTO> results = new ArrayList<>();

        for (StudentRow s : filtered) {
            Long studentId = s.userId();
            boolean hasGroup = studentGroupIdMap.containsKey(studentId);
            Long currentGid = studentGroupIdMap.get(studentId);
            String currentGName = currentGid != null ? groupNames.get(currentGid) : null;

            boolean hasPending = pendingMap.containsKey(studentId);
            Long pendingId = hasPending ? pendingMap.get(studentId).getId() : null;

            boolean canInvite = false;
            String violationReason = null;

            if (hasGroup) {
                violationReason = "Sinh viên đã thuộc nhóm khác (" + (currentGName != null ? currentGName : "Nhóm #" + currentGid) + ")";
            } else if (hasPending) {
                violationReason = "Đã gửi lời mời, đang chờ sinh viên phản hồi";
            } else if (currentMembers.size() >= maxMembersLimit) {
                violationReason = "Nhóm đã đủ số lượng thành viên tối đa (" + maxMembersLimit + ")";
            } else {
                // Kiểm tra formation rules
                List<GroupMemberDTO> proposed = new ArrayList<>(currentMemberDTOs);
                proposed.add(toMemberDTOFromRow(s, classId, deadlineId));
                if (!ruleValidationService.areFormationRulesPassed(classId, proposed)) {
                    violationReason = "Không thể mời do vi phạm quy định ghép nhóm (vượt quá giới hạn chuyên ngành)";
                } else {
                    canInvite = true;
                }
            }

            results.add(StudentSearchForInviteDTO.builder()
                    .studentId(s.userId())
                    .fullName(s.fullName())
                    .email(s.email())
                    .rollNumber(s.rollNumber())
                    .memberCode(s.memberCode())
                    .majorId(s.majorId())
                    .majorCode(s.majorCode())
                    .majorName(s.majorName())
                    .selfDescription(s.selfDescription())
                    .hasGroup(hasGroup)
                    .currentGroupId(currentGid)
                    .currentGroupName(currentGName)
                    .canInvite(canInvite)
                    .ruleViolationReason(violationReason)
                    .hasPendingInvitation(hasPending)
                    .pendingInvitationId(pendingId)
                    .build());
        }

        return results;
    }

    /**
     * Gửi lời mời gia nhập nhóm.
     */
    public GroupInvitationDTO sendInvitation(Integer deadlineId, Integer classId, Long groupId, SendInvitationRequest request) {
        validateDeadlineActive(deadlineId, classId);
        Student inviter = getCurrentStudent(classId);
        Long inviterId = inviter.getUserId();

        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy nhóm", "group", "groupNotFound"));

        if (!Objects.equals(group.getSchoolClassId(), classId) || !Objects.equals(group.getDeadlineId(), deadlineId)) {
            throw new ForbiddenAlertException("Nhóm không thuộc đợt hạn hoặc lớp học này", "group", "ERR_FORBIDDEN_NOT_IN_CLASS");
        }

        if (group.getStatus() != GroupStatus.OPEN) {
            throw new ConflictAlertException("Nhóm hiện không ở trạng thái mở để mời thành viên.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        // Người mời phải là thành viên trong nhóm
        groupMemberRepository.findByGroupIdAndStudentId(groupId, inviterId)
                .orElseThrow(() -> new ForbiddenAlertException("Bạn phải là thành viên của nhóm để gửi lời mời.", "group", "ERR_FORBIDDEN_NOT_MEMBER"));

        // Xác định sinh viên được mời (bằng studentId hoặc email)
        StudentRow targetStudent = null;
        List<StudentRow> classStudents = studentRepository.findStudentsBySchoolClassId(classId);
        if (request.getStudentId() != null) {
            targetStudent = classStudents.stream()
                    .filter(s -> Objects.equals(s.userId(), request.getStudentId()))
                    .findFirst()
                    .orElseThrow(() -> new NotFoundAlertException("Sinh viên không thuộc lớp học này", "student", "studentNotFound"));
        } else if (request.getEmail() != null && !request.getEmail().isBlank()) {
            String cleanEmail = request.getEmail().trim().toLowerCase(Locale.ROOT);
            targetStudent = classStudents.stream()
                    .filter(s -> s.email() != null && s.email().trim().equalsIgnoreCase(cleanEmail))
                    .findFirst()
                    .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy sinh viên có email này trong lớp học", "student", "studentNotFound"));
        } else {
            throw new ConflictAlertException("Vui lòng cung cấp ID hoặc Email của sinh viên cần mời", "group", "ERR_INVALID_INVITATION_REQUEST");
        }

        Long targetStudentId = targetStudent.userId();

        // 1. Kiểm tra xem sinh viên đã có nhóm chưa
        if (groupMemberRepository.findByStudentIdAndDeadlineId(targetStudentId, deadlineId).isPresent()) {
            throw new ConflictAlertException("Sinh viên này đã tham gia một nhóm khác.", "group", "ERR_ALREADY_IN_GROUP");
        }

        // 2. Kiểm tra xem đã có lời mời PENDING nào từ nhóm này chưa
        if (groupInvitationRepository.existsByGroupIdAndStudentIdAndStatus(groupId, targetStudentId, GroupInvitationStatus.PENDING)) {
            throw new ConflictAlertException("Nhóm đã gửi lời mời đến sinh viên này rồi, đang chờ phản hồi.", "group", "ERR_INVITATION_EXISTS");
        }

        // 3. Kiểm tra sĩ số tối đa của nhóm
        long currentCount = groupMemberRepository.countByGroupId(groupId);
        int maxMembersLimit = ruleValidationService.getMaxMembers(classId);
        if (currentCount >= maxMembersLimit) {
            throw new ConflictAlertException("Nhóm đã đủ số lượng thành viên tối đa (" + maxMembersLimit + ").", "group", "ERR_GROUP_FULL");
        }

        // 4. Kiểm tra formation rules
        Map<Long, StudentRow> studentRowMap = classStudents.stream()
                .collect(Collectors.toMap(StudentRow::userId, Function.identity(), (a, b) -> a));
        List<GroupMemberDTO> proposed = new ArrayList<>(groupMemberRepository.findByGroupId(groupId).stream()
                .map(member -> toMemberDTO(member, studentRowMap.get(member.getStudentId()))).toList());
        proposed.add(toMemberDTOFromRow(targetStudent, classId, deadlineId));

        if (!ruleValidationService.areFormationRulesPassed(classId, proposed)) {
            throw new UnprocessableAlertException("Không thể mời vì vi phạm quy định ghép nhóm của lớp (vượt quá giới hạn chuyên ngành).", "group", "ERR_HARD_RULE_VIOLATED");
        }

        // 5. Tạo GroupInvitation
        GroupInvitation invitation = new GroupInvitation();
        invitation.setGroupId(groupId);
        invitation.setStudentId(targetStudentId);
        invitation.setInviterId(inviterId);
        invitation.setDeadlineId(deadlineId);
        invitation.setSchoolClassId(classId);
        invitation.setStatus(GroupInvitationStatus.PENDING);
        invitation.setMessage(request.getMessage() != null ? request.getMessage().trim() : null);
        invitation.setCreatedAt(Instant.now());
        GroupInvitation saved = groupInvitationRepository.save(invitation);

        String actor = getCurrentUserLogin();
        GroupInvitationDTO dto = toInvitationDTO(saved, group, targetStudent, inviter.getFullName(), (int) currentCount, maxMembersLimit);

        // Phát realtime event đến lớp / deadline
        eventPublisher.publish("GROUP_INVITATION_SENT", groupId, deadlineId, classId, actor, dto);

        return dto;
    }

    /**
     * Lấy danh sách lời mời đang chờ của sinh viên đăng nhập hiện tại.
     */
    @Transactional(readOnly = true)
    public List<GroupInvitationDTO> getMyPendingInvitations(Integer deadlineId, Integer classId) {
        Student current = getCurrentStudent(classId);
        Long studentId = current.getUserId();

        List<GroupInvitation> invitations = groupInvitationRepository
                .findByStudentIdAndDeadlineIdAndStatus(studentId, deadlineId, GroupInvitationStatus.PENDING);

        if (invitations.isEmpty()) {
            return Collections.emptyList();
        }

        Set<Long> groupIds = invitations.stream().map(GroupInvitation::getGroupId).collect(Collectors.toSet());
        Map<Long, Group> groupMap = groupRepository.findAllById(groupIds).stream()
                .collect(Collectors.toMap(Group::getId, Function.identity()));

        int maxMembersLimit = ruleValidationService.getMaxMembers(classId);

        StudentRow studentRow = studentRepository.findStudentProjectionById(studentId).orElse(null);

        List<StudentRow> classStudents = studentRepository.findStudentsBySchoolClassId(classId);
        Map<Long, StudentRow> classStudentMap = classStudents.stream()
                .collect(Collectors.toMap(StudentRow::userId, Function.identity(), (a, b) -> a));

        List<GroupInvitationDTO> result = new ArrayList<>();
        for (GroupInvitation inv : invitations) {
            Group group = groupMap.get(inv.getGroupId());
            if (group == null || group.getStatus() == GroupStatus.DISBANDED) {
                continue;
            }
            int memberCount = (int) groupMemberRepository.countByGroupId(group.getId());
            StudentRow inviterRow = classStudentMap.get(inv.getInviterId());
            String inviterName = inviterRow != null ? inviterRow.fullName() : "Thành viên nhóm";

            GroupInvitationDTO dto = toInvitationDTO(inv, group, studentRow, inviterName, memberCount, maxMembersLimit);
            result.add(dto);
        }

        return result;
    }

    /**
     * Lấy danh sách lời mời của một nhóm cụ thể.
     */
    @Transactional(readOnly = true)
    public List<GroupInvitationDTO> getGroupInvitations(Integer deadlineId, Integer classId, Long groupId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy nhóm", "group", "groupNotFound"));

        List<GroupInvitation> invitations = groupInvitationRepository.findByGroupIdAndDeadlineId(groupId, deadlineId);
        if (invitations.isEmpty()) {
            return Collections.emptyList();
        }

        List<StudentRow> classStudents = studentRepository.findStudentsBySchoolClassId(classId);
        Map<Long, StudentRow> classStudentMap = classStudents.stream()
                .collect(Collectors.toMap(StudentRow::userId, Function.identity(), (a, b) -> a));

        int maxMembersLimit = ruleValidationService.getMaxMembers(classId);
        int memberCount = (int) groupMemberRepository.countByGroupId(groupId);

        return invitations.stream()
                .map(inv -> {
                    StudentRow target = classStudentMap.get(inv.getStudentId());
                    StudentRow inviter = classStudentMap.get(inv.getInviterId());
                    return toInvitationDTO(inv, group, target, inviter != null ? inviter.fullName() : "N/A", memberCount, maxMembersLimit);
                })
                .sorted(Comparator.comparing(GroupInvitationDTO::getCreatedAt).reversed())
                .toList();
    }

    /**
     * Sinh viên chấp nhận lời mời vào nhóm.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public GroupDTO acceptInvitation(Integer deadlineId, Integer classId, Long invitationId) {
        validateDeadlineActive(deadlineId, classId);
        Student student = getCurrentStudent(classId);
        Long studentId = student.getUserId();

        GroupInvitation invitation = groupInvitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lời mời", "invitation", "invitationNotFound"));

        if (!Objects.equals(invitation.getStudentId(), studentId)) {
            throw new ForbiddenAlertException("Bạn không phải người nhận lời mời này", "invitation", "ERR_FORBIDDEN_NOT_RECIPIENT");
        }

        if (invitation.getStatus() != GroupInvitationStatus.PENDING) {
            throw new ConflictAlertException("Lời mời này đã được phản hồi hoặc đã bị hủy.", "invitation", "ERR_INVITATION_NOT_PENDING");
        }

        Long groupId = invitation.getGroupId();
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy nhóm", "group", "groupNotFound"));

        if (group.getStatus() != GroupStatus.OPEN) {
            invitation.setStatus(GroupInvitationStatus.CANCELLED);
            invitation.setRespondedAt(Instant.now());
            groupInvitationRepository.save(invitation);
            throw new ConflictAlertException("Nhóm hiện không ở trạng thái mở để tham gia.", "group", "ERR_GROUP_STATE_CONFLICT");
        }

        // Kiểm tra xem sinh viên đã có nhóm chưa
        if (groupMemberRepository.findByStudentIdAndDeadlineId(studentId, deadlineId).isPresent()) {
            invitation.setStatus(GroupInvitationStatus.CANCELLED);
            invitation.setRespondedAt(Instant.now());
            groupInvitationRepository.save(invitation);
            throw new ConflictAlertException("Bạn đã tham gia một nhóm khác trong đợt này.", "group", "ERR_ALREADY_IN_GROUP");
        }

        // Kiểm tra sĩ số tối đa
        long currentCount = groupMemberRepository.countByGroupId(groupId);
        int maxMembersLimit = ruleValidationService.getMaxMembers(classId);
        if (currentCount >= maxMembersLimit) {
            invitation.setStatus(GroupInvitationStatus.CANCELLED);
            invitation.setRespondedAt(Instant.now());
            groupInvitationRepository.save(invitation);
            throw new ConflictAlertException("Nhóm đã đủ số lượng thành viên tối đa.", "group", "ERR_GROUP_FULL");
        }

        // Kiểm tra formation rules
        List<StudentRow> classStudents = studentRepository.findStudentsBySchoolClassId(classId);
        Map<Long, StudentRow> studentRowMap = classStudents.stream()
                .collect(Collectors.toMap(StudentRow::userId, Function.identity(), (a, b) -> a));
        List<GroupMemberDTO> proposed = new ArrayList<>(groupMemberRepository.findByGroupId(groupId).stream()
                .map(member -> toMemberDTO(member, studentRowMap.get(member.getStudentId()))).toList());
        proposed.add(toMemberDTOFromRow(studentRowMap.get(studentId), classId, deadlineId));

        if (!ruleValidationService.areFormationRulesPassed(classId, proposed)) {
            throw new UnprocessableAlertException("Không thể tham gia vì nhóm đã vi phạm quy định ghép nhóm của lớp.", "group", "ERR_HARD_RULE_VIOLATED");
        }

        // Thêm thành viên vào nhóm
        GroupMember member = new GroupMember();
        member.setGroupId(groupId);
        member.setStudentId(studentId);
        member.setDeadlineId(deadlineId);
        member.setSchoolClassId(classId);
        member.setRole(GroupMemberRole.MEMBER);
        member.setJoinedAt(Instant.now());
        groupMemberRepository.save(member);

        // Đánh dấu ACCEPTED cho lời mời này
        invitation.setStatus(GroupInvitationStatus.ACCEPTED);
        invitation.setRespondedAt(Instant.now());
        groupInvitationRepository.save(invitation);

        // Tự động hủy các lời mời PENDING khác của sinh viên này trong đợt này
        List<GroupInvitation> otherInvitations = groupInvitationRepository
                .findByStudentIdAndDeadlineIdAndStatus(studentId, deadlineId, GroupInvitationStatus.PENDING);
        for (GroupInvitation other : otherInvitations) {
            other.setStatus(GroupInvitationStatus.CANCELLED);
            other.setRespondedAt(Instant.now());
        }
        groupInvitationRepository.saveAll(otherInvitations);

        String actor = getCurrentUserLogin();
        saveMemberHistory(groupId, studentId, deadlineId, GroupMemberAction.JOINED, actor, "Gia nhập nhóm từ lời mời");

        eventPublisher.publish("GROUP_INVITATION_ACCEPTED", groupId, deadlineId, classId, actor, invitation.getId());
        eventPublisher.publish("MEMBER_JOINED", groupId, deadlineId, classId, actor, null);

        return groupService.getGroupDetail(groupId, classId, deadlineId);
    }

    /**
     * Sinh viên từ chối lời mời vào nhóm.
     */
    public void rejectInvitation(Integer deadlineId, Integer classId, Long invitationId) {
        Student student = getCurrentStudent(classId);
        Long studentId = student.getUserId();

        GroupInvitation invitation = groupInvitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lời mời", "invitation", "invitationNotFound"));

        if (!Objects.equals(invitation.getStudentId(), studentId)) {
            throw new ForbiddenAlertException("Bạn không phải người nhận lời mời này", "invitation", "ERR_FORBIDDEN_NOT_RECIPIENT");
        }

        if (invitation.getStatus() != GroupInvitationStatus.PENDING) {
            throw new ConflictAlertException("Lời mời này không ở trạng thái chờ phản hồi.", "invitation", "ERR_INVITATION_NOT_PENDING");
        }

        invitation.setStatus(GroupInvitationStatus.REJECTED);
        invitation.setRespondedAt(Instant.now());
        groupInvitationRepository.save(invitation);

        String actor = getCurrentUserLogin();
        eventPublisher.publish("GROUP_INVITATION_REJECTED", invitation.getGroupId(), deadlineId, classId, actor, invitation.getId());
    }

    /**
     * Người gửi (hoặc trưởng nhóm) hủy lời mời đã gửi.
     */
    public void cancelInvitation(Integer deadlineId, Integer classId, Long invitationId) {
        Student student = getCurrentStudent(classId);
        Long currentUserId = student.getUserId();

        GroupInvitation invitation = groupInvitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy lời mời", "invitation", "invitationNotFound"));

        // Phải là thành viên trong nhóm mời
        groupMemberRepository.findByGroupIdAndStudentId(invitation.getGroupId(), currentUserId)
                .orElseThrow(() -> new ForbiddenAlertException("Bạn không có quyền hủy lời mời của nhóm này", "invitation", "ERR_FORBIDDEN_NOT_MEMBER"));

        if (invitation.getStatus() != GroupInvitationStatus.PENDING) {
            throw new ConflictAlertException("Chỉ có thể hủy lời mời đang ở trạng thái chờ phản hồi.", "invitation", "ERR_INVITATION_NOT_PENDING");
        }

        invitation.setStatus(GroupInvitationStatus.CANCELLED);
        invitation.setRespondedAt(Instant.now());
        groupInvitationRepository.save(invitation);

        String actor = getCurrentUserLogin();
        eventPublisher.publish("GROUP_INVITATION_CANCELLED", invitation.getGroupId(), deadlineId, classId, actor, invitation.getId());
    }

    // ==========================================
    // HELPERS
    // ==========================================

    private void validateDeadlineActive(Integer deadlineId, Integer classId) {
        Deadline deadline = deadlineRepository.findById(deadlineId)
                .orElseThrow(() -> new NotFoundAlertException("Không tìm thấy đợt tạo nhóm", "deadline", "deadlineNotFound"));
        DeadlineStatus status = deadlinePolicy.status(deadline, classId);
        if (status != DeadlineStatus.ACTIVE) {
            throw new ConflictAlertException("Đợt hạn không ở trạng thái mở.", "deadline", "ERR_DEADLINE_NOT_ACTIVE");
        }
    }

    private Student getCurrentStudent(Integer classId) {
        Long userId = resolveCurrentUserId();
        Student student = studentRepository.findById(userId)
                .orElseThrow(() -> new ForbiddenAlertException("Không tìm thấy thông tin sinh viên", "group", "ERR_STUDENT_NOT_FOUND"));
        if (!Objects.equals(student.getSchoolClassId(), classId)) {
            throw new ForbiddenAlertException("Bạn không thuộc danh sách lớp học này", "group", "ERR_FORBIDDEN_NOT_IN_CLASS");
        }
        return student;
    }

    private Long resolveCurrentUserId() {
        return SecurityUtils.getCurrentUserLogin()
                .flatMap(userRepository::findOneByEmail)
                .map(User::getId)
                .orElseThrow(() -> new ForbiddenAlertException("Không thể xác thực người dùng hiện tại", "group", "ERR_UNAUTHENTICATED"));
    }

    private String getCurrentUserLogin() {
        return SecurityUtils.getCurrentUserLogin().orElse("system");
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

    private GroupMemberDTO toMemberDTO(GroupMember member, StudentRow row) {
        return GroupMemberDTO.builder()
                .studentId(member.getStudentId())
                .rollNumber(row != null ? row.rollNumber() : "N/A")
                .fullName(row != null ? row.fullName() : "N/A")
                .email(row != null ? row.email() : "N/A")
                .memberCode(row != null ? row.memberCode() : "N/A")
                .majorId(row != null ? row.majorId() : null)
                .majorCode(row != null ? row.majorCode() : null)
                .majorName(row != null ? row.majorName() : null)
                .selfDescription(row != null ? row.selfDescription() : null)
                .role(member.getRole())
                .joinedAt(member.getJoinedAt())
                .build();
    }

    private GroupMemberDTO toMemberDTOFromRow(StudentRow row, Integer classId, Integer deadlineId) {
        return GroupMemberDTO.builder()
                .studentId(row.userId())
                .rollNumber(row.rollNumber())
                .fullName(row.fullName())
                .email(row.email())
                .memberCode(row.memberCode())
                .majorId(row.majorId())
                .majorCode(row.majorCode())
                .majorName(row.majorName())
                .selfDescription(row.selfDescription())
                .role(GroupMemberRole.MEMBER)
                .joinedAt(Instant.now())
                .build();
    }

    private GroupInvitationDTO toInvitationDTO(GroupInvitation inv, Group group, StudentRow target, String inviterName, int memberCount, int maxMembers) {
        return GroupInvitationDTO.builder()
                .id(inv.getId())
                .groupId(inv.getGroupId())
                .groupName(group != null ? group.getName() : "Nhóm #" + inv.getGroupId())
                .studentId(inv.getStudentId())
                .studentName(target != null ? target.fullName() : "N/A")
                .studentEmail(target != null ? target.email() : "N/A")
                .studentRollNumber(target != null ? target.rollNumber() : "N/A")
                .studentMajorCode(target != null ? target.majorCode() : "N/A")
                .inviterId(inv.getInviterId())
                .inviterName(inviterName)
                .deadlineId(inv.getDeadlineId())
                .schoolClassId(inv.getSchoolClassId())
                .status(inv.getStatus())
                .message(inv.getMessage())
                .createdAt(inv.getCreatedAt())
                .respondedAt(inv.getRespondedAt())
                .currentMembers(memberCount)
                .maxMembers(maxMembers)
                .build();
    }
}
