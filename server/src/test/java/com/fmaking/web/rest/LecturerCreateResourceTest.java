package com.fmaking.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.User;
import com.fmaking.repository.*;
import com.fmaking.service.*;
import com.fmaking.service.dto.CreateLecturerDTO;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.zalando.problem.violations.ConstraintViolationProblem;

import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:lecturer-create;DB_CLOSE_DELAY=-1;MODE=MySQL;IGNORECASE=TRUE",
        "spring.jpa.properties.hibernate.cache.use_second_level_cache=false",
        "spring.jpa.properties.hibernate.cache.use_query_cache=false"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@WithMockUser(authorities = "ROLE_ADMIN")
class LecturerCreateResourceTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired LecturerService service;
    @Autowired UserService userService;
    @MockitoSpyBean UserRepository users;
    @MockitoSpyBean LecturerRepository lecturers;
    @MockitoBean MailService mail;
    @MockitoBean NotificationAsyncService notifications;

    private String key() { return UUID.randomUUID().toString().substring(0, 12); }
    private org.springframework.test.web.servlet.ResultActions create(Map<String, Object> body) throws Exception {
        return mvc.perform(post("/api/lecturers").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(body)));
    }
    @AfterEach void resetSpy() { reset(lecturers, users); }

    @Test void createsAnInactiveLecturerAndCanUseExistingActivationWithoutRealMail() throws Exception {
        String code = "GV" + key(), email = key() + "@example.test";
        create(Map.of("code", " " + code + " ", "email", " " + email.toUpperCase(Locale.ROOT) + " ",
                "activated", true, "password", "ignored", "authorities", List.of("ROLE_ADMIN"), "userId", 1))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.code").value(code))
                .andExpect(jsonPath("$.data.email").value(email)).andExpect(jsonPath("$.data.activated").value(false))
                .andExpect(jsonPath("$.data.activationKey").doesNotExist()).andExpect(jsonPath("$.data.password").doesNotExist());
        User user = users.findOneWithAuthoritiesByEmail(email).orElseThrow();
        assertThat(user.getName()).isEqualTo(code);
        assertThat(user.getActivated()).isFalse(); assertThat(user.getPassword()).isNull(); assertThat(user.getActivationKey()).isNull();
        assertThat(user.getAuthorities()).extracting("name").containsExactly("ROLE_LECTURE");
        assertThat(lecturers.findById(user.getId()).orElseThrow().getCode()).isEqualTo(code);
        verifyNoInteractions(mail, notifications);
        mvc.perform(post("/api/activate").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(Map.of("userId", user.getId()))))
                .andExpect(status().isOk());
        verify(mail).sendActivationEmail(any());
        String activation = users.findById(user.getId()).orElseThrow().getActivationKey();
        userService.activateAccountAndSetPassword(activation, "Test-password-123!");
        User activated = users.findOneWithAuthoritiesByEmail(email).orElseThrow();
        assertThat(activated.getActivated()).isTrue(); assertThat(activated.getPassword()).isNotBlank();
        assertThat(activated.getActivationKey()).isNull();
        assertThat(activated.getAuthorities()).extracting("name").containsExactly("ROLE_LECTURE");
    }

    @Test void validatesMissingBlankLengthAndEmailWithoutWrites() throws Exception {
        long before = users.count();
        List<Map<String,Object>> invalid = List.of(Map.of(), Map.of("code", "GV"), Map.of("email", "a@example.test"),
                Map.of("code", " ", "email", " "), Map.of("code", "A", "email", "a@example.test"),
                Map.of("code", "A".repeat(51), "email", "a@example.test"), Map.of("code", "GV", "email", "invalid"),
                Map.of("code", "GV", "email", "a".repeat(245) + "@example.test"), Map.of("code", "GV", "email", "a@b"));
        for (var body : invalid) create(body).andExpect(status().isBadRequest());
        assertThat(users.count()).isEqualTo(before);
    }

    @Test void reportsBothDuplicatesIncludingCaseVariantsAndEmailFromANonLecturer() throws Exception {
        String code = "GV" + key(), email = key() + "@example.test";
        service.createLecturer(new CreateLecturerDTO(code, email));
        long before = users.count();
        create(Map.of("code", code.toLowerCase(Locale.ROOT), "email", email.toUpperCase(Locale.ROOT)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.violations[?(@.field=='code')].message").value(org.hamcrest.Matchers.hasItem("lecturerCreate.duplicateCode")))
                .andExpect(jsonPath("$.violations[?(@.field=='email')].message").value(org.hamcrest.Matchers.hasItem("lecturerCreate.duplicateEmail")));
        create(Map.of("code", code, "email", key() + "@example.test")).andExpect(status().isConflict());
        User other = new User(); other.setEmail(key() + "@example.test"); users.saveAndFlush(other);
        create(Map.of("code", "NEW" + key(), "email", other.getEmail().toUpperCase(Locale.ROOT)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.violations[0].field").value("email"));
        assertThat(users.count()).isEqualTo(before + 1);
    }

    @Test void databaseUniqueConflictRollsBackAndReturnsTheCodeFieldAfterRollback() throws Exception {
        String code = "GV" + key();
        service.createLecturer(new CreateLecturerDTO(code, key() + "@example.test"));
        long beforeUsers = users.count(), beforeLecturers = lecturers.count();
        // Simulate validation preceding a competing commit. The real unique constraint rejects the insert.
        doReturn(List.of()).when(lecturers).findByCodeIgnoreCaseIn(anyCollection());
        String email = key() + "@example.test";
        create(Map.of("code", code, "email", email)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.violations[0].message").value("lecturerCreate.duplicateCode"));
        assertThat(users.findOneByEmail(email)).isEmpty();
        assertThat(users.count()).isEqualTo(beforeUsers); assertThat(lecturers.count()).isEqualTo(beforeLecturers);
    }

    @Test void unexpectedFlushFailureRollsBackTheNewUser() {
        long before = users.count();
        doThrow(new DataIntegrityViolationException("Test conflict")).when(lecturers).flush();
        assertThatThrownBy(() -> service.createLecturer(new CreateLecturerDTO("GV" + key(), key() + "@example.test")))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(users.count()).isEqualTo(before);
    }

    @Test void databaseEmailConflictReturnsTheEmailFieldAfterRollback() throws Exception {
        User existing = new User(); existing.setEmail(key() + "@example.test"); users.saveAndFlush(existing);
        long beforeUsers = users.count(), beforeLecturers = lecturers.count();
        doReturn(List.of()).doReturn(List.of(existing)).when(users).findByEmailIgnoreCaseIn(anyList());
        create(Map.of("code", "GV" + key(), "email", existing.getEmail().toUpperCase(Locale.ROOT)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.violations[0].message").value("lecturerCreate.duplicateEmail"));
        assertThat(users.count()).isEqualTo(beforeUsers); assertThat(lecturers.count()).isEqualTo(beforeLecturers);
    }

    @Test void concurrentCodeOnlyAndEmailOnlyConflictsAreAlsoAtomic() throws Exception {
        for (boolean sameCode : List.of(true, false)) {
            String code = "GV" + key(), email = key() + "@example.test";
            long beforeUsers = users.count(), beforeLecturers = lecturers.count();
            CountDownLatch start = new CountDownLatch(1);
            try (var executor = Executors.newFixedThreadPool(2)) {
                var a = executor.submit(() -> createAfter(start, new CreateLecturerDTO(code, email)));
                var b = executor.submit(() -> createAfter(start, new CreateLecturerDTO(sameCode ? code.toLowerCase(Locale.ROOT) : "GV" + key(),
                        sameCode ? key() + "@example.test" : email.toUpperCase(Locale.ROOT))));
                start.countDown();
                assertThat(a.get(20, TimeUnit.SECONDS) + b.get(20, TimeUnit.SECONDS)).isEqualTo(1);
            }
            assertThat(users.count()).isEqualTo(beforeUsers + 1); assertThat(lecturers.count()).isEqualTo(beforeLecturers + 1);
        }
    }

    @Test void simultaneousRequestsCreateOnlyOneLecturer() throws Exception {
        String code = "GV" + key(), email = key() + "@example.test";
        long beforeUsers = users.count(), beforeLecturers = lecturers.count();
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> first = () -> createAfter(start, new CreateLecturerDTO(code, email));
            Callable<Integer> second = () -> createAfter(start, new CreateLecturerDTO(code.toLowerCase(Locale.ROOT), email.toUpperCase(Locale.ROOT)));
            var a = executor.submit(first); var b = executor.submit(second); start.countDown();
            assertThat(a.get(20, TimeUnit.SECONDS) + b.get(20, TimeUnit.SECONDS)).isEqualTo(1);
        }
        assertThat(users.count()).isEqualTo(beforeUsers + 1); assertThat(lecturers.count()).isEqualTo(beforeLecturers + 1);
    }
    private int createAfter(CountDownLatch start, CreateLecturerDTO request) throws Exception {
        if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Test synchronization timeout");
        try { service.createLecturer(request); return 1; }
        catch (ConstraintViolationProblem | DataIntegrityViolationException expected) { return 0; }
    }

    @Test void excelImportStillCreatesTheSameAccountAndRejectsDuplicateRowsAtomically() throws Exception {
        String code = "GV" + key(), email = key() + "@example.test";
        var result = service.importFromExcel(excel(new String[][]{{code, email}}));
        assertThat(result.isSuccess()).isTrue(); assertThat(result.getTotalImported()).isEqualTo(1);
        User user = users.findOneWithAuthoritiesByEmail(email).orElseThrow();
        assertThat(user.getName()).isEqualTo(code); assertThat(user.getActivated()).isFalse(); assertThat(user.getPassword()).isNull();
        assertThat(user.getActivationKey()).isNull(); assertThat(user.getAuthorities()).extracting("name").containsExactly("ROLE_LECTURE");
        long before = users.count();
        var duplicate = service.importFromExcel(excel(new String[][]{{code.toLowerCase(Locale.ROOT), email}, {"NEW" + key(), key() + "@example.test"}}));
        assertThat(duplicate.isSuccess()).isFalse(); assertThat(duplicate.getTotalImported()).isZero();
        assertThat(users.count()).isEqualTo(before); verifyNoInteractions(mail, notifications);
    }
    private MockMultipartFile excel(String[][] values) throws Exception {
        try (var workbook = new XSSFWorkbook(); var out = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet("Lecturers"); var header = sheet.createRow(0);
            header.createCell(0).setCellValue("Lecturer Code"); header.createCell(1).setCellValue("Email");
            for (int i = 0; i < values.length; i++) { var row = sheet.createRow(i + 1); row.createCell(0).setCellValue(values[i][0]); row.createCell(1).setCellValue(values[i][1]); }
            workbook.write(out);
            return new MockMultipartFile("file", "lecturers.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray());
        }
    }

    @Test @WithMockUser(authorities = "ROLE_STUDENT") void rejectsStudent() throws Exception {
        create(Map.of("code", "GV", "email", "a@example.test")).andExpect(status().isForbidden());
    }
    @Test @WithMockUser(authorities = "ROLE_LECTURE_MASTER") void rejectsLecturerMaster() throws Exception {
        create(Map.of("code", "GV", "email", "a@example.test")).andExpect(status().isForbidden());
    }
    @Test @WithMockUser(authorities = "ROLE_LECTURE") void rejectsLecturer() throws Exception {
        create(Map.of("code", "GV", "email", "a@example.test")).andExpect(status().isForbidden());
    }
    @Test @org.springframework.security.test.context.support.WithAnonymousUser void rejectsAnonymous() throws Exception {
        create(Map.of("code", "GV", "email", "a@example.test")).andExpect(status().isUnauthorized());
    }
}
