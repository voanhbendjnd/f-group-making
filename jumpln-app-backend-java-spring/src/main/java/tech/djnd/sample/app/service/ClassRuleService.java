package tech.djnd.sample.app.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.djnd.sample.app.domain.GroupingRuleCode;
import tech.djnd.sample.app.domain.Rule;
import tech.djnd.sample.app.domain.SchoolClass;
import tech.djnd.sample.app.repository.RuleRepository;
import tech.djnd.sample.app.repository.SchoolClassRepository;
import tech.djnd.sample.app.repository.StudentRepository;
import tech.djnd.sample.app.service.dto.ClassRulesDTO;
import tech.djnd.sample.app.service.dto.GroupingRuleDTO;
import tech.djnd.sample.app.service.dto.SaveClassRulesDTO;
import tech.djnd.sample.app.service.errors.BadRequestResourceException;
import tech.djnd.sample.app.web.rest.errors.ConflictAlertException;
import tech.djnd.sample.app.web.rest.errors.NotFoundAlertException;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static tech.djnd.sample.app.domain.GroupingRuleCode.*;

@Service
@Transactional
public class ClassRuleService {
    private final SchoolClassRepository schoolClassRepository;
    private final RuleRepository ruleRepository;
    private final StudentRepository studentRepository;
    private final SchoolClassAccessService accessService;

    public ClassRuleService(SchoolClassRepository schoolClassRepository, RuleRepository ruleRepository,
                            StudentRepository studentRepository, SchoolClassAccessService accessService) {
        this.schoolClassRepository = schoolClassRepository;
        this.ruleRepository = ruleRepository;
        this.studentRepository = studentRepository;
        this.accessService = accessService;
    }

    @Transactional(readOnly = true)
    public ClassRulesDTO getRules(Integer classId) {
        SchoolClass schoolClass = schoolClassRepository.findById(classId).orElseThrow(ClassRuleService::notFound);
        accessService.requireReadAccess(schoolClass);
        List<Rule> storedRules = ruleRepository.findBySchoolClassId(classId);
        Map<String, Rule> byCode = storedRules.stream().collect(Collectors.toMap(Rule::getCode, Function.identity()));
        List<GroupingRuleDTO> rules = Arrays.stream(values()).map(code -> new GroupingRuleDTO(code,
                byCode.containsKey(code.name()) ? byCode.get(code.name()).getValue() : code.getSuggestedValue(),
                !byCode.containsKey(code.name()) || byCode.get(code.name()).getStatus())).toList();
        boolean configured = Arrays.stream(values()).allMatch(code -> byCode.containsKey(code.name()));
        return response(schoolClass, configured, rules);
    }

    public ClassRulesDTO saveRules(Integer classId, SaveClassRulesDTO request) {
        // All writers of a class's rules serialize on the same class row, including the first insert.
        SchoolClass schoolClass = schoolClassRepository.findByIdForUpdate(classId).orElseThrow(ClassRuleService::notFound);
        accessService.requireWriteAccess(schoolClass);
        if (request.version() != schoolClass.getRulesVersion()) {
            throw new ConflictAlertException("Rules changed. Reload before saving.", "classRules", "rulesVersionConflict");
        }
        validate(request.rules());
        Map<String, Rule> existing = ruleRepository.findBySchoolClassId(classId).stream()
                .collect(Collectors.toMap(Rule::getCode, Function.identity()));
        List<Rule> toSave = new ArrayList<>();
        for (GroupingRuleDTO item : request.rules()) {
            Rule rule = existing.getOrDefault(item.code().name(), new Rule());
            rule.setSchoolClassId(classId);
            rule.setCode(item.code().name());
            rule.setValue(item.value());
            rule.setStatus(item.status());
            toSave.add(rule);
        }
        ruleRepository.saveAll(toSave);
        schoolClass.setRulesVersion(schoolClass.getRulesVersion() + 1);
        schoolClassRepository.save(schoolClass);
        List<GroupingRuleDTO> sorted = toSave.stream().map(rule -> new GroupingRuleDTO(
                GroupingRuleCode.valueOf(rule.getCode()), rule.getValue(), rule.getStatus()))
                .sorted(java.util.Comparator.comparing(GroupingRuleDTO::code)).toList();
        return response(schoolClass, true, sorted);
    }

