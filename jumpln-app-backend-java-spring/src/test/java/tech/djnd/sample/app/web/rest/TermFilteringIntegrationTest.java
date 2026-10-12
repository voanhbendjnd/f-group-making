package tech.djnd.sample.app.web.rest;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tech.djnd.sample.app.domain.*;
import tech.djnd.sample.app.repository.*;
import tech.djnd.sample.app.service.MailService;
import tech.djnd.sample.app.service.NotificationAsyncService;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(authorities = "ROLE_ADMIN")
class TermFilteringIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private TermRepository termRepository;
    @Autowired private SchoolClassRepository classRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private StudentRepository studentRepository;
    @Autowired private LecturerRepository lecturerRepository;
    @Autowired private MajorRepository majorRepository;
    @Autowired private StudentQueryRepository studentQueryRepository;
    @Autowired private LecturerQueryRepository lecturerQueryRepository;
    @MockitoBean private NotificationAsyncService notificationAsyncService;
    @MockitoBean private MailService mailService;

    private Term firstTerm;
    private Term secondTerm;
    private Student firstStudent;
    private Student secondStudent;
    private Lecturer assignedLecturer;
    private Lecturer unassignedLecturer;

    @BeforeEach
    void setUp() {
        firstTerm = term("SP27");
        secondTerm = term("SU27");
        assignedLecturer = lecturer("assigned");
        Lecturer secondLecturer = lecturer("second");
        unassignedLecturer = lecturer("unassigned");
        SchoolClass firstClass = schoolClass(firstTerm, assignedLecturer, "EXE101_G01");
        schoolClass(firstTerm, assignedLecturer, "EXE101_G02");
        SchoolClass secondClass = schoolClass(secondTerm, secondLecturer, "EXE101_G01");
        firstStudent = student("first", firstClass);
        secondStudent = student("second", secondClass);
        student("unassigned", null);
    }

    @Test
    void studentListAndDashboardTotalsAreScopedToTerm() throws Exception {
        for (Student student : List.of(firstStudent, secondStudent)) {
            Integer termId = student == firstStudent ? firstTerm.getId() : secondTerm.getId();
            mockMvc.perform(get("/api/students").param("termId", termId.toString()).param("size", "1"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.meta.total").value(1))
                    .andExpect(jsonPath("$.data.result[0].userId").value(student.getUserId()));
        }
        mockMvc.perform(get("/api/students").param("termId", firstTerm.getId().toString()).param("activated", "true"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(0));
        mockMvc.perform(get("/api/students"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(3));
    }

    @Test
    void lecturerWithTwoClassesIsReturnedOnlyOnceAndUnassignedRemainsInGlobalCatalog() throws Exception {
        mockMvc.perform(get("/api/lecturers").param("termId", firstTerm.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.result.length()").value(1))
                .andExpect(jsonPath("$.data.result[0].userId").value(assignedLecturer.getUserId()));
        mockMvc.perform(get("/api/lecturers").param("search", "unassigned"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(1));
        mockMvc.perform(get("/api/lecturers").param("termId", firstTerm.getId().toString()).param("search", "unassigned"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(0));
    }

    @Test
    void classListUsesExistingTermFilter() throws Exception {
        mockMvc.perform(get("/api/school-classes").param("termId", firstTerm.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(2));
        mockMvc.perform(get("/api/school-classes").param("termId", secondTerm.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(1));
    }

    @Test
    void invalidTermsNeverFallBackToGlobalData() throws Exception {
        for (String endpoint : List.of("/api/students", "/api/lecturers", "/api/school-classes")) {
            for (String invalid : List.of("0", "-1", "2147483647", "invalid", "", " ")) {
                mockMvc.perform(get(endpoint).param("termId", invalid)).andExpect(status().isBadRequest());
            }
        }
        Term emptyTerm = term("FALL27");
        mockMvc.perform(get("/api/students").param("termId", emptyTerm.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(0));
    }

    @Test
    void singleActivationRejectsEmailOutsideTermBeforeCreatingKey() throws Exception {
        String email = userRepository.findById(secondStudent.getUserId()).orElseThrow().getEmail();
        mockMvc.perform(post("/api/activate").param("termId", firstTerm.getId().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isBadRequest());
        assertThat(userRepository.findById(secondStudent.getUserId()).orElseThrow().getActivationKey()).isNull();
        verify(mailService, never()).sendActivationEmail(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void mixedTermExplicitBatchIsRejectedBeforeKeysOrEmailTasks() throws Exception {
        mockMvc.perform(post("/api/activate/mul").param("termId", firstTerm.getId().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[" + firstStudent.getUserId() + "," + secondStudent.getUserId() + "]}"))
                .andExpect(status().isBadRequest());
        assertThat(userRepository.findById(firstStudent.getUserId()).orElseThrow().getActivationKey()).isNull();
        assertThat(userRepository.findById(secondStudent.getUserId()).orElseThrow().getActivationKey()).isNull();
        verify(notificationAsyncService, never()).sendMailActivatedAccount(anyList());
    }

    @Test
    void activateAllStudentsTouchesOnlySelectedTerm() throws Exception {
        mockMvc.perform(post("/api/students/activate/all").param("termId", firstTerm.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalProcessed").value(1));
        assertThat(userRepository.findById(firstStudent.getUserId()).orElseThrow().getActivationKey()).isNotBlank();
        assertThat(userRepository.findById(secondStudent.getUserId()).orElseThrow().getActivationKey()).isNull();
    }

    @Test
    void activateAllLecturersTouchesOnlyAssignedLecturer() throws Exception {
        mockMvc.perform(post("/api/lecturers/activate-all").param("termId", firstTerm.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalProcessed").value(1));
        assertThat(userRepository.findById(assignedLecturer.getUserId()).orElseThrow().getActivationKey()).isNotBlank();
        assertThat(userRepository.findById(unassignedLecturer.getUserId()).orElseThrow().getActivationKey()).isNull();
    }

    @Test
    void batchDeleteRejectsLecturersOutsideTerm() throws Exception {
        mockMvc.perform(post("/api/lecturers/batch-delete").param("termId", firstTerm.getId().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[" + assignedLecturer.getUserId() + "," + unassignedLecturer.getUserId() + "]"))
                .andExpect(status().isBadRequest());
        assertThat(lecturerRepository.existsById(assignedLecturer.getUserId())).isTrue();
        assertThat(lecturerRepository.existsById(unassignedLecturer.getUserId())).isTrue();
    }

    @Test
    void filtersWorkForRepositoryDataAndCountQueries() {
        var studentPage = studentQueryRepository.search(StudentSpecifications.withTerm(firstTerm.getId()), PageRequest.of(0, 1));
        assertThat(studentPage.getTotalElements()).isEqualTo(1);
        assertThat(studentPage.getContent()).extracting(row -> row.userId()).containsExactly(firstStudent.getUserId());
        var lecturerPage = lecturerQueryRepository.search(LecturerSpecifications.withTerm(firstTerm.getId()), PageRequest.of(0, 1));
        assertThat(lecturerPage.getTotalElements()).isEqualTo(1);
        assertThat(lecturerPage.getContent()).extracting(row -> row.userId()).containsExactly(assignedLecturer.getUserId());
    }

    private Term term(String name) {
        Term term = new Term();
        term.setName(name);
        return termRepository.save(term);
    }

    private User user(String name, String prefix) {
        User user = new User();
        user.setEmail(prefix + "." + name + "@example.test");
        user.setName(name);
        return userRepository.save(user);
    }

    private Lecturer lecturer(String code) {
        Lecturer lecturer = new Lecturer();
        lecturer.setUserId(user(code, "lecturer").getId());
        lecturer.setCode(code);
        return lecturerRepository.save(lecturer);
    }

    private SchoolClass schoolClass(Term term, Lecturer lecturer, String name) {
        SchoolClass schoolClass = new SchoolClass();
        schoolClass.setName(name);
        schoolClass.setTermId(term.getId());
        schoolClass.setLecturerId(lecturer.getUserId());
        return classRepository.save(schoolClass);
    }

    private Student student(String name, SchoolClass schoolClass) {
        Student student = new Student();
        student.setUserId(user(name, "student").getId());
        student.setRollNumber("TEST-" + name);
        student.setFullName(name);
        student.setMemberCode("MEM-" + name);
        student.setMajorId(majorRepository.findAll().getFirst().getId());
        student.setSchoolClassId(schoolClass == null ? null : schoolClass.getId());
        return studentRepository.save(student);
    }
}
