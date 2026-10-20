package com.fmaking.web.rest;

import lombok.extern.slf4j.Slf4j;
import jakarta.validation.Valid;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import com.fmaking.service.dto.CreateLecturerDTO;
import com.fmaking.service.dto.LecturerDTO;
import org.zalando.problem.Status;
import org.zalando.problem.violations.ConstraintViolationProblem;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import com.fmaking.security.AuthoritiesConstants;
import com.fmaking.service.LecturerService;
import com.fmaking.service.dto.BatchActivationResultDTO;
import com.fmaking.service.dto.ImportResultDTO;
import com.fmaking.service.dto.ResultPaginationDTO;
import com.fmaking.util.anotation.ApiMessage;

/**
 * REST controller for managing {@link com.fmaking.domain.Lecturer}.
 *
 * <p>Endpoint prefix: {@code /api/lecturers}</p>
 */
@Slf4j
@RestController
@RequestMapping("/api/lecturers")
public class LecturerResource {

    private final LecturerService lecturerService;

    public LecturerResource(LecturerService lecturerService) {
        this.lecturerService = lecturerService;
    }

    @PostMapping
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    @ApiMessage("Create lecturer successfully")
    public ResponseEntity<LecturerDTO> createLecturer(@Valid @RequestBody CreateLecturerDTO request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(lecturerService.createLecturer(request));
        } catch (DataIntegrityViolationException ex) {
            var conflicts = lecturerService.findCreationConflicts(request);
            if (!conflicts.isEmpty()) throw new ConstraintViolationProblem(Status.CONFLICT, conflicts);
            throw ex;
        }
    }

    /**
     * GET /api/lecturers : Get paginated, searched, and filtered lecturer list.
     *
     * <p>Only ADMIN can perform this operation.</p>
     */
    @GetMapping
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    @ApiMessage("Get lecturer list successfully")
    public ResponseEntity<ResultPaginationDTO> getAllLecturers(
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "activated", required = false) Boolean activated,
            @RequestParam(name = "hasActivationKey", required = false) Boolean hasActivationKey,
            @RequestParam(name = "termId", required = false) Integer termId,
            @PageableDefault(size = 20, sort = {"createdDate", "userId"}, direction = Sort.Direction.DESC) Pageable pageable) {

        log.debug("REST request to get lecturers with filter: search={}, activated={}, hasKey={}",
                search, activated, hasActivationKey);
        ResultPaginationDTO result = lecturerService.getLecturers(search, activated, hasActivationKey, pageable, termId);
        return ResponseEntity.ok(result);
    }

    /**
     * POST /api/lecturers/import : Import lecturer list from Excel file (.xlsx).
     *
     * <p>Only ADMIN can perform this operation.</p>
     */
    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    @ApiMessage("Import lecturers from Excel completed")
    public ResponseEntity<ImportResultDTO> importLecturersFromExcel(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "termId", required = false) Integer termId) {

        log.debug("REST request to import lecturers from Excel: filename={}, termId={}", file.getOriginalFilename(), termId);
        ImportResultDTO result = lecturerService.importFromExcel(file);
        return ResponseEntity.ok(result);
    }

    /**
     * POST /api/lecturers/activate-all : Batch activate all matching lecturers by filter criteria.
     *
     * <p>Only ADMIN can perform this operation.</p>
     */
    @PostMapping("/activate-all")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    @ApiMessage("Batch activation emails sent successfully")
    public ResponseEntity<BatchActivationResultDTO> activateAllMatching(
            @RequestParam(name = "search", required = false) String search,
            @RequestParam(name = "termId", required = false) Integer termId) {

        log.debug("REST request to activate all matching lecturers: search={}", search);
        BatchActivationResultDTO result = lecturerService.activateAllMatching(search, termId);
        return ResponseEntity.ok(result);
    }

    /**
     * DELETE /api/lecturers/{userId} : Delete single lecturer by userId.
     */
    @DeleteMapping("/{userId}")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    @ApiMessage("Delete lecturer successfully")
    public ResponseEntity<Void> deleteLecturer(@PathVariable("userId") Long userId) {
        log.debug("REST request to delete lecturer: userId={}", userId);
        lecturerService.deleteLecturer(userId);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /api/lecturers/batch-delete : Delete multiple lecturers by userIds.
     */
    @PostMapping("/batch-delete")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    @ApiMessage("Delete lecturers successfully")
    public ResponseEntity<Void> deleteLecturersBatch(@RequestBody java.util.List<Long> userIds,
            @RequestParam(name = "termId", required = false) Integer termId) {
        log.debug("REST request to delete batch lecturers: userIds={}", userIds);
        lecturerService.deleteLecturers(userIds, termId);
        return ResponseEntity.noContent().build();
    }
}
