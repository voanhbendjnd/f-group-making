package com.fmaking.service.dto;

import java.time.Instant;

public record GroupReviewDTO(GroupDTO group, String className, Instant submittedAt, String deadlineStatus,
                             boolean eligible, boolean canReview, boolean canReopen) {
}
