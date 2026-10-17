package com.fmaking.service;

import com.fmaking.domain.*;
import com.fmaking.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;

@SpringBootTest
@Transactional
class StudentProfileBioRealtimeTest {

    @Autowired
    private StudentProfileService studentProfileService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private StudentRepository studentRepository;

    @Autowired
    private SchoolClassRepository schoolClassRepository;

    @Autowired
    private DeadlineRepository deadlineRepository;

    @Autowired
    private MajorRepository majorRepository;

    @Autowired
    private TermRepository termRepository;

    @MockitoSpyBean
    private GroupEventPublisher groupEventPublisher;

    private User studentUser;
    private SchoolClass schoolClass;
    private Deadline deadline;

    @BeforeEach
    void setUp() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);

        Major major = new Major();
        major.setName("SE" + suffix);
        major.setCode("SE" + suffix.substring(0, 3));
        major = majorRepository.saveAndFlush(major);

        Term term = new Term();
        term.setName("T" + suffix);
        term = termRepository.saveAndFlush(term);

        schoolClass = new SchoolClass();
        schoolClass.setName("Class" + suffix);
        schoolClass.setTermId(term.getId());
        schoolClass = schoolClassRepository.saveAndFlush(schoolClass);

        studentUser = new User();
        studentUser.setEmail("student" + suffix + "@fpt.edu.vn");
        studentUser.setName("Student " + suffix);
        studentUser.setActivated(true);
        studentUser = userRepository.saveAndFlush(studentUser);

        Student student = new Student();
        student.setUserId(studentUser.getId());
        student.setFullName("Student " + suffix);
        student.setRollNumber("SE" + suffix);
        student.setMemberCode("M" + suffix);
        student.setMajorId(major.getId());
        student.setSchoolClassId(schoolClass.getId());
        studentRepository.saveAndFlush(student);

        deadline = new Deadline();
        deadline.setName("DL " + suffix);
        deadline.setStartTime(Instant.now().minusSeconds(100));
        deadline.setEndTime(Instant.now().plusSeconds(3600));
        deadline.getSchoolClasses().add(schoolClass);
        deadline = deadlineRepository.saveAndFlush(deadline);

        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(studentUser.getEmail(), "pass", AuthorityUtils.createAuthorityList("ROLE_STUDENT"))
        );
    }

    @Test
    void updateBio_shouldSaveBioAndBroadcastRealtimeEvent() {
        String bioText = "React developer passionate about clean UI & microservices";
        String result = studentProfileService.updateBio(bioText);

        assertThat(result).isEqualTo(bioText);

        Student reloaded = studentRepository.findById(studentUser.getId()).orElseThrow();
        assertThat(reloaded.getSelfDescription()).isEqualTo(bioText);

        verify(groupEventPublisher, atLeastOnce()).publish(
            eq("STUDENT_BIO_UPDATED"),
            isNull(),
            eq(deadline.getId()),
            eq(schoolClass.getId()),
            eq(studentUser.getEmail()),
            argThat(payload -> {
                if (payload instanceof Map<?, ?> map) {
                    return studentUser.getId().equals(map.get("studentId"))
                        && bioText.equals(map.get("selfDescription"));
                }
                return false;
            })
        );
    }

    @Test
    void deleteBio_shouldClearBioAndBroadcastRealtimeEvent() {
        studentProfileService.updateBio("Temporary bio");

        studentProfileService.deleteBio();

        Student reloaded = studentRepository.findById(studentUser.getId()).orElseThrow();
        assertThat(reloaded.getSelfDescription()).isNull();

        verify(groupEventPublisher, atLeastOnce()).publish(
            eq("STUDENT_BIO_UPDATED"),
            isNull(),
            eq(deadline.getId()),
            eq(schoolClass.getId()),
            eq(studentUser.getEmail()),
            argThat(payload -> {
                if (payload instanceof Map<?, ?> map) {
                    return studentUser.getId().equals(map.get("studentId"))
                        && "".equals(map.get("selfDescription"));
                }
                return false;
            })
        );
    }
}
