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
                byCode.containsKey(code.name()) ? byCode.get(code.name()).getValue() : code.getSuggestedValue())).toList();
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
            toSave.add(rule);
        }
        ruleRepository.saveAll(toSave);
        schoolClass.setRulesVersion(schoolClass.getRulesVersion() + 1);
        schoolClassRepository.save(schoolClass);
        List<GroupingRuleDTO> sorted = toSave.stream().map(rule -> new GroupingRuleDTO(
                GroupingRuleCode.valueOf(rule.getCode()), rule.getValue()))
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
        if (values.get(MIN_MEMBERS_PER_GROUP) > values.get(MAX_MEMBERS_PER_GROUP)
                || values.get(MIN_GROUPS_PER_CLASS) > values.get(MAX_GROUPS_PER_CLASS)
                || values.get(MIN_MAJORS_PER_GROUP) > values.get(MAX_MAJORS_PER_GROUP)) {
            throw invalid("ruleMinGreaterThanMax");
        }
        if (values.get(MIN_MAJORS_PER_GROUP) > values.get(MAX_MEMBERS_PER_GROUP)) {
            throw invalid("ruleMajorsExceedMembers");
        }
        if (values.get(MIN_SE_MEMBERS_PER_GROUP) > 0
                && values.get(MIN_SE_MEMBERS_PER_GROUP) + values.get(MIN_MAJORS_PER_GROUP) - 1
                > values.get(MAX_MEMBERS_PER_GROUP)) {
            throw invalid("ruleSeExceedMembers");
        }
    }

    private ClassRulesDTO response(SchoolClass schoolClass, boolean configured, List<GroupingRuleDTO> rules) {
        Map<GroupingRuleCode, Integer> values = rules.stream()
                .collect(Collectors.toMap(GroupingRuleDTO::code, GroupingRuleDTO::value));
        long students = studentRepository.countBySchoolClassId(schoolClass.getId());
        long majors = studentRepository.countDistinctMajorsBySchoolClassId(schoolClass.getId());
        List<String> warnings = new ArrayList<>();
        if (students == 0) {
            warnings.add("EMPTY_CLASS");
        } else {
            int seMinimum = values.get(MIN_SE_MEMBERS_PER_GROUP);
            int requiredMembers = Math.max(values.get(MIN_MEMBERS_PER_GROUP), seMinimum > 0
                    ? seMinimum + values.get(MIN_MAJORS_PER_GROUP) - 1 : values.get(MIN_MAJORS_PER_GROUP));
            long leastGroups = Math.max(values.get(MIN_GROUPS_PER_CLASS),
                    (students + values.get(MAX_MEMBERS_PER_GROUP) - 1) / values.get(MAX_MEMBERS_PER_GROUP));
            long mostGroups = Math.min(values.get(MAX_GROUPS_PER_CLASS), students / requiredMembers);
            if (leastGroups > mostGroups) warnings.add("GROUP_COUNTS_INFEASIBLE");
            if (majors < values.get(MIN_MAJORS_PER_GROUP)) warnings.add("INSUFFICIENT_MAJORS");
            if (seMinimum > 0 && studentRepository.countBySchoolClassIdAndMajorCode(schoolClass.getId(), "SE")
                    < leastGroups * seMinimum) {
                warnings.add("INSUFFICIENT_SE_STUDENTS");
            }
        }
        return new ClassRulesDTO(schoolClass.getId(), schoolClass.getRulesVersion(), configured, rules, warnings);
    }

    private static BadRequestResourceException invalid(String code) {
        return new BadRequestResourceException("Invalid grouping rules", "classRules", code);
    }

    private static NotFoundAlertException notFound() {
        return new NotFoundAlertException("Class not found", "schoolClass", "classNotFound");
    }
}
