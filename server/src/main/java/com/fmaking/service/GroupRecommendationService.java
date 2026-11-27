package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.GroupMemberRepository;
import com.fmaking.repository.GroupRepository;
import com.fmaking.repository.SchoolClassRepository;
import com.fmaking.repository.StudentRepository;
import com.fmaking.security.AuthoritiesConstants;
import com.fmaking.security.SecurityUtils;
import com.fmaking.service.dto.GroupMemberDTO;
import com.fmaking.service.dto.GroupRecommendationDTO;
import com.fmaking.service.projection.StudentRow;
import com.fmaking.web.rest.errors.ForbiddenAlertException;
import com.fmaking.web.rest.errors.NotFoundAlertException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class GroupRecommendationService {
    private final GroupRepository groupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final StudentRepository studentRepository;
    private final GroupRuleValidationService ruleValidationService;
    private final com.fmaking.repository.UserRepository userRepository;
    private final SchoolClassRepository schoolClassRepository;
    private final SchoolClassAccessService accessService;

    public GroupRecommendationService(GroupRepository groupRepository, GroupMemberRepository groupMemberRepository,
            StudentRepository studentRepository, GroupRuleValidationService ruleValidationService,
            com.fmaking.repository.UserRepository userRepository) {
        this(groupRepository, groupMemberRepository, studentRepository, ruleValidationService, userRepository, null, null);
    }

    @Autowired
    public GroupRecommendationService(GroupRepository groupRepository, GroupMemberRepository groupMemberRepository,
            StudentRepository studentRepository, GroupRuleValidationService ruleValidationService,
            com.fmaking.repository.UserRepository userRepository, SchoolClassRepository schoolClassRepository,
            SchoolClassAccessService accessService) {
        this.groupRepository = groupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.studentRepository = studentRepository;
        this.ruleValidationService = ruleValidationService;
        this.userRepository = userRepository;
        this.schoolClassRepository = schoolClassRepository;
        this.accessService = accessService;
    }

    public List<GroupRecommendationDTO> recommendGroupsForCurrentStudent(Integer schoolClassId, Integer deadlineId) {
        if (!SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.STUDENT)) {
            throw new ForbiddenAlertException("Chỉ sinh viên mới có thể xem gợi ý nhóm", "group", "ERR_FORBIDDEN_NOT_IN_CLASS");
        }
        Long currentUserId = SecurityUtils.getCurrentUserLogin()
            .flatMap(userRepository::findOneByEmail).map(User::getId).orElse(null);
        return currentUserId == null ? List.of() : recommendGroupsForStudent(currentUserId, schoolClassId, deadlineId);
    }

    /** Rank unassigned students using the same policy as student-facing group suggestions. */
    public List<GroupMemberDTO> recommendStudentsForGroup(Long groupId, Integer schoolClassId, Integer deadlineId) {
        requireClassReadAccess(schoolClassId);
        Group group = groupRepository.findById(groupId)
            .orElseThrow(() -> new NotFoundAlertException("Group not found", "group", "groupNotFound"));
        if (!Objects.equals(group.getSchoolClassId(), schoolClassId) || !Objects.equals(group.getDeadlineId(), deadlineId)) {
            throw new ForbiddenAlertException("Group does not belong to this class or deadline", "group", "ERR_FORBIDDEN_NOT_IN_CLASS");
        }
        if (group.getStatus() != GroupStatus.OPEN && group.getStatus() != GroupStatus.REVOKED) return List.of();

        var policy = new GroupRecommendationPolicy(ruleValidationService.getClassRules(schoolClassId));
        List<GroupMember> members = groupMemberRepository.findByGroupId(groupId);
        if (members.size() >= policy.maxMembers()) return List.of();
        List<StudentRow> students = studentRepository.findStudentsBySchoolClassId(schoolClassId);
        Map<Long, StudentRow> byId = studentMap(students);
        List<StudentRow> available = unassigned(students,
            groupMemberRepository.findBySchoolClassIdAndDeadlineId(schoolClassId, deadlineId));
        var matches = policy.scoreCandidates(memberRows(members, byId), members.size(), available);

        List<GroupMemberDTO> recommendations = new ArrayList<>();
        for (StudentRow student : available) {
            var match = matches.get(student.userId());
            if (match == null) continue;
            recommendations.add(GroupMemberDTO.builder()
                .studentId(student.userId()).rollNumber(student.rollNumber()).fullName(student.fullName())
                .email(student.email()).memberCode(student.memberCode()).majorId(student.majorId())
                .majorCode(student.majorCode()).majorName(student.majorName()).selfDescription(student.selfDescription())
                .role(GroupMemberRole.MEMBER).matchScore(match.score()).matchReasons(match.reasons()).build());
        }
        recommendations.sort(Comparator.comparing(GroupMemberDTO::getMatchScore, Comparator.reverseOrder())
            .thenComparing(GroupMemberDTO::getFullName, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(GroupMemberDTO::getStudentId));
        return recommendations;
    }

    public List<GroupRecommendationDTO> recommendGroupsForStudent(Long studentId, Integer schoolClassId, Integer deadlineId) {
        StudentRow studentRow = studentRepository.findStudentProjectionById(studentId)
            .orElseThrow(() -> new NotFoundAlertException("Student not found", "student", "studentNotFound"));
        if ((schoolClassRepository != null || studentRow.schoolClassId() != null)
                && !Objects.equals(studentRow.schoolClassId(), schoolClassId)) {
            throw new ForbiddenAlertException("Student does not belong to this class", "group", "ERR_FORBIDDEN_NOT_IN_CLASS");
        }
        List<Group> groups = groupRepository.findBySchoolClassIdAndDeadlineId(schoolClassId, deadlineId);
        var policy = new GroupRecommendationPolicy(ruleValidationService.getClassRules(schoolClassId));
        List<StudentRow> students = studentRepository.findStudentsBySchoolClassId(schoolClassId);
        Map<Long, StudentRow> byId = studentMap(students);
        List<GroupMember> allMembers = groupMemberRepository.findBySchoolClassIdAndDeadlineId(schoolClassId, deadlineId);
        List<StudentRow> available = unassigned(students, allMembers);
        var candidate = available.stream().filter(student -> Objects.equals(student.userId(), studentId)).findFirst();
        if (candidate.isEmpty()) return List.of();
        Map<Long, List<GroupMember>> byGroup = allMembers.stream().collect(Collectors.groupingBy(GroupMember::getGroupId));

        List<GroupRecommendationDTO> recommendations = new ArrayList<>();
        for (Group group : groups) {
            if (group.getStatus() != GroupStatus.OPEN && group.getStatus() != GroupStatus.REVOKED) continue;
            List<GroupMember> members = byGroup.getOrDefault(group.getId(), List.of());
            var match = policy.scoreCandidates(memberRows(members, byId), members.size(), available,
                List.of(candidate.get())).get(studentId);
            if (match == null) continue;
            recommendations.add(GroupRecommendationDTO.builder().groupId(group.getId()).groupName(group.getName())
                .currentMembers(members.size()).maxMembers(policy.maxMembers()).matchScore(match.score())
                .matchReasons(match.reasons()).isEligible(true).build());
        }
        recommendations.sort(Comparator.comparing(GroupRecommendationDTO::getMatchScore, Comparator.reverseOrder())
            .thenComparing(GroupRecommendationDTO::getGroupName, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(GroupRecommendationDTO::getGroupId));
        return recommendations;
    }

    private void requireClassReadAccess(Integer schoolClassId) {
        if (schoolClassRepository == null && accessService == null) {
            return;
        }
        if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.ADMIN)
                || SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE_MASTER)) {
            return;
        }
        if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.LECTURE)) {
            SchoolClass schoolClass = schoolClassRepository.findById(schoolClassId)
                .orElseThrow(() -> new NotFoundAlertException("Class not found", "schoolClass", "classNotFound"));
            accessService.requireReadAccess(schoolClass);
            return;
        }
        if (SecurityUtils.isCurrentUserInRole(AuthoritiesConstants.STUDENT)) {
            Long currentUserId = SecurityUtils.getCurrentUserLogin()
                .flatMap(userRepository::findOneByEmail).map(User::getId)
                .orElseThrow(() -> new ForbiddenAlertException("Unauthenticated", "group", "ERR_UNAUTHENTICATED"));
            if (studentRepository.findById(currentUserId).filter(s -> Objects.equals(s.getSchoolClassId(), schoolClassId)).isPresent()) {
                return;
            }
        }
        throw new ForbiddenAlertException("Access denied to class recommendations", "group", "ERR_FORBIDDEN_NOT_IN_CLASS");
    }

    private static Map<Long, StudentRow> studentMap(List<StudentRow> students) {
        return students.stream().collect(Collectors.toMap(StudentRow::userId, Function.identity(), (a, b) -> a));
    }

    private static List<StudentRow> memberRows(List<GroupMember> members, Map<Long, StudentRow> byId) {
        return members.stream().map(member -> byId.get(member.getStudentId())).filter(Objects::nonNull).toList();
    }

    private static List<StudentRow> unassigned(List<StudentRow> students, List<GroupMember> members) {
        Set<Long> assigned = members.stream().map(GroupMember::getStudentId).collect(Collectors.toSet());
        return students.stream().filter(student -> !assigned.contains(student.userId())).toList();
    }
}
