package com.fmaking.web.rest;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.service.NotificationAsyncService;
import java.time.Instant;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class GroupReviewResourceTest {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired StudentRepository students;
    @Autowired SchoolClassRepository classes;
    @Autowired TermRepository terms;
    @Autowired DeadlineRepository deadlines;
    @Autowired GroupRepository groups;
    @Autowired GroupMemberRepository members;
    @Autowired GroupStatusHistoryRepository history;
    @Autowired MajorRepository majors;
    @MockitoBean NotificationAsyncService notifications;
    User teacher;
    SchoolClass own;
    SchoolClass other;
    Term term;
    Deadline deadline;
    Group group;

    User account(String name) {
        User value = new User(); value.setName(name); value.setEmail(UUID.randomUUID() + "@example.test");
        return users.saveAndFlush(value);
    }

    @BeforeEach void setup() {
        teacher = account("Review teacher");
        term = new Term(); term.setName("R" + UUID.randomUUID().toString().substring(0, 6)); term = terms.saveAndFlush(term);
        own = new SchoolClass(); own.setName("Review class"); own.setLecturerId(teacher.getId()); own.setTermId(term.getId()); own = classes.saveAndFlush(own);
        other = new SchoolClass(); other.setName("Other class"); other.setLecturerId(account("Other teacher").getId()); other.setTermId(term.getId()); other = classes.saveAndFlush(other);
        deadline = new Deadline(); deadline.setName("Expired review"); deadline.setStartTime(Instant.now().minusSeconds(7200));
        deadline.setEndTime(Instant.now().minusSeconds(3600)); deadline.getSchoolClasses().add(own); deadline = deadlines.saveAndFlush(deadline);
        Major se = majors.findAll().stream().filter(value -> "SE".equals(value.getCode())).findFirst().orElseGet(() -> {
            Major value = new Major(); value.setCode("SE"); value.setName("Software"); return majors.saveAndFlush(value);
        });
        Major second = new Major(); second.setCode("R" + UUID.randomUUID().toString().substring(0, 5)); second.setName("Other major"); second = majors.saveAndFlush(second);
        group = new Group(); group.setName("Review Alpha"); group.setSchoolClassId(own.getId()); group.setDeadlineId(deadline.getId());
        group.setLeaderId(teacher.getId()); group.setStatus(GroupStatus.PENDING); group = groups.saveAndFlush(group);
        for (int i = 0; i < 4; i++) {
            User value = account(i == 0 ? "Leader Search" : "Review student");
            Student student = new Student(); student.setUserId(value.getId()); student.setFullName(value.getName());
            student.setRollNumber("R" + value.getId()); student.setMemberCode("M" + value.getId()); student.setSchoolClassId(own.getId());
            student.setMajorId(i == 0 ? se.getId() : second.getId()); students.saveAndFlush(student);
            GroupMember member = new GroupMember(); member.setGroupId(group.getId()); member.setStudentId(value.getId());
            member.setSchoolClassId(own.getId()); member.setDeadlineId(deadline.getId()); member.setJoinedAt(Instant.now());
            member.setRole(i == 0 ? GroupMemberRole.LEADER : GroupMemberRole.MEMBER); members.saveAndFlush(member);
            if (i == 0) { group.setLeaderId(value.getId()); group = groups.saveAndFlush(group); }
        }
        GroupStatusHistory submitted = new GroupStatusHistory(); submitted.setGroupId(group.getId()); submitted.setFromStatus(GroupStatus.OPEN);
        submitted.setToStatus(GroupStatus.PENDING); submitted.setChangedBy("fixture"); history.saveAndFlush(submitted);
    }

    String action(String suffix) { return "/api/deadlines/" + deadline.getId() + "/classes/" + own.getId() + "/groups/" + group.getId() + suffix; }

    @Test void missingApiReturns404InsteadOfInternalServerError() throws Exception {
        mvc.perform(get("/api/me/group-reviews-not-deployed").with(user(teacher.getEmail()).roles("LECTURE")))
            .andExpect(status().isNotFound());
    }

    @Test void searchesLeaderAndGroupWithPaginationAndRealSubmittedTime() throws Exception {
        for (String search : new String[]{"alpha", "leader search"}) {
            mvc.perform(get("/api/me/group-reviews").param("termId", term.getId().toString()).param("search", search)
                    .param("status", "PENDING").param("size", "1").with(user(teacher.getEmail()).roles("LECTURE")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.result[0].submittedAt").isNotEmpty())
                .andExpect(jsonPath("$.data.result[0].eligible").value(true))
                .andExpect(jsonPath("$.data.result[0].canReview").value(true));
        }
        assertThat(groups.findById(group.getId()).orElseThrow().getRulesEvaluationSnapshot()).isNull();
        mvc.perform(get("/api/me/group-reviews").param("termId", term.getId().toString()).param("status", "OPEN")
                .with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(jsonPath("$.data.meta.total").value(0));
    }

    @Test void rejectsUnauthorizedScopesEvenForMasterAndHandlesEmptyOrInvalidTerm() throws Exception {
        mvc.perform(get("/api/me/group-reviews").param("termId", term.getId().toString())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me/group-reviews").param("termId", term.getId().toString()).with(user(teacher.getEmail()).roles("STUDENT"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/me/group-reviews").param("termId", term.getId().toString()).param("classId", other.getId().toString())
            .with(user(teacher.getEmail()).roles("LECTURE_MASTER"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/me/group-reviews").param("termId", "2147483647").with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isBadRequest());
        Term empty = new Term(); empty.setName("E" + UUID.randomUUID().toString().substring(0, 6)); empty = terms.saveAndFlush(empty);
        mvc.perform(get("/api/me/group-reviews").param("termId", empty.getId().toString()).with(user(teacher.getEmail()).roles("LECTURE")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(0));
        mvc.perform(get("/api/me/group-reviews").param("termId", empty.getId().toString()).param("classId", own.getId().toString())
            .with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isBadRequest());
    }

    @Test void expiredPendingCanBeApprovedButAcceptedCannotBeEditedWithoutReopening() throws Exception {
        mvc.perform(post(action("/accept")).with(user(teacher.getEmail()).roles("LECTURE")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("ACCEPTED"));
        mvc.perform(post(action("/accept")).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isConflict());
        mvc.perform(post(action("/revoke")).with(user(teacher.getEmail()).roles("LECTURE_MASTER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("REVOKED"));
        mvc.perform(post(action("/submit-review")).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isConflict());
    }

    @Test void rejectionRequiresReasonAndReturnsDraftWithoutDisbanding() throws Exception {
        mvc.perform(post(action("/reject")).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"   \"}")
            .with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isBadRequest());
        mvc.perform(post(action("/reject")).contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Please revise\"}")
            .with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("OPEN"));
        assertThat(members.countByGroupId(group.getId())).isEqualTo(4);
        mvc.perform(post(action("/accept")).with(user(teacher.getEmail()).roles("LECTURE"))).andExpect(status().isConflict());
    }

    @Test void paginationAndMasterListNeverIncludeAnotherLecturersGroups() throws Exception {
        Group second = new Group(); second.setName("Second own draft"); second.setSchoolClassId(own.getId());
        second.setDeadlineId(deadline.getId()); second.setLeaderId(group.getLeaderId()); groups.saveAndFlush(second);
        Group foreign = new Group(); foreign.setName("Foreign group"); foreign.setSchoolClassId(other.getId());
        foreign.setDeadlineId(deadline.getId()); foreign.setLeaderId(group.getLeaderId()); groups.saveAndFlush(foreign);
        for (int page = 1; page <= 2; page++) {
            mvc.perform(get("/api/me/group-reviews").param("termId", term.getId().toString()).param("page", String.valueOf(page)).param("size", "1")
                .with(user(teacher.getEmail()).roles("LECTURE_MASTER"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(2)).andExpect(jsonPath("$.data.meta.pages").value(2))
                .andExpect(jsonPath("$.data.result.length()").value(1))
                .andExpect(jsonPath("$.data.result[0].group.schoolClassId").value(own.getId()));
        }
        mvc.perform(post(action("/accept")).with(user(users.findById(other.getLecturerId()).orElseThrow().getEmail()).roles("LECTURE_MASTER")))
            .andExpect(status().isForbidden());
    }
}
