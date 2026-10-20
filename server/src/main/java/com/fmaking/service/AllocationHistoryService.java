package com.fmaking.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.repository.*;
import com.fmaking.service.dto.*;
import com.fmaking.web.rest.errors.NotFoundAlertException;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;

@Service
@Transactional(readOnly = true)
public class AllocationHistoryService {
    private final AllocationRunRepository runs;
    private final SchoolClassRepository classes;
    private final DeadlineRepository deadlines;
    private final SchoolClassAccessService access;
    private final ObjectMapper mapper;
    public AllocationHistoryService(AllocationRunRepository runs, SchoolClassRepository classes, DeadlineRepository deadlines,
            SchoolClassAccessService access, ObjectMapper mapper) {
        this.runs = runs; this.classes = classes; this.deadlines = deadlines; this.access = access; this.mapper = mapper;
    }
    public record Summary(Long runId, String previewId, Long actorId, int targetGroupCount, long seed, Instant appliedAt) {}
    public ResultPaginationDTO list(Integer deadlineId, Integer classId, Pageable pageable) {
        authorize(deadlineId, classId);
        var page = runs.findBySchoolClassIdAndDeadlineIdOrderByAppliedAtDescIdDesc(classId, deadlineId,
            PageRequest.of(pageable.getPageNumber(), Math.min(pageable.getPageSize(), 100)));
        return new ResultPaginationDTO(new ResultPaginationDTO.Meta(page.getNumber() + 1, page.getSize(), page.getTotalPages(), page.getTotalElements()),
            page.map(run -> new Summary(run.getId(), run.getPreviewId(), run.getActorId(), run.getTargetCount(), run.getSeed(), run.getAppliedAt())).getContent());
    }
    public AllocationApplyDTO detail(Integer deadlineId, Integer classId, Long id) {
        authorize(deadlineId, classId);
        var run = runs.findByIdAndSchoolClassIdAndDeadlineId(id, classId, deadlineId).orElseThrow(AllocationHistoryService::notFound);
        try { return mapper.readValue(run.getResultJson(), AllocationApplyDTO.class); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Cannot read allocation history", exception); }
    }
    private void authorize(Integer deadlineId, Integer classId) {
        var schoolClass = classes.findById(classId).orElseThrow(AllocationHistoryService::notFound);
        access.requireWriteAccess(schoolClass);
        if (deadlines.countByDeadlineIdAndClassId(deadlineId, classId) != 1) throw notFound();
    }
    private static NotFoundAlertException notFound() { return new NotFoundAlertException("Allocation history not found", "allocation", "allocationHistoryNotFound"); }
}
