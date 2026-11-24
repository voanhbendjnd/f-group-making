package com.fmaking.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.test.context.support.WithAnonymousUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import com.fmaking.domain.User;
import com.fmaking.repository.UserRepository;
import com.fmaking.service.MailService;
import com.fmaking.service.dto.CreateAdminDTO;
import com.fmaking.service.dto.UserDTO;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AdminResourceTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @MockitoBean
    private MailService mailService;

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void createAdmin_shouldSucceedWithActivationEmailWhenAuthorizedAsAdmin() throws Exception {
        CreateAdminDTO request = CreateAdminDTO.builder()
                .name("New Admin")
                .email("new.admin@fpt.edu.vn")
                .build();

        mockMvc.perform(post("/api/admin/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.email").value("new.admin@fpt.edu.vn"))
                .andExpect(jsonPath("$.data.name").value("New Admin"))
                .andExpect(jsonPath("$.data.activated").value(false))
                .andExpect(jsonPath("$.data.activationKey").isNotEmpty())
                .andExpect(jsonPath("$.data.authorities[0]").value("ROLE_ADMIN"));

        User saved = userRepository.findOneByEmail("new.admin@fpt.edu.vn").orElseThrow();
        assertThat(saved.getName()).isEqualTo("New Admin");
        assertThat(saved.getActivated()).isFalse();
        assertThat(saved.getActivationKey()).isNotBlank();
        assertThat(saved.getAuthorities()).extracting("name").contains("ROLE_ADMIN");

        verify(mailService).sendActivationEmail(any(UserDTO.class));
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void createAdmin_shouldSucceedWithDirectPasswordWhenSendEmailIsFalse() throws Exception {
        CreateAdminDTO request = CreateAdminDTO.builder()
                .name("Direct Admin")
                .email("direct.admin@fpt.edu.vn")
                .password("Admin@123456")
                .sendActivationEmail(false)
                .build();

        mockMvc.perform(post("/api/admin/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.email").value("direct.admin@fpt.edu.vn"))
                .andExpect(jsonPath("$.data.name").value("Direct Admin"))
                .andExpect(jsonPath("$.data.activated").value(true))
                .andExpect(jsonPath("$.data.authorities[0]").value("ROLE_ADMIN"));

        User saved = userRepository.findOneByEmail("direct.admin@fpt.edu.vn").orElseThrow();
        assertThat(saved.getName()).isEqualTo("Direct Admin");
        assertThat(saved.getActivated()).isTrue();
        assertThat(saved.getActivationKey()).isNull();
    }

    @Test
    @WithAnonymousUser
    void createAdmin_shouldRejectAnonymous() throws Exception {
        CreateAdminDTO request = CreateAdminDTO.builder()
                .name("Anonymous Target")
                .email("anon.admin@fpt.edu.vn")
                .password("Admin@123456")
                .build();

        mockMvc.perform(post("/api/admin/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(authorities = "ROLE_STUDENT")
    void createAdmin_shouldRejectNonAdmin() throws Exception {
        CreateAdminDTO request = CreateAdminDTO.builder()
                .name("Student Attempt")
                .email("student.attempt@fpt.edu.vn")
                .password("Admin@123456")
                .build();

        mockMvc.perform(post("/api/admin/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void createAdmin_shouldRejectDuplicateEmail() throws Exception {
        CreateAdminDTO first = CreateAdminDTO.builder()
                .name("Admin First")
                .email("duplicate.admin@fpt.edu.vn")
                .password("Admin@123456")
                .build();

        mockMvc.perform(post("/api/admin/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(first)))
                .andExpect(status().isCreated());

        CreateAdminDTO duplicate = CreateAdminDTO.builder()
                .name("Admin Duplicate")
                .email("DUPLICATE.ADMIN@FPT.EDU.VN")
                .password("AnotherPassword@123")
                .build();

        mockMvc.perform(post("/api/admin/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(duplicate)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void createAdmin_shouldValidateFields() throws Exception {
        // Name blank, invalid email, password too short
        CreateAdminDTO invalid = CreateAdminDTO.builder()
                .name("   ")
                .email("not-an-email")
                .password("123")
                .build();

        mockMvc.perform(post("/api/admin/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalid)))
                .andExpect(status().isBadRequest());
    }
}
