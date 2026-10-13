package com.fmaking.web.rest;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.context.support.WithAnonymousUser;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.domain.*;
import com.fmaking.repository.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(authorities = "ROLE_ADMIN")
class ClassLecturerAssignmentTest {
    @Autowired MockMvc mvc;
    @Autowired SchoolClassRepository classes;
    @Autowired LecturerRepository lecturers;
    @Autowired UserRepository users;
    @Autowired TermRepository terms;
    @Autowired RuleRepository rules;
    @Autowired ObjectMapper mapper;
    SchoolClass schoolClass;
    Long firstId;
    Long secondId;

    @BeforeEach
    void prepare() {
        firstId = lecturer("ASSIGN-FIRST", "assign-first@example.test");
        secondId = lecturer("ASSIGN-SECOND", "assign-second@example.test");
        var term = new Term(); term.setName("ASSIGNTERM"); term = terms.saveAndFlush(term);
        schoolClass = new SchoolClass(); schoolClass.setName("Unassigned Class"); schoolClass.setTermId(term.getId());
        schoolClass = classes.saveAndFlush(schoolClass);
    }

    @Test
    void assignsAnUnassignedGlobalLecturerAndGrantsClassAccessWithoutSavingRules() throws Exception {
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(body(firstId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.lecturerId").value(firstId))
                .andExpect(jsonPath("$.data.lecturerCode").value("ASSIGN-FIRST"))
                .andExpect(jsonPath("$.data.lecturerEmail").value("assign-first@example.test"))
                .andExpect(jsonPath("$.data.termId").value(schoolClass.getTermId()));
        assertThat(classes.findById(schoolClass.getId()).orElseThrow().getLecturerId()).isEqualTo(firstId);
        assertThat(schoolClass.getRulesVersion()).isZero();
        assertThat(rules.findBySchoolClassId(schoolClass.getId())).isEmpty();
        mvc.perform(get("/api/me/school-classes").with(org.springframework.security.test.web.servlet.request
                        .SecurityMockMvcRequestPostProcessors.user("assign-first@example.test").authorities(
                                new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_LECTURE"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.result[0].id").value(schoolClass.getId()));
    }

    @Test
    void changesLecturerAndAllowsSameAssignmentWithoutRemovingIt() throws Exception {
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(body(firstId))).andExpect(status().isOk());
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(body(secondId, firstId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.lecturerId").value(secondId));
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(body(secondId, secondId)))
                .andExpect(status().isOk());
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content("{\"lecturerId\":null}"))
                .andExpect(status().isBadRequest());
        assertThat(schoolClass.getLecturerId()).isEqualTo(secondId);
    }

    @Test
    void staleAssignmentCannotOverwriteTheCurrentLecturer() throws Exception {
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(body(firstId))).andExpect(status().isOk());
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(body(secondId)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("error.lecturerAssignmentConflict"));
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(body(secondId, secondId)))
                .andExpect(status().isConflict());
        assertThat(schoolClass.getLecturerId()).isEqualTo(firstId);
    }

