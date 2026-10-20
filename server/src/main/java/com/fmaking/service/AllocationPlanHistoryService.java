package com.fmaking.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.AllocationPreview;
import com.fmaking.domain.User;
import com.fmaking.repository.AllocationPreviewRepository;
import com.fmaking.repository.UserRepository;
import com.fmaking.service.dto.AllocationPreviewDTO;
import com.fmaking.service.dto.AllocationResultDTO;
import com.fmaking.service.dto.ResultPaginationDTO;
import com.fmaking.web.rest.errors.NotFoundAlertException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Durable Random history, separate from the successful Apply audit. Reading never recomputes assignments. */
@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class AllocationPlanHistoryService {
    private final AllocationPreviewRepository previews;
    private final AllocationPreviewService snapshots;
    private final SchoolClassAccessService access;
    private final UserRepository users;
    private final ObjectMapper mapper;

    public AllocationPlanHistoryService(AllocationPreviewRepository previews, AllocationPreviewService snapshots,
            SchoolClassAccessService access, UserRepository users, ObjectMapper mapper) {
        this.previews = previews; this.snapshots = snapshots; this.access = access; this.users = users; this.mapper = mapper;
    }

    public enum Status { UNAPPLIED, APPLIED, INVALID }
    public record Summary(String planId, Long actorId, String actorName, Instant createdAt, Instant appliedAt,
                          int targetGroupCount, long seed, Integer totalStudents, Status status, boolean available,
                          boolean canApply, String invalidReason) {}
    public record Detail(Summary summary, AllocationPreviewDTO preview) {}

    public ResultPaginationDTO list(Integer deadlineId, Integer classId, Pageable pageable) {
        var current = currentOverview(deadlineId, classId); // Scope authorization and one snapshot for the entire page.
        var page = previews.findBySchoolClassIdAndDeadlineIdOrderByCreatedAtDescIdDesc(classId, deadlineId,
            PageRequest.of(pageable.getPageNumber(), Math.min(pageable.getPageSize(), 100)));
        Map<Long, User> actors = users.findAllById(page.stream().map(AllocationPreview::getOwnerId).distinct().toList())
            .stream().collect(Collectors.toMap(User::getId, Function.identity()));
        var result = page.map(row -> summary(row, decode(row), current, actors.get(row.getOwnerId()))).getContent();
        return new ResultPaginationDTO(new ResultPaginationDTO.Meta(page.getNumber() + 1, page.getSize(), page.getTotalPages(), page.getTotalElements()), result);
    }

    public Detail detail(Integer deadlineId, Integer classId, String id) {
        var current = currentOverview(deadlineId, classId);
        var row = previews.findById(id).filter(value -> Objects.equals(classId, value.getSchoolClassId())
            && Objects.equals(deadlineId, value.getDeadlineId())).orElseThrow(AllocationPlanHistoryService::notFound);
        var saved = decode(row);
        if (saved == null) throw notFound();
        var summary = summary(row, saved, current, users.findById(row.getOwnerId()).orElse(null));
        var restored = new AllocationPreviewDTO(saved.scope(), saved.snapshotFingerprint(), saved.planFingerprint(), saved.sameAsPreviousPlan(),
            saved.result(), saved.groups(), saved.report(), row.getId(), row.getCreatedAt(), null);
        return new Detail(summary, restored);
    }

    private Summary summary(AllocationPreview row, AllocationPreviewDTO saved, AllocationPreviewDTO.Overview current, User actor) {
        String reason = saved == null ? "allocationPreviewInvalid"
            : current == null ? "allocationDataConflict"
            : AllocationPreviewService.isAllocationComplete(current) ? "allocationAlreadyComplete"
            : !row.getSnapshotFingerprint().equals(current.snapshotFingerprint()) ? "allocationPreviewStale"
            : !AllocationBalancePolicy.isBalanced(saved.groups().stream().map(group -> group.members().size()).toList()) ? "allocationBalanceViolation" : null;
        Status status = row.getAppliedAt() != null ? Status.APPLIED : reason != null ? Status.INVALID : Status.UNAPPLIED;
        return new Summary(row.getId(), row.getOwnerId(), actor == null ? null : actor.getName(), row.getCreatedAt(), row.getAppliedAt(),
            row.getTargetCount(), row.getSeed(), saved == null ? null : saved.report().studentsAfter(), status, saved != null,
            status == Status.UNAPPLIED && Objects.equals(row.getOwnerId(), access.currentLecturerId()), status == Status.INVALID ? reason : null);
    }

    private AllocationPreviewDTO.Overview currentOverview(Integer deadlineId, Integer classId) {
        return snapshots.captureForHistory(deadlineId, classId).map(AllocationPreviewService.Captured::overview).orElse(null);
    }

    private AllocationPreviewDTO decode(AllocationPreview row) {
        if (row.getFormatVersion() != 1 || row.getPayload() == null) return null;
        try {
            var plan = mapper.readValue(row.getPayload(), AllocationPreviewDTO.class);
            if (plan == null || plan.result() == null || plan.groups() == null || plan.report() == null || plan.scope() == null
                || plan.result().status() != AllocationResultDTO.Status.FEASIBLE || plan.groups().size() != row.getTargetCount()
                || !Objects.equals(plan.scope().classId(), row.getSchoolClassId()) || !Objects.equals(plan.scope().deadlineId(), row.getDeadlineId())
                || plan.groups().stream().anyMatch(group -> group == null || group.members() == null || group.groupId() == null)
                || !row.getSnapshotFingerprint().equals(plan.snapshotFingerprint())
                || !row.getPlanFingerprint().equals(snapshots.planFingerprint(row.getSnapshotFingerprint(), plan.groups()))) return null;
            return plan;
        } catch (JsonProcessingException exception) { return null; }
    }
    private static NotFoundAlertException notFound() {
        return new NotFoundAlertException("Saved allocation plan unavailable", "allocation", "allocationPlanUnavailable");
    }
}
