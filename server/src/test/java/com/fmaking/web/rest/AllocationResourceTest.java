package com.fmaking.web.rest;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.GroupEventPublisher;
import com.fmaking.service.MailService;
import com.fmaking.service.NotificationAsyncService;
import com.fmaking.service.SmartAllocationService;
import com.fmaking.service.dto.AllocationSnapshotDTO;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:allocation-api;DB_CLOSE_DELAY=-1;MODE=MySQL",
    "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
    "spring.jpa.properties.hibernate.cache.use_second_level_cache=false",
    "spring.jpa.properties.hibernate.generate_statistics=true"
})
@AutoConfigureMockMvc
@Transactional
class AllocationResourceTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired EntityManager em;
    @Autowired UserRepository users;
    @Autowired StudentRepository students;
    @Autowired SchoolClassRepository classes;
    @Autowired DeadlineRepository deadlines;
    @Autowired GroupRepository groups;
    @Autowired GroupMemberRepository members;
    @Autowired GroupStatusHistoryRepository statusHistory;
    @Autowired GroupMemberHistoryRepository memberHistory;
    @Autowired TermRepository terms;
    @Autowired MajorRepository majors;
    @Autowired RuleRepository rules;
    @MockitoBean NotificationAsyncService notifications;
    @MockitoBean MailService mail;
    @MockitoBean GroupEventPublisher events;
    @MockitoSpyBean SmartAllocationService engine;
    User teacher;
    SchoolClass own, other;
    Deadline deadline;
    Major se, second;
    List<Long> studentIds;
    List<Long> groupIds;

    @BeforeEach void setup() {
        teacher = account("Teacher");
        Term term = new Term(); term.setName("A" + UUID.randomUUID().toString().substring(0, 7)); term = terms.saveAndFlush(term);
        own = new SchoolClass(); own.setName("Allocation class"); own.setTermId(term.getId()); own.setLecturerId(teacher.getId()); own = classes.saveAndFlush(own);
        other = new SchoolClass(); other.setName("Other class"); other.setLecturerId(account("Other teacher").getId()); other = classes.saveAndFlush(other);
        deadline = new Deadline(); deadline.setName("Allocation session"); deadline.setStartTime(Instant.now().minusSeconds(7200));
        deadline.setEndTime(Instant.now().minusSeconds(3600)); deadline.getSchoolClasses().add(own); deadline = deadlines.saveAndFlush(deadline);
        se = majors.findAll().stream().filter(value -> "SE".equals(value.getCode())).findFirst().orElseGet(() -> {
            Major major = new Major(); major.setCode("SE"); major.setName("Software"); return majors.saveAndFlush(major);
        });
        second = new Major(); second.setCode("M" + UUID.randomUUID().toString().substring(0, 6)); second.setName("Other " + UUID.randomUUID()); second = majors.saveAndFlush(second);
        studentIds = new ArrayList<>(); groupIds = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            User user = account("Student " + i); user.setActivationKey("secret-for-test-only"); users.saveAndFlush(user);
            Student student = new Student(); student.setUserId(user.getId()); student.setFullName(user.getName());
            student.setRollNumber("S" + user.getId()); student.setMemberCode("M" + user.getId());
            student.setMajorId(i % 2 == 0 ? se.getId() : second.getId()); student.setSchoolClassId(own.getId());
            students.saveAndFlush(student); studentIds.add(user.getId());
        }
        for (int i = 0; i < 3; i++) {
            Group group = new Group(); group.setName("G" + i); group.setSchoolClassId(own.getId()); group.setDeadlineId(deadline.getId());
            group.setLeaderId(studentIds.get(i * 2)); group.setStatus(i == 1 ? GroupStatus.REVOKED : GroupStatus.OPEN); group = groups.saveAndFlush(group); groupIds.add(group.getId());
            for (int j = 0; j < 2; j++) {
                GroupMember member = new GroupMember(); member.setGroupId(group.getId()); member.setStudentId(studentIds.get(i * 2 + j));
                member.setSchoolClassId(own.getId()); member.setDeadlineId(deadline.getId()); member.setRole(j == 0 ? GroupMemberRole.LEADER : GroupMemberRole.MEMBER);
                member.setJoinedAt(Instant.now()); members.saveAndFlush(member);
            }
        }
        em.flush(); em.clear();
    }

    User account(String name) {
        User user = new User(); user.setName(name); user.setEmail(UUID.randomUUID() + "@example.test"); user.setActivated(true);
        return users.saveAndFlush(user);
    }
    String path(String action) { return "/api/deadlines/" + deadline.getId() + "/classes/" + own.getId() + "/allocation/" + action; }
    JsonNode overview() throws Exception {
        return mapper.readTree(mvc.perform(get(path("overview")).with(user(teacher.getEmail()).roles("ADMIN")))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data");
    }
    JsonNode preview(String body) throws Exception {
        return mapper.readTree(mvc.perform(post(path("preview")).contentType(MediaType.APPLICATION_JSON).content(body)
            .with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data");
    }

    @Test void overviewIncludesActualGroupsScoresRulesAndUnassignedWithoutCredentials() throws Exception {
        JsonNode data = overview();
        assertThat(data.path("summary").path("totalStudents").asInt()).isEqualTo(8);
        assertThat(data.path("summary").path("totalGroups").asInt()).isEqualTo(3);
        assertThat(data.path("summary").path("unassignedStudents").asInt()).isEqualTo(2);
        assertThat(data.path("summary").path("invalidGroups").asInt()).isEqualTo(3);
        assertThat(data.path("groups").get(0).path("score").path("scorePercent").asDouble()).isEqualTo(80);
        assertThat(data.path("groups").get(0).path("leaderName").asText()).isEqualTo("Student 0");
        assertThat(data.path("groups").get(0).path("rules").get(0).has("message")).isFalse();
        assertThat(data.toString()).doesNotContain("activationKey", "secret-for-test-only", "password", "refreshToken");
        assertThat(data.path("snapshotFingerprint").asText()).matches("[0-9a-f]{64}");
    }

    @Test void assignedLecturerMasterAndAdminCanReadButOthersCannot() throws Exception {
        for (String role : List.of("LECTURE", "LECTURE_MASTER", "ADMIN")) {
            mvc.perform(get(path("overview")).with(user(teacher.getEmail()).roles(role))).andExpect(status().isOk());
        }
        mvc.perform(get(path("overview"))).andExpect(status().isUnauthorized());
        mvc.perform(get(path("overview")).with(user(teacher.getEmail()).roles("STUDENT"))).andExpect(status().isForbidden());
        for (String role : List.of("LECTURE", "LECTURE_MASTER")) {
            mvc.perform(get(path("overview")).with(user(users.findById(other.getLecturerId()).orElseThrow().getEmail()).roles(role)))
                .andExpect(status().isForbidden());
            mvc.perform(get(path("setup")).with(user(users.findById(other.getLecturerId()).orElseThrow().getEmail()).roles(role)))
                .andExpect(status().isForbidden());
            mvc.perform(post(path("preview")).contentType(MediaType.APPLICATION_JSON).content("{\"targetGroupCount\":2}")
                .with(user(users.findById(other.getLecturerId()).orElseThrow().getEmail()).roles(role))).andExpect(status().isForbidden());
        }
    }

    @Test void classAndSessionScopeAndMissingRecordsUseExpectedStatuses() throws Exception {
        mvc.perform(get(path("overview").replace("/classes/" + own.getId(), "/classes/" + other.getId()))
            .with(user(teacher.getEmail()).roles("ADMIN"))).andExpect(status().isForbidden());
        mvc.perform(get(path("overview").replace("/classes/" + own.getId(), "/classes/2147483647"))
            .with(user(teacher.getEmail()).roles("ADMIN"))).andExpect(status().isNotFound());
        mvc.perform(get(path("overview").replace("/deadlines/" + deadline.getId(), "/deadlines/2147483647"))
            .with(user(teacher.getEmail()).roles("ADMIN"))).andExpect(status().isNotFound());
        mvc.perform(get(path("overview").replace("/classes/" + own.getId(), "/classes/0"))
            .with(user(teacher.getEmail()).roles("ADMIN"))).andExpect(status().isBadRequest());
    }

    @Test void setupReturnsCheckedSuggestionRangeAndNoNewGroupPolicy() throws Exception {
        mvc.perform(get(path("setup")).param("seed", "42").with(user(teacher.getEmail()).roles("LECTURE")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.seed").value(42))
            .andExpect(jsonPath("$.data.range.minimum").value(2)).andExpect(jsonPath("$.data.range.maximum").value(2))
            .andExpect(jsonPath("$.data.suggestion.status").value("FEASIBLE"))
            .andExpect(jsonPath("$.data.suggestion.suggestedCount").value(2))
            .andExpect(jsonPath("$.data.limits.createsNewGroups").value(false));
    }

    @Test void previewBuildsBeforeAfterReportAndDoesNotApproveOrWriteAnything() throws Exception {
        long statusCount = statusHistory.count(), historyCount = memberHistory.count();
        JsonNode before = overview();
        var statistics = em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics(); statistics.clear();
        JsonNode result = preview("{\"targetGroupCount\":2,\"seed\":42}"); em.flush();
        assertThat(statistics.getEntityInsertCount()).isEqualTo(1); // Staging Preview only; group data is unchanged.
        assertThat(statistics.getEntityUpdateCount()).isZero();
        assertThat(statistics.getEntityDeleteCount()).isZero();
        assertThat(result.path("result").path("status").asText()).isEqualTo("FEASIBLE");
        assertThat(result.path("report").path("groupsBefore").asInt()).isEqualTo(3);
        assertThat(result.path("report").path("groupsAfter").asInt()).isEqualTo(2);
        assertThat(result.path("report").path("studentsAfter").asInt()).isEqualTo(8);
        assertThat(result.path("report").path("unassignedBefore").asInt()).isEqualTo(2);
        assertThat(result.path("report").path("disbandedGroupIds").size()).isEqualTo(1);
        assertThat(result.path("report").path("createdGroupIds").isEmpty()).isTrue();
        assertThat(result.path("report").path("movements").findValues("previouslyUnassigned").stream().filter(JsonNode::asBoolean).count()).isEqualTo(2);
        for (var group : result.path("groups")) {
            assertThat(group.path("status").asText()).isIn("OPEN", "REVOKED");
            assertThat(group.path("allRulesPassed").asBoolean()).isTrue();
            assertThat(group.path("score").path("scorePercent").asDouble()).isEqualTo(100);
        }
        assertThat(overview()).isEqualTo(before);
        assertThat(statusHistory.count()).isEqualTo(statusCount); assertThat(memberHistory.count()).isEqualTo(historyCount);
        verifyNoInteractions(events, notifications, mail);
    }

    @Test void protectedGroupsArePresentAndUnchangedEvenWhenTheyHaveRuleWarnings() throws Exception {
        var fixed = groups.findById(groupIds.getFirst()).orElseThrow(); fixed.setStatus(GroupStatus.ACCEPTED); groups.saveAndFlush(fixed); em.clear();
        var before = overview().path("groups").get(0);
        var result = preview("{\"targetGroupCount\":2,\"seed\":42}");
        assertThat(result.path("groups").get(0)).isEqualTo(before);
        assertThat(result.path("report").path("protectedGroupIds").get(0).asLong()).isEqualTo(fixed.getId());
        assertThat(result.path("result").path("warnings").findValuesAsText("code")).contains("PROTECTED_RULE_WARNING");
    }

    @Test void infeasiblePreviewReturnsNoPretendAfterReport() throws Exception {
        var result = preview("{\"targetGroupCount\":1,\"seed\":42}");
        assertThat(result.path("result").path("status").asText()).isEqualTo("PROVEN_INFEASIBLE");
        assertThat(result.path("groups").isEmpty()).isTrue();
        assertThat(result.path("report").isNull()).isTrue();
        assertThat(result.path("planFingerprint").isNull()).isTrue();
    }

    @Test void exhaustedSearchReturns200WithUnknownStatusAndNoAfterReport() throws Exception {
        doAnswer(call -> engine.allocate(call.getArgument(0), call.getArgument(1), call.getArgument(2),
            new SmartAllocationService.SearchLimits(1, 256)))
            .when(engine).allocate(any(AllocationSnapshotDTO.class), anyInt(), anyLong());
        var result = preview("{\"targetGroupCount\":2,\"seed\":42}");
        assertThat(result.path("result").path("status").asText()).isEqualTo("SEARCH_LIMIT_REACHED");
        assertThat(result.path("report").isNull()).isTrue();
        assertThat(result.path("planFingerprint").isNull()).isTrue();
        verifyNoInteractions(events, notifications, mail);
    }

    @Test void queryCountStaysBoundedAsMoreGroupsAreLoaded() throws Exception {
        var statistics = em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        em.clear(); statistics.clear(); overview(); long before = statistics.getPrepareStatementCount();
        for (int i = 0; i < 8; i++) {
            User user = account("Additional leader");
            Student student = new Student(); student.setUserId(user.getId()); student.setFullName(user.getName());
            student.setRollNumber("Q" + user.getId()); student.setMemberCode("Q" + user.getId()); student.setMajorId(second.getId()); student.setSchoolClassId(own.getId()); students.saveAndFlush(student);
            Group group = new Group(); group.setName("Additional " + i); group.setSchoolClassId(own.getId()); group.setDeadlineId(deadline.getId()); group.setLeaderId(user.getId()); group.setStatus(GroupStatus.OPEN); group = groups.saveAndFlush(group);
            GroupMember member = new GroupMember(); member.setStudentId(user.getId()); member.setGroupId(group.getId()); member.setSchoolClassId(own.getId()); member.setDeadlineId(deadline.getId()); member.setRole(GroupMemberRole.LEADER); member.setJoinedAt(Instant.now()); members.saveAndFlush(member);
        }
        em.clear(); statistics.clear();
        assertThat(overview().path("groups").size()).isEqualTo(11);
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(before);
    }

    @Test void clientCannotSupplySnapshotAndFakePlanHintDoesNotControlResults() throws Exception {
        var expected = preview("{\"targetGroupCount\":2,\"seed\":42}");
        var result = preview("{\"targetGroupCount\":2,\"seed\":42,\"snapshot\":{\"classId\":999,\"groups\":[]},\"previousPlanFingerprint\":\"" + "0".repeat(64) + "\"}");
        assertThat(result.path("groups")).isEqualTo(expected.path("groups"));
        assertThat(result.path("snapshotFingerprint")).isEqualTo(expected.path("snapshotFingerprint"));
        assertThat(result.path("sameAsPreviousPlan").asBoolean()).isFalse();
    }

    @Test void emptyClassSessionReturnsEmptyOverviewAndNoSuggestion() throws Exception {
        members.deleteAllInBatch(); groups.deleteAllInBatch(); students.deleteAllInBatch(); em.clear();
        mvc.perform(get(path("overview")).with(user(teacher.getEmail()).roles("LECTURE")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.summary.totalStudents").value(0))
            .andExpect(jsonPath("$.data.groups").isEmpty());
        mvc.perform(get(path("setup")).with(user(teacher.getEmail()).roles("LECTURE")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.suggestion.status").value("PROVEN_INFEASIBLE"))
            .andExpect(jsonPath("$.data.suggestion.suggestedCount").isEmpty());
    }

    @Test void sameSeedReproducesPlanAndAutoAgainCanReportIdenticalPlan() throws Exception {
        var first = preview("{\"targetGroupCount\":2,\"seed\":42}");
        var again = preview("{\"targetGroupCount\":2,\"seed\":42,\"previousPlanFingerprint\":\"" + first.path("planFingerprint").asText() + "\"}");
        assertThat(again.path("planFingerprint")).isEqualTo(first.path("planFingerprint"));
        assertThat(again.path("groups")).isEqualTo(first.path("groups"));
        assertThat(again.path("sameAsPreviousPlan").asBoolean()).isTrue();
        assertThat(again.path("result").path("warnings").findValuesAsText("code")).contains("SAME_AS_PREVIOUS_PLAN");
        var generated = preview("{\"targetGroupCount\":2}");
        assertThat(generated.path("result").path("seed").isIntegralNumber()).isTrue();
    }

    @ParameterizedTest @ValueSource(strings = {"{}", "{\"targetGroupCount\":0}", "{\"targetGroupCount\":-1}",
        "{\"targetGroupCount\":2.7}", "{\"targetGroupCount\":\"2\"}", "{\"targetGroupCount\":true}",
        "{\"targetGroupCount\":2,\"seed\":1.5}", "{\"targetGroupCount\":2,\"seed\":9007199254740992}",
        "{\"targetGroupCount\":2,\"previousPlanFingerprint\":\"fake\"}"})
    void invalidRequestsReturn400(String body) throws Exception {
        mvc.perform(post(path("preview")).contentType(MediaType.APPLICATION_JSON).content(body)
            .with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isBadRequest());
    }

    @Test void setupRejectsUnsafeSeedAndGeneratedSeedIsSafeForFrontendNumbers() throws Exception {
        mvc.perform(get(path("setup")).param("seed", "9007199254740992").with(user(teacher.getEmail()).roles("LECTURE")))
            .andExpect(status().isBadRequest());
        var response = preview("{\"targetGroupCount\":2}");
        assertThat(response.path("result").path("seed").asLong()).isBetween(0L, 9007199254740991L);
    }

    @ParameterizedTest @ValueSource(strings = {"studentMajor", "studentSet", "membership", "leader", "status", "rules", "rulesVersion", "deadline", "deadlineOverride", "term"})
    void sourceChangesInvalidateSnapshotFingerprint(String change) throws Exception {
        String before = overview().path("snapshotFingerprint").asText();
        switch (change) {
            case "studentMajor" -> { var student = students.findById(studentIds.getFirst()).orElseThrow(); student.setMajorId(second.getId()); students.saveAndFlush(student); }
            case "studentSet" -> {
                User user = account("Extra"); Student student = new Student(); student.setUserId(user.getId()); student.setFullName("Extra");
                student.setRollNumber("E" + user.getId()); student.setMemberCode("E" + user.getId()); student.setMajorId(se.getId()); student.setSchoolClassId(own.getId()); students.saveAndFlush(student);
            }
            case "membership" -> { var member = members.findByGroupIdAndStudentId(groupIds.get(0), studentIds.get(1)).orElseThrow(); member.setGroupId(groupIds.get(1)); members.saveAndFlush(member); }
            case "leader" -> {
                var rows = members.findByGroupId(groupIds.get(0)); rows.forEach(member -> member.setRole(member.getStudentId().equals(studentIds.get(1)) ? GroupMemberRole.LEADER : GroupMemberRole.MEMBER)); members.saveAllAndFlush(rows);
                var group = groups.findById(groupIds.getFirst()).orElseThrow(); group.setLeaderId(studentIds.get(1)); groups.saveAndFlush(group);
            }
            case "status" -> { var group = groups.findById(groupIds.getFirst()).orElseThrow(); group.setStatus(GroupStatus.PENDING); groups.saveAndFlush(group); }
            case "rules" -> { Rule rule = new Rule(); rule.setSchoolClassId(own.getId()); rule.setCode("MIN_SE_MEMBERS_PER_GROUP"); rule.setValue(0); rule.setStatus(false); rules.saveAndFlush(rule); }
            case "rulesVersion" -> { var schoolClass = classes.findById(own.getId()).orElseThrow(); schoolClass.setRulesVersion(1); classes.saveAndFlush(schoolClass); }
            case "deadline" -> { var value = deadlines.findById(deadline.getId()).orElseThrow(); value.setEndTime(Instant.now().plusSeconds(7200)); deadlines.saveAndFlush(value); }
            case "deadlineOverride" -> { var window = em.find(DeadlineClassWindow.class, new DeadlineClassWindow.Key(deadline.getId(), own.getId())); window.setEndTimeOverride(Instant.now().plusSeconds(3600)); em.flush(); }
            case "term" -> { Term term = new Term(); term.setName("Changed"); term = terms.saveAndFlush(term); var schoolClass = classes.findById(own.getId()).orElseThrow(); schoolClass.setTermId(term.getId()); classes.saveAndFlush(schoolClass); }
        }
        em.clear();
        assertThat(overview().path("snapshotFingerprint").asText()).isNotEqualTo(before);
    }

    @Test void duplicateSessionsOrInconsistentMembershipsReturn409() throws Exception {
        var member = members.findByGroupId(groupIds.getFirst()).getFirst(); member.setSchoolClassId(other.getId()); members.saveAndFlush(member); em.clear();
        mvc.perform(get(path("overview")).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isConflict());
        member.setSchoolClassId(own.getId()); members.saveAndFlush(member);
        Deadline duplicate = new Deadline(); duplicate.setName("Historical duplicate"); duplicate.setStartTime(Instant.now().minusSeconds(30));
        duplicate.setEndTime(Instant.now().plusSeconds(3600)); duplicate.getSchoolClasses().add(own); deadlines.saveAndFlush(duplicate); em.clear();
        mvc.perform(get(path("setup")).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isConflict());
    }
}
