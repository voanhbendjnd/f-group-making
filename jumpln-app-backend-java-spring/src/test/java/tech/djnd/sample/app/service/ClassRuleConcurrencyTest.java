package tech.djnd.sample.app.service;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import tech.djnd.sample.app.domain.GroupingRuleCode;
import tech.djnd.sample.app.domain.Lecturer;
import tech.djnd.sample.app.domain.SchoolClass;
import tech.djnd.sample.app.domain.User;
import tech.djnd.sample.app.repository.*;
import tech.djnd.sample.app.service.dto.GroupingRuleDTO;
import tech.djnd.sample.app.service.dto.SaveClassRulesDTO;
import tech.djnd.sample.app.web.rest.errors.ConflictAlertException;

import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class ClassRuleConcurrencyTest {
    @Autowired ClassRuleService service;
    @Autowired SchoolClassRepository classes;
    @Autowired RuleRepository rules;
    @Autowired UserRepository users;
    @Autowired LecturerRepository lecturers;

    @Test
    void concurrentFirstSavesAcceptOneVersionAndPersistExactlyOneCompleteSet() throws Exception {
        User user = new User(); user.setEmail("race-lecturer@example.com"); user.setName("Race Lecturer");
        user = users.saveAndFlush(user);
        Lecturer lecturer = new Lecturer(); lecturer.setUserId(user.getId()); lecturer.setCode("RACE-LECTURER");
        lecturers.saveAndFlush(lecturer);
        SchoolClass schoolClass = new SchoolClass(); schoolClass.setName("Concurrent Rule Class"); schoolClass.setLecturerId(user.getId());
        schoolClass = classes.saveAndFlush(schoolClass);
        Integer classId = schoolClass.getId();
        Long userId = user.getId();
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        var request = new SaveClassRulesDTO(0L, Arrays.stream(GroupingRuleCode.values())
                .map(code -> new GroupingRuleDTO(code, code.getSuggestedValue())).toList());
        java.util.concurrent.Callable<String> save = () -> {
            var context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(new UsernamePasswordAuthenticationToken("race-lecturer@example.com", "",
                    List.of(new SimpleGrantedAuthority("ROLE_LECTURE"))));
            SecurityContextHolder.setContext(context);
            try {
                ready.countDown(); start.await();
                service.saveRules(classId, request);
                return "saved";
            } catch (ConflictAlertException conflict) {
                return "conflict";
            } finally {
                SecurityContextHolder.clearContext();
            }
        };
        try {
            var first = executor.submit(save); var second = executor.submit(save);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue(); start.countDown();
            assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("saved", "conflict");
            assertThat(rules.findBySchoolClassId(classId)).hasSize(GroupingRuleCode.values().length);
            assertThat(classes.findById(classId).orElseThrow().getRulesVersion()).isEqualTo(1);
        } finally {
            start.countDown(); executor.shutdownNow(); executor.awaitTermination(5, TimeUnit.SECONDS);
            rules.deleteAll(rules.findBySchoolClassId(classId));
            classes.deleteById(classId); lecturers.deleteById(userId); users.deleteById(userId);
        }
    }
}
