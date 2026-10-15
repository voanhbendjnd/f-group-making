package com.fmaking.web.rest;

import com.fmaking.security.AuthoritiesConstants;
import com.fmaking.service.DeadlineService;
import com.fmaking.service.dto.CreateDeadlineDTO;
import com.fmaking.service.dto.DeadlineDTO;
import com.fmaking.service.dto.DeadlineValidateDTO;
import com.fmaking.service.dto.StudentDeadlineActivityDTO;
import com.fmaking.service.dto.UpdateDeadlineDTO;
import com.fmaking.util.anotation.ApiMessage;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/deadlines")
public class DeadlineResource {

    private final DeadlineService deadlineService;

    public DeadlineResource(DeadlineService deadlineService) {
        this.deadlineService = deadlineService;
    }

    @PostMapping
    @PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "', '" + AuthoritiesConstants.LECTURE + "', '" + AuthoritiesConstants.LECTURE_MASTER + "')")
    @ResponseStatus(HttpStatus.CREATED)
    @ApiMessage("Deadline created successfully")
    public ResponseEntity<DeadlineDTO> createDeadline(@Valid @RequestBody CreateDeadlineDTO dto) {
        log.debug("REST request to create Deadline : {}", dto.getName());
        DeadlineDTO result = deadlineService.createDeadline(dto);
        return new ResponseEntity<>(result, HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "', '" + AuthoritiesConstants.LECTURE + "', '" + AuthoritiesConstants.LECTURE_MASTER + "')")
    @ApiMessage("Deadline updated successfully")
    public ResponseEntity<DeadlineDTO> updateDeadline(
            @PathVariable("id") Integer id,
            @Valid @RequestBody UpdateDeadlineDTO dto
    ) {
        log.debug("REST request to update Deadline : {}", id);
        dto.setId(id);
        DeadlineDTO result = deadlineService.updateDeadline(dto);
        return ResponseEntity.ok(result);
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Page<DeadlineDTO>> getDeadlines(Pageable pageable,
            @RequestParam(name = "termId", required = false) Integer termId) {
        log.debug("REST request to get a page of Deadlines");
        Page<DeadlineDTO> page = deadlineService.getDeadlines(pageable, termId);
        return ResponseEntity.ok(page);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<DeadlineDTO> getDeadline(@PathVariable("id") Integer id) {
        log.debug("REST request to get Deadline : {}", id);
        DeadlineDTO result = deadlineService.getDeadlineById(id);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{id}/validate")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.STUDENT + "')")
    @ApiMessage("Deadline validated successfully")
    public ResponseEntity<DeadlineValidateDTO> validateDeadline(
            @PathVariable("id") Integer id,
            @RequestParam("classId") Integer classId
    ) {
        log.debug("REST request to validate Deadline : {} for class : {}", id, classId);
        DeadlineValidateDTO result = deadlineService.validateDeadlineForStudent(id, classId);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/my-activities")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.STUDENT + "')")
    @ApiMessage("Get student deadline activities successfully")
    public ResponseEntity<List<StudentDeadlineActivityDTO>> getMyActivities() {
        log.debug("REST request to get deadline activities for current student");
        List<StudentDeadlineActivityDTO> activities = deadlineService.getMyActivities();
        return ResponseEntity.ok(activities);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "', '" + AuthoritiesConstants.LECTURE + "', '" + AuthoritiesConstants.LECTURE_MASTER + "')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @ApiMessage("Deadline cancelled successfully")
    public ResponseEntity<Void> deleteDeadline(@PathVariable("id") Integer id) {
        log.debug("REST request to cancel Deadline : {}", id);
        deadlineService.cancelOrDeleteDeadline(id);
        return ResponseEntity.noContent().build();
    }
}
