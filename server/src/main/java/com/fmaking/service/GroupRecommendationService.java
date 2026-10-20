package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.GroupMemberRepository;
import com.fmaking.repository.GroupRepository;
import com.fmaking.repository.StudentRepository;
import com.fmaking.service.dto.GroupMemberDTO;
import com.fmaking.service.dto.GroupRecommendationDTO;
import com.fmaking.service.dto.GroupingRuleDTO;
import com.fmaking.service.projection.StudentRow;
import com.fmaking.web.rest.errors.NotFoundAlertException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.fmaking.domain.GroupingRuleCode.*;

@Service
@Transactional(readOnly = true)
public class GroupRecommendationService {

    private final GroupRepository groupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final StudentRepository studentRepository;
    private final GroupRuleValidationService ruleValidationService;
    private final com.fmaking.repository.UserRepository userRepository;

    public GroupRecommendationService(
            GroupRepository groupRepository,
            GroupMemberRepository groupMemberRepository,
            StudentRepository studentRepository,
            GroupRuleValidationService ruleValidationService,
            com.fmaking.repository.UserRepository userRepository
    ) {
        this.groupRepository = groupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.studentRepository = studentRepository;
        this.ruleValidationService = ruleValidationService;
        this.userRepository = userRepository;
    }

    public List<GroupRecommendationDTO> recommendGroupsForCurrentStudent(Integer schoolClassId, Integer deadlineId) {
        Long currentUserId = com.fmaking.security.SecurityUtils.getCurrentUserLogin()
                .flatMap(userRepository::findOneByEmail)
                .map(User::getId)
                .orElse(null);
        if (currentUserId == null) {
            return Collections.emptyList();
        }
        return recommendGroupsForStudent(currentUserId, schoolClassId, deadlineId);
    }

    /**
     * Gợi ý các sinh viên chưa có nhóm phù hợp nhất cho 1 nhóm cụ thể.
     */
    public List<GroupMemberDTO> recommendStudentsForGroup(Long groupId, Integer schoolClassId, Integer deadlineId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundAlertException("Group not found", "group", "groupNotFound"));

        if (group.getStatus() == GroupStatus.DISBANDED) {
            return Collections.emptyList();
        }

        List<GroupingRuleDTO> rules = ruleValidationService.getClassRules(schoolClassId);
        int maxMembers = ruleValidationService.getMaxMembers(schoolClassId);

        GroupingRuleDTO minMembersRule = findRule(rules, MIN_MEMBERS_PER_GROUP);
        int minMembers = minMembersRule != null ? minMembersRule.value() : MIN_MEMBERS_PER_GROUP.getSuggestedValue();

        GroupingRuleDTO minSERule = findRule(rules, MIN_SE_MEMBERS_PER_GROUP);
        boolean minSEActive = minSERule != null && minSERule.status();
        int minSE = minSERule != null ? minSERule.value() : MIN_SE_MEMBERS_PER_GROUP.getSuggestedValue();

        GroupingRuleDTO minMajorsRule = findRule(rules, MIN_MAJORS_PER_GROUP);
        boolean minMajorsActive = minMajorsRule != null && minMajorsRule.status();
        int minMajors = minMajorsRule != null ? minMajorsRule.value() : MIN_MAJORS_PER_GROUP.getSuggestedValue();

        GroupingRuleDTO maxMajorsRule = findRule(rules, MAX_MAJORS_PER_GROUP);
        boolean maxMajorsActive = maxMajorsRule != null && maxMajorsRule.status();
        int maxMajors = maxMajorsRule != null ? maxMajorsRule.value() : Integer.MAX_VALUE;

        // Thành viên hiện tại của nhóm
        List<GroupMember> groupMembers = groupMemberRepository.findByGroupId(groupId);
        if (groupMembers.size() >= maxMembers) {
            return Collections.emptyList(); // Nhóm đã đầy
        }

        // Toàn bộ sinh viên của lớp
        List<StudentRow> classStudents = studentRepository.findStudentsBySchoolClassId(schoolClassId);
        Map<Long, StudentRow> classStudentMap = classStudents.stream()
                .collect(Collectors.toMap(StudentRow::userId, Function.identity(), (a, b) -> a));

