package tech.djnd.sample.app.web.rest;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tech.djnd.sample.app.domain.User;
import tech.djnd.sample.app.service.UserService;
import tech.djnd.sample.app.service.dto.ActivationKeyVerifyDTO;

import java.util.Optional;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "djnd.client.base-url=http://localhost:3000",
        "djnd.client.allow-localhost=true"
})
@AutoConfigureMockMvc
class AccountResourceSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserService userService;

    @Test
    void singleActivationRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/activate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"student@example.com\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(authorities = "ROLE_STUDENT")
    void singleActivationRejectsNonAdminUsers() throws Exception {
        mockMvc.perform(post("/api/activate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"student@example.com\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void singleActivationRejectsMissingEmail() throws Exception {
        mockMvc.perform(post("/api/activate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void batchActivationRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/activate/mul")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[1]}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(authorities = "ROLE_STUDENT")
    void batchActivationRejectsNonAdminUsers() throws Exception {
        mockMvc.perform(post("/api/activate/mul")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[1]}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void batchActivationRejectsAnEmptyUserIdList() throws Exception {
        mockMvc.perform(post("/api/activate/mul")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void batchActivationRejectsMissingUserIds() throws Exception {
        mockMvc.perform(post("/api/activate/mul")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser(authorities = "ROLE_ADMIN")
    void batchActivationRejectsInvalidUserIds() throws Exception {
        mockMvc.perform(post("/api/activate/mul")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[null,0,-1]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void verifyActivationKeyIsPublic() throws Exception {
        when(userService.verifyActivationKey("valid-key"))
                .thenReturn(ActivationKeyVerifyDTO.builder().valid(true).email("user@example.com").name("Student").build());

        mockMvc.perform(get("/api/account/activate/verify")
                        .param("key", "valid-key"))
                .andExpect(status().isOk());
    }

    @Test
    void accountActivationIsPublic() throws Exception {
        mockMvc.perform(post("/api/account/activate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"key\":\"valid-key\",\"password\":\"new-password\"}"))
                .andExpect(status().isNoContent());
    }

    @Test
    void accountActivationRejectsMissingFields() throws Exception {
        mockMvc.perform(post("/api/account/activate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void accountActivationRejectsShortPasswords() throws Exception {
        mockMvc.perform(post("/api/account/activate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"key\":\"valid-key\",\"password\":\"123\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void resetPasswordInitIsPublic() throws Exception {
        mockMvc.perform(post("/api/account/reset-password/init")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"student@example.com\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void resetPasswordInitRejectsInvalidEmail() throws Exception {
        mockMvc.perform(post("/api/account/reset-password/init")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"not-an-email\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void resetPasswordInitRejectsMissingEmail() throws Exception {
        mockMvc.perform(post("/api/account/reset-password/init")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void resetPasswordFinishIsPublic() throws Exception {
        when(userService.completePasswordReset("new-password-123", "valid-reset-key"))
                .thenReturn(Optional.of(new User()));

        mockMvc.perform(post("/api/account/reset-password/finish")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"resetKey\":\"valid-reset-key\",\"newPassword\":\"new-password-123\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void resetPasswordFinishRejectsMissingKey() throws Exception {
        mockMvc.perform(post("/api/account/reset-password/finish")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newPassword\":\"new-password-123\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void resetPasswordFinishRejectsShortPassword() throws Exception {
        mockMvc.perform(post("/api/account/reset-password/finish")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"resetKey\":\"valid-reset-key\",\"newPassword\":\"123\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void resetPasswordVerifyIsPublic() throws Exception {
        when(userService.verifyResetKey("valid-reset-key"))
                .thenReturn(tech.djnd.sample.app.service.dto.ResetKeyVerifyDTO.builder()
                        .valid(true)
                        .email("student@example.com")
                        .name("Student")
                        .build());

        mockMvc.perform(get("/api/account/reset-password/verify")
                        .param("key", "valid-reset-key"))
                .andExpect(status().isOk());
    }
}
