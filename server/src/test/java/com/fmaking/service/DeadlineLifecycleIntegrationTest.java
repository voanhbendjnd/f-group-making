package com.fmaking.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.dto.*;
import com.fmaking.web.rest.errors.ConflictAlertException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:deadline-lifecycle;DB_CLOSE_DELAY=-1;MODE=MySQL",
    "spring.jpa.properties.hibernate.cache.use_second_level_cache=false",
    "spring.jpa.properties.hibernate.cache.use_query_cache=false"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DeadlineLifecycleIntegrationTest {
    // Opt-in dedicated disposable MySQL database; never read the development datasource.
    @DynamicPropertySource
    static void isolatedMySql(DynamicPropertyRegistry properties) {
        String url = System.getenv("DEADLINE_TEST_MYSQL_URL");
        if (url != null) {
            properties.add("spring.datasource.url", () -> url);
            properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
            properties.add("spring.jpa.database-platform", () -> "org.hibernate.dialect.MySQLDialect");
            properties.add("spring.datasource.username", () -> "root");
            properties.add("spring.datasource.password", () -> System.getenv("DEADLINE_TEST_MYSQL_PASSWORD"));
        }
    }

    @Autowired DeadlineService service;
    @Autowired GroupService groupService;
    @Autowired DeadlineRepository deadlines;
    @Autowired SchoolClassRepository classes;
    @Autowired StudentRepository students;
    @Autowired UserRepository users;
    @Autowired MajorRepository majors;
    @Autowired TermRepository terms;
    @Autowired GroupRepository groups;
    @Autowired GroupMemberRepository members;
    @Autowired GroupMemberHistoryRepository history;
    @Autowired PlatformTransactionManager transactions;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @org.springframework.boot.test.web.server.LocalServerPort int port;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder encoder;
    @Autowired org.springframework.messaging.simp.broker.SimpleBrokerMessageHandler broker;
    @Autowired org.springframework.messaging.simp.user.SimpUserRegistry socketUsers;
    @MockitoBean NotificationAsyncService notifications;
    @MockitoSpyBean SimpMessagingTemplate messaging;
    private User studentUser;
    private SchoolClass schoolClass;
    private Deadline deadline;

    private void login(String email, String role) {
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(email, "test", AuthorityUtils.createAuthorityList(role)));
    }
    private void admin() { login("deadline-admin@example.test", "ROLE_ADMIN"); }

    @BeforeEach void setup() {
        admin();
        if (users.findOneByEmail("deadline-admin@example.test").isEmpty()) {
            User adminUser = new User(); adminUser.setEmail("deadline-admin@example.test"); adminUser.setActivated(true); users.saveAndFlush(adminUser);
        }
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        Term term = new Term(); term.setName("D" + suffix); term = terms.saveAndFlush(term);
        schoolClass = new SchoolClass(); schoolClass.setName("Class " + suffix); schoolClass.setTermId(term.getId());
        schoolClass = classes.saveAndFlush(schoolClass);
        studentUser = new User(); studentUser.setEmail(suffix + "@example.test"); studentUser.setName("Student test"); studentUser.setActivated(true);
        studentUser = users.saveAndFlush(studentUser);
        Student student = new Student(); student.setUserId(studentUser.getId()); student.setFullName("Student test");
        student.setRollNumber("SE" + suffix); student.setMemberCode("M" + suffix);
        student.setMajorId(majors.findAll().getFirst().getId()); student.setSchoolClassId(schoolClass.getId()); students.saveAndFlush(student);
        deadline = new Deadline(); deadline.setName("Round " + suffix);
        deadline.setStartTime(Instant.now().minusSeconds(60)); deadline.setEndTime(Instant.now().plusSeconds(3600));
        deadline.getSchoolClasses().add(schoolClass); deadline = deadlines.saveAndFlush(deadline);
        clearInvocations(messaging);
    }
    @AfterEach void clearSecurity() { SecurityContextHolder.clearContext(); }

    @Test void cancellationIsConsistentAcrossAllReadsAndPreservesMembership() throws Exception {
        login(studentUser.getEmail(), "ROLE_STUDENT");
        CreateGroupRequest request = new CreateGroupRequest(); request.setName("Existing team");
        var group = groupService.createGroup(deadline.getId(), schoolClass.getId(), request);
        long historyBefore = history.count();
        admin(); service.cancelOrDeleteDeadline(deadline.getId());
        assertThat(service.getDeadlineById(deadline.getId()).getStatus()).isEqualTo(DeadlineStatus.CANCELLED);
        assertThat(service.getDeadlines(org.springframework.data.domain.PageRequest.of(0, 20), schoolClass.getTermId()).getContent())
            .extracting(DeadlineDTO::getStatus).containsOnly(DeadlineStatus.CANCELLED);
        login(studentUser.getEmail(), "ROLE_STUDENT");
        var validation = service.validateDeadlineForStudent(deadline.getId(), schoolClass.getId());
        assertThat(validation.isValid()).isFalse();
        assertThat(validation.getStatus()).isEqualTo(DeadlineStatus.CANCELLED);
        assertThat(service.getMyActivities().getFirst().getStatus()).isEqualTo(DeadlineStatus.CANCELLED);
        var workspace = groupService.getWorkspace(deadline.getId(), schoolClass.getId());
        assertThat(workspace.getDeadlineStatus()).isEqualTo("CANCELLED");
        assertThat(workspace.isCanJoinGroup()).isFalse();
        assertThat(workspace.getMyGroup().getId()).isEqualTo(group.getId());
        assertThat(members.findByStudentIdAndDeadlineId(studentUser.getId(), deadline.getId())).isPresent();
        assertThat(history.count()).isEqualTo(historyBefore);
        mvc.perform(get("/api/deadlines/my-activities")).andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].status").value("CANCELLED"));
    }

    @Test void repeatedCancellationDoesNotChangeAuditOrBroadcastTwice() {
        service.cancelOrDeleteDeadline(deadline.getId());
        Deadline cancelled = deadlines.findById(deadline.getId()).orElseThrow();
        Instant cancelledAt = cancelled.getCancelledAt(); long version = cancelled.getVersion();
        service.cancelOrDeleteDeadline(deadline.getId());
        Deadline repeated = deadlines.findById(deadline.getId()).orElseThrow();
        assertThat(repeated.getCancelledAt()).isEqualTo(cancelledAt);
        assertThat(repeated.getCancelledBy()).isEqualTo("deadline-admin@example.test");
        assertThat(repeated.getVersion()).isEqualTo(version);
        verify(messaging, times(1)).convertAndSend(eq("/topic/admin/deadlines"), isA(DeadlineRealtimeEvent.class));
        verify(messaging, times(1)).convertAndSend(eq("/topic/classes/" + schoolClass.getId() + "/deadlines"), isA(DeadlineRealtimeEvent.class));
    }

    @Test void rollbackDoesNotBroadcastOrCancel() {
        new TransactionTemplate(transactions).executeWithoutResult(tx -> {
            service.cancelOrDeleteDeadline(deadline.getId()); tx.setRollbackOnly();
        });
        assertThat(deadlines.findById(deadline.getId()).orElseThrow().getStatus()).isEqualTo("ACTIVE");
        verify(messaging, never()).convertAndSend(anyString(), isA(DeadlineRealtimeEvent.class));
    }

    @Test void cancelledDeadlineRejectsEveryStudentWriteAndStaffWrite() throws Exception {
        service.cancelOrDeleteDeadline(deadline.getId());
        login(studentUser.getEmail(), "ROLE_STUDENT");
        String base = "/api/deadlines/" + deadline.getId() + "/classes/" + schoolClass.getId() + "/groups";
        mvc.perform(post(base).with(user(studentUser.getEmail()).roles("STUDENT")).contentType("application/json").content("{\"name\":\"Blocked team\"}"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("error.ERR_DEADLINE_CANCELLED"));
        for (String action : List.of("join", "leave", "submit", "cancel-submit", "transfer-leader")) {
            mvc.perform(post(base + "/123/" + action).with(user(studentUser.getEmail()).roles("STUDENT")).contentType("application/json").content("{\"newLeaderId\":123}"))
                .andExpect(status().isConflict());
        }
        mvc.perform(delete(base + "/123").with(user(studentUser.getEmail()).roles("STUDENT"))).andExpect(status().isConflict());
        admin();
        mvc.perform(post(base + "/123/accept").with(user("deadline-admin@example.test").roles("ADMIN"))).andExpect(status().isConflict());
        admin();
        UpdateDeadlineDTO update = new UpdateDeadlineDTO(); update.setId(deadline.getId()); update.setName("Cannot reopen"); update.setEndTime(deadline.getEndTime().plusSeconds(3600));
        assertThatThrownBy(() -> service.updateDeadline(update)).isInstanceOf(ConflictAlertException.class);
    }

    @Test void upcomingIsReadableButCannotBeJoined() {
        deadline.setStartTime(Instant.now().plusSeconds(600)); deadlines.saveAndFlush(deadline);
        login(studentUser.getEmail(), "ROLE_STUDENT");
        assertThat(groupService.getWorkspace(deadline.getId(), schoolClass.getId()).getReadOnlyReason()).isEqualTo("UPCOMING");
        assertThatThrownBy(() -> groupService.joinGroup(deadline.getId(), schoolClass.getId(), 123L)).isInstanceOf(ConflictAlertException.class);
    }

    @Test void aDifferentActiveDeadlineCannotBeUsedToModifyACancelledGroup() throws Exception {
        login(studentUser.getEmail(), "ROLE_STUDENT");
        CreateGroupRequest request = new CreateGroupRequest(); request.setName("Protected group");
        var group = groupService.createGroup(deadline.getId(), schoolClass.getId(), request);
        admin(); service.cancelOrDeleteDeadline(deadline.getId());
        Deadline open = new Deadline(); open.setName("Another round"); open.setStartTime(Instant.now().minusSeconds(30));
        open.setEndTime(Instant.now().plusSeconds(3600)); open.getSchoolClasses().add(schoolClass); open = deadlines.saveAndFlush(open);
        mvc.perform(post("/api/deadlines/" + open.getId() + "/classes/" + schoolClass.getId() + "/groups/" + group.getId() + "/leave")
                .with(user(studentUser.getEmail()).roles("STUDENT")))
            .andExpect(status().isConflict());
        // Legacy duplicate sessions now fail closed before any group mutation.
        assertThat(members.findByStudentIdAndDeadlineId(studentUser.getId(), deadline.getId())).isPresent();
    }

    @Test void reopeningPublishesTheSameSessionWithNewVersionAfterCommit() {
        deadline.setEndTime(Instant.now().minusSeconds(1)); deadlines.saveAndFlush(deadline);
        long previousVersion = deadline.getVersion();
        UpdateDeadlineDTO update = new UpdateDeadlineDTO(); update.setId(deadline.getId()); update.setName(deadline.getName());
        update.setEndTime(Instant.now().plusSeconds(3600));
        service.updateDeadline(update);
        verify(messaging).convertAndSend(eq("/topic/admin/deadlines"), argThat((Object value) ->
            value instanceof DeadlineRealtimeEvent event && event.eventType().equals("DEADLINE_REOPENED")
                && event.deadlineId().equals(deadline.getId()) && event.version() > previousVersion
                && event.status() == DeadlineStatus.ACTIVE));
    }

    @Test void managerCanReviewExpiredRoundButNotCancelledRound() {
        deadline.setEndTime(Instant.now().minusSeconds(1)); deadlines.saveAndFlush(deadline);
        assertThat(groupService.getWorkspace(deadline.getId(), schoolClass.getId()).isCanManageGroups()).isTrue();
        service.cancelOrDeleteDeadline(deadline.getId());
        assertThat(groupService.getWorkspace(deadline.getId(), schoolClass.getId()).isCanManageGroups()).isFalse();
    }

    @Test void sharedDeadlineCannotBeCancelledByOneLecturer() throws Exception {
        User lecturer = new User(); lecturer.setEmail(UUID.randomUUID()+"@example.test"); lecturer.setActivated(true); lecturer = users.saveAndFlush(lecturer);
        schoolClass.setLecturerId(lecturer.getId()); classes.saveAndFlush(schoolClass);
        SchoolClass other = new SchoolClass(); other.setName("Other class"); other = classes.saveAndFlush(other);
        deadline.getSchoolClasses().add(other); deadlines.saveAndFlush(deadline);
        login(lecturer.getEmail(), "ROLE_LECTURE");
        assertThat(service.getDeadlineById(deadline.getId()).isCanCancel()).isFalse();
        mvc.perform(delete("/api/deadlines/" + deadline.getId())).andExpect(status().isForbidden());
    }

    @Test void cancellationWaitsForInFlightMembershipTransactionAndThenBlocksNewJoin() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch sharedLocked = new CountDownLatch(1), release = new CountDownLatch(1);
        try {
            Future<?> join = executor.submit(() -> {
                login(studentUser.getEmail(), "ROLE_STUDENT");
                try {
                    new TransactionTemplate(transactions).executeWithoutResult(tx -> {
                        deadlines.findForShare(deadline.getId()).orElseThrow(); sharedLocked.countDown();
                        try { if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Test timed out"); }
                        catch (InterruptedException e) { throw new IllegalStateException(e); }
                        CreateGroupRequest request = new CreateGroupRequest(); request.setName("Before cancellation");
                        groupService.createGroup(deadline.getId(), schoolClass.getId(), request);
                    });
                } finally { SecurityContextHolder.clearContext(); }
            });
            assertThat(sharedLocked.await(10, TimeUnit.SECONDS)).isTrue();
            Future<?> cancel = executor.submit(() -> { admin(); try { service.cancelOrDeleteDeadline(deadline.getId()); } finally { SecurityContextHolder.clearContext(); } });
            assertThatThrownBy(() -> cancel.get(300, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            release.countDown(); join.get(15, TimeUnit.SECONDS); cancel.get(15, TimeUnit.SECONDS);
            assertThat(deadlines.findById(deadline.getId()).orElseThrow().getStatus()).isEqualTo("CANCELLED");
            assertThat(members.findByStudentIdAndDeadlineId(studentUser.getId(), deadline.getId())).isPresent();
            login(studentUser.getEmail(), "ROLE_STUDENT");
            assertThatThrownBy(() -> groupService.joinGroup(deadline.getId(), schoolClass.getId(), 123L)).isInstanceOf(ConflictAlertException.class);
        } finally { release.countDown(); executor.shutdownNow(); }
    }

    @Test void realtimeCancellationReachesAdminStudentAndLecturerSessions() throws Exception {
        User lecturer = new User(); lecturer.setEmail(UUID.randomUUID() + "@example.test"); lecturer.setActivated(true);
        lecturer = users.saveAndFlush(lecturer);
        schoolClass.setLecturerId(lecturer.getId()); classes.saveAndFlush(schoolClass);
        var client = new org.springframework.web.socket.messaging.WebSocketStompClient(
            new org.springframework.web.socket.sockjs.client.SockJsClient(List.of(
                new org.springframework.web.socket.sockjs.client.WebSocketTransport(
                    new org.springframework.web.socket.client.standard.StandardWebSocketClient()))));
        var converter = new org.springframework.messaging.converter.MappingJackson2MessageConverter();
        converter.setObjectMapper(mapper); client.setMessageConverter(converter);
        List<org.springframework.messaging.simp.stomp.StompSession> sessions = new ArrayList<>();
        try {
            var adminSession = connect(client, "deadline-admin@example.test", "ROLE_ADMIN"); sessions.add(adminSession);
            var studentSession = connect(client, studentUser.getEmail(), "ROLE_STUDENT"); sessions.add(studentSession);
            var lecturerSession = connect(client, lecturer.getEmail(), "ROLE_LECTURE"); sessions.add(lecturerSession);
            var adminEvent = listen(adminSession, "/topic/admin/deadlines");
            String classTopic = "/topic/classes/" + schoolClass.getId() + "/deadlines";
            var studentEvent = listen(studentSession, classTopic);
            var lecturerEvent = listen(lecturerSession, "/user/queue/deadlines");
            waitForSubscription("/topic/admin/deadlines"); waitForSubscription(classTopic);
            long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (socketUsers.getUser(lecturer.getEmail()) == null && System.nanoTime() < until) Thread.sleep(10);
            var lecturerSocket = socketUsers.getUser(lecturer.getEmail());
            assertThat(lecturerSocket).isNotNull();
            String lecturerDestination = "/queue/deadlines-user" + lecturerSocket.getSessions().iterator().next().getId();
            waitForSubscription(lecturerDestination);
            service.cancelOrDeleteDeadline(deadline.getId());
            for (var received : List.of(adminEvent, studentEvent, lecturerEvent)) {
                assertThat(received.get(2, TimeUnit.SECONDS)).containsEntry("eventType", "DEADLINE_CANCELLED")
                    .containsEntry("status", "CANCELLED").containsEntry("deadlineId", deadline.getId());
            }
        } finally { sessions.forEach(s -> { if (s.isConnected()) s.disconnect(); }); client.stop(); }
    }

    private org.springframework.messaging.simp.stomp.StompSession connect(
            org.springframework.web.socket.messaging.WebSocketStompClient client, String email, String role) throws Exception {
        var claims = org.springframework.security.oauth2.jwt.JwtClaimsSet.builder().subject(email)
            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).claim("authorities", List.of(role)).build();
        String token = encoder.encode(org.springframework.security.oauth2.jwt.JwtEncoderParameters.from(
            org.springframework.security.oauth2.jwt.JwsHeader.with(com.fmaking.security.SecurityUtils.JWT_ALGORITHM).build(), claims)).getTokenValue();
        var headers = new org.springframework.messaging.simp.stomp.StompHeaders();
        headers.add("Authorization", "Bearer " + token);
        return client.connectAsync("ws://localhost:" + port + "/ws", new org.springframework.web.socket.WebSocketHttpHeaders(),
            headers, new org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter() {}).get(10, TimeUnit.SECONDS);
    }

    private CompletableFuture<Map<String, Object>> listen(org.springframework.messaging.simp.stomp.StompSession session, String topic) {
        var result = new CompletableFuture<Map<String, Object>>();
        session.subscribe(topic, new org.springframework.messaging.simp.stomp.StompFrameHandler() {
            public java.lang.reflect.Type getPayloadType(org.springframework.messaging.simp.stomp.StompHeaders headers) { return Map.class; }
            @SuppressWarnings("unchecked")
            public void handleFrame(org.springframework.messaging.simp.stomp.StompHeaders headers, Object payload) { result.complete((Map<String, Object>) payload); }
        });
        return result;
    }

    private void waitForSubscription(String destination) throws Exception {
        var headers = org.springframework.messaging.simp.SimpMessageHeaderAccessor.create(org.springframework.messaging.simp.SimpMessageType.MESSAGE);
        headers.setDestination(destination);
        var message = org.springframework.messaging.support.MessageBuilder.createMessage(new byte[0], headers.getMessageHeaders());
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (broker.getSubscriptionRegistry().findSubscriptions(message).isEmpty() && System.nanoTime() < until) Thread.sleep(10);
        assertThat(broker.getSubscriptionRegistry().findSubscriptions(message)).isNotEmpty();
    }
}
