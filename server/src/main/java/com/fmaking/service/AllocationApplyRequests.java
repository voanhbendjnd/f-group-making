package com.fmaking.service;

import com.fmaking.domain.AllocationApplyRequest;
import com.fmaking.repository.AllocationApplyRequestRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Duration;

/** Separate transactions preserve the key binding even when the business transaction rolls back. */
@Service
public class AllocationApplyRequests {
    private final AllocationApplyRequestRepository requests;
    private final Clock clock;
    public AllocationApplyRequests(AllocationApplyRequestRepository requests, Clock clock) { this.requests = requests; this.clock = clock; }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long reserve(Long owner, Integer classId, Integer deadlineId, String previewId, String keyHash, String requestHash) {
        var request = new AllocationApplyRequest();
        request.setOwnerId(owner); request.setSchoolClassId(classId); request.setDeadlineId(deadlineId);
        request.setPreviewId(previewId); request.setKeyHash(keyHash); request.setRequestHash(requestHash);
        request.setCreatedAt(clock.instant()); request.setExpiresAt(clock.instant().plus(Duration.ofDays(30)));
        return requests.saveAndFlush(request).getId();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Long find(Long owner, Integer classId, Integer deadlineId, String keyHash) {
        return requests.findByOwnerIdAndSchoolClassIdAndDeadlineIdAndKeyHash(owner, classId, deadlineId, keyHash)
            .map(AllocationApplyRequest::getId).orElseThrow(() -> AllocationApplyService.conflict("allocationBusy"));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failed(Long id) {
        requests.findForUpdate(id).ifPresent(request -> {
            if (request.getStatus() != AllocationApplyRequest.Status.SUCCEEDED) {
                request.setStatus(AllocationApplyRequest.Status.FAILED);
                request.setFailureCode("allocationApplyFailed");
            }
        });
    }
}
