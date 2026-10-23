package com.fmaking.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithAnonymousUser;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.domain.*;
import com.fmaking.repository.*;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "assigned@example.com", authorities = "ROLE_LECTURE")
class LecturerClassRulesTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired LecturerRepository lecturers;
    @Autowired SchoolClassRepository classes;
    @Autowired RuleRepository rules;
    @Autowired TermRepository terms;
    @Autowired StudentRepository students;
    @Autowired MajorRepository majors;

    SchoolClass ownClass;
    SchoolClass anotherOwnClass;
    SchoolClass otherClass;
    Term term;

    @BeforeEach
    void prepare() {
        User lecturer = saveLecturer("assigned@example.com", "RULES-OWN");
        User other = saveLecturer("other@example.com", "RULES-OTHER");
        term = new Term(); term.setName("RULESTERM"); term = terms.saveAndFlush(term);
        ownClass = saveClass("Rules Class A", lecturer.getId(), term.getId());
        anotherOwnClass = saveClass("Rules Class B", lecturer.getId(), term.getId());
        otherClass = saveClass("Rules Class Other", other.getId(), term.getId());
    }

    @Test
    void listOnlyAssignedClassesWithSearchPaginationAndTermFilter() throws Exception {
        mvc.perform(get("/api/me/school-classes").param("size", "1").param("page", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(2))
                .andExpect(jsonPath("$.data.meta.page").value(1))
                .andExpect(jsonPath("$.data.result[0].id").value(anotherOwnClass.getId()));
        mvc.perform(get("/api/me/school-classes").param("size", "1").param("page", "2"))
                .andExpect(jsonPath("$.data.result[0].id").value(ownClass.getId()));
        mvc.perform(get("/api/me/school-classes").param("search", " Class A").param("termId", term.getId().toString()))
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.result[0].id").value(ownClass.getId()));
        Term emptyTerm = new Term(); emptyTerm.setName("EMPTYTERM"); emptyTerm = terms.saveAndFlush(emptyTerm);
        mvc.perform(get("/api/me/school-classes").param("termId", emptyTerm.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(0));
        mvc.perform(get("/api/me/school-classes").param("termId", "2147483647"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void assignedLecturerCanInitializeUnscheduledWorkspaceIdempotently() throws Exception {
        var first = mvc.perform(put("/api/school-classes/{id}/grouping-session", ownClass.getId())
                        .param("termId", term.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("UNSCHEDULED"))
                .andExpect(jsonPath("$.data.startTime").isEmpty()).andExpect(jsonPath("$.data.endTime").isEmpty())
                .andReturn();
        int sessionId = mapper.readTree(first.getResponse().getContentAsString()).path("data").path("id").asInt();
        mvc.perform(put("/api/school-classes/{id}/grouping-session", ownClass.getId()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(sessionId));
        mvc.perform(get("/api/deadlines/{deadline}/classes/{classId}/groups/workspace", sessionId, ownClass.getId()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.canManageGroups").value(true))
                .andExpect(jsonPath("$.data.deadlineStatus").value("UNSCHEDULED"));
        mvc.perform(put("/api/school-classes/{id}/grouping-session", otherClass.getId()))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "assigned@example.com", authorities = "ROLE_STUDENT")
    void studentCannotInitializeManagementWorkspace() throws Exception {
        mvc.perform(put("/api/school-classes/{id}/grouping-session", ownClass.getId()))
                .andExpect(status().isForbidden());
    }

    @Test
    void readsOwnClassAndSuggestionsWithoutInsertingRules() throws Exception {
        mvc.perform(get("/api/school-classes/{id}", ownClass.getId()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.name").value(ownClass.getName()));
        mvc.perform(get(rulePath(ownClass))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(false))
                .andExpect(jsonPath("$.data.version").value(0))
                .andExpect(jsonPath("$.data.rules.length()").value(GroupingRuleCode.values().length))
                .andExpect(jsonPath("$.data.rules[?(@.code == 'MAX_GROUPS_PER_CLASS')].status", org.hamcrest.Matchers.contains(false)))
                .andExpect(jsonPath("$.data.rules[?(@.code == 'MIN_SE_MEMBERS_PER_GROUP')].status", org.hamcrest.Matchers.contains(false)))
                .andExpect(jsonPath("$.data.rules[?(@.code == 'MIN_MAJORS_PER_GROUP')].value", org.hamcrest.Matchers.contains(2)));
        assertThat(rules.findBySchoolClassId(ownClass.getId())).isEmpty();
    }

    @Test
    void insertsThenUpdatesWithoutDuplicatesAndKeepsClassValuesIndependent() throws Exception {
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 3, 6)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.configured").value(true))
                .andExpect(jsonPath("$.data.version").value(1));
        mvc.perform(put(rulePath(anotherOwnClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 5, 8)))
                .andExpect(status().isOk());
        List<Integer> ids = rules.findBySchoolClassId(ownClass.getId()).stream().map(Rule::getId).toList();
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(1, 4, 7)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(2));
        assertThat(rules.findBySchoolClassId(ownClass.getId())).hasSize(GroupingRuleCode.values().length)
                .extracting(Rule::getId).containsExactlyInAnyOrderElementsOf(ids);
        assertThat(value(ownClass, "MIN_MEMBERS_PER_GROUP")).isEqualTo(4);
        assertThat(value(anotherOwnClass, "MIN_MEMBERS_PER_GROUP")).isEqualTo(5);
    }

    @Test
    void lecturerCanEnableSeAndTheSavedChoiceOverridesItsDisabledDefault() throws Exception {
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6, 1)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.rules[6].status").value(true));
        mvc.perform(get(rulePath(ownClass)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.rules[6].status").value(true))
                .andExpect(jsonPath("$.data.rules[6].value").value(1));
        mvc.perform(get(rulePath(anotherOwnClass)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.rules[6].status").value(false));
    }

    @Test
    void refusesOtherClassReadsAndWritesWithoutChangingData() throws Exception {
        mvc.perform(get("/api/school-classes")).andExpect(status().isForbidden());
        mvc.perform(get("/api/school-classes/{id}", otherClass.getId())).andExpect(status().isForbidden());
        mvc.perform(get("/api/school-classes/{id}/students", ownClass.getId())).andExpect(status().isOk());
        mvc.perform(get("/api/school-classes/{id}/students", otherClass.getId())).andExpect(status().isForbidden());
        mvc.perform(get(rulePath(otherClass))).andExpect(status().isForbidden());
        mvc.perform(put(rulePath(otherClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6)))
                .andExpect(status().isForbidden());
        assertThat(rules.findBySchoolClassId(otherClass.getId())).isEmpty();
    }

    @Test
    void reassignmentRevokesAccessImmediately() throws Exception {
        ownClass.setLecturerId(otherClass.getLecturerId()); classes.saveAndFlush(ownClass);
        mvc.perform(get("/api/school-classes/{id}/students", ownClass.getId())).andExpect(status().isForbidden());
        mvc.perform(get(rulePath(ownClass))).andExpect(status().isForbidden());
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/me/school-classes")).andExpect(jsonPath("$.data.meta.total").value(1));
    }

    @Test
    void rejectsStaleVersionAndInvalidConfigurationWithoutPartialWrites() throws Exception {
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6)))
                .andExpect(status().isOk());
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 5, 6)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("error.rulesVersionConflict"));
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(1, 7, 6)))
                .andExpect(status().isBadRequest());
        assertThat(classes.findById(ownClass.getId()).orElseThrow().getRulesVersion()).isEqualTo(1);
        assertThat(value(ownClass, "MIN_MEMBERS_PER_GROUP")).isEqualTo(4);
    }

    @Test
    void rejectsMissingDuplicateUnknownNullAndOutOfRangeRules() throws Exception {
        String valid = payload(0, 4, 6);
        for (String invalid : List.of(
                valid.replace("MAX_MEMBERS_PER_GROUP", "MIN_MEMBERS_PER_GROUP"),
                valid.replace("MIN_MEMBERS_PER_GROUP", "ARBITRARY_RULE"),
                payload(0, 0, 6), payload(0, 4, 1001),
                valid.replace("\"value\":4", "\"value\":4.5"),
                valid.replace("\"version\":0", "\"version\":0.5"),
                "{\"version\":0,\"rules\":[]}", "{\"version\":0,\"rules\":[null,null,null,null,null,null,null]}",
                valid.replace("\"version\":0", "\"version\":null"))) {
            mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(invalid))
                    .andExpect(status().isBadRequest());
        }
        assertThat(rules.findBySchoolClassId(ownClass.getId())).isEmpty();
    }

    @Test
    void rejectsMajorsMinimumExceedingMemberCapacity() throws Exception {
        // Jackson map ordering is not significant; build the modified request through the tree.
        var body = mapper.readTree(payload(0, 1, 1));
        ((com.fasterxml.jackson.databind.node.ObjectNode) body.path("rules").get(4)).put("value", 2);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
        assertThat(rules.findBySchoolClassId(ownClass.getId())).isEmpty();
    }

    @Test
    @WithMockUser(username = "admin@example.com", authorities = "ROLE_ADMIN")
    void adminCanReadAndEditAnyClassWithoutLecturerRoleOrAssignment() throws Exception {
        User admin = new User(); admin.setEmail("admin@example.com"); users.saveAndFlush(admin);
        mvc.perform(get("/api/school-classes").param("search", "Rules Class"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(3));
        mvc.perform(get("/api/school-classes/{id}", ownClass.getId())).andExpect(status().isOk());
        mvc.perform(get(rulePath(ownClass))).andExpect(status().isOk());
        mvc.perform(put(rulePath(otherClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(1));
        mvc.perform(get("/api/school-classes/{id}/students", otherClass.getId())).andExpect(status().isOk());
        mvc.perform(get("/api/me/school-classes")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(0));
        mvc.perform(put(rulePath(otherClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 5, 6)))
                .andExpect(status().isConflict());
        assertThat(rules.findBySchoolClassId(otherClass.getId())).hasSize(GroupingRuleCode.values().length);
    }

    @Test
    @WithMockUser(username = "assigned@example.com", authorities = "ROLE_LECTURE_MASTER")
    void departmentHeadSeesAllClassesButOnlyManagesAssignedClasses() throws Exception {
        mvc.perform(get("/api/school-classes").param("search", "Rules Class").param("size", "1")
                        .param("page", "1").param("termId", term.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(3))
                .andExpect(jsonPath("$.data.result.length()").value(1));
        mvc.perform(get("/api/school-classes").param("search", "Rules Class Other"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.result[0].id").value(otherClass.getId()));
        mvc.perform(get("/api/school-classes/{id}", otherClass.getId())).andExpect(status().isOk());
        mvc.perform(get("/api/school-classes/{id}/students", otherClass.getId())).andExpect(status().isOk());
        mvc.perform(get(rulePath(otherClass))).andExpect(status().isOk());
        mvc.perform(get("/api/me/school-classes")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(2));
        mvc.perform(put(rulePath(otherClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6)))
                .andExpect(status().isForbidden());
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6)))
                .andExpect(status().isOk());
        assertThat(rules.findBySchoolClassId(otherClass.getId())).isEmpty();
    }

    @Test
    @WithMockUser(username = "assigned@example.com", authorities = {"ROLE_LECTURE", "ROLE_LECTURE_MASTER"})
    void combinedLecturerAndHeadRolesRetainGlobalReadWithoutGlobalWrite() throws Exception {
        mvc.perform(get("/api/school-classes/{id}", otherClass.getId())).andExpect(status().isOk());
        mvc.perform(get(rulePath(otherClass))).andExpect(status().isOk());
        mvc.perform(put(rulePath(otherClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6)))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "head@example.com", authorities = "ROLE_LECTURE_MASTER")
    void headWithoutAssignedClassesCanStillViewAllClasses() throws Exception {
        User head = new User(); head.setEmail("head@example.com"); users.saveAndFlush(head);
        mvc.perform(get("/api/school-classes").param("search", "Rules Class"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(3));
        mvc.perform(get(rulePath(otherClass))).andExpect(status().isOk());
        mvc.perform(get("/api/me/school-classes")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(0));
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6)))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(authorities = "ROLE_STUDENT")
    void studentsCannotUseLecturerEndpoints() throws Exception {
        mvc.perform(get("/api/me/school-classes")).andExpect(status().isForbidden());
        mvc.perform(get("/api/school-classes/{id}", ownClass.getId())).andExpect(status().isForbidden());
        mvc.perform(get("/api/school-classes/{id}/students", ownClass.getId())).andExpect(status().isForbidden());
        mvc.perform(get(rulePath(ownClass))).andExpect(status().isForbidden());
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6)))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithAnonymousUser
    void anonymousUsersMustAuthenticate() throws Exception {
        mvc.perform(get("/api/me/school-classes")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/school-classes/{id}/students", ownClass.getId())).andExpect(status().isUnauthorized());
        mvc.perform(get(rulePath(ownClass))).andExpect(status().isUnauthorized());
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void missingClassReturns404() throws Exception {
        mvc.perform(get("/api/school-classes/2147483647")).andExpect(status().isNotFound());
        mvc.perform(get("/api/school-classes/2147483647/rules")).andExpect(status().isNotFound());
        mvc.perform(get("/api/school-classes/2147483647/students")).andExpect(status().isNotFound());
    }

    @Test
    void lecturerRosterReturnsOnlyStudentsOfAssignedClassInRollNumberOrder() throws Exception {
        Major major = new Major(); major.setCode("ROSTER-MAJOR"); major.setName("Roster Major");
        major = majors.saveAndFlush(major);
        saveRosterStudent("ROSTER-002", ownClass, major, false);
        saveRosterStudent("ROSTER-001", ownClass, major, true);
        saveRosterStudent("ROSTER-OTHER", otherClass, major, true);
        mvc.perform(get("/api/school-classes/{id}/students", ownClass.getId()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].rollNumber").value("ROSTER-001"))
                .andExpect(jsonPath("$.data[0].email").value("roster-001@example.com"))
                .andExpect(jsonPath("$.data[0].fullName").value("Roster ROSTER-001"))
                .andExpect(jsonPath("$.data[0].majorCode").value("ROSTER-MAJOR"))
                .andExpect(jsonPath("$.data[0].activated").value(true))
                .andExpect(jsonPath("$.data[0].activationKey").doesNotExist())
                .andExpect(jsonPath("$.data[1].rollNumber").value("ROSTER-002"))
                .andExpect(jsonPath("$.data[1].activated").value(false));
        mvc.perform(get("/api/school-classes/{id}/students", anotherOwnClass.getId()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
        mvc.perform(get("/api/school-classes/{id}/students", otherClass.getId()))
                .andExpect(status().isForbidden());
    }

    private void saveRosterStudent(String rollNumber, SchoolClass schoolClass, Major major, boolean activated) {
        User user = new User(); user.setEmail(rollNumber + "@example.com"); user.setActivated(activated);
        user = users.saveAndFlush(user);
        Student student = new Student(); student.setUserId(user.getId()); student.setRollNumber(rollNumber);
        student.setFullName("Roster " + rollNumber); student.setMemberCode("MEM-" + rollNumber);
        student.setMajorId(major.getId()); student.setSchoolClassId(schoolClass.getId());
        students.saveAndFlush(student);
    }

    @Test
    void savesValidRulesWithRosterFeasibilityWarnings() throws Exception {
        Major major = new Major(); major.setCode("RULES-MAJOR"); major.setName("Rules Test Major");
        major = majors.saveAndFlush(major);
        for (int index = 0; index < 7; index++) {
            User user = new User(); user.setEmail("rules-student-" + index + "@example.com");
            user = users.saveAndFlush(user);
            Student student = new Student(); student.setUserId(user.getId()); student.setFullName("Rules Student");
            student.setRollNumber("RULES-SV-" + index); student.setMemberCode("RULES-MEM-" + index);
            student.setMajorId(major.getId()); student.setSchoolClassId(ownClass.getId());
            students.saveAndFlush(student);
        }
        var body = mapper.readTree(payload(0, 4, 6));
        ((com.fasterxml.jackson.databind.node.ObjectNode) body.path("rules").get(4)).put("value", 2);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.configured").value(true))
                .andExpect(jsonPath("$.data.warnings", org.hamcrest.Matchers.hasItems("GROUP_COUNTS_INFEASIBLE", "INSUFFICIENT_MAJORS")));
        assertThat(rules.findBySchoolClassId(ownClass.getId())).hasSize(GroupingRuleCode.values().length);
    }

    private int value(SchoolClass schoolClass, String code) {
        return rules.findBySchoolClassId(schoolClass.getId()).stream().filter(rule -> rule.getCode().equals(code))
                .findFirst().orElseThrow().getValue();
    }

    @Test
    void seMinimumAcceptsZeroAndCanBeUpdatedIndependentlyForEachClass() throws Exception {
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6, 0)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.configured").value(true));
        mvc.perform(put(rulePath(anotherOwnClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6, 1)))
                .andExpect(status().isOk());
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(1, 4, 6, 2)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(2));
        assertThat(value(ownClass, "MIN_SE_MEMBERS_PER_GROUP")).isEqualTo(2);
        assertThat(value(anotherOwnClass, "MIN_SE_MEMBERS_PER_GROUP")).isEqualTo(1);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(2, 4, 6, 0)))
                .andExpect(status().isOk());
        assertThat(value(ownClass, "MIN_SE_MEMBERS_PER_GROUP")).isZero();
    }

    @Test
    void rejectsInvalidSeValuesAndZeroForOtherRulesWithoutWriting() throws Exception {
        for (String invalid : List.of(payload(0, 4, 6, -1), payload(0, 4, 6, 1001), payload(0, 4, 6, 7))) {
            mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(invalid))
                    .andExpect(status().isBadRequest());
        }
        for (String invalidValue : List.of("0.5", "\"0\"", "null")) {
            String invalid = payload(0, 4, 6, 0).replace("\"value\":0", "\"value\":" + invalidValue);
            mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(invalid))
                    .andExpect(status().isBadRequest());
        }
        for (GroupingRuleCode code : GroupingRuleCode.values()) {
            if (code == GroupingRuleCode.MIN_SE_MEMBERS_PER_GROUP) continue;
            var body = mapper.readTree(payload(0, 4, 6, 0));
            for (var item : body.path("rules")) {
                if (item.path("code").asText().equals(code.name())) {
                    ((com.fasterxml.jackson.databind.node.ObjectNode) item).put("value", 0);
                }
            }
            mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
        }
        var composition = mapper.readTree(payload(0, 4, 6, 5));
        ((com.fasterxml.jackson.databind.node.ObjectNode) composition.path("rules").get(4)).put("value", 3);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(composition)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("error.ruleSeExceedMembers"));
        assertThat(rules.findBySchoolClassId(ownClass.getId())).isEmpty();
        assertThat(classes.findById(ownClass.getId()).orElseThrow().getRulesVersion()).isZero();
    }

    @Test
    void legacySixRulesArePreservedAndSeSuggestionIsOnlyInsertedOnSave() throws Exception {
        List<Rule> legacy = Arrays.stream(GroupingRuleCode.values())
                .filter(code -> code != GroupingRuleCode.MIN_SE_MEMBERS_PER_GROUP).map(code -> {
                    Rule rule = new Rule(); rule.setSchoolClassId(ownClass.getId()); rule.setCode(code.name());
                    rule.setValue(code == GroupingRuleCode.MAX_MEMBERS_PER_GROUP ? 8 : code.getSuggestedValue());
                    return rule;
                }).toList();
        rules.saveAllAndFlush(legacy);
        ownClass.setRulesVersion(3); classes.saveAndFlush(ownClass);
        mvc.perform(get(rulePath(ownClass))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(false)).andExpect(jsonPath("$.data.version").value(3))
                .andExpect(jsonPath("$.data.rules[1].value").value(8))
                .andExpect(jsonPath("$.data.rules[6].code").value("MIN_SE_MEMBERS_PER_GROUP"))
                .andExpect(jsonPath("$.data.rules[6].value").value(1))
                .andExpect(jsonPath("$.data.rules[6].status").value(false));
        assertThat(rules.findBySchoolClassId(ownClass.getId())).hasSize(6);
        var incomplete = mapper.readTree(payload(3, 4, 8, 0));
        ((com.fasterxml.jackson.databind.node.ArrayNode) incomplete.path("rules")).remove(6);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(incomplete)))
                .andExpect(status().isBadRequest());
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(3, 4, 8, 0)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.configured").value(true))
                .andExpect(jsonPath("$.data.version").value(4));
        assertThat(rules.findBySchoolClassId(ownClass.getId())).hasSize(7)
                .extracting(Rule::getId).containsAll(legacy.stream().map(Rule::getId).toList());
        assertThat(value(ownClass, "MIN_SE_MEMBERS_PER_GROUP")).isZero();
    }

    @Test
    void seWarningCountsExactMajorInThisClassAndZeroDisablesTheRequirement() throws Exception {
        Major se = new Major(); se.setCode(" se "); se.setName("Rules Software Engineering"); se = majors.saveAndFlush(se);
        Major other = new Major(); other.setCode("MKTSE"); other.setName("Rules Other Major"); other = majors.saveAndFlush(other);
        saveRosterStudent("SE-ROSTER-001", ownClass, se, true);
        for (int index = 2; index <= 12; index++) saveRosterStudent("SE-ROSTER-" + index, ownClass, other, true);
        saveRosterStudent("OUTSIDE-SE-1", otherClass, se, true);
        saveRosterStudent("OUTSIDE-SE-2", otherClass, se, true);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6, 1)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.warnings",
                        org.hamcrest.Matchers.hasItem("INSUFFICIENT_SE_STUDENTS")));
        Student moved = students.findByRollNumberIn(List.of("SE-ROSTER-2")).getFirst();
        moved.setMajorId(se.getId()); students.saveAndFlush(moved);
        mvc.perform(get(rulePath(ownClass))).andExpect(status().isOk()).andExpect(jsonPath("$.data.warnings",
                org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("INSUFFICIENT_SE_STUDENTS"))));
        for (Student student : students.findByRollNumberIn(List.of("SE-ROSTER-001", "SE-ROSTER-2"))) {
            student.setMajorId(other.getId()); students.saveAndFlush(student);
        }
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(1, 4, 6, 0)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.warnings",
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("INSUFFICIENT_SE_STUDENTS"))));
    }

    @ParameterizedTest
    @EnumSource(GroupingRuleCode.class)
    void eachDisabledRuleIsExcludedFromRelatedChecksAndReenablingRevalidates(GroupingRuleCode code) throws Exception {
        boolean majorsPair = code == GroupingRuleCode.MIN_MAJORS_PER_GROUP || code == GroupingRuleCode.MAX_MAJORS_PER_GROUP;
        var body = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(payload(0, 4, majorsPair ? 100 : 6,
                code == GroupingRuleCode.MIN_SE_MEMBERS_PER_GROUP ? 7 : 1));
        if (code == GroupingRuleCode.MIN_MEMBERS_PER_GROUP || code == GroupingRuleCode.MAX_MEMBERS_PER_GROUP) {
            ruleItem(body, GroupingRuleCode.MIN_MEMBERS_PER_GROUP).put("value", 9);
        } else if (code == GroupingRuleCode.MIN_GROUPS_PER_CLASS || code == GroupingRuleCode.MAX_GROUPS_PER_CLASS) {
            ruleItem(body, GroupingRuleCode.MIN_GROUPS_PER_CLASS).put("value", 60);
        } else if (majorsPair) {
            ruleItem(body, GroupingRuleCode.MIN_MAJORS_PER_GROUP).put("value", 8);
        }
        ruleItem(body, code).put("status", false);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(1));
        Rule stored = rules.findBySchoolClassId(ownClass.getId()).stream()
                .filter(rule -> rule.getCode().equals(code.name())).findFirst().orElseThrow();
        assertThat(stored.getStatus()).isFalse();
        body.put("version", 1);
        ruleItem(body, code).put("status", true);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
        assertThat(stored.getStatus()).isFalse();
        assertThat(classes.findById(ownClass.getId()).orElseThrow().getRulesVersion()).isEqualTo(1);
    }

    @Test
    void allDisabledRulesKeepValuesAndSuppressRuleWarningsEvenWithContradictoryValues() throws Exception {
        Major other = new Major(); other.setCode("STATUS-MKT"); other.setName("Status Marketing"); other = majors.saveAndFlush(other);
        saveRosterStudent("STATUS-ROSTER", ownClass, other, true);
        var body = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(payload(0, 1000, 1, 1000));
        ruleItem(body, GroupingRuleCode.MIN_GROUPS_PER_CLASS).put("value", 1000);
        ruleItem(body, GroupingRuleCode.MAX_GROUPS_PER_CLASS).put("value", 1);
        ruleItem(body, GroupingRuleCode.MIN_MAJORS_PER_GROUP).put("value", 1000);
        for (var item : body.path("rules")) ((com.fasterxml.jackson.databind.node.ObjectNode) item).put("status", false);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.warnings").isEmpty())
                .andExpect(jsonPath("$.data.configured").value(true));
        mvc.perform(get(rulePath(ownClass))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.warnings").isEmpty())
                .andExpect(jsonPath("$.data.rules[*].status", org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is(false))))
                .andExpect(jsonPath("$.data.rules[6].value").value(1000));
        body.put("version", 1);
        ruleItem(body, GroupingRuleCode.MIN_SE_MEMBERS_PER_GROUP).put("status", true);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.warnings",
                        org.hamcrest.Matchers.hasItem("INSUFFICIENT_SE_STUDENTS")));
    }

    @Test
    void disablingMajorMinimumRemovesItFromSeCapacityChecksButActiveSeStillHasToFit() throws Exception {
        var body = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(payload(0, 4, 6, 6));
        ruleItem(body, GroupingRuleCode.MIN_MAJORS_PER_GROUP).put("value", 3).put("status", false);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isOk());
        body.put("version", 1);
        ruleItem(body, GroupingRuleCode.MIN_SE_MEMBERS_PER_GROUP).put("value", 7);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("error.ruleSeExceedMembers"));
    }

    @Test
    void statusIsIndependentPerClassAndStatusOnlyUpdatesHonorVersion() throws Exception {
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6))).andExpect(status().isOk());
        mvc.perform(put(rulePath(anotherOwnClass)).contentType(MediaType.APPLICATION_JSON).content(payload(0, 4, 6))).andExpect(status().isOk());
        var body = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(payload(1, 4, 6));
        ruleItem(body, GroupingRuleCode.MIN_SE_MEMBERS_PER_GROUP).put("status", false);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(2));
        mvc.perform(get(rulePath(ownClass))).andExpect(jsonPath("$.data.rules[6].status").value(false))
                .andExpect(jsonPath("$.data.rules[6].value").value(1));
        mvc.perform(get(rulePath(anotherOwnClass))).andExpect(jsonPath("$.data.rules[6].status").value(true));
        ruleItem(body, GroupingRuleCode.MIN_SE_MEMBERS_PER_GROUP).put("status", true);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
        assertThat(rules.findBySchoolClassId(ownClass.getId()).stream()
                .filter(rule -> rule.getCode().equals(GroupingRuleCode.MIN_SE_MEMBERS_PER_GROUP.name()))
                .findFirst().orElseThrow().getStatus()).isFalse();
    }

    @Test
    void missingNullOrCoercedStatusAndInvalidDisabledValuesCannotBeSaved() throws Exception {
        for (String invalidStatus : List.of("null", "1", "0", "\"true\"", "\"false\"", "{}", "[]")) {
            String invalid = payload(0, 4, 6).replace("\"status\":true", "\"status\":" + invalidStatus);
            mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(invalid))
                    .andExpect(status().isBadRequest());
        }
        var body = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(payload(0, 4, 6));
        ruleItem(body, GroupingRuleCode.MIN_MEMBERS_PER_GROUP).remove("status");
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
        ruleItem(body, GroupingRuleCode.MIN_MEMBERS_PER_GROUP).put("status", false).put("value", 0);
        mvc.perform(put(rulePath(ownClass)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
        assertThat(rules.findBySchoolClassId(ownClass.getId())).isEmpty();
        assertThat(classes.findById(ownClass.getId()).orElseThrow().getRulesVersion()).isZero();
    }

    private com.fasterxml.jackson.databind.node.ObjectNode ruleItem(com.fasterxml.jackson.databind.JsonNode body, GroupingRuleCode code) {
        for (var item : body.path("rules")) {
            if (item.path("code").asText().equals(code.name())) return (com.fasterxml.jackson.databind.node.ObjectNode) item;
        }
        throw new IllegalArgumentException("Missing rule " + code);
    }

    private String payload(long version, int minMembers, int maxMembers) throws Exception {
        return payload(version, minMembers, maxMembers, 1);
    }

    private String payload(long version, int minMembers, int maxMembers, int seMinimum) throws Exception {
        var items = Arrays.stream(GroupingRuleCode.values()).map(code -> Map.of("code", code.name(), "status", true, "value",
                code == GroupingRuleCode.MIN_MEMBERS_PER_GROUP ? minMembers :
                code == GroupingRuleCode.MAX_MEMBERS_PER_GROUP ? maxMembers :
                code == GroupingRuleCode.MIN_SE_MEMBERS_PER_GROUP ? seMinimum : code.getSuggestedValue())).toList();
        return mapper.writeValueAsString(Map.of("version", version, "rules", items));
    }

    private String rulePath(SchoolClass schoolClass) { return "/api/school-classes/" + schoolClass.getId() + "/rules"; }

    private User saveLecturer(String email, String code) {
        User user = new User(); user.setEmail(email); user.setName(code); user = users.saveAndFlush(user);
        Lecturer lecturer = new Lecturer(); lecturer.setUserId(user.getId()); lecturer.setCode(code);
        lecturers.saveAndFlush(lecturer); return user;
    }

    private SchoolClass saveClass(String name, Long lecturerId, Integer termId) {
        SchoolClass schoolClass = new SchoolClass(); schoolClass.setName(name);
        schoolClass.setLecturerId(lecturerId); schoolClass.setTermId(termId);
        return classes.saveAndFlush(schoolClass);
    }
}
