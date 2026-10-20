package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.dto.*;
import com.fmaking.web.rest.errors.ConflictAlertException;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** No enclosing test transaction: exercise real service commit/rollback and REQUIRES_NEW reservations. */
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:allocation-apply;DB_CLOSE_DELAY=-1;MODE=MySQL",
    "spring.jpa.properties.hibernate.cache.use_second_level_cache=false"
})
@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
class AllocationApplyServiceTest {
    @BeforeAll static void approvedMigrationOnDisposableMysql(@Autowired javax.sql.DataSource dataSource) throws Exception {
        if (!"true".equals(System.getenv("ALLOCATION_ISOLATED_MYSQL_TEST"))) return;
        try (var connection = dataSource.getConnection(); var statement = connection.createStatement()) {
            assertThat(connection.getMetaData().getURL()).startsWith("jdbc:mysql://127.0.0.1:33318/fmaking_allocation_test");
            // Only replace Hibernate's three EMPTY staging tables in this disposable test database.
            try (var result = statement.executeQuery("SELECT COUNT(*) FROM allocation_previews")) { result.next(); assertThat(result.getLong(1)).isZero(); }
            statement.execute("DROP TABLE allocation_runs"); statement.execute("DROP TABLE allocation_apply_requests"); statement.execute("DROP TABLE allocation_previews");
            var migration = new org.springframework.jdbc.datasource.init.ResourceDatabasePopulator(
                new org.springframework.core.io.FileSystemResource("../docs/sql/20261020_allocation_storage.sql"));
            migration.populate(connection);
            try (var result = statement.executeQuery("SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name LIKE 'allocation_%' AND constraint_type='FOREIGN KEY'")) {
                result.next(); assertThat(result.getInt(1)).isEqualTo(12);
            }
        }
    }
    @AfterAll static void removeTestMigrationTables(@Autowired javax.sql.DataSource dataSource) throws Exception {
        if (!"true".equals(System.getenv("ALLOCATION_ISOLATED_MYSQL_TEST"))) return;
        try (var connection = dataSource.getConnection(); var statement = connection.createStatement()) {
            assertThat(connection.getMetaData().getURL()).startsWith("jdbc:mysql://127.0.0.1:33318/fmaking_allocation_test");
            statement.execute("DROP TABLE IF EXISTS allocation_runs");
            statement.execute("DROP TABLE IF EXISTS allocation_apply_requests");
            statement.execute("DROP TABLE IF EXISTS allocation_previews");
        }
    }
    @org.springframework.test.context.DynamicPropertySource
    static void isolatedMysql(org.springframework.test.context.DynamicPropertyRegistry properties) {
        // Opt-in, fixed disposable endpoint: never accept an application/local database URL from the environment.
        if ("true".equals(System.getenv("ALLOCATION_ISOLATED_MYSQL_TEST"))) {
            properties.add("spring.datasource.url", () -> "jdbc:mysql://127.0.0.1:33318/fmaking_allocation_test?allowPublicKeyRetrieval=true&useSSL=false&serverTimezone=UTC");
            properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
            properties.add("spring.datasource.username", () -> "root");
            properties.add("spring.datasource.password", () -> "allocation-test-only");
            properties.add("spring.jpa.database-platform", () -> "org.hibernate.dialect.MySQLDialect");
        }
    }
    @Autowired AllocationPreviewService previews;
    @Autowired AllocationApplyCoordinator apply;
    @Autowired AllocationRetentionService retention;
    @Autowired AllocationHistoryService history;
    @Autowired AllocationPlanHistoryService planHistory;
    @Autowired GroupInvitationService invitationService;
    @Autowired AllocationPreviewRepository storedPreviews;
    @Autowired AllocationApplyRequestRepository requests;
    @MockitoSpyBean AllocationRunRepository runs;
    @MockitoSpyBean GroupService groupService;
    @Autowired UserRepository users;
    @Autowired StudentRepository students;
    @Autowired SchoolClassRepository classes;
    @Autowired DeadlineRepository deadlines;
    @Autowired GroupRepository groups;
    @Autowired GroupMemberRepository members;
    @Autowired GroupInvitationRepository invitations;
    @Autowired MajorRepository majors;
    @Autowired RuleRepository rules;
    @Autowired GroupStatusHistoryRepository statusHistory;
    @Autowired GroupMemberHistoryRepository memberHistory;
    @Autowired org.springframework.test.web.servlet.MockMvc mvc;
    @Autowired com.fasterxml.jackson.databind.ObjectMapper mapper;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean NotificationAsyncService notifications;
    @MockitoBean MailService mail;
    @MockitoBean SimpMessagingTemplate realtime;
    @MockitoBean Clock clock;
    Instant now;
    User teacher;
    SchoolClass schoolClass;
    Deadline deadline;
    List<Long> ids;
    List<Long> groupIds;

