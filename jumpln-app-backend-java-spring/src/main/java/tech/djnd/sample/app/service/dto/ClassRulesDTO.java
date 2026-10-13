package tech.djnd.sample.app.service.dto;

import java.util.List;

public record ClassRulesDTO(
        Integer schoolClassId,
        long version,
        boolean configured,
        List<GroupingRuleDTO> rules,
        List<String> warnings
) {}