    private void validate(List<GroupingRuleDTO> rules) {
        Map<GroupingRuleCode, Integer> values = new EnumMap<>(GroupingRuleCode.class);
        for (GroupingRuleDTO rule : rules) {
            if (rule.value() < rule.code().getMinimumValue()) {
                throw invalid("ruleValueOutOfRange");
            }
            if (values.put(rule.code(), rule.value()) != null) {
                throw invalid("duplicateRuleCode");
            }
        }
        if (values.size() != GroupingRuleCode.values().length) {
            throw invalid("incompleteRules");
        }
        Map<GroupingRuleCode, Integer> active = activeValues(rules);
        if (bound(active, MIN_MEMBERS_PER_GROUP, 1) > bound(active, MAX_MEMBERS_PER_GROUP, Long.MAX_VALUE)
                || bound(active, MIN_GROUPS_PER_CLASS, 1) > bound(active, MAX_GROUPS_PER_CLASS, Long.MAX_VALUE)
                || bound(active, MIN_MAJORS_PER_GROUP, 0) > bound(active, MAX_MAJORS_PER_GROUP, Long.MAX_VALUE)) {
            throw invalid("ruleMinGreaterThanMax");
        }
        long minMajors = bound(active, MIN_MAJORS_PER_GROUP, 0);
        long maxMembers = bound(active, MAX_MEMBERS_PER_GROUP, Long.MAX_VALUE);
        if (minMajors > maxMembers) {
            throw invalid("ruleMajorsExceedMembers");
        }
        long seMinimum = bound(active, MIN_SE_MEMBERS_PER_GROUP, 0);
        if (seMinimum > 0 && seMinimum + Math.max(minMajors - 1, 0) > maxMembers) {
            throw invalid("ruleSeExceedMembers");
        }
    }

    private ClassRulesDTO response(SchoolClass schoolClass, boolean configured, List<GroupingRuleDTO> rules) {
        Map<GroupingRuleCode, Integer> active = activeValues(rules);
        long students = studentRepository.countBySchoolClassId(schoolClass.getId());
        long majors = studentRepository.countDistinctMajorsBySchoolClassId(schoolClass.getId());
        List<String> warnings = new ArrayList<>();
        if (students == 0) {
            warnings.add("EMPTY_CLASS");
        } else {
            long seMinimum = bound(active, MIN_SE_MEMBERS_PER_GROUP, 0);
            long minMajors = bound(active, MIN_MAJORS_PER_GROUP, 0);
            long maxMembers = bound(active, MAX_MEMBERS_PER_GROUP, Long.MAX_VALUE);
            long requiredMembers = Math.max(bound(active, MIN_MEMBERS_PER_GROUP, 1), seMinimum > 0
                    ? seMinimum + Math.max(minMajors - 1, 0) : minMajors);
            long leastGroups = Math.max(bound(active, MIN_GROUPS_PER_CLASS, 1), (students - 1) / maxMembers + 1);
            long mostGroups = Math.min(bound(active, MAX_GROUPS_PER_CLASS, Long.MAX_VALUE), students / requiredMembers);
            if (leastGroups > mostGroups) warnings.add("GROUP_COUNTS_INFEASIBLE");
            if (majors < minMajors) warnings.add("INSUFFICIENT_MAJORS");
            if (seMinimum > 0 && studentRepository.countBySchoolClassIdAndMajorCode(schoolClass.getId(), "SE")
                    < leastGroups * seMinimum) {
                warnings.add("INSUFFICIENT_SE_STUDENTS");
            }
        }
        return new ClassRulesDTO(schoolClass.getId(), schoolClass.getRulesVersion(), configured, rules, warnings);
    }

    // Disabled rules keep their stored values but never contribute a constraint.
    private static Map<GroupingRuleCode, Integer> activeValues(List<GroupingRuleDTO> rules) {
        return rules.stream().filter(rule -> Boolean.TRUE.equals(rule.status()))
                .collect(Collectors.toMap(GroupingRuleDTO::code, GroupingRuleDTO::value));
    }

    private static long bound(Map<GroupingRuleCode, Integer> active, GroupingRuleCode code, long fallback) {
        return active.containsKey(code) ? active.get(code) : fallback;
    }

    private static BadRequestResourceException invalid(String code) {
        return new BadRequestResourceException("Invalid grouping rules", "classRules", code);
    }

    private static NotFoundAlertException notFound() {
        return new NotFoundAlertException("Class not found", "schoolClass", "classNotFound");
    }
}
