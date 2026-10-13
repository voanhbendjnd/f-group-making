package com.fmaking.web.rest;

import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.fmaking.service.SchoolClassService;
import com.fmaking.service.dto.ResultPaginationDTO;
import com.fmaking.util.anotation.ApiMessage;

@RestController
@RequestMapping("/api/me/school-classes")
@PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
public class LecturerClassResource {
    private final SchoolClassService schoolClassService;

    public LecturerClassResource(SchoolClassService schoolClassService) {
        this.schoolClassService = schoolClassService;
    }

    @GetMapping
    @ApiMessage("Get assigned classes successfully")
    public ResponseEntity<ResultPaginationDTO> getMyClasses(
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "termId", required = false) Integer termId,
            @PageableDefault(size = 10, sort = {"createdDate", "id"}, direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(schoolClassService.getMySchoolClasses(search, termId, pageable));
    }
}
