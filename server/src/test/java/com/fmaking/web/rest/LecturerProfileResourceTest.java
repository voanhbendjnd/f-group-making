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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class LecturerProfileResourceTest {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired LecturerRepository lecturers;
    @Autowired SchoolClassRepository classes;
    @Autowired TermRepository terms;
    private User teacher;

    @BeforeEach void setup() {
        teacher = new User(); teacher.setName("Profile Lecturer"); teacher.setEmail("lecturer.profile@example.test");
        teacher.setActivated(true); teacher.setPassword("test-hash"); teacher.setActivationKey("test-key"); users.saveAndFlush(teacher);
        Lecturer lecturer = new Lecturer(); lecturer.setUserId(teacher.getId()); lecturer.setCode("PROFILE_GV"); lecturers.saveAndFlush(lecturer);
        User other = new User(); other.setEmail("other.lecturer.profile@example.test"); users.saveAndFlush(other);
        Lecturer otherLecturer = new Lecturer(); otherLecturer.setUserId(other.getId()); otherLecturer.setCode("OTHER_PROFILE_GV"); lecturers.saveAndFlush(otherLecturer);
        Term first = new Term(); first.setName("SP23"); terms.saveAndFlush(first);
        Term second = new Term(); second.setName("FALL23"); terms.saveAndFlush(second);
        addClass("OWN_SPRING", first.getId(), teacher.getId()); addClass("OWN_FALL", second.getId(), teacher.getId());
        addClass("OWN_WITHOUT_TERM", null, teacher.getId()); addClass("OTHER_CLASS", first.getId(), other.getId());
    }
    private void addClass(String name, Integer termId, Long lecturerId) {
        SchoolClass schoolClass = new SchoolClass(); schoolClass.setName(name); schoolClass.setTermId(termId); schoolClass.setLecturerId(lecturerId);
        classes.saveAndFlush(schoolClass);
    }

    @Test @WithMockUser(username="lecturer.profile@example.test", authorities="ROLE_LECTURE")
    void returnsOwnUserAndLecturerWithoutSensitiveFieldsOrAnIdParameter() throws Exception {
        mvc.perform(get("/api/me/lecturer-profile").param("userId", "1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("Profile Lecturer"))
                .andExpect(jsonPath("$.data.code").value("PROFILE_GV"))
                .andExpect(jsonPath("$.data.email").value(teacher.getEmail()))
                .andExpect(jsonPath("$.data.activated").value(true)).andExpect(jsonPath("$.data.profileComplete").value(true))
                .andExpect(jsonPath("$.data.userId").doesNotExist()).andExpect(jsonPath("$.data.password").doesNotExist())
                .andExpect(jsonPath("$.data.activationKey").doesNotExist()).andExpect(jsonPath("$.data.authorities").doesNotExist());
        mvc.perform(get("/api/lecturers")).andExpect(status().isForbidden());
    }

    @Test @WithMockUser(username="lecturer.profile@example.test", authorities="ROLE_LECTURE_MASTER")
    void masterProfileUsesOnlyAssignedClassesAcrossTermsAndPaginationMetadata() throws Exception {
        mvc.perform(get("/api/me/lecturer-profile")).andExpect(status().isOk()).andExpect(jsonPath("$.data.code").value("PROFILE_GV"));
        mvc.perform(get("/api/me/school-classes").param("page", "1").param("size", "2").param("userId", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(3))
                .andExpect(jsonPath("$.data.meta.pages").value(2)).andExpect(jsonPath("$.data.result.length()").value(2))
                .andExpect(jsonPath("$.data.result[?(@.name=='OTHER_CLASS')]").isEmpty());
        mvc.perform(get("/api/me/school-classes").param("size", "10").param("sort", "name,asc"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.result[0].termName").value("FALL23"))
                .andExpect(jsonPath("$.data.result[1].termName").value("SP23"))
                .andExpect(jsonPath("$.data.result[2].termName").isEmpty())
                .andExpect(jsonPath("$.data.result[0].studentCount").value(0));
    }

    @Test @WithMockUser(username="lecturer.profile@example.test", authorities="ROLE_LECTURE")
    void lecturerAlsoSeesOnlyAssignedClasses() throws Exception {
        mvc.perform(get("/api/me/school-classes").param("size", "10"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(3))
                .andExpect(jsonPath("$.data.result[?(@.name=='OTHER_CLASS')]").isEmpty());
    }

    @Test @WithMockUser(username="lecturer.profile@example.test", authorities="ROLE_LECTURE_MASTER")
    void missingLecturerRecordStillReturnsRealUserInformation() throws Exception {
        lecturers.deleteById(teacher.getId()); lecturers.flush();
        mvc.perform(get("/api/me/lecturer-profile")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value(teacher.getName())).andExpect(jsonPath("$.data.email").value(teacher.getEmail()))
                .andExpect(jsonPath("$.data.code").isEmpty()).andExpect(jsonPath("$.data.profileComplete").value(false));
    }

    @Test @WithMockUser(username="unassigned.profile@example.test", authorities="ROLE_LECTURE")
    void unassignedLecturerHasAnEmptyPersonalClassList() throws Exception {
        User user = new User(); user.setEmail("unassigned.profile@example.test"); users.saveAndFlush(user);
        Lecturer lecturer = new Lecturer(); lecturer.setUserId(user.getId()); lecturer.setCode("UNASSIGNED_PROFILE"); lecturers.saveAndFlush(lecturer);
        mvc.perform(get("/api/me/school-classes")).andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(0));
    }

    @Test @WithMockUser(username="missing@example.test", authorities="ROLE_LECTURE")
    void missingUserReturnsNotFound() throws Exception { mvc.perform(get("/api/me/lecturer-profile")).andExpect(status().isNotFound()); }
    @Test @WithMockUser(authorities="ROLE_STUDENT")
    void studentIsForbidden() throws Exception { mvc.perform(get("/api/me/lecturer-profile")).andExpect(status().isForbidden()); }
    @Test @WithMockUser(authorities="ROLE_ADMIN")
    void adminOnlyIsForbidden() throws Exception { mvc.perform(get("/api/me/lecturer-profile")).andExpect(status().isForbidden()); }
    @Test @org.springframework.security.test.context.support.WithAnonymousUser
    void anonymousIsUnauthorized() throws Exception { mvc.perform(get("/api/me/lecturer-profile")).andExpect(status().isUnauthorized()); }
}
