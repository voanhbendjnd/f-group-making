package tech.djnd.sample.app.service;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tech.djnd.sample.app.domain.GroupingRuleCode;
import tech.djnd.sample.app.domain.Rule;
import tech.djnd.sample.app.domain.SchoolClass;
import tech.djnd.sample.app.repository.RuleRepository;
import tech.djnd.sample.app.repository.SchoolClassRepository;
import tech.djnd.sample.app.repository.StudentRepository;

import java.util.Arrays;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static tech.djnd.sample.app.domain.GroupingRuleCode.*;

@ExtendWith(MockitoExtension.class)
class ClassRuleStatusWarningsTest {
    @Mock SchoolClassRepository classes;
    @Mock RuleRepository rules;
    @Mock StudentRepository students;
    @Mock SchoolClassAccessService access;

    @ParameterizedTest
    @CsvSource({
            "MAX_MEMBERS_PER_GROUP, 10001, 4, 6, 1, 1",
            "MAX_GROUPS_PER_CLASS, 12, 4, 6, 3, 1",
            "MIN_GROUPS_PER_CLASS, 12, 4, 6, 50, 50",
            "MIN_MEMBERS_PER_GROUP, 1, 4, 6, 1, 50",
            "MIN_MAJORS_PER_GROUP, 12, 4, 6, 1, 50",
            "MIN_SE_MEMBERS_PER_GROUP, 12, 4, 6, 1, 50"
    })
    void disabledBoundDoesNotProduceWarningsOrFallBackToSuggestedLimits(GroupingRuleCode disabled, long count,
            int minMembers, int maxMembers, int minGroups, int maxGroups) {
        SchoolClass schoolClass = new SchoolClass(); schoolClass.setId(42);
        var stored = Arrays.stream(GroupingRuleCode.values()).map(code -> {
            Rule rule = new Rule(); rule.setSchoolClassId(42); rule.setCode(code.name());
            rule.setStatus(code != disabled);
            rule.setValue(switch (code) {
                case MIN_MEMBERS_PER_GROUP -> minMembers;
                case MAX_MEMBERS_PER_GROUP -> maxMembers;
                case MIN_GROUPS_PER_CLASS -> minGroups;
                case MAX_GROUPS_PER_CLASS -> maxGroups;
                case MIN_MAJORS_PER_GROUP -> disabled == MIN_MAJORS_PER_GROUP ? 1000 : 1;
                case MIN_SE_MEMBERS_PER_GROUP -> disabled == MIN_SE_MEMBERS_PER_GROUP ? 5 : 0;
                default -> code.getSuggestedValue();
            });
            return rule;
        }).toList();
        when(classes.findById(42)).thenReturn(Optional.of(schoolClass));
        when(rules.findBySchoolClassId(42)).thenReturn(stored);
        when(students.countBySchoolClassId(42)).thenReturn(count);
        when(students.countDistinctMajorsBySchoolClassId(42)).thenReturn(1L);
        var response = new ClassRuleService(classes, rules, students, access).getRules(42);
        assertThat(response.warnings()).isEmpty();
        assertThat(response.rules().stream().filter(rule -> rule.code() == disabled).findFirst().orElseThrow().status()).isFalse();
    }
}
