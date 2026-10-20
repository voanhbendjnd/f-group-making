package com.fmaking.web.rest;

import lombok.extern.slf4j.Slf4j;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import com.fmaking.service.SchoolClassService;
import com.fmaking.service.dto.AssignClassLecturerDTO;
import com.fmaking.service.dto.ResultPaginationDTO;
import com.fmaking.service.dto.SchoolClassDTO;
import com.fmaking.service.dto.StudentDTO;
import com.fmaking.util.anotation.ApiMessage;

import java.util.List;

/**
 * REST controller for managing {@link com.fmaking.domain.SchoolClass}.
 *
 * <p>Endpoint prefix: {@code /api/school-classes}</p>
 */
@Slf4j
@RestController
@RequestMapping("/api/school-classes")
public class SchoolClassResource {

    private final SchoolClassService schoolClassService;

    public SchoolClassResource(SchoolClassService schoolClassService) {
        this.schoolClassService = schoolClassService;
    }

    /**
     * GET /api/school-classes : Get paginated list of school classes with search and term filter.
     */
    @GetMapping
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER')")
    @ApiMessage("Get school classes list successfully")
    public ResponseEntity<ResultPaginationDTO> getAllSchoolClasses(
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "termId", required = false) Integer termId,
            @PageableDefault(size = 20, sort = "createdDate", direction = Sort.Direction.DESC) Pageable pageable) {

        log.debug("REST request to get school classes: search={}, termId={}, pageable={}", search, termId, pageable);
        ResultPaginationDTO result = schoolClassService.getSchoolClasses(search, termId, pageable);
        return ResponseEntity.ok(result);
    }

    /**
     * GET /api/school-classes/{id} : Get class details by ID.
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Get school class details successfully")
    public ResponseEntity<SchoolClassDTO> getSchoolClassById(@PathVariable("id") Integer id) {
        log.debug("REST request to get school class: id={}", id);
        SchoolClassDTO result = schoolClassService.getSchoolClassById(id);
        return ResponseEntity.ok(result);
    }

    /**
     * GET /api/school-classes/{id}/students : Get all students belonging to the class.
     */
    @GetMapping("/{id}/students")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE_MASTER', 'ROLE_LECTURE')")
    @ApiMessage("Get school class students successfully")
    public ResponseEntity<List<StudentDTO>> getStudentsByClassId(@PathVariable("id") Integer id) {
        log.debug("REST request to get students of class: id={}", id);
        List<StudentDTO> result = schoolClassService.getStudentsByClassId(id);
        return ResponseEntity.ok(result);
    }

    @PutMapping("/{id}/lecturer")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    @ApiMessage("Assign class lecturer successfully")
    public ResponseEntity<SchoolClassDTO> assignLecturer(
            @PathVariable("id") Integer id, @Valid @RequestBody AssignClassLecturerDTO request) {
        return ResponseEntity.ok(schoolClassService.assignLecturer(id, request.lecturerId(), request.expectedLecturerId()));
    }
}
