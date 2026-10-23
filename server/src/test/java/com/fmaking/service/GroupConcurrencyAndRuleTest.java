package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.dto.GroupMemberDTO;
import com.fmaking.service.dto.GroupRuleEvaluationDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class GroupConcurrencyAndRuleTest {

    @Autowired
    private GroupRuleValidationService ruleValidationService;

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private GroupMemberHistoryRepository groupMemberHistoryRepository;

    @Autowired
    private SchoolClassRepository schoolClassRepository;

    @Autowired
    private DeadlineRepository deadlineRepository;

    @Autowired
    private RuleRepository ruleRepository;

    private SchoolClass testClass;
    private Deadline testDeadline;

    @BeforeEach
    void setUp() {
        testClass = new SchoolClass();
        testClass.setName("Test Group Class");
        testClass.setRulesVersion(1L);
        testClass = schoolClassRepository.saveAndFlush(testClass);

        testDeadline = new Deadline();
        testDeadline.setName("Test Group Deadline");
        testDeadline.setStartTime(Instant.now().minusSeconds(3600));
        testDeadline.setEndTime(Instant.now().plusSeconds(86400));
        testDeadline.setStatus("ACTIVE");
        testDeadline.getSchoolClasses().add(testClass);
        testDeadline = deadlineRepository.saveAndFlush(testDeadline);
    }

    @Test
    void testRuleValidation_HardAndSoftRules() {
        List<GroupMemberDTO> members = new ArrayList<>();
        members.add(GroupMemberDTO.builder()
            .studentId(101L).rollNumber("SE101").fullName("Student 1").majorCode("SE").majorId(1)
            .role(GroupMemberRole.LEADER).build());
        members.add(GroupMemberDTO.builder()
            .studentId(102L).rollNumber("IA102").fullName("Student 2").majorCode("IA").majorId(2)
            .role(GroupMemberRole.MEMBER).build());

        List<GroupRuleEvaluationDTO> evaluations = ruleValidationService.evaluateGroup(testClass.getId(), members);

        assertThat(evaluations).isNotEmpty();
        // Since MIN_MEMBERS_PER_GROUP defaults to 4, having 2 members should fail MIN_MEMBERS_PER_GROUP
        boolean allPassed = ruleValidationService.areAllRulesPassed(evaluations);
        assertThat(allPassed).isFalse();

        boolean hasHard = ruleValidationService.hasHardRuleViolations(evaluations);
        assertThat(hasHard).isTrue();

        // SE is optional until the lecturer explicitly enables it for this class.
        assertThat(evaluations).noneMatch(e -> e.getCode() == GroupingRuleCode.MIN_SE_MEMBERS_PER_GROUP);
    }

    @Test
    @Transactional
    void testActiveMembershipSeparation_LeaveGroupAThenJoinGroupB() {
        Long studentId = 9999L;
        Integer deadlineId = testDeadline.getId();
        Integer classId = testClass.getId();

        // 1. Create Group A
        Group groupA = new Group();
        groupA.setName("Team Alpha");
        groupA.setDeadlineId(deadlineId);
        groupA.setSchoolClassId(classId);
        groupA.setLeaderId(studentId);
        groupA.setStatus(GroupStatus.OPEN);
        groupA = groupRepository.saveAndFlush(groupA);

        // Member joins Group A
        GroupMember gmA = new GroupMember();
        gmA.setGroupId(groupA.getId());
        gmA.setStudentId(studentId);
        gmA.setDeadlineId(deadlineId);
        gmA.setSchoolClassId(classId);
        gmA.setRole(GroupMemberRole.LEADER);
        gmA.setJoinedAt(Instant.now());
        groupMemberRepository.saveAndFlush(gmA);

        GroupMemberHistory h1 = new GroupMemberHistory();
        h1.setGroupId(groupA.getId());
        h1.setStudentId(studentId);
        h1.setDeadlineId(deadlineId);
        h1.setAction(GroupMemberAction.JOINED);
        h1.setPerformedBy("test-user");
        h1.setNote("Tạo nhóm A");
        groupMemberHistoryRepository.saveAndFlush(h1);

        assertThat(groupMemberRepository.findByStudentIdAndDeadlineId(studentId, deadlineId)).isPresent();

        // 2. Student leaves Group A -> Active record is deleted
        groupMemberRepository.deleteByGroupIdAndStudentId(groupA.getId(), studentId);
        groupMemberRepository.flush();

        GroupMemberHistory h2 = new GroupMemberHistory();
        h2.setGroupId(groupA.getId());
        h2.setStudentId(studentId);
        h2.setDeadlineId(deadlineId);
        h2.setAction(GroupMemberAction.LEFT);
        h2.setPerformedBy("test-user");
        h2.setNote("Rời nhóm A");
        groupMemberHistoryRepository.saveAndFlush(h2);

        // Active membership is empty
        assertThat(groupMemberRepository.findByStudentIdAndDeadlineId(studentId, deadlineId)).isEmpty();

        // 3. Create Group B & Student joins Group B in the SAME deadline
        Group groupB = new Group();
        groupB.setName("Team Beta");
        groupB.setDeadlineId(deadlineId);
        groupB.setSchoolClassId(classId);
        groupB.setLeaderId(8888L);
        groupB.setStatus(GroupStatus.OPEN);
        groupB = groupRepository.saveAndFlush(groupB);

        GroupMember gmB = new GroupMember();
        gmB.setGroupId(groupB.getId());
        gmB.setStudentId(studentId);
        gmB.setDeadlineId(deadlineId);
        gmB.setSchoolClassId(classId);
        gmB.setRole(GroupMemberRole.MEMBER);
        gmB.setJoinedAt(Instant.now());
        // This must NOT throw Unique Constraint Violation because Group A was deleted from active table!
        groupMemberRepository.saveAndFlush(gmB);

        GroupMemberHistory h3 = new GroupMemberHistory();
        h3.setGroupId(groupB.getId());
        h3.setStudentId(studentId);
        h3.setDeadlineId(deadlineId);
        h3.setAction(GroupMemberAction.JOINED);
        h3.setPerformedBy("test-user");
        h3.setNote("Tham gia nhóm B");
        groupMemberHistoryRepository.saveAndFlush(h3);

        // Verify active membership is Group B
        GroupMember activeMember = groupMemberRepository.findByStudentIdAndDeadlineId(studentId, deadlineId).orElseThrow();
        assertThat(activeMember.getGroupId()).isEqualTo(groupB.getId());

        // Verify audit history preserved all 3 actions without conflict
        List<GroupMemberHistory> history = groupMemberHistoryRepository.findByStudentIdAndDeadlineIdOrderByCreatedAtDesc(studentId, deadlineId);
        assertThat(history).hasSize(3);
        assertThat(history.get(0).getAction()).isEqualTo(GroupMemberAction.JOINED);
        assertThat(history.get(1).getAction()).isEqualTo(GroupMemberAction.LEFT);
        assertThat(history.get(2).getAction()).isEqualTo(GroupMemberAction.JOINED);
    }
}
