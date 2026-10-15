package com.fmaking.service;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.dao.DataIntegrityViolationException;
import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.dto.CreateStudentDTO;
import com.fmaking.service.errors.BadRequestResourceException;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:student-create-concurrency;DB_CLOSE_DELAY=-1;MODE=MySQL")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class StudentCreateConcurrencyTest {
    @Autowired private StudentService service;
    @Autowired private UserRepository users;
    @MockitoSpyBean private StudentRepository students;
    @Autowired private MajorRepository majors;
    @Autowired private LecturerRepository lecturers;
    @Autowired private TermRepository terms;
    @Autowired private SchoolClassRepository classes;

    private CreateStudentDTO request(String suffix, String member) {
        User user = new User(); user.setName("Concurrent Lecturer"); user.setEmail("teacher" + suffix + "@example.test");
        users.saveAndFlush(user);
        Lecturer lecturer = new Lecturer(); lecturer.setUserId(user.getId()); lecturer.setCode("GV" + suffix); lecturers.saveAndFlush(lecturer);
        Term term = new Term(); term.setName("SP" + suffix); terms.saveAndFlush(term);
        SchoolClass schoolClass = new SchoolClass(); schoolClass.setName("CLASS" + suffix); schoolClass.setTermId(term.getId());
        schoolClass.setLecturerId(user.getId()); classes.saveAndFlush(schoolClass);
        return new CreateStudentDTO("Concurrent Student", "ROLL" + suffix, member, "student" + suffix + "@example.test",
                majors.findAll().getFirst().getId(), term.getId(), schoolClass.getId());
    }

    @Test
    void concurrentRequestsWithTheSameMemberCodeAcrossDifferentClassesDoNotCreateDuplicates() throws Exception {
        var first = request("91", "SHARED-MEMBER");
        var second = request("92", "shared-member");
        long initialUsers = users.count(), initialStudents = students.count();
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var firstResult = executor.submit(() -> createAfter(start, first));
            var secondResult = executor.submit(() -> createAfter(start, second));
            start.countDown();
            assertThat(firstResult.get(15, TimeUnit.SECONDS) + secondResult.get(15, TimeUnit.SECONDS)).isEqualTo(1);
        }
        assertThat(users.count()).isEqualTo(initialUsers + 1);
        assertThat(students.count()).isEqualTo(initialStudents + 1);
    }

    @Test
    void identicalConcurrentRequestsCreateOnlyOneStudent() throws Exception {
        var request = request("94", "IDENTICAL-MEMBER");
        long initialUsers = users.count(), initialStudents = students.count();
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> createAfter(start, request));
            var second = executor.submit(() -> createAfter(start, request));
            start.countDown();
            assertThat(first.get(15, TimeUnit.SECONDS) + second.get(15, TimeUnit.SECONDS)).isEqualTo(1);
        }
        assertThat(users.count()).isEqualTo(initialUsers + 1);
        assertThat(students.count()).isEqualTo(initialStudents + 1);
    }

    @Test
    void integrityFailureRollsBackTheUserAndReleasesTheCreationGuard() {
        var request = request("93", "ROLLBACK-MEMBER");
        long initialUsers = users.count(), initialStudents = students.count();
        doThrow(new DataIntegrityViolationException("Test conflict")).when(students).flush();
        assertThatThrownBy(() -> service.createStudent(request)).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(users.count()).isEqualTo(initialUsers);
        assertThat(students.count()).isEqualTo(initialStudents);
        reset(students);
        assertThat(service.createStudent(request).getEmail()).isEqualTo(request.email());
    }

    private int createAfter(CountDownLatch start, CreateStudentDTO request) throws InterruptedException {
        if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Test start timed out");
        try { service.createStudent(request); return 1; }
        catch (BadRequestResourceException expected) { return 0; }
    }
}
