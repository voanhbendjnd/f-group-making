package com.fmaking.web.rest;

import com.fmaking.service.ClassViewScope;
import com.fmaking.service.DepartmentOverviewService;
import com.fmaking.service.dto.DepartmentOverviewDTO.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/department-overview")
@PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER')")
public class DepartmentOverviewResource {
    private final DepartmentOverviewService service;
    public DepartmentOverviewResource(DepartmentOverviewService service) { this.service = service; }

    @GetMapping
    public ResponseEntity<Overview> overview(@RequestParam("termId") Integer termId,
            @RequestParam(value = "search", required = false) String search,
            @RequestParam(value = "classScope", defaultValue = "ALL") ClassViewScope scope,
            @PageableDefault(size = 10, sort = "name", direction = Sort.Direction.ASC) Pageable pageable) {
        return ResponseEntity.ok(service.overview(termId, search, scope, pageable));
    }

    @GetMapping("/classes/{classId}")
    public ResponseEntity<ClassDetail> detail(@RequestParam("termId") Integer termId, @PathVariable("classId") Integer classId) {
        return ResponseEntity.ok(service.detail(termId, classId));
    }
}
