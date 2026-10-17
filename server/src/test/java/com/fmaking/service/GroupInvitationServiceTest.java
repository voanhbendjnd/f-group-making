package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.dto.*;
import com.fmaking.web.rest.errors.ConflictAlertException;
import com.fmaking.web.rest.errors.UnprocessableAlertException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Transactional
class GroupInvitationServiceTest {

    @Autowired
    private GroupInvitationService groupInvitationService;

    @Autowired
    private GroupInvitationRepository groupInvitationRepository;

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private StudentRepository studentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SchoolClassRepository schoolClassRepository;

    @Autowired
    private DeadlineRepository deadlineRepository;

    @Autowired
    private RuleRepository ruleRepository;

    @Autowired
    private MajorRepository majorRepository;

    @Autowired
    private TermRepository termRepository;

    private SchoolClass testClass;
    private Deadline testDeadline;
    private User leaderUser;
    private User studentUser1;
    private User studentUser2;
    private Student leaderStudent;
    private Student student1;
    private Student student2;
    private Group testGroup;
    private Major majorSE;

    @BeforeEach
    void setUp() {
        majorSE = majorRepository.findAll().stream()
                .filter(m -> "SE".equalsIgnoreCase(m.getCode()))
                .findFirst()
                .orElseGet(() -> {
                    Major m = new Major();
                    m.setCode("SE");
                    m.setName("Software Engineering");
                    return majorRepository.saveAndFlush(m);
                });

        Term term = new Term();
        term.setName("Term " + java.util.UUID.randomUUID().toString().substring(0, 7));
        term = termRepository.saveAndFlush(term);

        testClass = new SchoolClass();
        testClass.setName("Class SE101");
        testClass.setTermId(term.getId());
        testClass.setRulesVersion(1L);
        testClass = schoolClassRepository.saveAndFlush(testClass);

        testDeadline = new Deadline();
        testDeadline.setName("Deadline Milestone 1");
        testDeadline.setStartTime(Instant.now().minusSeconds(3600));
        testDeadline.setEndTime(Instant.now().plusSeconds(86400));
        testDeadline.setStatus("ACTIVE");
        testDeadline.getSchoolClasses().add(testClass);
        testDeadline = deadlineRepository.saveAndFlush(testDeadline);

        // Leader User & Student
        leaderUser = new User();
        leaderUser.setEmail("leader@test.com");
        leaderUser.setPassword("pass");
        leaderUser = userRepository.saveAndFlush(leaderUser);

        leaderStudent = new Student();
        leaderStudent.setUserId(leaderUser.getId());
        leaderStudent.setFullName("Leader One");
        leaderStudent.setRollNumber("SE001");
        leaderStudent.setMemberCode("MEM001");
        leaderStudent.setSchoolClassId(testClass.getId());
        leaderStudent.setMajorId(majorSE.getId());
        leaderStudent = studentRepository.saveAndFlush(leaderStudent);

        // Candidate 1
        studentUser1 = new User();
        studentUser1.setEmail("student1@test.com");
        studentUser1.setPassword("pass");
        studentUser1 = userRepository.saveAndFlush(studentUser1);

        student1 = new Student();
        student1.setUserId(studentUser1.getId());
        student1.setFullName("Student One");
        student1.setRollNumber("SE002");
        student1.setMemberCode("MEM002");
        student1.setSchoolClassId(testClass.getId());
        student1.setMajorId(majorSE.getId());
        student1 = studentRepository.saveAndFlush(student1);

        // Candidate 2
        studentUser2 = new User();
        studentUser2.setEmail("student2@test.com");
        studentUser2.setPassword("pass");
        studentUser2 = userRepository.saveAndFlush(studentUser2);

        student2 = new Student();
        student2.setUserId(studentUser2.getId());
        student2.setFullName("Student Two");
        student2.setRollNumber("SE003");
        student2.setMemberCode("MEM003");
        student2.setSchoolClassId(testClass.getId());
        student2.setMajorId(majorSE.getId());
        student2 = studentRepository.saveAndFlush(student2);

        // Group
        testGroup = new Group();
        testGroup.setDeadlineId(testDeadline.getId());
        testGroup.setSchoolClassId(testClass.getId());
        testGroup.setName("Alpha Team");
        testGroup.setLeaderId(leaderStudent.getUserId());
        testGroup.setStatus(GroupStatus.OPEN);
        testGroup.setVersion(0L);
        testGroup = groupRepository.saveAndFlush(testGroup);

        GroupMember leaderMember = new GroupMember();
        leaderMember.setGroupId(testGroup.getId());
        leaderMember.setStudentId(leaderStudent.getUserId());
        leaderMember.setDeadlineId(testDeadline.getId());
        leaderMember.setSchoolClassId(testClass.getId());
        leaderMember.setRole(GroupMemberRole.LEADER);
        leaderMember.setJoinedAt(Instant.now());
        groupMemberRepository.saveAndFlush(leaderMember);
    }

