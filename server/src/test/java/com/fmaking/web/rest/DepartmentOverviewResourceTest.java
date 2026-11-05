package com.fmaking.web.rest;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "overview-head@example.test", authorities = "ROLE_LECTURE_MASTER")
class DepartmentOverviewResourceTest {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired LecturerRepository lecturers;
    @Autowired SchoolClassRepository classes;
    @Autowired StudentRepository students;
    @Autowired TermRepository terms;
    @Autowired MajorRepository majors;
    @Autowired GroupRepository groups;
    @Autowired GroupMemberRepository memberships;
    @Autowired DeadlineRepository deadlines;
    User head;
    Term term, otherTerm;
    SchoolClass own, foreign, empty;
    Student assignedOwn, unassignedOwn, assignedForeign;

    User account(String email, String name, boolean activated) {
        User account = new User(); account.setEmail(email); account.setName(name); account.setActivated(activated);
        return users.saveAndFlush(account);
    }
    User lecturer(String email, String code) {
        User account = account(email, code, true);
        Lecturer lecturer = new Lecturer(); lecturer.setUserId(account.getId()); lecturer.setCode(code); lecturers.saveAndFlush(lecturer);
        return account;
    }
    Term term() { Term value = new Term(); value.setName("D" + UUID.randomUUID().toString().substring(0, 7)); return terms.saveAndFlush(value); }
    SchoolClass schoolClass(String name, Long lecturer, Term term) {
        SchoolClass value = new SchoolClass(); value.setName(name); value.setLecturerId(lecturer); value.setTermId(term.getId());
        return classes.saveAndFlush(value);
    }
    Student student(SchoolClass schoolClass, boolean activated) {
        User account = account(UUID.randomUUID() + "@example.test", "Dashboard student", activated);
        Student value = new Student(); value.setUserId(account.getId()); value.setFullName(account.getName());
        value.setRollNumber("D" + account.getId()); value.setMemberCode("DM" + account.getId());
        value.setMajorId(majors.findAll().getFirst().getId()); value.setSchoolClassId(schoolClass.getId());
        return students.saveAndFlush(value);
    }
    Group group(SchoolClass schoolClass, Student student, GroupStatus status) {
        Deadline session = new Deadline(); session.setName("Dashboard session"); session.setStatus("UNSCHEDULED");
        session.getSchoolClasses().add(schoolClass); session = deadlines.saveAndFlush(session);
        Group group = new Group(); group.setName("Dashboard group"); group.setSchoolClassId(schoolClass.getId());
        group.setDeadlineId(session.getId()); group.setLeaderId(student.getUserId()); group.setStatus(status); group = groups.saveAndFlush(group);
        GroupMember member = new GroupMember(); member.setGroupId(group.getId()); member.setStudentId(student.getUserId());
        member.setSchoolClassId(schoolClass.getId()); member.setDeadlineId(session.getId()); member.setRole(GroupMemberRole.LEADER);
        member.setJoinedAt(Instant.now()); memberships.saveAndFlush(member);
        return group;
    }

    @BeforeEach void setup() {
        head = lecturer("overview-head@example.test", "OV-HEAD");
        User other = lecturer("overview-other@example.test", "OV-OTHER");
        term = term(); otherTerm = term();
        own = schoolClass("Overview own", head.getId(), term);
        foreign = schoolClass("Overview foreign", other.getId(), term);
        empty = schoolClass("Overview unassigned", null, term);
        assignedOwn = student(own, true); unassignedOwn = student(own, false); assignedForeign = student(foreign, true);
        group(own, assignedOwn, GroupStatus.PENDING); group(own, unassignedOwn, GroupStatus.DISBANDED);
        group(foreign, assignedForeign, GroupStatus.ACCEPTED);
        SchoolClass outside = schoolClass("Outside semester", other.getId(), otherTerm);
        group(outside, student(outside, true), GroupStatus.PENDING);
    }

