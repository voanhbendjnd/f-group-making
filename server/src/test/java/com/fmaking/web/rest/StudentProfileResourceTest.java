package com.fmaking.web.rest;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.domain.*;
import com.fmaking.repository.*;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class StudentProfileResourceTest {
    @Autowired private MockMvc mvc;
    @Autowired private UserRepository users;
    @Autowired private StudentRepository students;
    @Autowired private MajorRepository majors;
    @Autowired private SchoolClassRepository classes;
    @Autowired private TermRepository terms;
    @Autowired private GroupRepository groups;
    private Student student;
    private SchoolClass schoolClass;

    @BeforeEach
    void setUp() {
        User user = new User();
        user.setName("Profile Student");
        user.setEmail("profile@example.test");
        user.setActivated(true);
        user.setActivationKey("test-profile-key");
        users.saveAndFlush(user);
        Major major = majors.findAll().getFirst();
        Term term = new Term();
        term.setName("SP24");
        terms.saveAndFlush(term);
        schoolClass = new SchoolClass();
        schoolClass.setName("EXE101_PROFILE");
        schoolClass.setTermId(term.getId());
        classes.saveAndFlush(schoolClass);
        student = new Student();
        student.setUserId(user.getId());
        student.setFullName("Profile Student");
        student.setRollNumber("PROFILE001");
        student.setMemberCode("PROFILEMEMBER");
        student.setMajorId(major.getId());
        student.setSchoolClassId(schoolClass.getId());
        students.saveAndFlush(student);
    }

    @Test
    @WithMockUser(username = "profile@example.test", authorities = "ROLE_STUDENT")
    void returnsOnlyOwnProfileAndNeverSecretsOrTechnicalIds() throws Exception {
        mvc.perform(get("/api/me/student-profile").param("userId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rollNumber").value("PROFILE001"))
                .andExpect(jsonPath("$.data.email").value("profile@example.test"))
                .andExpect(jsonPath("$.data.activated").value(true))
                .andExpect(jsonPath("$.data.schoolClass.name").value("EXE101_PROFILE"))
                .andExpect(jsonPath("$.data.term.name").value("SP24"))
                .andExpect(jsonPath("$.data.group.state").value("UNASSIGNED"))
                .andExpect(jsonPath("$.data.activationKey").doesNotExist())
                .andExpect(jsonPath("$.data.password").doesNotExist())
                .andExpect(jsonPath("$.data.userId").doesNotExist());
        mvc.perform(get("/api/students/1")).andExpect(status().isForbidden());
    }

    @Test
    void rejectsAnonymous() throws Exception {
        mvc.perform(get("/api/me/student-profile")).andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(authorities = "ROLE_LECTURE")
    void rejectsOtherRoles() throws Exception {
        mvc.perform(get("/api/me/student-profile")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "profile@example.test", authorities = "ROLE_STUDENT")
    void handlesUnassignedClassAndTerm() throws Exception {
        student.setSchoolClassId(null);
        students.saveAndFlush(student);
        mvc.perform(get("/api/me/student-profile"))
                .andExpect(jsonPath("$.data.schoolClass.state").value("UNASSIGNED"))
                .andExpect(jsonPath("$.data.term.state").value("UNASSIGNED"));
    }

    @Test
    @WithMockUser(username = "profile@example.test", authorities = "ROLE_STUDENT")
    void handlesClassWithoutTermAndBrokenLinks() throws Exception {
        schoolClass.setTermId(null);
        classes.saveAndFlush(schoolClass);
        mvc.perform(get("/api/me/student-profile")).andExpect(jsonPath("$.data.term.state").value("UNASSIGNED"));
        schoolClass.setTermId(Integer.MAX_VALUE);
        classes.saveAndFlush(schoolClass);
        mvc.perform(get("/api/me/student-profile")).andExpect(jsonPath("$.data.term.state").value("MISSING"));
        student.setSchoolClassId(Integer.MAX_VALUE);
        student.setGroupId(Long.MAX_VALUE);
        students.saveAndFlush(student);
        mvc.perform(get("/api/me/student-profile"))
                .andExpect(jsonPath("$.data.schoolClass.state").value("MISSING"))
                .andExpect(jsonPath("$.data.group.state").value("MISSING"));
    }

    @Test
    @WithMockUser(username = "profile@example.test", authorities = "ROLE_STUDENT")
    void readsGroupButDoesNotExposeAGroupFromAnotherClass() throws Exception {
        Group group = new Group();
        group.setName("Profile Group");
        group.setSchoolClassId(schoolClass.getId());
        groups.saveAndFlush(group);
        student.setGroupId(group.getId());
        students.saveAndFlush(student);
        mvc.perform(get("/api/me/student-profile")).andExpect(jsonPath("$.data.group.name").value("Profile Group"));
        group.setSchoolClassId(Integer.MAX_VALUE);
        groups.saveAndFlush(group);
        mvc.perform(get("/api/me/student-profile"))
                .andExpect(jsonPath("$.data.group.state").value("MISSING"))
                .andExpect(jsonPath("$.data.group.name").isEmpty());
    }

    @Test
    @WithMockUser(username = "absent@example.test", authorities = "ROLE_STUDENT")
    void missingProfileReturnsNotFound() throws Exception {
        mvc.perform(get("/api/me/student-profile")).andExpect(status().isNotFound());
    }
}
