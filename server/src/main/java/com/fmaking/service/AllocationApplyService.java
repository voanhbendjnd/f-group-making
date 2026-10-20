package com.fmaking.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fmaking.domain.*;
import com.fmaking.repository.*;
import com.fmaking.service.dto.*;
import com.fmaking.web.rest.errors.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.util.*;
import jakarta.persistence.EntityManager;

@Service
public class AllocationApplyService {
    private final AllocationLocks locks;
    private final AllocationPreviewRepository previews;
    private final AllocationApplyRequestRepository requests;
    private final AllocationRunRepository runs;
    private final AllocationPreviewService snapshots;
    private final GroupService groups;
    private final GroupInvitationService invitations;
    private final SchoolClassAccessService access;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final EntityManager em;

    public AllocationApplyService(AllocationLocks locks, AllocationPreviewRepository previews, AllocationApplyRequestRepository requests,
            AllocationRunRepository runs, AllocationPreviewService snapshots, GroupService groups, GroupInvitationService invitations,
            SchoolClassAccessService access, ObjectMapper mapper, Clock clock, EntityManager em) {
        this.locks = locks; this.previews = previews; this.requests = requests; this.runs = runs; this.snapshots = snapshots;
        this.groups = groups; this.invitations = invitations; this.access = access; this.mapper = mapper; this.clock = clock; this.em = em;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public AllocationApplyDTO apply(Integer deadlineId, Integer classId, Long requestId, String requestHash) {
        // OSIV may retain entities read by the coordinator before this transaction acquired locks.
        em.clear();
        locks.scope(classId, deadlineId);
        Long actor = access.currentLecturerId();
        var request = requests.findForUpdate(requestId).orElseThrow(() -> conflict("allocationRequestNotFound"));
        if (!Objects.equals(actor, request.getOwnerId()) || !Objects.equals(classId, request.getSchoolClassId())
                || !Objects.equals(deadlineId, request.getDeadlineId()) || !requestHash.equals(request.getRequestHash()))
            throw conflict("allocationIdempotencyMismatch");
        if (!clock.instant().isBefore(request.getExpiresAt())) throw conflict("allocationIdempotencyExpired");
        if (request.getStatus() == AllocationApplyRequest.Status.SUCCEEDED) return read(request.getResultJson(), AllocationApplyDTO.class);
        var preview = previews.findForUpdate(request.getPreviewId()).orElseThrow(AllocationApplyService::notFound);
        checkOwner(preview, actor, classId, deadlineId);
        if (preview.getAppliedAt() != null) throw conflict("allocationPreviewUsed");
        if (preview.getFormatVersion() != 1 || preview.getPayload() == null) throw conflict("allocationPreviewInvalid");
        request.setStatus(AllocationApplyRequest.Status.PROCESSING);
        locks.data(classId, deadlineId);
        var current = snapshots.capture(deadlineId, classId);
        if (!preview.getSnapshotFingerprint().equals(current.overview().snapshotFingerprint())) throw conflict("allocationPreviewStale");
        var plan = read(preview.getPayload(), AllocationPreviewDTO.class);
        if (plan.result() == null || plan.groups() == null || plan.report() == null || plan.scope() == null
                || plan.result().status() != AllocationResultDTO.Status.FEASIBLE
                || plan.groups().size() != preview.getTargetCount() || plan.result().targetGroupCount() != preview.getTargetCount()
                || !Objects.equals(plan.scope().classId(), classId) || !Objects.equals(plan.scope().deadlineId(), deadlineId)
                || !preview.getSnapshotFingerprint().equals(plan.snapshotFingerprint())
                || !preview.getPlanFingerprint().equals(snapshots.planFingerprint(preview.getSnapshotFingerprint(), plan.groups())))
            throw conflict("allocationPreviewInvalid");
        if (!AllocationBalancePolicy.isBalanced(plan.groups().stream().map(g -> g.members().size()).toList()))
            throw conflict("allocationBalanceViolation");
        var affected = new HashSet<Long>();
        current.overview().groups().stream().filter(g -> g.status() == GroupStatus.OPEN || g.status() == GroupStatus.REVOKED)
            .forEach(g -> affected.add(g.groupId()));
        var cancelled = invitations.cancelForAllocation(deadlineId, classId, affected);
        var approved = groups.applyAllocationPlan(deadlineId, classId, plan.groups());
        var run = new AllocationRun();
        run.setPreviewId(preview.getId()); run.setApplyRequestId(requestId); run.setActorId(actor);
        run.setSchoolClassId(classId); run.setDeadlineId(deadlineId); run.setTargetCount(preview.getTargetCount()); run.setSeed(preview.getSeed());
        run.setAppliedAt(clock.instant()); run.setSnapshotFingerprint(preview.getSnapshotFingerprint()); run.setPlanFingerprint(preview.getPlanFingerprint());
        run.setResultJson("{}"); runs.saveAndFlush(run);
        var result = new AllocationApplyDTO(run.getId(), preview.getId(), actor, classId, deadlineId, preview.getTargetCount(), preview.getSeed(),
            run.getAppliedAt(), preview.getSnapshotFingerprint(), preview.getPlanFingerprint(), approved, cancelled, plan.report());
        String json = write(result);
        run.setResultJson(json); preview.setAppliedAt(run.getAppliedAt());
        request.setStatus(AllocationApplyRequest.Status.SUCCEEDED); request.setResultJson(json); request.setFailureCode(null);
        runs.flush(); requests.flush(); previews.flush();
        return result;
    }

    static void checkOwner(AllocationPreview preview, Long actor, Integer classId, Integer deadlineId) {
        if (!Objects.equals(preview.getOwnerId(), actor) || !Objects.equals(preview.getSchoolClassId(), classId)
                || !Objects.equals(preview.getDeadlineId(), deadlineId)) throw notFound();
    }
    static NotFoundAlertException notFound() { return new NotFoundAlertException("Preview not found", "allocation", "allocationPreviewNotFound"); }
    static ConflictAlertException conflict(String code) { return new ConflictAlertException("Allocation request cannot be applied", "allocation", code); }
    private <T> T read(String json, Class<T> type) {
        try { return mapper.readValue(json, type); } catch (JsonProcessingException exception) { throw conflict("allocationPreviewInvalid"); }
    }
    private String write(Object value) {
        try { return mapper.writeValueAsString(value); } catch (JsonProcessingException exception) { throw new IllegalStateException("Cannot serialize allocation result", exception); }
    }
}