    @Test
    void changingLecturerTransfersAccessAndPreservesRulesAndTerm() throws Exception {
        String rulesPath = "/api/school-classes/" + schoolClass.getId() + "/rules";
        var payload = new com.fmaking.service.dto.SaveClassRulesDTO(0L,
                java.util.Arrays.stream(GroupingRuleCode.values()).map(code ->
                        new com.fmaking.service.dto.GroupingRuleDTO(code, code.getSuggestedValue(), true)).toList());
        String ruleBody = mapper.writeValueAsString(payload);
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(body(firstId))).andExpect(status().isOk());
        mvc.perform(put(rulesPath).contentType(MediaType.APPLICATION_JSON).content(ruleBody)).andExpect(status().isOk());
        var ruleIds = rules.findBySchoolClassId(schoolClass.getId()).stream().map(Rule::getId).toList();
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(body(secondId, firstId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.termId").value(schoolClass.getTermId()));
        assertThat(schoolClass.getRulesVersion()).isEqualTo(1);
        assertThat(rules.findBySchoolClassId(schoolClass.getId())).extracting(Rule::getId)
                .containsExactlyInAnyOrderElementsOf(ruleIds);
        var previous = user("assign-first@example.test").authorities(new SimpleGrantedAuthority("ROLE_LECTURE"));
        var replacement = user("assign-second@example.test").authorities(new SimpleGrantedAuthority("ROLE_LECTURE"));
        mvc.perform(get("/api/me/school-classes").with(previous)).andExpect(jsonPath("$.data.meta.total").value(0));
        mvc.perform(get("/api/me/school-classes").with(replacement)).andExpect(jsonPath("$.data.meta.total").value(1));
        for (String readPath : new String[]{"/api/school-classes/" + schoolClass.getId(),
                "/api/school-classes/" + schoolClass.getId() + "/students", rulesPath}) {
            mvc.perform(get(readPath).with(previous)).andExpect(status().isForbidden());
            mvc.perform(get(readPath).with(replacement)).andExpect(status().isOk());
        }
        String nextRules = mapper.writeValueAsString(new com.fmaking.service.dto.SaveClassRulesDTO(1L, payload.rules()));
        mvc.perform(put(rulesPath).with(previous).contentType(MediaType.APPLICATION_JSON).content(nextRules))
                .andExpect(status().isForbidden());
        mvc.perform(put(rulesPath).with(replacement).contentType(MediaType.APPLICATION_JSON).content(nextRules))
                .andExpect(status().isOk());
    }

    @Test
    void rejectsMissingClassAndMissingLecturerWithoutWriting() throws Exception {
        mvc.perform(put("/api/school-classes/2147483647/lecturer").contentType(MediaType.APPLICATION_JSON).content(body(firstId)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("error.classNotFound"));
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(body(Long.MAX_VALUE)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("error.lecturerNotFound"));
        assertThat(schoolClass.getLecturerId()).isNull();
    }

    @Test
    void validatesStrictPositiveIntegerId() throws Exception {
        for (String value : new String[]{"null", "0", "-1", "1.5", "\"1\"", "true", "9223372036854775808"}) {
            mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content("{\"lecturerId\":" + value + "}"))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        for (String value : new String[]{"0", "-1", "1.5", "\"1\"", "true"}) {
            mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(
                    "{\"lecturerId\":" + firstId + ",\"expectedLecturerId\":" + value + "}"))
                    .andExpect(status().isBadRequest());
        }
        assertThat(schoolClass.getLecturerId()).isNull();
    }

    @Test @WithMockUser(authorities = "ROLE_LECTURE")
    void ordinaryLecturerCannotAssign() throws Exception { forbidden(); }

    @Test @WithMockUser(authorities = "ROLE_LECTURE_MASTER")
    void departmentHeadCannotAssign() throws Exception { forbidden(); }

    @Test @WithMockUser(authorities = "ROLE_STUDENT")
    void studentCannotAssign() throws Exception { forbidden(); }

    @Test @WithAnonymousUser
    void anonymousCannotAssign() throws Exception {
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(body(firstId))).andExpect(status().isUnauthorized());
        assertThat(schoolClass.getLecturerId()).isNull();
    }

    private void forbidden() throws Exception {
        mvc.perform(put(path()).contentType(MediaType.APPLICATION_JSON).content(body(firstId))).andExpect(status().isForbidden());
        assertThat(schoolClass.getLecturerId()).isNull();
    }
    private String path() { return "/api/school-classes/" + schoolClass.getId() + "/lecturer"; }
    private String body(Long id) { return "{\"lecturerId\":" + id + "}"; }
    private String body(Long id, Long expectedId) {
        return "{\"lecturerId\":" + id + ",\"expectedLecturerId\":" + expectedId + "}";
    }
    private Long lecturer(String code, String email) {
        var user = new User(); user.setEmail(email); user.setName(code); user = users.saveAndFlush(user);
        var lecturer = new Lecturer(); lecturer.setUserId(user.getId()); lecturer.setCode(code); lecturers.saveAndFlush(lecturer);
        return user.getId();
    }
}
