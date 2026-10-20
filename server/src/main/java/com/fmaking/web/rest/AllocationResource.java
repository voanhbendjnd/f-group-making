package com.fmaking.web.rest;

import com.fmaking.service.AllocationPreviewService;
import com.fmaking.service.AllocationApplyCoordinator;
import com.fmaking.service.AllocationHistoryService;
import com.fmaking.service.dto.AllocationApplyDTO;
import com.fmaking.service.dto.ResultPaginationDTO;
import org.springframework.data.domain.Pageable;
import com.fmaking.service.dto.AllocationPreviewDTO;
import com.fmaking.service.dto.AllocationPreviewRequest;
import com.fmaking.util.anotation.ApiMessage;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/deadlines/{deadlineId}/classes/{classId}/allocation")
@PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_LECTURE', 'ROLE_LECTURE_MASTER')")
public class AllocationResource {
    private final AllocationPreviewService service;
    private final AllocationApplyCoordinator apply;
    private final AllocationHistoryService history;

    public AllocationResource(AllocationPreviewService service, AllocationApplyCoordinator apply, AllocationHistoryService history) {
        this.service = service; this.apply = apply; this.history = history;
    }

    @PostMapping("/apply")
    @ApiMessage("Allocation applied")
    public ResponseEntity<AllocationApplyDTO> apply(@PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId, @RequestHeader("Idempotency-Key") String key,
            @Valid @RequestBody AllocationApplyDTO.Request request) {
        return ResponseEntity.ok(apply.apply(deadlineId, classId, request.previewId(), key));
    }

    @GetMapping("/history")
    @ApiMessage("Allocation history retrieved")
    public ResponseEntity<ResultPaginationDTO> history(@PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId, Pageable pageable) {
        return ResponseEntity.ok(history.list(deadlineId, classId, pageable));
    }

    @GetMapping("/history/{runId}")
    @ApiMessage("Allocation history retrieved")
    public ResponseEntity<AllocationApplyDTO> historyDetail(@PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId, @PathVariable("runId") Long runId) {
        return ResponseEntity.ok(history.detail(deadlineId, classId, runId));
    }

    @GetMapping("/overview")
    @ApiMessage("Allocation overview retrieved")
    public ResponseEntity<AllocationPreviewDTO.Overview> overview(@PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId) {
        return ResponseEntity.ok(service.overview(deadlineId, classId));
    }

    @GetMapping("/setup")
    @ApiMessage("Allocation setup retrieved")
    public ResponseEntity<AllocationPreviewDTO.Setup> setup(@PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId, @RequestParam(value = "seed", required = false) Long seed) {
        return ResponseEntity.ok(service.setup(deadlineId, classId, seed));
    }

    @PostMapping("/preview")
    @ApiMessage("Allocation calculation completed")
    public ResponseEntity<AllocationPreviewDTO> preview(@PathVariable("deadlineId") Integer deadlineId,
            @PathVariable("classId") Integer classId, @Valid @RequestBody AllocationPreviewRequest request) {
        return ResponseEntity.ok(service.preview(deadlineId, classId, request));
    }
}
