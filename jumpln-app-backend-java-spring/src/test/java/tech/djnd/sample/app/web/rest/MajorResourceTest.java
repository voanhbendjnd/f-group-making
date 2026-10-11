package tech.djnd.sample.app.web.rest;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.test.context.support.WithAnonymousUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;
import tech.djnd.sample.app.domain.Major;
import tech.djnd.sample.app.domain.MajorTerm;
import tech.djnd.sample.app.domain.Student;
import tech.djnd.sample.app.repository.MajorRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(authorities = "ROLE_ADMIN")
class MajorResourceTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MajorRepository majorRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    void createMajorTrimsInputAndReturnsSavedMajor() throws Exception {
        MvcResult response = mockMvc.perform(post("/api/majors")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\" TEST \",\"name\":\" Test Major \"}"))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.data.code").value("TEST"))
                .andExpect(jsonPath("$.data.name").value("Test Major"))
                .andReturn();

        JsonNode body = objectMapper.readTree(response.getResponse().getContentAsString());
        int id = body.path("data").path("id").asInt();
        Major savedMajor = majorRepository.findById(id).orElseThrow();
        assertThat(savedMajor.getCode()).isEqualTo("TEST");
        assertThat(savedMajor.getName()).isEqualTo("Test Major");

        mockMvc.perform(get("/api/majors/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(id));
    }

    @Test
    void listMajorsUsesExistingPaginationFormat() throws Exception {
        mockMvc.perform(get("/api/majors").param("page", "1").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.page").value(1))
                .andExpect(jsonPath("$.data.meta.pageSize").value(2))
                .andExpect(jsonPath("$.data.result.length()").value(2));
    }

    @Test
    void defaultSortUsesCreationTimeThenIdAndExplicitSortOverridesIt() throws Exception {
        Major first = saveMajor("SORTTESTA", "Sorttest Alpha");
        Major second = saveMajor("SORTTESTB", "Sorttest Beta");
        Major third = saveMajor("SORTTESTC", "Sorttest Gamma");
        entityManager.createNativeQuery("UPDATE majors SET created_date = :created WHERE id IN (:first, :third)")
                .setParameter("created", java.sql.Timestamp.valueOf("2024-01-01 00:00:00"))
                .setParameter("first", first.getId()).setParameter("third", third.getId()).executeUpdate();
        entityManager.createNativeQuery("UPDATE majors SET created_date = :created WHERE id = :id")
                .setParameter("created", java.sql.Timestamp.valueOf("2023-01-01 00:00:00"))
                .setParameter("id", second.getId()).executeUpdate();
        entityManager.clear();
        mockMvc.perform(get("/api/majors").param("search", "sorttest").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.result[0].id").value(third.getId()))
                .andExpect(jsonPath("$.data.result[1].id").value(first.getId()))
                .andExpect(jsonPath("$.data.meta.total").value(3));
        mockMvc.perform(get("/api/majors").param("search", "sorttest").param("size", "2").param("page", "2"))
                .andExpect(jsonPath("$.data.result[0].id").value(second.getId()));
        mockMvc.perform(get("/api/majors").param("search", "sorttest").param("sort", "id,asc"))
                .andExpect(jsonPath("$.data.result[0].id").value(first.getId()))
                .andExpect(jsonPath("$.data.result[1].id").value(second.getId()));
    }

    @Test
    void temporaryNameFilterCombinesWithSearchAndPagination() throws Exception {
        saveMajor("FILTERTESTA", "filtertesta");
        saveMajor("FILTERTESTB", "Filtertest Named Major");
        saveMajor("FILTERTESTC", "FILTERTESTC");
        mockMvc.perform(get("/api/majors").param("search", "filtertest").param("temporaryName", "true").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(2))
                .andExpect(jsonPath("$.data.result.length()").value(1));
        mockMvc.perform(get("/api/majors").param("search", "filtertest").param("temporaryName", "false"))
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.result[0].code").value("FILTERTESTB"));
        mockMvc.perform(get("/api/majors").param("search", "filtertest"))
                .andExpect(jsonPath("$.data.meta.total").value(3));
        mockMvc.perform(get("/api/majors").param("temporaryName", "invalid"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getMissingMajorReturnsNotFound() throws Exception {
        mockMvc.perform(get("/api/majors/2147483647"))
                .andExpect(status().isNotFound());
    }

    @Test
    void majorSuggestionsSearchCodeAndName() throws Exception {
        mockMvc.perform(get("/api/majors").param("search", "software engineering"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.result[0].code").value("SE"));
        mockMvc.perform(get("/api/majors").param("search", "kt"))
                .andExpect(jsonPath("$.data.meta.total").value(2));
        mockMvc.perform(get("/api/majors").param("search", "%"))
                .andExpect(jsonPath("$.data.meta.total").value(0));
    }

    @Test
    void nameUpdateCanNormalizeALegacyCodeUsedByStudents() throws Exception {
        Major major = saveMajor("legacy", "Legacy Name");
        saveStudent(major.getId(), "legacy");
        mockMvc.perform(put("/api/majors/{id}", major.getId()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"legacy\",\"name\":\"Updated Name\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.code").value("LEGACY"))
                .andExpect(jsonPath("$.data.name").value("Updated Name"));
    }

    @Test
    void createMajorRejectsDuplicateCodeAndNameIgnoringCase() throws Exception {
        Major major = new Major();
        major.setCode("TEST");
        major.setName("Test Major");
        majorRepository.saveAndFlush(major);

        mockMvc.perform(post("/api/majors")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"test\",\"name\":\"Other Major\"}"))
                .andExpect(status().isConflict());

        mockMvc.perform(post("/api/majors")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"OTHER\",\"name\":\"test major\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void createMajorRejectsBlankFieldsAndSuppliedId() throws Exception {
        String[] invalidRequests = {
                "{\"code\":\" \",\"name\":\"Test Major\"}",
                "{\"code\":\"TEST\",\"name\":\" \"}",
                "{\"id\":1,\"code\":\"TEST\",\"name\":\"Test Major\"}",
                "{\"code\":\"123456789012345678901\",\"name\":\"Test Major\"}",
                "{\"name\":\"Test Major\"}"
        };

        for (String request : invalidRequests) {
            mockMvc.perform(post("/api/majors")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(request))
                    .andExpect(status().isBadRequest());
        }
        assertThat(majorRepository.existsByCode("TEST")).isFalse();
    }

    @Test
    @WithMockUser(authorities = "ROLE_STUDENT")
    void nonAdminCannotReadOrCreateMajor() throws Exception {
        mockMvc.perform(get("/api/majors"))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/majors")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"TEST\",\"name\":\"Test Major\"}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/majors/1"))
                .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/majors/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"TEST\",\"name\":\"Test Major\"}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/majors/1"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithAnonymousUser
    void allMajorEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/majors")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/majors/1")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/majors")).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/majors/1")).andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/majors/1")).andExpect(status().isUnauthorized());
    }

    @Test
    void updateAllowsSameCodeAndNameThenChangesUnusedMajor() throws Exception {
        Major major = saveMajor("TEST", "Test Major");
        mockMvc.perform(put("/api/majors/{id}", major.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"TEST\",\"name\":\"Test Major\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/majors/{id}", major.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\" NEW \",\"name\":\" Updated Major \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(major.getId()))
                .andExpect(jsonPath("$.data.code").value("NEW"))
                .andExpect(jsonPath("$.data.name").value("Updated Major"));
        majorRepository.flush();
        entityManager.clear();
        assertThat(majorRepository.findById(major.getId()).orElseThrow().getCode()).isEqualTo("NEW");
    }

    @Test
    void updateRejectsDuplicateCodeAndNameAndMismatchedId() throws Exception {
        Major major = saveMajor("TEST", "Test Major");
        saveMajor("OTHER", "Other Major");
        String[] conflictingRequests = {
                "{\"code\":\"other\",\"name\":\"Test Major\"}",
                "{\"code\":\"TEST\",\"name\":\"other major\"}"
        };
        for (String request : conflictingRequests) {
            mockMvc.perform(put("/api/majors/{id}", major.getId())
                            .contentType(MediaType.APPLICATION_JSON).content(request))
                    .andExpect(status().isConflict());
        }
        mockMvc.perform(put("/api/majors/{id}", major.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":2147483647,\"code\":\"TEST\",\"name\":\"Test Major\"}"))
                .andExpect(status().isBadRequest());
        assertThat(major.getCode()).isEqualTo("TEST");
        assertThat(major.getName()).isEqualTo("Test Major");
    }

    @Test
    void deleteUnusedMajorRemovesItAndMissingWritesReturnNotFound() throws Exception {
        Major major = saveMajor("TEST", "Test Major");
        mockMvc.perform(delete("/api/majors/{id}", major.getId()))
                .andExpect(status().isNoContent());
        assertThat(majorRepository.findById(major.getId())).isEmpty();

        mockMvc.perform(delete("/api/majors/{id}", major.getId()))
                .andExpect(status().isNotFound());
        mockMvc.perform(put("/api/majors/{id}", major.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"TEST\",\"name\":\"Test Major\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void majorUsedByStudentsCannotChangeCodeOrBeDeletedButCanChangeName() throws Exception {
        Major major = saveMajor("TEST", "Test Major");
        saveStudent(major.getId(), major.getCode());

        mockMvc.perform(put("/api/majors/{id}", major.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"NEW\",\"name\":\"Test Major\"}"))
                .andExpect(status().isConflict());
        mockMvc.perform(delete("/api/majors/{id}", major.getId()))
                .andExpect(status().isConflict());
        mockMvc.perform(put("/api/majors/{id}", major.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"TEST\",\"name\":\"Updated Major\"}"))
                .andExpect(status().isOk());

        majorRepository.flush();
        entityManager.clear();
        assertThat(majorRepository.findById(major.getId()).orElseThrow().getCode()).isEqualTo("TEST");
        assertThat(entityManager.find(Student.class, 100001L).getMajorId()).isEqualTo(major.getId());
    }

    @Test
    void studentReferenceIsDetectedById() throws Exception {
        Major major = saveMajor("TEST", "Test Major");
        saveStudent(major.getId(), "test");
        mockMvc.perform(delete("/api/majors/{id}", major.getId()))
                .andExpect(status().isConflict());
        assertThat(majorRepository.findById(major.getId())).isPresent();
    }

    @Test
    void majorUsedByTermsCannotBeDeletedButCanChangeCode() throws Exception {
        Major major = saveMajor("TEST", "Test Major");
        MajorTerm majorTerm = new MajorTerm();
        majorTerm.setMajorId(major.getId());
        majorTerm.setTermId(100001);
        entityManager.persist(majorTerm);
        entityManager.flush();

        mockMvc.perform(delete("/api/majors/{id}", major.getId()))
                .andExpect(status().isConflict());
        mockMvc.perform(put("/api/majors/{id}", major.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"NEW\",\"name\":\"Test Major\"}"))
                .andExpect(status().isOk());
        assertThat(entityManager.find(MajorTerm.class, majorTerm.getId()).getMajorId()).isEqualTo(major.getId());
    }

    private Major saveMajor(String code, String name) {
        Major major = new Major();
        major.setCode(code);
        major.setName(name);
        return majorRepository.saveAndFlush(major);
    }

    private void saveStudent(Integer majorId, String majorCode) {
        Student student = new Student();
        student.setUserId(100001L);
        student.setRollNumber("TEST100001");
        student.setFullName("Test Student");
        student.setMemberCode("TESTMEMBER");
        student.setMajorId(majorId);
        entityManager.persist(student);
        entityManager.flush();
    }
}
