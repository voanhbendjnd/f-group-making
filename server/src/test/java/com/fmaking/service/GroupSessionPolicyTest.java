package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.dto.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:group-session-policy;DB_CLOSE_DELAY=-1;MODE=MySQL",
    "spring.jpa.properties.hibernate.cache.use_second_level_cache=false"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class GroupSessionPolicyTest {
    @Autowired GroupService service;
    @Autowired StudentProfileService profiles;
    @Autowired ClassRuleService classRules;
    @Autowired GroupRuleValidationService validation;
    @Autowired DeadlineService deadlineService;
    @Autowired SchoolClassRepository classes;
    @Autowired DeadlineRepository deadlines;
    @Autowired GroupRepository groups;
    @Autowired GroupMemberRepository members;
    @Autowired GroupStatusHistoryRepository history;
    @Autowired UserRepository users;
    @Autowired StudentRepository students;
    @Autowired MajorRepository majors;
    @Autowired RuleRepository rules;
    @Autowired TermRepository terms;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean NotificationAsyncService notifications;
    SchoolClass schoolClass;
    Deadline deadline;
    User teacher;
    Major se;
    Major otherMajor;

    void login(User user, String role) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
            user.getEmail(), "test", AuthorityUtils.createAuthorityList(role)));
    }

    User user() {
        User value = new User(); value.setName("Policy User"); value.setEmail(UUID.randomUUID() + "@example.test");
        value.setActivated(true); return users.saveAndFlush(value);
    }

    SchoolClass schoolClass() {
        SchoolClass value = new SchoolClass(); value.setName("Policy " + UUID.randomUUID()); value.setLecturerId(teacher.getId());
        Term term = new Term(); term.setName("T" + UUID.randomUUID().toString().substring(0, 7)); term = terms.saveAndFlush(term);
        value.setTermId(term.getId()); return classes.saveAndFlush(value);
    }

    @BeforeEach void setup() {
        teacher = user(); login(teacher, "ROLE_ADMIN"); schoolClass = schoolClass();
        deadline = new Deadline(); deadline.setName("Policy round"); deadline.setStartTime(Instant.now().minusSeconds(60));
        deadline.setEndTime(Instant.now().plusSeconds(3600)); deadline.getSchoolClasses().add(schoolClass);
        deadline = deadlines.saveAndFlush(deadline);
        se = majors.findAll().stream().filter(m -> "SE".equalsIgnoreCase(m.getCode())).findFirst().orElseGet(() -> {
            Major m = new Major(); m.setCode("SE"); m.setName("Software"); return majors.saveAndFlush(m);
        });
        otherMajor = new Major(); otherMajor.setCode("M" + UUID.randomUUID().toString().substring(0, 5));
        otherMajor.setName("Other " + UUID.randomUUID()); otherMajor = majors.saveAndFlush(otherMajor);
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    User student(SchoolClass target, Major major) {
        User user = user(); Student value = new Student(); value.setUserId(user.getId()); value.setFullName("Policy Student");
        value.setRollNumber("R" + user.getId()); value.setMemberCode("M" + user.getId()); value.setMajorId(major.getId());
        value.setSchoolClassId(target.getId()); students.saveAndFlush(value); return user;
    }

    GroupDTO draft(int count) {
        List<Long> ids = new ArrayList<>();
        for (int i = 0; i < count; i++) ids.add(student(schoolClass, i % 2 == 0 ? se : otherMajor).getId());
        LecturerCreateGroupRequest request = new LecturerCreateGroupRequest(); request.setName("Group " + UUID.randomUUID()); request.setStudentIds(ids);
        return service.lecturerCreateGroup(deadline.getId(), schoolClass.getId(), request);
    }

    void expire() { deadline.setEndTime(Instant.now().minusSeconds(1)); deadline = deadlines.saveAndFlush(deadline); }
    void rule(GroupingRuleCode code, int value) {
        Rule rule = new Rule(); rule.setSchoolClassId(schoolClass.getId()); rule.setCode(code.name()); rule.setValue(value); rule.setStatus(true); rules.saveAndFlush(rule);
    }
    UpdateDeadlineDTO extension() {
        UpdateDeadlineDTO dto = new UpdateDeadlineDTO(); dto.setId(deadline.getId()); dto.setName(deadline.getName());
        dto.setEndTime(Instant.now().plusSeconds(7200)); return dto;
    }

    @Test void repeatedReopeningPreservesGroupsMembersAndApprovalHistory() {
        GroupDTO group = draft(4); service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId());
        service.acceptGroup(deadline.getId(), schoolClass.getId(), group.getId());
        int historyCount = history.findByGroupIdOrderByCreatedAtDesc(group.getId()).size();
        for (int i = 0; i < 3; i++) {
            expire(); DeadlineDTO updated = deadlineService.updateDeadline(extension());
            assertThat(updated.getId()).isEqualTo(deadline.getId()); assertThat(updated.getStatus()).isEqualTo(DeadlineStatus.ACTIVE);
            deadline = deadlines.findById(deadline.getId()).orElseThrow();
        }
        assertThat(groups.findById(group.getId()).orElseThrow().getStatus()).isEqualTo(GroupStatus.ACCEPTED);
        assertThat(members.countByGroupId(group.getId())).isEqualTo(4);
        assertThat(history.findByGroupIdOrderByCreatedAtDesc(group.getId())).hasSize(historyCount);
        assertThatThrownBy(() -> service.lecturerRemoveMember(deadline.getId(), schoolClass.getId(), group.getId(), group.getMembers().getFirst().getStudentId())).isInstanceOf(RuntimeException.class);
    }

    @Test void sharedScopeMustBeConfirmedExactlyAndCancellationCannotBeReopened() {
        SchoolClass second = schoolClass(); deadline.getSchoolClasses().add(second); deadline = deadlines.saveAndFlush(deadline);
        UpdateDeadlineDTO dto = extension();
        assertThatThrownBy(() -> deadlineService.updateDeadline(dto)).hasMessageContaining("Confirm");
        dto.setConfirmedClassIds(List.of(schoolClass.getId()));
        assertThatThrownBy(() -> deadlineService.updateDeadline(dto)).hasMessageContaining("Confirm");
        dto.setConfirmedClassIds(List.of(schoolClass.getId(), second.getId()));
        assertThat(deadlineService.updateDeadline(dto).getSchoolClassIds()).containsExactlyInAnyOrder(schoolClass.getId(), second.getId());
        deadlineService.cancelOrDeleteDeadline(deadline.getId());
        assertThatThrownBy(() -> deadlineService.updateDeadline(dto)).isInstanceOf(RuntimeException.class);
    }

    @Test void pendingAndApprovedStructuresAreLockedButPendingReviewWorksAfterExpiry() {
        GroupDTO group = draft(4); service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId()); expire();
        assertThatThrownBy(() -> service.lecturerSetLeader(deadline.getId(), schoolClass.getId(), group.getId(), group.getMembers().getLast().getStudentId())).isInstanceOf(RuntimeException.class);
        service.acceptGroup(deadline.getId(), schoolClass.getId(), group.getId());
        assertThatThrownBy(() -> service.lecturerDisbandGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(RuntimeException.class);
        service.revokeGroup(deadline.getId(), schoolClass.getId(), group.getId());
        assertThatThrownBy(() -> service.lecturerRemoveMember(deadline.getId(), schoolClass.getId(), group.getId(), group.getMembers().getLast().getStudentId())).isInstanceOf(RuntimeException.class);
    }

    @Test void unlockRequiresAssignedTeacherOrAdminAndReturnsToReviewFlow() {
        GroupDTO group = draft(4); service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId()); service.acceptGroup(deadline.getId(), schoolClass.getId(), group.getId());
        User outsider = user(); login(outsider, "ROLE_LECTURE_MASTER");
        assertThatThrownBy(() -> service.revokeGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(RuntimeException.class);
        login(outsider, "ROLE_LECTURE");
        assertThatThrownBy(() -> service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(RuntimeException.class);
        login(teacher, "ROLE_LECTURE");
        assertThat(service.revokeGroup(deadline.getId(), schoolClass.getId(), group.getId()).getStatus()).isEqualTo(GroupStatus.REVOKED);
        service.lecturerSetLeader(deadline.getId(), schoolClass.getId(), group.getId(), group.getMembers().getLast().getStudentId());
        service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId());
        assertThat(service.acceptGroup(deadline.getId(), schoolClass.getId(), group.getId()).getStatus()).isEqualTo(GroupStatus.ACCEPTED);
    }

    @Test void rejectAfterUnlockDoesNotBypassActiveOnlyRevisionRule() {
        GroupDTO group = draft(4); service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId()); service.acceptGroup(deadline.getId(), schoolClass.getId(), group.getId());
        service.revokeGroup(deadline.getId(), schoolClass.getId(), group.getId()); service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId()); expire();
        RejectGroupRequest reject = new RejectGroupRequest(); reject.setReason("Needs revision");
        assertThat(service.rejectGroup(deadline.getId(), schoolClass.getId(), group.getId(), reject).getStatus()).isEqualTo(GroupStatus.REVOKED);
        assertThatThrownBy(() -> service.lecturerSetLeader(deadline.getId(), schoolClass.getId(), group.getId(), group.getLeaderId())).isInstanceOf(RuntimeException.class);
    }

    @Test void intermediateDraftsCanBeCreatedAfterExpiryButMustPassCompositionBeforeReview() {
        rule(GroupingRuleCode.MIN_MAJORS_PER_GROUP, 2); expire(); GroupDTO group = draft(1);
        assertThat(group.getStatus()).isEqualTo(GroupStatus.OPEN);
        assertThatThrownBy(() -> service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(RuntimeException.class);
        for (int i = 0; i < 3; i++) service.lecturerAddMember(deadline.getId(), schoolClass.getId(), group.getId(), student(schoolClass, otherMajor).getId());
        assertThat(service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId()).getStatus()).isEqualTo(GroupStatus.PENDING);
        service.acceptGroup(deadline.getId(), schoolClass.getId(), group.getId());
    }

    @Test void overflowMoveRollsBackSourceAndWrongClassAndDuplicateMembershipAreRejected() {
        GroupDTO source = draft(2); GroupDTO full = draft(6); Long studentId = source.getMembers().getFirst().getStudentId();
        assertThatThrownBy(() -> service.lecturerMoveMember(deadline.getId(), schoolClass.getId(), source.getId(), full.getId(), studentId)).isInstanceOf(RuntimeException.class);
        assertThat(members.findByGroupIdAndStudentId(source.getId(), studentId)).isPresent();
        assertThat(members.countByGroupId(source.getId())).isEqualTo(2); assertThat(members.countByGroupId(full.getId())).isEqualTo(6);
        assertThatThrownBy(() -> service.lecturerAddMember(deadline.getId(), schoolClass.getId(), full.getId(), studentId)).isInstanceOf(RuntimeException.class);
        Long wrongClass = student(schoolClass(), se).getId();
        assertThatThrownBy(() -> service.lecturerAddMember(deadline.getId(), schoolClass.getId(), source.getId(), wrongClass)).isInstanceOf(RuntimeException.class);
    }

    @Test void teacherConsolidatesNineGroupsIntoSixAfterExpiryWithoutReopening() {
        List<GroupDTO> values = new ArrayList<>(); for (int i = 0; i < 9; i++) values.add(draft(4));
        // Existing drafts may exceed a maximum configured later; retain them for deliberate consolidation.
        rule(GroupingRuleCode.MAX_GROUPS_PER_CLASS, 6); rule(GroupingRuleCode.MIN_MAJORS_PER_GROUP, 2); expire();
        assertThatThrownBy(() -> service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), values.getFirst().getId())).isInstanceOf(RuntimeException.class);
        int target = 0;
        for (int i = 6; i < 9; i++) for (GroupMemberDTO member : values.get(i).getMembers()) {
            service.lecturerMoveMember(deadline.getId(), schoolClass.getId(), values.get(i).getId(), values.get(target++ % 6).getId(), member.getStudentId());
        }
        for (int i = 0; i < 6; i++) {
            assertThat(members.countByGroupId(values.get(i).getId())).isEqualTo(6);
            service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), values.get(i).getId());
            service.acceptGroup(deadline.getId(), schoolClass.getId(), values.get(i).getId());
        }
        assertThat(service.getWorkspace(deadline.getId(), schoolClass.getId()).getGroups()).hasSize(6);
        assertThat(service.getWorkspace(deadline.getId(), schoolClass.getId()).getUnassignedStudents()).isEmpty();
        assertThat(service.getWorkspace(deadline.getId(), schoolClass.getId()).getDeadlineStatus()).isEqualTo("EXPIRED");
    }

    @Test void concurrentCreatesProduceOnlyOneSession() throws Exception {
        SchoolClass fresh = schoolClass(); ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        Callable<Boolean> create = () -> {
            login(teacher, "ROLE_ADMIN"); start.await();
            try {
                CreateDeadlineDTO request = new CreateDeadlineDTO(); request.setName("One session"); request.setSchoolClassIds(List.of(fresh.getId()));
                request.setStartTime(Instant.now()); request.setEndTime(Instant.now().plusSeconds(3600));
                deadlineService.createDeadline(request); return true;
            } catch (RuntimeException conflict) { return false; }
            finally { SecurityContextHolder.clearContext(); }
        };
        try {
            Future<Boolean> first = executor.submit(create); Future<Boolean> second = executor.submit(create); start.countDown();
            assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
            assertThat(deadlines.findAllBySchoolClassId(fresh.getId())).hasSize(1);
        } finally { executor.shutdownNow(); }
    }

    @Test void concurrentMovesCannotOverflowOrLoseTheOtherStudent() throws Exception {
        GroupDTO source = draft(2); GroupDTO target = draft(5); expire();
        ExecutorService executor = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        try {
            for (GroupMemberDTO member : source.getMembers()) results.add(executor.submit(() -> {
                login(teacher, "ROLE_LECTURE"); start.await();
                try {
                    service.lecturerMoveMember(deadline.getId(), schoolClass.getId(), source.getId(), target.getId(), member.getStudentId());
                    return true;
                } catch (RuntimeException conflict) { return false; }
                finally { SecurityContextHolder.clearContext(); }
            }));
            start.countDown();
            assertThat(List.of(results.get(0).get(15, TimeUnit.SECONDS), results.get(1).get(15, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(true, false);
            assertThat(members.countByGroupId(target.getId())).isEqualTo(6);
            assertThat(members.countByGroupId(source.getId())).isEqualTo(1);
        } finally { executor.shutdownNow(); }
    }

    @Test void disbandingReleasesTheNameButKeepsHistoryAndUnassignsTheLastMember() {
        GroupDTO original = draft(1);
        Long studentId = original.getMembers().getFirst().getStudentId();
        service.lecturerDisbandGroup(deadline.getId(), schoolClass.getId(), original.getId());
        assertThat(groups.findById(original.getId()).orElseThrow().getStatus()).isEqualTo(GroupStatus.DISBANDED);
        assertThat(members.countByGroupId(original.getId())).isZero();
        assertThat(history.findByGroupIdOrderByCreatedAtDesc(original.getId())).isNotEmpty();
        assertThat(service.getWorkspace(deadline.getId(), schoolClass.getId()).getUnassignedStudents())
            .extracting(GroupMemberDTO::getStudentId).contains(studentId);
        LecturerCreateGroupRequest request = new LecturerCreateGroupRequest();
        request.setName(original.getName().toUpperCase()); request.setStudentIds(List.of(studentId));
        GroupDTO recreated = service.lecturerCreateGroup(deadline.getId(), schoolClass.getId(), request);
        assertThat(recreated.getId()).isNotEqualTo(original.getId());
        assertThatThrownBy(() -> service.lecturerCreateGroup(deadline.getId(), schoolClass.getId(), request))
            .isInstanceOf(RuntimeException.class);
        assertThat(service.getWorkspace(deadline.getId(), schoolClass.getId()).getGroups())
            .extracting(GroupDTO::getId).contains(recreated.getId()).doesNotContain(original.getId());
    }

    @Test void studentsCannotWriteAfterExpiryAndCanResubmitUnlockedGroupsWhileActive() {
        GroupDTO group = draft(4); service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId());
        service.acceptGroup(deadline.getId(), schoolClass.getId(), group.getId());
        service.revokeGroup(deadline.getId(), schoolClass.getId(), group.getId());
        User leader = users.findById(group.getLeaderId()).orElseThrow(); login(leader, "ROLE_STUDENT");
        assertThat(service.submitGroup(deadline.getId(), schoolClass.getId(), group.getId()).getStatus()).isEqualTo(GroupStatus.PENDING);
        service.cancelSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId());
        expire();
        assertThatThrownBy(() -> service.submitGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> service.leaveGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(RuntimeException.class);
        CreateGroupRequest create = new CreateGroupRequest(); create.setName("Not allowed");
        assertThatThrownBy(() -> service.createGroup(deadline.getId(), schoolClass.getId(), create)).isInstanceOf(RuntimeException.class);
    }

    @Test void defaultsRequireTwoMajorsWithoutPersistingOrOverwritingConfiguredValues() {
        var defaults = classRules.getRules(schoolClass.getId());
        assertThat(defaults.rules()).anySatisfy(rule -> {
            assertThat(rule.code()).isEqualTo(GroupingRuleCode.MIN_MAJORS_PER_GROUP);
            assertThat(rule.value()).isEqualTo(2); assertThat(rule.status()).isTrue();
        });
        assertThat(defaults.rules().stream().filter(rule -> rule.code() == GroupingRuleCode.MAX_GROUPS_PER_CLASS
            || rule.code() == GroupingRuleCode.MIN_GROUPS_PER_CLASS)).allMatch(rule -> !rule.status());
        assertThat(rules.findBySchoolClassId(schoolClass.getId())).isEmpty();
        rule(GroupingRuleCode.MIN_MAJORS_PER_GROUP, 1);
        assertThat(validation.getClassRules(schoolClass.getId())).anySatisfy(rule -> {
            assertThat(rule.code()).isEqualTo(GroupingRuleCode.MIN_MAJORS_PER_GROUP);
            assertThat(rule.value()).isEqualTo(1);
        });
    }

    @Test void draftsCanBeIncompleteButSubmissionAndApprovalReevaluateMajorsAndSe() {
        List<Long> ids = new ArrayList<>(); for (int i = 0; i < 4; i++) ids.add(student(schoolClass, se).getId());
        LecturerCreateGroupRequest request = new LecturerCreateGroupRequest(); request.setName("Single major draft"); request.setStudentIds(ids);
        GroupDTO group = service.lecturerCreateGroup(deadline.getId(), schoolClass.getId(), request);
        assertThatThrownBy(() -> service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(RuntimeException.class);
        rule(GroupingRuleCode.MIN_MAJORS_PER_GROUP, 1);
        service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId());
        rule(GroupingRuleCode.MIN_SE_MEMBERS_PER_GROUP, 5);
        assertThatThrownBy(() -> service.acceptGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(RuntimeException.class);
        assertThat(groups.findById(group.getId()).orElseThrow().getStatus()).isEqualTo(GroupStatus.PENDING);
    }

    @Test void studentCreateJoinLeaveUsesCanonicalMembershipAndOnlyChecksDraftMaximums() {
        User first = student(schoolClass, otherMajor); User second = student(schoolClass, otherMajor);
        login(first, "ROLE_STUDENT"); CreateGroupRequest request = new CreateGroupRequest(); request.setName("Student draft");
        GroupDTO group = service.createGroup(deadline.getId(), schoolClass.getId(), request);
        assertThat(profiles.getCurrentProfile().group().name()).isEqualTo(group.getName());
        assertThat(students.findById(first.getId()).orElseThrow().getGroupId()).isNull();
        login(second, "ROLE_STUDENT"); service.joinGroup(deadline.getId(), schoolClass.getId(), group.getId());
        assertThat(profiles.getCurrentProfile().group().name()).isEqualTo(group.getName());
        assertThat(service.getWorkspace(deadline.getId(), schoolClass.getId()).getMyGroup().getId()).isEqualTo(group.getId());
        service.leaveGroup(deadline.getId(), schoolClass.getId(), group.getId());
        assertThat(profiles.getCurrentProfile().group().state()).isEqualTo("UNASSIGNED");
        login(first, "ROLE_STUDENT");
        assertThatThrownBy(() -> service.submitGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(RuntimeException.class);
        service.leaveGroup(deadline.getId(), schoolClass.getId(), group.getId());
        assertThat(profiles.getCurrentProfile().group().state()).isEqualTo("UNASSIGNED");
    }

    @Test void profileFollowsAtomicMoveAndDisbandWithoutLegacyColumnWrites() {
        GroupDTO source = draft(1); GroupDTO target = draft(1); Long id = source.getLeaderId();
        service.lecturerMoveMember(deadline.getId(), schoolClass.getId(), source.getId(), target.getId(), id);
        login(users.findById(id).orElseThrow(), "ROLE_STUDENT");
        assertThat(profiles.getCurrentProfile().group().name()).isEqualTo(target.getName());
        login(teacher, "ROLE_LECTURE"); service.lecturerDisbandGroup(deadline.getId(), schoolClass.getId(), target.getId());
        login(users.findById(id).orElseThrow(), "ROLE_STUDENT");
        assertThat(profiles.getCurrentProfile().group().state()).isEqualTo("UNASSIGNED");
    }

    @Test void unassignedMasterCanReadButCannotMutateAnyGroupOrClassRules() {
        GroupDTO group = draft(4); User master = user(); login(master, "ROLE_LECTURE_MASTER");
        assertThat(service.getWorkspace(deadline.getId(), schoolClass.getId()).isCanManageGroups()).isFalse();
        assertThatThrownBy(() -> service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(com.fmaking.web.rest.errors.ForbiddenAlertException.class);
        assertThatThrownBy(() -> service.lecturerDisbandGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(com.fmaking.web.rest.errors.ForbiddenAlertException.class);
        login(teacher, "ROLE_LECTURE_MASTER");
        assertThat(service.getWorkspace(deadline.getId(), schoolClass.getId()).isCanManageGroups()).isTrue();
        service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId()); expire();
        assertThat(service.acceptGroup(deadline.getId(), schoolClass.getId(), group.getId()).getStatus()).isEqualTo(GroupStatus.ACCEPTED);
    }

    @Test void configuredMaximumsApplyDuringFormationAndDisabledCapacityIsNotSilentlyRestored() {
        rule(GroupingRuleCode.MAX_MEMBERS_PER_GROUP, 2); rule(GroupingRuleCode.MAX_MAJORS_PER_GROUP, 1);
        GroupDTO target = draft(1); Long other = student(schoolClass, otherMajor).getId();
        assertThatThrownBy(() -> service.lecturerAddMember(deadline.getId(), schoolClass.getId(), target.getId(), other)).isInstanceOf(RuntimeException.class);
        Long sameMajor = student(schoolClass, se).getId(); service.lecturerAddMember(deadline.getId(), schoolClass.getId(), target.getId(), sameMajor);
        assertThatThrownBy(() -> service.lecturerAddMember(deadline.getId(), schoolClass.getId(), target.getId(), student(schoolClass, se).getId())).isInstanceOf(RuntimeException.class);
        rule(GroupingRuleCode.MAX_GROUPS_PER_CLASS, 1);
        assertThatThrownBy(() -> draft(1)).isInstanceOf(RuntimeException.class);
        Rule maximum = rules.findBySchoolClassId(schoolClass.getId()).stream().filter(rule -> rule.getCode().equals("MAX_MEMBERS_PER_GROUP")).findFirst().orElseThrow();
        maximum.setStatus(false); rules.saveAndFlush(maximum);
        service.lecturerAddMember(deadline.getId(), schoolClass.getId(), target.getId(), student(schoolClass, se).getId());
        assertThat(members.countByGroupId(target.getId())).isEqualTo(3);
    }

    @Test void historicalDuplicateSessionsAreReportedWithoutChoosingOrDeletingOne() {
        GroupDTO group = draft(1);
        Deadline duplicate = new Deadline(); duplicate.setName("Legacy duplicate"); duplicate.setStartTime(Instant.now().minusSeconds(60));
        duplicate.setEndTime(Instant.now().plusSeconds(3600)); duplicate.getSchoolClasses().add(schoolClass); deadlines.saveAndFlush(duplicate);
        assertThatThrownBy(() -> service.lecturerDisbandGroup(deadline.getId(), schoolClass.getId(), group.getId()))
            .isInstanceOf(com.fmaking.web.rest.errors.ConflictAlertException.class).hasMessageContaining("historical");
        assertThat(deadlines.findAllBySchoolClassId(schoolClass.getId())).hasSize(2);
        assertThat(members.countByGroupId(group.getId())).isEqualTo(1);
    }

    @Test void customMemberBoundsAndDisabledSeAreRespectedAtCompletion() {
        rule(GroupingRuleCode.MIN_MEMBERS_PER_GROUP, 5); rule(GroupingRuleCode.MAX_MEMBERS_PER_GROUP, 7);
        GroupDTO group = draft(4);
        assertThatThrownBy(() -> service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(RuntimeException.class);
        service.lecturerAddMember(deadline.getId(), schoolClass.getId(), group.getId(), student(schoolClass, otherMajor).getId());
        service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId());
        assertThat(service.acceptGroup(deadline.getId(), schoolClass.getId(), group.getId()).getStatus()).isEqualTo(GroupStatus.ACCEPTED);
    }

    @Test void seMinimumIsACompletionCountAndCanBeDisabledExplicitly() {
        Major third = new Major(); third.setCode("X" + UUID.randomUUID().toString().substring(0, 5)); third.setName("Third"); third = majors.saveAndFlush(third);
        LecturerCreateGroupRequest request = new LecturerCreateGroupRequest(); request.setName("No SE draft");
        request.setStudentIds(List.of(student(schoolClass, otherMajor).getId(), student(schoolClass, otherMajor).getId(),
            student(schoolClass, third).getId(), student(schoolClass, third).getId()));
        GroupDTO group = service.lecturerCreateGroup(deadline.getId(), schoolClass.getId(), request);
        assertThatThrownBy(() -> service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId())).isInstanceOf(RuntimeException.class);
        Rule seRule = new Rule(); seRule.setSchoolClassId(schoolClass.getId()); seRule.setCode("MIN_SE_MEMBERS_PER_GROUP"); seRule.setValue(1); seRule.setStatus(false); rules.saveAndFlush(seRule);
        service.lecturerSubmitGroup(deadline.getId(), schoolClass.getId(), group.getId());
        assertThat(service.acceptGroup(deadline.getId(), schoolClass.getId(), group.getId()).getStatus()).isEqualTo(GroupStatus.ACCEPTED);
    }
}
