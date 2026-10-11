package tech.djnd.sample.app.web.rest;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tech.djnd.sample.app.service.StudentService;
import tech.djnd.sample.app.service.dto.BatchActivationResultDTO;
import tech.djnd.sample.app.service.dto.ResultPaginationDTO;
import tech.djnd.sample.app.service.dto.StudentDTO;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "djnd.client.base-url=http://localhost:3000",
        "djnd.client.allow-localhost=true"
})
@AutoConfigureMockMvc
class StudentResourceSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private StudentService studentService;

    @Test
    void getStudentsRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/students"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(authorities = "ROLE_STUDENT")
    void getStudentsRejectsNonAdmin() throws Exception {
        mockMvc.perform(get("/api/students"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void getStudentsAllowsAdmin() throws Exception {
        when(studentService.getStudents(any(), any(), any(), any(), any(), any()))
                .thenReturn(ResultPaginationDTO.builder()
                        .meta(ResultPaginationDTO.Meta.builder().page(1).pageSize(10).pages(1).total(0).build())
                        .result(List.of())
                        .build());

        mockMvc.perform(get("/api/students"))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void listingDefaultsToNewestFirstAndAcceptsExplicitSort() throws Exception {
        mockMvc.perform(get("/api/students")).andExpect(status().isOk());
        ArgumentCaptor<Pageable> defaultPage = ArgumentCaptor.forClass(Pageable.class);
        verify(studentService).getStudents(isNull(), isNull(), isNull(), isNull(), isNull(), defaultPage.capture());
        assertThat(defaultPage.getValue().getSort()).isEqualTo(Sort.by(Sort.Direction.DESC, "createdDate", "userId"));
        mockMvc.perform(get("/api/students").param("sort", "rollNumber,asc")).andExpect(status().isOk());
        verify(studentService).getStudents(isNull(), isNull(), isNull(), isNull(), isNull(),
                org.mockito.ArgumentMatchers.argThat(pageable -> pageable.getSort().equals(Sort.by("rollNumber"))));
    }

    @Test
    void getStudentByIdRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/students/1"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(authorities = "ROLE_STUDENT")
    void getStudentByIdRejectsNonAdmin() throws Exception {
        mockMvc.perform(get("/api/students/1"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void getStudentByIdAllowsAdmin() throws Exception {
        when(studentService.getStudentByUserId(1L))
                .thenReturn(StudentDTO.builder().userId(1L).rollNumber("SE12345").fullName("Nguyen Van A").build());

        mockMvc.perform(get("/api/students/1"))
                .andExpect(status().isOk());
    }

    @Test
    void activateAllRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/students/activate/all"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(authorities = "ROLE_STUDENT")
    void activateAllRejectsNonAdmin() throws Exception {
        mockMvc.perform(post("/api/students/activate/all"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void activateAllAllowsAdmin() throws Exception {
        when(studentService.activateAllMatching(any(), any(), any()))
                .thenReturn(BatchActivationResultDTO.builder()
                        .totalRequested(5)
                        .totalProcessed(5)
                        .totalSkippedAlreadyActive(0)
                        .sentEmails(List.of("a@example.com"))
                        .build());

        mockMvc.perform(post("/api/students/activate/all"))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void majorSelectionIsPassedToListingAndBatchActivation() throws Exception {
        mockMvc.perform(get("/api/students").param("majorId", "3").param("majorSearch", "KT"))
                .andExpect(status().isOk());
        verify(studentService).getStudents(isNull(), eq("KT"), eq(3), isNull(), isNull(), any());
        mockMvc.perform(post("/api/students/activate/all").param("majorId", "3").param("majorSearch", "KT"))
                .andExpect(status().isOk());
        verify(studentService).activateAllMatching(isNull(), eq("KT"), eq(3));
    }
}
