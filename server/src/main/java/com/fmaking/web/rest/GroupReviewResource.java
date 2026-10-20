package com.fmaking.web.rest;

import com.fmaking.domain.GroupStatus;
import com.fmaking.service.GroupService;
import com.fmaking.service.dto.ResultPaginationDTO;
import com.fmaking.util.anotation.ApiMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/me/group-reviews")
@PreAuthorize("hasAnyAuthority('ROLE_LECTURE', 'ROLE_LECTURE_MASTER', 'ROLE_ADMIN')")
public class GroupReviewResource {
    private final GroupService service;

    public GroupReviewResource(GroupService service) { this.service = service; }

    @GetMapping
    @ApiMessage("Get assigned class group reviews successfully")
    public ResponseEntity<ResultPaginationDTO> getReviews(@RequestParam("termId") Integer termId,
            @RequestParam(value = "classId", required = false) Integer classId,
            @RequestParam(value = "status", required = false) GroupStatus status,
            @RequestParam(value = "search", required = false) String search, Pageable pageable) {
        return ResponseEntity.ok(service.getMyGroupReviews(termId, classId, status, search, pageable));
    }
}
