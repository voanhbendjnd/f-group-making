package com.fmaking.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.Authority;
import com.fmaking.domain.User;
import com.fmaking.repository.AuthorityRepository;
import com.fmaking.repository.UserRepository;
import com.fmaking.security.AuthoritiesConstants;
import com.fmaking.service.dto.ResLoginDTO;
import com.fmaking.web.rest.vm.LoginVM;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.MediaType;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "djnd.client.base-url=http://localhost:3000",
        "djnd.client.allow-localhost=true"
})
@AutoConfigureMockMvc
class TwoBrowserLoginIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AuthorityRepository authorityRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    @SpyBean
    private SimpMessagingTemplate messagingTemplate;

    private static final String TEST_EMAIL = "concurrent.test.user@example.test";
    private static final String TEST_PASSWORD = "Password@123";

    @BeforeEach
    void setUp() {
        userRepository.findOneByEmail(TEST_EMAIL).ifPresent(user -> {
            userRepository.delete(user);
            userRepository.flush();
        });

        Authority adminAuth = authorityRepository.findById(AuthoritiesConstants.ADMIN).orElseGet(() -> {
            Authority a = new Authority();
            a.setName(AuthoritiesConstants.ADMIN);
            return authorityRepository.save(a);
        });

        User user = new User();
        user.setName("Concurrent Test User");
        user.setEmail(TEST_EMAIL);
        user.setPassword(passwordEncoder.encode(TEST_PASSWORD));
        user.setActivated(true);
        user.setAuthorities(Set.of(adminAuth));
        userRepository.saveAndFlush(user);
    }

    private String loginAndGetToken() throws Exception {
        LoginVM vm = new LoginVM();
        vm.setUsername(TEST_EMAIL);
        vm.setPassword(TEST_PASSWORD);

        MvcResult result = mockMvc.perform(post("/api/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(vm)))
                .andExpect(status().isOk())
                .andReturn();

        String content = result.getResponse().getContentAsString();
        return objectMapper.readTree(content).path("data").path("accessToken").asText();
    }

    @Test
    void secondBrowserLoginSucceedsAndInvalidatesFirstBrowserSession() throws Exception {
        // Browser A (Chrome) logs in
        String tokenA = loginAndGetToken();
        assertThat(tokenA).isNotBlank();

        // Browser A can access protected endpoint
        mockMvc.perform(get("/api/terms")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk());

        // Browser B (Edge) logs in with same account
        String tokenB = loginAndGetToken();
        assertThat(tokenB).isNotBlank();
        assertThat(tokenB).isNotEqualTo(tokenA);

        // Verify WebSocket realtime notification was broadcast for the invalidated session
        verify(messagingTemplate).convertAndSendToUser(eq(TEST_EMAIL), eq("/queue/session"), any());

        // Browser A makes request -> MUST be rejected with SESSION_TERMINATED_CONCURRENT_LOGIN
        mockMvc.perform(get("/api/terms")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SESSION_TERMINATED_CONCURRENT_LOGIN"))
                .andExpect(jsonPath("$.message").value("Tài khoản đã được đăng nhập trên thiết bị khác"));

        // Browser B makes request -> MUST SUCCEED (200 OK) and NOT be invalidated
        mockMvc.perform(get("/api/terms")
                        .header("Authorization", "Bearer " + tokenB))
                .andExpect(status().isOk());
    }

    @Test
    void loginWithOldTokenInAuthorizationHeaderShouldStillSucceed() throws Exception {
        // Browser A logs in
        String tokenA = loginAndGetToken();

        // Browser B logs in -> invalidating tokenA
        String tokenB = loginAndGetToken();

        // Browser A attempts to login while sending invalidated tokenA in Authorization header
        LoginVM vm = new LoginVM();
        vm.setUsername(TEST_EMAIL);
        vm.setPassword(TEST_PASSWORD);

        MvcResult result = mockMvc.perform(post("/api/login")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(vm)))
                .andReturn();

        System.out.println("Login with stale token header status: " + result.getResponse().getStatus());
        System.out.println("Login with stale token header body: " + result.getResponse().getContentAsString());
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }
}
