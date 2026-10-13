package tech.djnd.sample.app.service;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tech.djnd.sample.app.domain.*;
import tech.djnd.sample.app.repository.*;
import tech.djnd.sample.app.web.rest.errors.ConflictAlertException;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class ClassLecturerAssignmentConcurrencyTest {
    @Autowired SchoolClassService service;
    @Autowired SchoolClassRepository classes;
    @Autowired LecturerRepository lecturers;
    @Autowired UserRepository users;
    @Autowired TermRepository terms;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void simultaneousAssignmentsAcceptOnlyOneLecturer() throws Exception { race(false, false); }

    @Test
    void importLookupAndManualAssignmentCannotOverwriteEachOther() throws Exception { race(true, false); }

    @Test
    void simultaneousChangesOfAnAssignedClassAcceptOnlyOneNewLecturer() throws Exception { race(false, true); }

    private void race(boolean importLookup, boolean alreadyAssigned) throws Exception {
        Long firstId = lecturer("RACE-ASSIGN-1", "race-assign1@example.test");
        Long secondId = lecturer("RACE-ASSIGN-2", "race-assign2@example.test");
        Long previousId = lecturer("RACE-ASSIGN-PREV", "race-assign-previous@example.test");
        Long expectedId = alreadyAssigned ? previousId : null;
        var term = new Term(); term.setName("RACEASSIGN"); term = terms.saveAndFlush(term);
        var schoolClass = new SchoolClass(); schoolClass.setName("Assignment Race Class"); schoolClass.setTermId(term.getId());
        schoolClass.setLecturerId(expectedId);
        schoolClass = classes.saveAndFlush(schoolClass);
        Integer classId = schoolClass.getId(), termId = term.getId();
        var ready = new CountDownLatch(2); var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> attempt(ready, start, classId, firstId, expectedId));
            var second = executor.submit(() -> {
                if (!importLookup) return attempt(ready, start, classId, secondId, expectedId);
                ready.countDown(); start.await();
                // The same locked lookup and null check used by StudentService's import path.
                return new TransactionTemplate(transactionManager).execute(status -> {
                    var row = classes.findByNameAndTermIdForUpdate("assignment race class", termId).orElseThrow();
                    if (row.getLecturerId() != null) return "conflict";
                    row.setLecturerId(secondId); classes.saveAndFlush(row); return "saved";
                });
            });
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue(); start.countDown();
            String firstResult = first.get(15, TimeUnit.SECONDS), secondResult = second.get(15, TimeUnit.SECONDS);
            assertThat(List.of(firstResult, secondResult)).containsExactlyInAnyOrder("saved", "conflict");
            assertThat(classes.findById(classId).orElseThrow().getLecturerId())
                    .isEqualTo(firstResult.equals("saved") ? firstId : secondId);
        } finally {
            start.countDown(); executor.shutdownNow(); executor.awaitTermination(5, TimeUnit.SECONDS);
            classes.deleteById(classId); terms.deleteById(termId);
            lecturers.deleteById(firstId); lecturers.deleteById(secondId);
            users.deleteById(firstId); users.deleteById(secondId);
            lecturers.deleteById(previousId); users.deleteById(previousId);
        }
    }
    private String attempt(CountDownLatch ready, CountDownLatch start, Integer classId, Long lecturerId, Long expectedId) throws Exception {
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken("race-admin@example.test", "",
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
        SecurityContextHolder.setContext(context);
        try {
            ready.countDown(); start.await(); service.assignLecturer(classId, lecturerId, expectedId); return "saved";
        } catch (ConflictAlertException conflict) { return "conflict"; }
        finally { SecurityContextHolder.clearContext(); }
    }
    private Long lecturer(String code, String email) {
        var user = new User(); user.setEmail(email); user.setName(code); user = users.saveAndFlush(user);
        var lecturer = new Lecturer(); lecturer.setUserId(user.getId()); lecturer.setCode(code); lecturers.saveAndFlush(lecturer);
        return user.getId();
    }
}