        // Sinh viên đã vào nhóm trong deadline này
        List<GroupMember> allDeadlineMembers = groupMemberRepository.findBySchoolClassIdAndDeadlineId(schoolClassId, deadlineId);
        Set<Long> assignedStudentIds = allDeadlineMembers.stream()
                .map(GroupMember::getStudentId)
                .collect(Collectors.toSet());

        // Sinh viên chưa có nhóm
        List<StudentRow> unassignedStudents = classStudents.stream()
                .filter(s -> !assignedStudentIds.contains(s.userId()))
                .toList();

        // Thống kê thành viên hiện tại của nhóm
        Set<Integer> currentMajorIds = groupMembers.stream()
                .map(gm -> classStudentMap.get(gm.getStudentId()))
                .filter(Objects::nonNull)
                .map(StudentRow::majorId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        long currentSECount = groupMembers.stream()
                .map(gm -> classStudentMap.get(gm.getStudentId()))
                .filter(Objects::nonNull)
                .filter(s -> s.majorCode() != null && "SE".equalsIgnoreCase(s.majorCode().trim()))
                .count();

        List<GroupMemberDTO> recommendations = new ArrayList<>();

        for (StudentRow s : unassignedStudents) {
            boolean isNewMajor = s.majorId() != null && !currentMajorIds.contains(s.majorId());
            if (maxMajorsActive && isNewMajor && (currentMajorIds.size() + 1 > maxMajors)) {
                continue; // Vi phạm luật trần số lượng chuyên ngành
            }

            int score = 50;
            List<String> reasons = new ArrayList<>();

            boolean isSE = s.majorCode() != null && "SE".equalsIgnoreCase(s.majorCode().trim());
            if (minSEActive && currentSECount < minSE && isSE) {
                score += 40;
                reasons.add("Khắc phục điều kiện tiên quyết: Bổ sung sinh viên ngành Kỹ thuật Phần mềm (SE)");
            }

            if (minMajorsActive && currentMajorIds.size() < minMajors && isNewMajor) {
                score += 25;
                reasons.add("Gia tăng sự đa dạng ngành: Bổ sung chuyên ngành mới (" + (s.majorCode() != null ? s.majorCode() : "") + ")");
            }

            if (groupMembers.size() < minMembers) {
                score += 15;
                reasons.add("Giúp nhóm đạt sĩ số tối thiểu (" + (groupMembers.size() + 1) + "/" + minMembers + ")");
            }

            if (s.selfDescription() != null && !s.selfDescription().isBlank()) {
                score += 10;
                reasons.add("Đã cập nhật mô tả năng lực bản thân");
            }

            score = Math.min(100, Math.max(10, score));

            GroupMemberDTO dto = GroupMemberDTO.builder()
                    .studentId(s.userId())
                    .rollNumber(s.rollNumber())
                    .fullName(s.fullName())
                    .email(s.email())
                    .memberCode(s.memberCode())
                    .majorId(s.majorId())
                    .majorCode(s.majorCode())
                    .majorName(s.majorName())
                    .selfDescription(s.selfDescription())
                    .role(GroupMemberRole.MEMBER)
                    .matchScore(score)
                    .matchReasons(reasons)
                    .build();

            recommendations.add(dto);
        }

        recommendations.sort(Comparator.comparing(GroupMemberDTO::getMatchScore, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(GroupMemberDTO::getFullName));

        return recommendations;
    }

    /**
     * Gợi ý các nhóm còn thiếu người phù hợp nhất cho sinh viên chưa có nhóm.
     */
    public List<GroupRecommendationDTO> recommendGroupsForStudent(Long studentId, Integer schoolClassId, Integer deadlineId) {
        StudentRow student = studentRepository.findStudentProjectionById(studentId)
                .orElseThrow(() -> new NotFoundAlertException("Student not found", "student", "studentNotFound"));

        List<Group> classGroups = groupRepository.findBySchoolClassIdAndDeadlineId(schoolClassId, deadlineId);
        List<GroupingRuleDTO> rules = ruleValidationService.getClassRules(schoolClassId);
        int maxMembers = ruleValidationService.getMaxMembers(schoolClassId);

        GroupingRuleDTO minMembersRule = findRule(rules, MIN_MEMBERS_PER_GROUP);
        int minMembers = minMembersRule != null ? minMembersRule.value() : MIN_MEMBERS_PER_GROUP.getSuggestedValue();

        GroupingRuleDTO minSERule = findRule(rules, MIN_SE_MEMBERS_PER_GROUP);
        boolean minSEActive = minSERule != null && minSERule.status();
        int minSE = minSERule != null ? minSERule.value() : MIN_SE_MEMBERS_PER_GROUP.getSuggestedValue();

        GroupingRuleDTO minMajorsRule = findRule(rules, MIN_MAJORS_PER_GROUP);
        boolean minMajorsActive = minMajorsRule != null && minMajorsRule.status();
        int minMajors = minMajorsRule != null ? minMajorsRule.value() : MIN_MAJORS_PER_GROUP.getSuggestedValue();

        GroupingRuleDTO maxMajorsRule = findRule(rules, MAX_MAJORS_PER_GROUP);
        boolean maxMajorsActive = maxMajorsRule != null && maxMajorsRule.status();
        int maxMajors = maxMajorsRule != null ? maxMajorsRule.value() : Integer.MAX_VALUE;

        List<StudentRow> classStudents = studentRepository.findStudentsBySchoolClassId(schoolClassId);
        Map<Long, StudentRow> classStudentMap = classStudents.stream()
                .collect(Collectors.toMap(StudentRow::userId, Function.identity(), (a, b) -> a));

        List<GroupMember> allMembers = groupMemberRepository.findBySchoolClassIdAndDeadlineId(schoolClassId, deadlineId);
        Map<Long, List<GroupMember>> membersByGroup = allMembers.stream()
                .collect(Collectors.groupingBy(GroupMember::getGroupId));

        List<GroupRecommendationDTO> recommendations = new ArrayList<>();

        boolean studentIsSE = student.majorCode() != null && "SE".equalsIgnoreCase(student.majorCode().trim());

        for (Group group : classGroups) {
            if (group.getStatus() != GroupStatus.OPEN) {
                continue; // Chỉ gợi ý các nhóm OPEN đang mở tuyển
            }

            List<GroupMember> members = membersByGroup.getOrDefault(group.getId(), Collections.emptyList());
            if (members.size() >= maxMembers) {
                continue; // Đầy người
            }

            Set<Integer> currentMajorIds = members.stream()
                    .map(gm -> classStudentMap.get(gm.getStudentId()))
                    .filter(Objects::nonNull)
                    .map(StudentRow::majorId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());

            long seCount = members.stream()
                    .map(gm -> classStudentMap.get(gm.getStudentId()))
                    .filter(Objects::nonNull)
                    .filter(s -> s.majorCode() != null && "SE".equalsIgnoreCase(s.majorCode().trim()))
                    .count();

            boolean isNewMajor = student.majorId() != null && !currentMajorIds.contains(student.majorId());
            if (maxMajorsActive && isNewMajor && (currentMajorIds.size() + 1 > maxMajors)) {
                continue; // Vi phạm luật trần chuyên ngành
            }

            int score = 50;
            List<String> reasons = new ArrayList<>();

            if (minSEActive && seCount < minSE && studentIsSE) {
                score += 40;
                reasons.add("Nhóm đang rất cần sinh viên chuyên ngành Kỹ thuật Phần mềm (SE) của bạn!");
            }

            if (minMajorsActive && currentMajorIds.size() < minMajors && isNewMajor) {
                score += 25;
                reasons.add("Chuyên ngành " + (student.majorCode() != null ? student.majorCode() : "") + " của bạn giúp nhóm hoàn thiện tiêu chí đa ngành");
            }

            if (members.size() < minMembers) {
                score += 15;
                reasons.add("Nhóm đang cần thêm thành viên để đủ điều kiện nộp duyệt (" + (members.size() + 1) + "/" + minMembers + ")");
            }

            score = Math.min(100, Math.max(10, score));

            recommendations.add(GroupRecommendationDTO.builder()
                    .groupId(group.getId())
                    .groupName(group.getName())
                    .currentMembers(members.size())
                    .maxMembers(maxMembers)
                    .matchScore(score)
                    .matchReasons(reasons)
                    .isEligible(true)
                    .build());
        }

        recommendations.sort(Comparator.comparing(GroupRecommendationDTO::getMatchScore, Comparator.reverseOrder())
                .thenComparing(GroupRecommendationDTO::getGroupName));

        return recommendations;
    }

    private GroupingRuleDTO findRule(List<GroupingRuleDTO> rules, GroupingRuleCode code) {
        if (rules == null) return null;
        return rules.stream().filter(r -> r.code() == code).findFirst().orElse(null);
    }
}
