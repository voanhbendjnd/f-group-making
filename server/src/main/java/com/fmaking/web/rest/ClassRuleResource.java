package com.fmaking.web.rest;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import com.fmaking.service.ClassRuleService;
import com.fmaking.service.dto.ClassRulesDTO;
import com.fmaking.service.dto.SaveClassRulesDTO;
import com.fmaking.util.anotation.ApiMessage;

@RestController
@RequestMapping("/api/school-classes/{classId}/rules")
public class ClassRuleResource {
    private final ClassRuleService classRuleService;

    public ClassRuleResource(ClassRuleService classRuleService) {
        this.classRuleService = classRuleService;
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Get class rules successfully")
    public ResponseEntity<ClassRulesDTO> getRules(@PathVariable("classId") Integer classId) {
        return ResponseEntity.ok(classRuleService.getRules(classId));
    }

    @PutMapping
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Save class rules successfully")
    public ResponseEntity<ClassRulesDTO> saveRules(@PathVariable("classId") Integer classId,
                                                  @Valid @RequestBody SaveClassRulesDTO request) {
        return ResponseEntity.ok(classRuleService.saveRules(classId, request));
    }
}