    @Test void aggregatesEntireTermWithoutCountingDisbandedGroupsOrOtherTerms() throws Exception {
        mvc.perform(get("/api/department-overview").param("termId", term.getId().toString()).param("size", "1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.summary.classes").value(3))
            .andExpect(jsonPath("$.data.summary.lecturers").value(2)).andExpect(jsonPath("$.data.summary.unassignedClasses").value(1))
            .andExpect(jsonPath("$.data.summary.statistics.students").value(3))
            .andExpect(jsonPath("$.data.summary.statistics.activatedStudents").value(2))
            .andExpect(jsonPath("$.data.summary.statistics.groupedStudents").value(2))
            .andExpect(jsonPath("$.data.summary.statistics.unassignedStudents").value(1))
            .andExpect(jsonPath("$.data.summary.statistics.groups").value(2))
            .andExpect(jsonPath("$.data.summary.statistics.pendingGroups").value(1))
            .andExpect(jsonPath("$.data.summary.statistics.acceptedGroups").value(1))
            .andExpect(jsonPath("$.data.classes.meta.total").value(3)).andExpect(jsonPath("$.data.classes.meta.pages").value(3))
            .andExpect(jsonPath("$.data.classes.result.length()").value(1));
    }

    @Test void filtersListBeforePaginationWhileKeepingTermSummaryGlobal() throws Exception {
        mvc.perform(get("/api/department-overview").param("termId", term.getId().toString()).param("classScope", "OTHERS").param("size", "1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.summary.classes").value(3))
            .andExpect(jsonPath("$.data.classes.meta.total").value(2));
        mvc.perform(get("/api/department-overview").param("termId", term.getId().toString()).param("classScope", "MINE"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.classes.meta.total").value(1))
            .andExpect(jsonPath("$.data.classes.result[0].schoolClass.id").value(own.getId()));
        mvc.perform(get("/api/department-overview").param("termId", term.getId().toString()).param("search", "foreign"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.classes.meta.total").value(1))
            .andExpect(jsonPath("$.data.classes.result[0].statistics.acceptedGroups").value(1));
    }

    @Test void classDetailsAreReadableWithoutCreatingSessionsIncludingEmptyAndOwnClasses() throws Exception {
        long before = deadlines.count();
        mvc.perform(get("/api/department-overview/classes/{id}", foreign.getId()).param("termId", term.getId().toString()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.schoolClass.id").value(foreign.getId()))
            .andExpect(jsonPath("$.data.statistics.groupedStudents").value(1))
            .andExpect(jsonPath("$.data.groups[0].members").value(1))
            .andExpect(jsonPath("$.data.assignedStudentIds[0]").value(assignedForeign.getUserId()));
        mvc.perform(get("/api/department-overview/classes/{id}", empty.getId()).param("termId", term.getId().toString()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.statistics.students").value(0))
            .andExpect(jsonPath("$.data.groups").isEmpty());
        mvc.perform(get("/api/department-overview/classes/{id}", own.getId()).param("termId", term.getId().toString()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.statistics.unassignedStudents").value(1));
        assertThat(deadlines.count()).isEqualTo(before);
    }

    @Test void countsEachStudentOnceAcrossMultipleSessions() throws Exception {
        group(own, assignedOwn, GroupStatus.OPEN);
        mvc.perform(get("/api/department-overview/classes/{id}", own.getId()).param("termId", term.getId().toString()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.statistics.groupedStudents").value(1))
            .andExpect(jsonPath("$.data.statistics.groups").value(2))
            .andExpect(jsonPath("$.data.assignedStudentIds.length()").value(1));
    }

    @Test void headTeachingFeaturesDefaultToOwnClassesAndGlobalViewIsSeparate() throws Exception {
        mvc.perform(get("/api/me/group-reviews").param("termId", term.getId().toString()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(1))
            .andExpect(jsonPath("$.data.result[0].group.schoolClassId").value(own.getId()));
        mvc.perform(get("/api/deadlines").param("termId", term.getId().toString()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(2));
        mvc.perform(get("/api/me/group-reviews").param("termId", term.getId().toString()).param("classId", foreign.getId().toString()))
            .andExpect(status().isForbidden());
    }

    @Test void deniesOrdinaryLecturersAndStudentsAndRejectsInvalidClassTerm() throws Exception {
        for (String role : new String[]{"LECTURE", "STUDENT"}) {
            mvc.perform(get("/api/department-overview").param("termId", term.getId().toString()).with(user(head.getEmail()).roles(role)))
                .andExpect(status().isForbidden());
            mvc.perform(get("/api/department-overview/classes/{id}", own.getId()).param("termId", term.getId().toString()).with(user(head.getEmail()).roles(role)))
                .andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/department-overview/classes/{id}", own.getId()).param("termId", otherTerm.getId().toString()))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/department-overview/classes/2147483647").param("termId", term.getId().toString())).andExpect(status().isNotFound());
        mvc.perform(get("/api/department-overview").param("termId", "2147483647")).andExpect(status().isBadRequest());
    }
}
