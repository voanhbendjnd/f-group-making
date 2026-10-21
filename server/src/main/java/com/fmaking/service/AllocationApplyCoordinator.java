package com.fmaking.service;

import com.fmaking.repository.*;
import com.fmaking.service.dto.AllocationApplyDTO;
import com.fmaking.web.rest.errors.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.stereotype.Service;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;

/** Deliberately not transactional: reservations and business writes have separate transaction boundaries. */
@Service
public class AllocationApplyCoordinator {
    private final SchoolClassRepository classes;
    private final SchoolClassAccessService access;
    private final AllocationPreviewRepository previews;
    private final AllocationApplyRequests requests;
    private final AllocationApplyService worker;
    public AllocationApplyCoordinator(SchoolClassRepository classes, SchoolClassAccessService access, AllocationPreviewRepository previews,
            AllocationApplyRequests requests, AllocationApplyService worker) {
        this.classes = classes; this.access = access; this.previews = previews; this.requests = requests; this.worker = worker;
    }
    public AllocationApplyDTO apply(Integer deadlineId, Integer classId, String previewId, String key) {
        if (key == null || !key.matches("[!-~]{1,128}")) throw new BadRequestAlertException("Invalid Idempotency-Key", "allocation", "invalidIdempotencyKey");
        var schoolClass = classes.findById(classId).orElseThrow(() -> AllocationApplyService.notFound());
        access.requireWriteAccess(schoolClass);
        Long actor = access.currentLecturerId();
        String id = previewId.toLowerCase(Locale.ROOT);
        var preview = previews.findById(id).orElseThrow(AllocationApplyService::notFound);
        AllocationApplyService.checkOwner(preview, actor, classId, deadlineId);
        String keyHash = hash(key), requestHash = hash("allocation-apply-v1:" + actor + ":" + classId + ":" + deadlineId + ":" + id);
        Long requestId;
        try { requestId = requests.reserve(actor, classId, deadlineId, id, keyHash, requestHash); }
        catch (DataIntegrityViolationException exception) { requestId = requests.find(actor, classId, deadlineId, keyHash); }
        try { return worker.apply(deadlineId, classId, requestId, requestHash); }
        catch (RuntimeException exception) {
            try { requests.failed(requestId); } catch (RuntimeException markingFailure) { exception.addSuppressed(markingFailure); }
            if (exception instanceof PessimisticLockingFailureException) throw AllocationApplyService.conflict("allocationBusy");
            if (exception instanceof DataIntegrityViolationException) throw AllocationApplyService.conflict("allocationIntegrityConflict");
            throw exception;
        }
    }
    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
}
