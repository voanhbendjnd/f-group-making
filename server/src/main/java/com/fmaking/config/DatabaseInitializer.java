package com.fmaking.config;


import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import com.fmaking.domain.Authority;
import com.fmaking.domain.Major;
import com.fmaking.domain.User;
import com.fmaking.domain.Term;
import com.fmaking.repository.AuthorityRepository;
import com.fmaking.repository.MajorRepository;
import com.fmaking.repository.TermRepository;
import com.fmaking.repository.UserRepository;
import com.fmaking.security.AuthoritiesConstants;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@RequiredArgsConstructor(access = AccessLevel.PRIVATE)
@Slf4j
public class DatabaseInitializer implements CommandLineRunner {

    UserRepository userRepository;
    AuthorityRepository authorityRepository;
    MajorRepository majorRepository;
    TermRepository termRepository;
    PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) throws Exception {
        log.info("Database start check initialization...");
        Long totalUsers = userRepository.count();
        Long totalAuthority = authorityRepository.count();
        Set<Authority> authorities = new HashSet<>();

        List<String> requiredRoles = List.of(
                AuthoritiesConstants.ADMIN,
                AuthoritiesConstants.STUDENT,
                AuthoritiesConstants.LECTURE,
                AuthoritiesConstants.LECTURE_MASTER,
                AuthoritiesConstants.ANONYMOUS
        );
        for (String roleName : requiredRoles) {
            if (!authorityRepository.existsById(roleName)) {
                Authority auth = new Authority();
                auth.setName(roleName);
                authorityRepository.save(auth);
                authorities.add(auth);
            }
        }

        if (totalUsers.equals(0L)) {
            log.info("Start create user...");
            User admin = new User();
            admin.setName("Hoàng admin");
            admin.setActivated(true);
            admin.setEmail("hoangtlt.ce190272@gmail.com");
            admin.setPassword(passwordEncoder.encode("admin@123"));
            admin.setAuthorities(authorities);
            userRepository.save(admin);
            User admin2 = new User();
            admin2.setName("Djnd");
            admin2.setActivated(true);
            admin2.setEmail("benva.ce190709@gmail.com");
            admin2.setPassword(passwordEncoder.encode("123123"));
            admin2.setAuthorities(authorities);
            userRepository.save(admin2);
            User admin3 = new User();
            admin3.setName("Trang");
            admin3.setActivated(true);
            admin3.setEmail("trangtttce191027@gmail.com");
            admin3.setPassword(passwordEncoder.encode("123123"));
            admin3.setAuthorities(authorities);
            userRepository.save(admin3);
        }

        // Seed Major data — chỉ insert nếu chưa có dữ liệu
        initMajors();

        // Seed Term data — chỉ insert nếu chưa có dữ liệu
        initTerms();

        if (totalUsers > 0 || totalAuthority > 0) {
            log.info("Skip processing initialize...");
        } else {
            log.info("End init data and init data success");
        }
    }


    private void initMajors() {
        if (majorRepository.count() > 0) {
            log.info("Majors already initialized, skipping...");
            return;
        }
        log.info("Start seeding Major data...");

        List<Major> majors = List.of(
                buildMajor("KT", "Korean Studies"),
                buildMajor("ENG", "English"),
                buildMajor("CHN", "Chinese"),
                buildMajor("KR",  "Korean"),
                buildMajor("IB",  "International Business"),
                buildMajor("SE",  "Software Engineering"),
                buildMajor("GD",  "Graphic Design"),
                buildMajor("IA",  "Information Assurance"),
                buildMajor("MC",  "Multimedia Communications"),
                buildMajor("HM",  "Hotel Management"),
                buildMajor("TM",  "Tourism Management"),
                buildMajor("FIN", "Finance"),
                buildMajor("MKT", "Marketing")
        );

        majorRepository.saveAll(majors);
        log.info("Seeded {} major(s) successfully.", majors.size());
    }

    private Major buildMajor(String code, String name) {
        Major major = new Major();
        major.setCode(code);
        major.setName(name);
        return major;
    }

    private void initTerms() {
        if (termRepository.count() > 0) {
            log.info("Terms already initialized, skipping...");
            return;
        }
        log.info("Start seeding Term data...");
        List<Term> terms = List.of(
            buildTerm("FALL26"),
            buildTerm("SP26"),
            buildTerm("SU26")
        );
        termRepository.saveAll(terms);
        log.info("Seeded {} term(s) successfully.", terms.size());
    }

    private Term buildTerm(String name) {
        Term term = new Term();
        term.setName(name);
        return term;
    }
}