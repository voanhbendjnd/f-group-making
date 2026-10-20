package com.fmaking.service.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Instant;
import java.util.List;

public record AllocationApplyDTO(Long runId, String previewId, Long actorId, Integer classId, Integer deadlineId,
                                 int targetGroupCount, long seed, Instant appliedAt,
                                 String snapshotFingerprint, String planFingerprint,
                                 List<Long> approvedGroupIds, List<Long> cancelledInvitationIds, AllocationPreviewDTO.Report report) {
    public record Request(@NotNull @Pattern(regexp = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") String previewId) {}
}
