package com.fmaking.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.Authority;
import com.fmaking.domain.User;
import com.fmaking.repository.*;
import com.fmaking.service.AuthService;
import com.fmaking.service.LecturerService;
import com.fmaking.service.dto.CreateLecturerDTO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:lecturer-role-cache;DB_CLOSE_DELAY=-1;MODE=MySQL",
    "spring.cache.type=simple",
    "spring.jpa.properties.hibernate.cache.use_second_level_cache=false"
})
@AutoConfigureMockMvc
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class LecturerRoleResourceTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired LecturerService lecturers;
    @Autowired UserRepository users;
    @Autowired AuthorityRepository authorities;
    @Autowired AuthService auth;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;

    private User lecturer() {
        String key = UUID.randomUUID().toString().substring(0, 8);
        var created = lecturers.createLecturer(new CreateLecturerDTO("ROLE-" + key, key + "@example.test"));
        User value = users.findById(created.getUserId()).orElseThrow();
        value.setActivated(true);
        return users.saveAndFlush(value);
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder change(User target, String role, String expected) throws Exception {
        return put("/api/lecturers/{id}/role", target.getId()).contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsBytes(Map.of("role", role, "expectedRole", expected)));
    }

    @Test void promotesAndDemotesExistingFacultyAndRevokesOldTokens() throws Exception {
        User target = lecturer();
        String oldToken = auth.generateResLoginDTO(users.findOneWithAuthoritiesByEmail(target.getEmail()).orElseThrow()).getAccessToken();
        String oldSession = users.findById(target.getId()).orElseThrow().getSessionId();
        mvc.perform(change(target, "ROLE_LECTURE_MASTER", "ROLE_LECTURE").with(user("admin@example.test").roles("ADMIN")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.authorities[0]").value("ROLE_LECTURE_MASTER"));
        User promoted = users.findOneWithAuthoritiesByEmail(target.getEmail()).orElseThrow();
        assertThat(promoted.getAuthorities()).extracting(Authority::getName).containsExactly("ROLE_LECTURE_MASTER");
        assertThat(promoted.getSessionId()).isNotEqualTo(oldSession);
        assertThat(promoted.getRefreshToken()).isNull();
        mvc.perform(get("/api/school-classes").header("Authorization", "Bearer " + oldToken)).andExpect(status().isUnauthorized());
        String headToken = auth.generateResLoginDTO(promoted).getAccessToken();
        mvc.perform(get("/api/school-classes").header("Authorization", "Bearer " + headToken)).andExpect(status().isOk());
        mvc.perform(get("/api/lecturers").param("search", target.getEmail()).with(user("admin@example.test").roles("ADMIN")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.result[0].authorities[0]").value("ROLE_LECTURE_MASTER"));
        mvc.perform(change(target, "ROLE_LECTURE", "ROLE_LECTURE_MASTER").with(user("admin@example.test").roles("ADMIN")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.authorities[0]").value("ROLE_LECTURE"));
        mvc.perform(get("/api/school-classes").header("Authorization", "Bearer " + headToken)).andExpect(status().isUnauthorized());
        // Authentication may have started before the demotion; token issuance must reload the current role under lock.
        String teacherToken = auth.generateResLoginDTO(promoted).getAccessToken();
        mvc.perform(get("/api/school-classes").header("Authorization", "Bearer " + teacherToken)).andExpect(status().isForbidden());
    }

    @Test void rejectsNonAdminsInvalidRolesAndStaleEditsWithoutChangingFaculty() throws Exception {
        User target = lecturer();
        mvc.perform(change(target, "ROLE_LECTURE_MASTER", "ROLE_LECTURE")).andExpect(status().isUnauthorized());
        for (String role : List.of("LECTURE", "LECTURE_MASTER", "STUDENT")) {
            mvc.perform(change(target, "ROLE_LECTURE_MASTER", "ROLE_LECTURE").with(user(target.getEmail()).roles(role)))
                .andExpect(status().isForbidden());
        }
        mvc.perform(change(target, "ROLE_ADMIN", "ROLE_LECTURE").with(user("admin@example.test").roles("ADMIN")))
            .andExpect(status().isBadRequest());
        mvc.perform(change(target, "ROLE_LECTURE", "ROLE_LECTURE_MASTER").with(user("admin@example.test").roles("ADMIN")))
            .andExpect(status().isConflict());
        assertThat(users.findOneWithAuthoritiesByEmail(target.getEmail()).orElseThrow().getAuthorities())
            .extracting(Authority::getName).containsExactly("ROLE_LECTURE");
        target.setId(Long.MAX_VALUE);
        mvc.perform(change(target, "ROLE_LECTURE_MASTER", "ROLE_LECTURE").with(user("admin@example.test").roles("ADMIN")))
            .andExpect(status().isNotFound());
    }

    @Test
    @org.springframework.security.test.context.support.WithMockUser(authorities = "ROLE_ADMIN")
    void loginDoesNotReuseAuthoritiesFromAnAlreadyManagedUserSnapshot() {
        User target = lecturer();
        var outer = new org.springframework.transaction.support.TransactionTemplate(transactions);
        outer.executeWithoutResult(status -> {
            User snapshot = users.findById(target.getId()).orElseThrow();
            assertThat(snapshot.getAuthorities()).extracting(Authority::getName).containsExactly("ROLE_LECTURE");
            var separate = new org.springframework.transaction.support.TransactionTemplate(transactions);
            separate.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            separate.executeWithoutResult(ignored -> lecturers.updateRole(target.getId(),
                new com.fmaking.service.dto.UpdateLecturerRoleDTO("ROLE_LECTURE_MASTER", "ROLE_LECTURE")));
            assertThat(snapshot.getAuthorities()).extracting(Authority::getName).containsExactly("ROLE_LECTURE");
            assertThat(auth.generateResLoginDTO(snapshot).getUser().getAuthorities()).containsExactly("ROLE_LECTURE_MASTER");
        });
    }

    @Test void facultyRoleEditorCannotChangeAdministratorPrivileges() throws Exception {
        User target = lecturer();
        target = users.findOneWithAuthoritiesByEmail(target.getEmail()).orElseThrow();
        target.getAuthorities().add(authorities.findById("ROLE_ADMIN").orElseThrow()); users.saveAndFlush(target);
        mvc.perform(change(target, "ROLE_LECTURE_MASTER", "ROLE_LECTURE").with(user("admin@example.test").roles("ADMIN")))
            .andExpect(status().isForbidden());
    }

    @Test void headGetsMinimalLecturerOptionsWithoutAccountManagement() throws Exception {
        User target = lecturer();
        mvc.perform(get("/api/lecturers/options").param("search", target.getEmail()).with(user(target.getEmail()).roles("LECTURE_MASTER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.result[0].userId").value(target.getId()))
            .andExpect(jsonPath("$.data.result[0].email").doesNotExist()).andExpect(jsonPath("$.data.result[0].activated").doesNotExist());
        mvc.perform(get("/api/lecturers").with(user(target.getEmail()).roles("LECTURE_MASTER"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/lecturers/options").with(user(target.getEmail()).roles("LECTURE"))).andExpect(status().isForbidden());
    }
}
