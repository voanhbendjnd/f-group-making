package com.fmaking.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DataIntegrityViolationException;
import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.*;
import com.fmaking.service.dto.CreateStudentDTO;

import java.util.Map;
import java.util.HashMap;
import java.util.Set;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(authorities = "ROLE_ADMIN")
class StudentCreateResourceTest {
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserRepository users;
    @MockitoSpyBean private StudentRepository students;
    @Autowired private MajorRepository majors;
    @Autowired private SchoolClassRepository classes;
    @Autowired private TermRepository terms;
    @Autowired private LecturerRepository lecturers;
    @Autowired private StudentService service;
    @MockitoBean private MailService mailService;
    @MockitoBean private NotificationAsyncService notifications;
    private SchoolClass schoolClass;
    private Major major;
    private Term term;

    @BeforeEach
    void setUp() {
        major = majors.findAll().getFirst();
        term = new Term(); term.setName("SP28"); terms.saveAndFlush(term);
        User lecturerUser = new User(); lecturerUser.setName("Form Lecturer"); lecturerUser.setEmail("form-lecturer@example.test");
        users.saveAndFlush(lecturerUser);
        Lecturer lecturer = new Lecturer(); lecturer.setUserId(lecturerUser.getId()); lecturer.setCode("FORM-LECTURER");
        lecturers.saveAndFlush(lecturer);
        schoolClass = new SchoolClass(); schoolClass.setName("FORM_CLASS"); schoolClass.setTermId(term.getId());
        schoolClass.setLecturerId(lecturer.getUserId()); classes.saveAndFlush(schoolClass);
    }

    private Map<String, Object> payload() {
        return new HashMap<>(Map.of("fullName", "  Form Student  ", "rollNumber", " FORM001 ",
                "memberCode", " FORM-MEMBER ", "email", " FORM.STUDENT@EXAMPLE.TEST ",
                "majorId", major.getId(), "termId", term.getId(), "schoolClassId", schoolClass.getId()));
    }

    private org.springframework.test.web.servlet.ResultActions create(Map<String, Object> payload) throws Exception {
        return mvc.perform(post("/api/students").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(payload)));
    }

    @Test
    void createsInactiveUserAndStudentInTheChosenFutureTermWithoutSendingEmail() throws Exception {
        Map<String,Object> payload = payload();
        payload.put("userId", 1); payload.put("activated", true); payload.put("groupId", 99); payload.put("password", "not-used");
        create(payload).andExpect(status().isCreated()).andExpect(jsonPath("$.data.email").value("form.student@example.test"))
                .andExpect(jsonPath("$.data.fullName").value("Form Student"))
                .andExpect(jsonPath("$.data.activated").value(false))
                .andExpect(jsonPath("$.data.activationKey").doesNotExist());
        User user = users.findOneByEmail("form.student@example.test").orElseThrow();
        Student student = students.findById(user.getId()).orElseThrow();
        assertThat(user.getActivated()).isFalse(); assertThat(user.getPassword()).isNull();
        assertThat(user.getActivationKey()).isNull(); assertThat(user.getAuthorities()).isEmpty();
        assertThat(student.getGroupId()).isNull(); assertThat(student.getSchoolClassId()).isEqualTo(schoolClass.getId());
        assertThat(classes.findById(student.getSchoolClassId()).orElseThrow().getTermId()).isEqualTo(term.getId());
        verifyNoInteractions(mailService, notifications);
        mvc.perform(post("/api/activate").param("termId", term.getId().toString()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(Map.of("userId", user.getId())))).andExpect(status().isOk());
        assertThat(users.findById(user.getId()).orElseThrow().getActivationKey()).isNotBlank();
        verify(mailService).sendActivationEmail(any());
    }

    @Test
    void validatesRequiredFieldsAndLengthsWithoutWrites() throws Exception {
        long before = users.count();
        for (String field : Set.of("fullName", "rollNumber", "memberCode", "email", "majorId", "termId", "schoolClassId")) {
            Map<String,Object> payload = payload(); payload.remove(field); create(payload).andExpect(status().isBadRequest());
        }
        for (var entry : Map.of("fullName", "X".repeat(51), "email", "not-an-email", "rollNumber", " ", "memberCode", "X".repeat(256)).entrySet()) {
            var payload = payload(); payload.put(entry.getKey(), entry.getValue()); create(payload).andExpect(status().isBadRequest());
        }
        assertThat(users.count()).isEqualTo(before);
    }

    @Test
    void rejectsInvalidMajorClassTermAndClassTermMismatch() throws Exception {
        for (String field : Set.of("majorId", "termId", "schoolClassId")) {
            var payload = payload(); payload.put(field, Integer.MAX_VALUE); create(payload).andExpect(status().isBadRequest());
        }
        Term other = new Term(); other.setName("SU28"); terms.saveAndFlush(other);
        var payload = payload(); payload.put("termId", other.getId()); create(payload).andExpect(status().isBadRequest());
        schoolClass.setLecturerId(null); classes.saveAndFlush(schoolClass);
        create(payload()).andExpect(status().isBadRequest());
    }

    @Test
    void rejectsEmailFromAnyUserAndCaseInsensitiveRollAndMemberDuplicates() throws Exception {
        create(payload()).andExpect(status().isCreated());
        long before = users.count();
        for (String duplicate : Set.of("email", "rollNumber", "memberCode")) {
            var payload = payload(); payload.put("rollNumber", "OTHER001"); payload.put("memberCode", "OTHER-MEMBER"); payload.put("email", "other.student@example.test");
            payload.put(duplicate, duplicate.equals("email") ? "form.student@example.test" : duplicate.equals("rollNumber") ? "form001" : "form-member");
            create(payload).andExpect(status().isBadRequest());
        }
        var payload = payload(); payload.put("email", "form-lecturer@example.test");
        create(payload).andExpect(status().isBadRequest());
        assertThat(users.count()).isEqualTo(before);
    }

    @Test
    @WithMockUser(authorities = "ROLE_STUDENT")
    void rejectsStudents() throws Exception { create(payload()).andExpect(status().isForbidden()); }

    @Test
    @org.springframework.security.test.context.support.WithAnonymousUser
    void rejectsAnonymous() throws Exception { create(payload()).andExpect(status().isUnauthorized()); }
}