    @Test
    @WithMockUser(username = "leader@test.com")
    void testSearchStudentsForInvite() {
        List<StudentSearchForInviteDTO> results = groupInvitationService.searchStudentsForInvite(
                testDeadline.getId(), testClass.getId(), testGroup.getId(), "student1"
        );

        assertThat(results).hasSize(1);
        StudentSearchForInviteDTO candidate = results.get(0);
        assertThat(candidate.getEmail()).isEqualTo("student1@test.com");
        assertThat(candidate.isHasGroup()).isFalse();
        assertThat(candidate.isCanInvite()).isTrue();
        assertThat(candidate.isHasPendingInvitation()).isFalse();
    }

    @Test
    @WithMockUser(username = "leader@test.com")
    void testSendAndAcceptInvitation() {
        SendInvitationRequest request = SendInvitationRequest.builder()
                .studentId(student1.getUserId())
                .message("Welcome to Alpha Team!")
                .build();

        GroupInvitationDTO invitation = groupInvitationService.sendInvitation(
                testDeadline.getId(), testClass.getId(), testGroup.getId(), request
        );

        assertThat(invitation).isNotNull();
        assertThat(invitation.getStatus()).isEqualTo(GroupInvitationStatus.PENDING);
        assertThat(invitation.getStudentId()).isEqualTo(student1.getUserId());

        // Target student accepts invitation
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken("student1@test.com", "pass")
        );

        GroupDTO updatedGroup = groupInvitationService.acceptInvitation(
                testDeadline.getId(), testClass.getId(), invitation.getId()
        );

        assertThat(updatedGroup.getMembers()).hasSize(2);
        GroupInvitation accepted = groupInvitationRepository.findById(invitation.getId()).orElseThrow();
        assertThat(accepted.getStatus()).isEqualTo(GroupInvitationStatus.ACCEPTED);
        assertThat(accepted.getRespondedAt()).isNotNull();
    }

    @Test
    @WithMockUser(username = "leader@test.com")
    void testRejectInvitation() {
        SendInvitationRequest request = SendInvitationRequest.builder()
                .studentId(student1.getUserId())
                .build();

        GroupInvitationDTO invitation = groupInvitationService.sendInvitation(
                testDeadline.getId(), testClass.getId(), testGroup.getId(), request
        );

        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken("student1@test.com", "pass")
        );

        groupInvitationService.rejectInvitation(testDeadline.getId(), testClass.getId(), invitation.getId());

        GroupInvitation rejected = groupInvitationRepository.findById(invitation.getId()).orElseThrow();
        assertThat(rejected.getStatus()).isEqualTo(GroupInvitationStatus.REJECTED);
    }

    @Test
    @WithMockUser(username = "leader@test.com")
    void testCannotInviteStudentAlreadyInGroup() {
        // Place student1 into another group
        Group otherGroup = new Group();
        otherGroup.setDeadlineId(testDeadline.getId());
        otherGroup.setSchoolClassId(testClass.getId());
        otherGroup.setName("Beta Team");
        otherGroup.setLeaderId(student1.getUserId());
        otherGroup.setStatus(GroupStatus.OPEN);
        otherGroup = groupRepository.saveAndFlush(otherGroup);

        GroupMember gm = new GroupMember();
        gm.setGroupId(otherGroup.getId());
        gm.setStudentId(student1.getUserId());
        gm.setDeadlineId(testDeadline.getId());
        gm.setSchoolClassId(testClass.getId());
        gm.setRole(GroupMemberRole.LEADER);
        gm.setJoinedAt(Instant.now());
        groupMemberRepository.saveAndFlush(gm);

        SendInvitationRequest request = SendInvitationRequest.builder()
                .studentId(student1.getUserId())
                .build();

        assertThatThrownBy(() -> groupInvitationService.sendInvitation(
                testDeadline.getId(), testClass.getId(), testGroup.getId(), request
        )).isInstanceOf(ConflictAlertException.class);
    }
}