    @BeforeEach void setup() {
        now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS); when(clock.instant()).thenAnswer(inv -> now); when(clock.getZone()).thenReturn(ZoneOffset.UTC);
        new TransactionTemplate(manager).executeWithoutResult(tx -> {
            teacher = user("Teacher");
            schoolClass = new SchoolClass(); schoolClass.setName("Allocation " + UUID.randomUUID()); schoolClass.setLecturerId(teacher.getId()); schoolClass = classes.saveAndFlush(schoolClass);
            deadline = new Deadline(); deadline.setName("Test session"); deadline.setStartTime(now.minusSeconds(7200));
            deadline.setEndTime(now.minusSeconds(3600)); deadline.getSchoolClasses().add(schoolClass); deadline = deadlines.saveAndFlush(deadline);
            Major se = majors.findAll().stream().filter(m -> "SE".equals(m.getCode())).findFirst().orElseGet(() -> major("SE"));
            Major other = major("M" + UUID.randomUUID().toString().substring(0, 6));
            ids = new ArrayList<>(); groupIds = new ArrayList<>();
            for (int i = 0; i < 8; i++) {
                User u = user("Student " + i); Student s = new Student(); s.setUserId(u.getId()); s.setFullName(u.getName());
                s.setRollNumber("S" + u.getId()); s.setMemberCode("M" + u.getId()); s.setMajorId(i % 2 == 0 ? se.getId() : other.getId());
                s.setSchoolClassId(schoolClass.getId()); students.saveAndFlush(s); ids.add(u.getId());
            }
            for (int i = 0; i < 3; i++) {
                Group g = new Group(); g.setName("Group " + i); g.setSchoolClassId(schoolClass.getId()); g.setDeadlineId(deadline.getId());
                g.setLeaderId(ids.get(i * 2)); g.setStatus(i == 1 ? GroupStatus.REVOKED : GroupStatus.OPEN); g = groups.saveAndFlush(g); groupIds.add(g.getId());
                for (int j = 0; j < 2; j++) {
                    GroupMember m = new GroupMember(); m.setGroupId(g.getId()); m.setStudentId(ids.get(i * 2 + j)); m.setDeadlineId(deadline.getId());
                    m.setSchoolClassId(schoolClass.getId()); m.setRole(j == 0 ? GroupMemberRole.LEADER : GroupMemberRole.MEMBER); m.setJoinedAt(now); members.saveAndFlush(m);
                }
            }
        });
        login(teacher, "LECTURE"); clearInvocations(realtime);
    }
    @AfterEach void cleanup() { SecurityContextHolder.clearContext(); }
    User user(String name) { User u = new User(); u.setName(name); u.setEmail(UUID.randomUUID() + "@example.test"); u.setActivated(true); return users.saveAndFlush(u); }
    Major major(String code) { Major m = new Major(); m.setCode(code); m.setName("Major " + UUID.randomUUID()); return majors.saveAndFlush(m); }
    void login(User user, String role) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user.getEmail(), "n/a", List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }
    AllocationPreviewDTO preview() { return previews.preview(deadline.getId(), schoolClass.getId(), new AllocationPreviewRequest(2, 17L, null)); }
    AllocationApplyDTO apply(AllocationPreviewDTO p, String key) { return apply.apply(deadline.getId(), schoolClass.getId(), p.previewId(), key); }
    long runCount() { return runs.findBySchoolClassIdAndDeadlineIdOrderByAppliedAtDescIdDesc(schoolClass.getId(), deadline.getId(), org.springframework.data.domain.PageRequest.of(0, 10)).getTotalElements(); }
    void conflict(Runnable action, String key) { assertThatThrownBy(action::run).isInstanceOfSatisfying(ConflictAlertException.class, e -> assertThat(e.getErrorKey()).isEqualTo(key)); }
    GroupInvitation invite(Long group, Long student) {
        var i = new GroupInvitation(); i.setGroupId(group); i.setStudentId(student); i.setInviterId(ids.getFirst()); i.setSchoolClassId(schoolClass.getId()); i.setDeadlineId(deadline.getId());
        return invitations.saveAndFlush(i);
    }

    @Test void applyCommitsMembershipApprovalHistoryAndIdempotentResult() {
        var p = preview(); assertThat(p.previewId()).isNotNull(); assertThat(p.expiresAt()).isNull();
        assertThat(members.findByGroupId(groupIds.getFirst())).hasSize(2); verifyNoInteractions(realtime);
        var result = apply(p, "happy"); assertThat(result.approvedGroupIds()).hasSize(2);
        assertThat(runCount()).isEqualTo(1);
        for (Long id : result.approvedGroupIds()) {
            assertThat(groups.findById(id).orElseThrow().getStatus()).isEqualTo(GroupStatus.ACCEPTED); assertThat(members.findByGroupId(id)).hasSize(4);
            assertThat(statusHistory.findByGroupIdOrderByCreatedAtDesc(id)).extracting(GroupStatusHistory::getToStatus).contains(GroupStatus.PENDING, GroupStatus.ACCEPTED);
        }
        for (Long id : ids) assertThat(members.findByStudentIdAndDeadlineId(id, deadline.getId())).isPresent();
        now = now.plusSeconds(1000); assertThat(apply(p, "happy")).isEqualTo(result);
        assertThat(history.detail(deadline.getId(), schoolClass.getId(), result.runId())).isEqualTo(result);
        conflict(() -> apply(p, "other-key"), "allocationPreviewUsed"); assertThat(runCount()).isEqualTo(1);
        verify(realtime, atLeastOnce()).convertAndSend(anyString(), any(Object.class)); verifyNoInteractions(mail);
    }
    @Test void savedPlanCanApplyAfterThirtyOneDaysIfSourceIsUnchanged() {
        var p = preview(); now = now.plus(Duration.ofDays(31)); retention.clean();
        assertThat(storedPreviews.findById(p.previewId()).orElseThrow().getPayload()).isNotNull();
        var saved = planHistory.detail(deadline.getId(), schoolClass.getId(), p.previewId());
        assertThat(saved.summary().canApply()).isTrue();
        assertThat(saved.preview().groups()).isEqualTo(p.groups());
        assertThat(apply(p, "durable").approvedGroupIds()).hasSize(2);
    }
    @Test void staleMembershipCannotApply() {
        var p = preview(); var m = members.findByStudentIdAndDeadlineId(ids.getFirst(), deadline.getId()).orElseThrow(); m.setRole(GroupMemberRole.MEMBER); members.saveAndFlush(m);
        assertThatThrownBy(() -> apply(p, "stale")).isInstanceOf(ConflictAlertException.class); assertThat(runCount()).isZero();
    }

    @Test void savedHistoryRemainsReadableWithBrokenLiveDataOutsideAnyTestTransaction() {
        var p = preview();
        var other = new SchoolClass(); other.setName("Other history scope"); other = classes.saveAndFlush(other);
        var member = members.findByGroupId(groupIds.getFirst()).getFirst(); member.setSchoolClassId(other.getId()); members.saveAndFlush(member);
        var saved = planHistory.detail(deadline.getId(), schoolClass.getId(), p.previewId());
        assertThat(saved.summary().status()).isEqualTo(AllocationPlanHistoryService.Status.INVALID);
        assertThat(saved.summary().canApply()).isFalse();
        assertThat(saved.preview().groups()).isEqualTo(p.groups());
    }

    @Test void unbalancedStoredPlanIsRejectedBeforeAnyMembershipOrInvitationWrite() throws Exception {
        var p = preview();
        var first = p.groups().getFirst(); var second = p.groups().get(1);
        var six = new ArrayList<>(first.members()); six.addAll(second.members().subList(0, 2));
        var two = second.members().subList(2, 4);
        var changedGroups = List.of(
            new AllocationPreviewDTO.GroupView(first.groupId(), first.name(), first.status(), first.leaderId(), first.leaderName(), false, six, first.score(), first.rules(), true),
            new AllocationPreviewDTO.GroupView(second.groupId(), second.name(), second.status(), second.leaderId(), second.leaderName(), false, two, second.score(), second.rules(), true));
        String fingerprint = previews.planFingerprint(p.snapshotFingerprint(), changedGroups);
        var changed = new AllocationPreviewDTO(p.scope(), p.snapshotFingerprint(), fingerprint, false, p.result(), changedGroups, p.report(), null, null, null);
        var stored = storedPreviews.findById(p.previewId()).orElseThrow(); stored.setPlanFingerprint(fingerprint); stored.setPayload(mapper.writeValueAsString(changed)); storedPreviews.saveAndFlush(stored);
        long before = members.count();
        conflict(() -> apply(p, "unbalanced"), "allocationBalanceViolation");
        assertThat(members.count()).isEqualTo(before); assertThat(runCount()).isZero();
        verifyNoInteractions(realtime, mail);
    }
    @Test void staleDeadlineCannotApply() { var p = preview(); deadline.setEndTime(now.plusSeconds(3600)); deadlines.saveAndFlush(deadline); conflict(() -> apply(p, "stale-time"), "allocationPreviewStale"); }
    @Test void pendingInvitationChangeInvalidatesSnapshot() { var p = preview(); invite(groupIds.getFirst(), ids.getLast()); conflict(() -> apply(p, "invite-stale"), "allocationPreviewStale"); }
    @Test void ruleChangeInvalidatesSnapshot() {
        var p = preview(); Rule rule = new Rule(); rule.setSchoolClassId(schoolClass.getId()); rule.setCode("MIN_MEMBERS_PER_GROUP"); rule.setValue(5); rule.setStatus(true); rules.saveAndFlush(rule);
        conflict(() -> apply(p, "rules-stale"), "allocationPreviewStale");
    }
    @Test void majorChangeInvalidatesSnapshot() {
        var p = preview(); var student = students.findById(ids.getFirst()).orElseThrow(); student.setMajorId(major("NEW" + schoolClass.getId()).getId()); students.saveAndFlush(student);
        conflict(() -> apply(p, "major-stale"), "allocationPreviewStale");
    }
    @Test void protectedStatusChangeInvalidatesSnapshot() {
        var p = preview(); var group = groups.findById(groupIds.getFirst()).orElseThrow(); group.setStatus(GroupStatus.PENDING); groups.saveAndFlush(group);
        conflict(() -> apply(p, "review-stale"), "allocationPreviewStale");
    }
    @Test void disabledRulesAreRespectedDuringApply() {
        for (var code : GroupingRuleCode.values()) { Rule rule = new Rule(); rule.setSchoolClassId(schoolClass.getId()); rule.setCode(code.name()); rule.setValue(code.getSuggestedValue()); rule.setStatus(false); rules.saveAndFlush(rule); }
        assertThat(apply(preview(), "disabled").approvedGroupIds()).hasSize(2);
    }
    @Test void affectedInvitationsCancelledAtomicallyAndOutsideScopeUnchanged() {
        var affected = invite(groupIds.getFirst(), ids.getLast());
        SchoolClass other = new SchoolClass(); other.setName("Outside scope"); other = classes.saveAndFlush(other);
        var outside = invite(groupIds.get(1), ids.getLast()); outside.setSchoolClassId(other.getId()); invitations.saveAndFlush(outside);
        apply(preview(), "cancel-invites");
        assertThat(invitations.findById(affected.getId()).orElseThrow().getStatus()).isEqualTo(GroupInvitationStatus.CANCELLED);
        assertThat(invitations.findById(outside.getId()).orElseThrow().getStatus()).isEqualTo(GroupInvitationStatus.PENDING);
    }
    @Test void historyFailureRollsBackMembershipApprovalInvitationsAndRealtime() {
        var invitation = invite(groupIds.getFirst(), ids.getLast()); var p = preview();
        doThrow(new IllegalStateException("Simulated history failure")).when(runs).saveAndFlush(any(AllocationRun.class));
        assertThatThrownBy(() -> apply(p, "rollback")).isInstanceOf(IllegalStateException.class);
        assertThat(runCount()).isZero(); assertThat(storedPreviews.findById(p.previewId()).orElseThrow().getAppliedAt()).isNull();
        assertThat(members.findByGroupId(groupIds.getFirst())).hasSize(2); assertThat(groups.findById(groupIds.getFirst()).orElseThrow().getStatus()).isEqualTo(GroupStatus.OPEN);
        assertThat(invitations.findById(invitation.getId()).orElseThrow().getStatus()).isEqualTo(GroupInvitationStatus.PENDING); verifyNoInteractions(realtime);
        for (Long id : groupIds) { assertThat(statusHistory.findByGroupIdOrderByCreatedAtDesc(id)).isEmpty(); assertThat(memberHistory.findByGroupIdOrderByCreatedAtDesc(id)).isEmpty(); }
        reset(runs);
        assertThat(apply(p, "rollback").approvedGroupIds()).hasSize(2);
    }
    @Test void sameKeyDifferentPreviewRejected() { var p = preview(); var p2 = preview(); apply(p, "bound-key"); conflict(() -> apply(p2, "bound-key"), "allocationIdempotencyMismatch"); }
    @Test void wrongOwnerAndUnassignedMasterDenied() {
        var p = preview(); User other = user("Other"); login(other, "LECTURE_MASTER"); assertThatThrownBy(() -> apply(p, "master")).isInstanceOf(com.fmaking.web.rest.errors.ForbiddenAlertException.class);
        login(other, "ADMIN"); assertThatThrownBy(() -> apply(p, "admin-owner")).isInstanceOf(com.fmaking.web.rest.errors.NotFoundAlertException.class);
    }
    @Test void consumedPreviewCannotReplayAfterIdempotencyRetention() {
        var p = preview(); var result = apply(p, "retained"); now = now.plus(Duration.ofDays(31)); retention.clean();
        assertThat(runs.findById(result.runId()).orElseThrow().getApplyRequestId()).isNull();
        assertThat(storedPreviews.findById(p.previewId()).orElseThrow().getPayload()).isNotNull();
        assertThat(planHistory.detail(deadline.getId(), schoolClass.getId(), p.previewId()).summary().status()).isEqualTo(AllocationPlanHistoryService.Status.APPLIED);
        conflict(() -> apply(p, "retained"), "allocationPreviewUsed"); assertThat(runCount()).isEqualTo(1);
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = GroupStatus.class, names = {"PENDING", "ACCEPTED"})
    void protectedGroupAndInvitationRemainUntouched(GroupStatus status) {
        var group = groups.findById(groupIds.getFirst()).orElseThrow(); group.setStatus(status); groups.saveAndFlush(group);
        // Protected sizes participate in balance: keep four fixed students and allocate the other four.
        for (Long id : ids.subList(6, 8)) {
            var member = new GroupMember(); member.setGroupId(group.getId()); member.setStudentId(id); member.setDeadlineId(deadline.getId());
            member.setSchoolClassId(schoolClass.getId()); member.setRole(GroupMemberRole.MEMBER); member.setJoinedAt(now); members.saveAndFlush(member);
        }
        var invitation = invite(group.getId(), ids.getLast());
        var before = members.findByGroupId(group.getId()).stream().map(m -> List.of(m.getId(), m.getStudentId(), m.getRole())).toList();
        var result = apply(preview(), "protected"); assertThat(result.approvedGroupIds()).doesNotContain(group.getId());
        assertThat(groups.findById(group.getId()).orElseThrow().getStatus()).isEqualTo(status);
        assertThat(members.findByGroupId(group.getId()).stream().map(m -> List.of(m.getId(), m.getStudentId(), m.getRole())).toList()).isEqualTo(before);
        assertThat(invitations.findById(invitation.getId()).orElseThrow().getStatus()).isEqualTo(GroupInvitationStatus.PENDING);
    }
    @Test void approvalFailureRollsBackAllMembershipAndHistoryWrites() {
        var p = preview();
        doThrow(new IllegalStateException("Simulated approval failure")).when(groupService).acceptGroup(anyInt(), anyInt(), anyLong());
        assertThatThrownBy(() -> apply(p, "approval-failure")).isInstanceOf(IllegalStateException.class);
        assertThat(runCount()).isZero();
        for (Long id : groupIds) assertThat(members.findByGroupId(id)).hasSize(2);
        assertThat(groups.findById(groupIds.getFirst()).orElseThrow().getStatus()).isEqualTo(GroupStatus.OPEN);
        verifyNoInteractions(realtime);
    }
    @Test void concurrentSameKeyReturnsOneRun() throws Exception { concurrent(true); }
    @Test void concurrentDifferentKeysConsumePreviewOnce() throws Exception { concurrent(false); }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {true, false})
    void invitationAndLeaderMutationsSerializeWithApply(boolean invitationMutation) throws Exception {
        var invitation = invite(groupIds.getFirst(), ids.getLast()); var p = preview();
        Long keptGroup = p.groups().stream().filter(g -> !g.protectedGroup()).findFirst().orElseThrow().groupId();
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1), started = new CountDownLatch(1);
        doAnswer(inv -> { entered.countDown(); if (!release.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Gate timeout"); return inv.callRealMethod(); })
            .when(groupService).applyAllocationPlan(anyInt(), anyInt(), anyList());
        try (var pool = Executors.newFixedThreadPool(2)) {
            var applying = pool.submit(() -> { login(teacher, "LECTURE"); try { return apply(p, "mutation-race"); } finally { SecurityContextHolder.clearContext(); } });
            assertThat(entered.await(15, TimeUnit.SECONDS)).isTrue();
            var mutation = pool.submit(() -> {
                login(invitationMutation ? users.findById(ids.getLast()).orElseThrow() : teacher, invitationMutation ? "STUDENT" : "LECTURE");
                started.countDown();
                try {
                    if (invitationMutation) invitationService.rejectInvitation(deadline.getId(), schoolClass.getId(), invitation.getId());
                    else groupService.lecturerSetLeader(deadline.getId(), schoolClass.getId(), keptGroup, ids.getFirst());
                } finally { SecurityContextHolder.clearContext(); }
            });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> mutation.get(250, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown(); applying.get(30, TimeUnit.SECONDS);
            assertThatThrownBy(() -> mutation.get(30, TimeUnit.SECONDS)).hasCauseInstanceOf(ConflictAlertException.class);
            assertThat(runCount()).isEqualTo(1);
        } finally { release.countDown(); }
    }
    void concurrent(boolean sameKey) throws Exception {
        var p = preview(); CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        doAnswer(inv -> { entered.countDown(); if (!release.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Test gate timeout"); return inv.callRealMethod(); })
            .when(groupService).applyAllocationPlan(anyInt(), anyInt(), anyList());
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> { login(teacher, "LECTURE"); try { return apply(p, "parallel"); } finally { SecurityContextHolder.clearContext(); } });
            assertThat(entered.await(15, TimeUnit.SECONDS)).isTrue();
            var started = new CountDownLatch(1);
            var second = pool.submit(() -> { login(teacher, "LECTURE"); started.countDown(); try { return apply(p, sameKey ? "parallel" : "parallel-other"); } finally { SecurityContextHolder.clearContext(); } });
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> second.get(250, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown(); var result = first.get(30, TimeUnit.SECONDS);
            if (sameKey) assertThat(second.get(30, TimeUnit.SECONDS)).isEqualTo(result);
            else assertThatThrownBy(() -> second.get(30, TimeUnit.SECONDS)).hasCauseInstanceOf(ConflictAlertException.class);
            assertThat(runCount()).isEqualTo(1);
        } finally { release.countDown(); }
    }
    @Test void applyHttpContractValidationSecurityAndRetry() throws Exception {
        var p = preview(); String path = "/api/deadlines/" + deadline.getId() + "/classes/" + schoolClass.getId() + "/allocation/apply";
        SecurityContextHolder.clearContext();
        var teacherAuth = org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(teacher.getEmail()).roles("LECTURE");
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path).contentType("application/json")
            .content(mapper.writeValueAsString(new AllocationApplyDTO.Request(p.previewId()))).header("Idempotency-Key", "http-key");
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path).contentType("application/json").content("{}").with(teacherAuth))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest());
        mvc.perform(request.with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous()))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
        mvc.perform(request.with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(teacher.getEmail()).roles("STUDENT")))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
        mvc.perform(request.with(teacherAuth)).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.approvedGroupIds.length()").value(2));
        mvc.perform(request.with(teacherAuth)).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()); assertThat(runCount()).isEqualTo(1);
    }
}
