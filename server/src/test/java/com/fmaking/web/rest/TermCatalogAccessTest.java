package com.fmaking.web.rest;

import com.fmaking.domain.Term;
import com.fmaking.repository.TermRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class TermCatalogAccessTest {
    @Autowired MockMvc mvc;
    @Autowired TermRepository terms;

    @Test
    void supportedRolesCanReadHistoryAndCurrentTermButOnlyAdminCanCreate() throws Exception {
        Term past = new Term();
        past.setName("SP21");
        terms.saveAndFlush(past);
        for (String role : new String[]{"ADMIN", "STUDENT", "LECTURE", "LECTURE_MASTER"}) {
            mvc.perform(get("/api/terms").param("currentAndFutureOnly", "false").with(user("catalog").roles(role)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data[?(@.name=='SP21')]").isNotEmpty());
            mvc.perform(get("/api/terms/current").with(user("catalog").roles(role)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.isCurrent").value(true));
            if (!role.equals("ADMIN")) {
                mvc.perform(post("/api/terms").with(user("catalog").roles(role))
                                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"SP99\"}"))
                        .andExpect(status().isForbidden());
            }
        }
    }

    @Test
    void anonymousAndUnknownRolesCannotReadTheCatalog() throws Exception {
        mvc.perform(get("/api/terms")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/terms/current")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/terms").with(user("unknown").roles("UNKNOWN"))).andExpect(status().isForbidden());
    }
}
