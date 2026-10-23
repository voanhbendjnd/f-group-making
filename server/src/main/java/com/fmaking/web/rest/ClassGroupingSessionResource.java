package com.fmaking.web.rest;

import com.fmaking.service.DeadlineService;
import com.fmaking.service.dto.DeadlineDTO;
import com.fmaking.util.anotation.ApiMessage;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/school-classes/{classId}/grouping-session")
@PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
public class ClassGroupingSessionResource {
    private final DeadlineService deadlines;

    public ClassGroupingSessionResource(DeadlineService deadlines) { this.deadlines = deadlines; }

    @PutMapping
    @ApiMessage("Class grouping workspace ready")
    public ResponseEntity<DeadlineDTO> ensure(@PathVariable("classId") Integer classId,
            @RequestParam(value = "termId", required = false) Integer termId) {
        return ResponseEntity.ok(deadlines.ensureGroupingSession(classId, termId));
    }
}
