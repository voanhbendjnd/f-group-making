package com.fmaking.web.rest;

import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import com.fmaking.security.AuthoritiesConstants;
import com.fmaking.service.TermService;
import com.fmaking.service.dto.CreateTermRequestDTO;
import com.fmaking.service.dto.TermDTO;
import com.fmaking.util.anotation.ApiMessage;

import java.util.List;

/**
 * REST controller for managing {@link com.fmaking.domain.Term}.
 *
 * <p>Endpoint prefix: {@code /api/terms}</p>
 */
@Slf4j
@RestController
@RequestMapping("/api/terms")
public class TermResource {

    private final TermService termService;

    public TermResource(TermService termService) {
        this.termService = termService;
    }

    /**
     * GET /api/terms : Get terms list.
     * By default returns terms from current term to future terms.
     */
    @GetMapping
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_STUDENT', 'ROLE_LECTURE', 'ROLE_LECTURE_MASTER')")
    @ApiMessage("Get available terms successfully")
    public ResponseEntity<List<TermDTO>> getTerms(
            @RequestParam(name = "currentAndFutureOnly", defaultValue = "true") Boolean currentAndFutureOnly) {
        log.debug("REST request to get terms: currentAndFutureOnly={}", currentAndFutureOnly);
        List<TermDTO> terms = termService.getAvailableTerms(currentAndFutureOnly);
        return ResponseEntity.ok(terms);
    }

    /**
     * GET /api/terms/current : Get current active term.
     */
    @GetMapping("/current")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_STUDENT', 'ROLE_LECTURE', 'ROLE_LECTURE_MASTER')")
    @ApiMessage("Get current term successfully")
    public ResponseEntity<TermDTO> getCurrentTerm() {
        log.debug("REST request to get current term");
        TermDTO currentTerm = termService.getCurrentTerm();
        return ResponseEntity.ok(currentTerm);
    }

    /**
     * POST /api/terms : Create a future or current term.
     */
    @PostMapping
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    @ApiMessage("Create term successfully")
    public ResponseEntity<TermDTO> createTerm(@Valid @RequestBody CreateTermRequestDTO request) {
        log.debug("REST request to create term: {}", request.getName());
        TermDTO result = termService.createFutureTerm(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }
}
