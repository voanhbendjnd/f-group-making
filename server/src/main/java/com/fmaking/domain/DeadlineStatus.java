package com.fmaking.domain;

import java.time.Instant;

public enum DeadlineStatus {
    UPCOMING,
    ACTIVE,
    EXPIRED,
    CANCELLED;

    public static DeadlineStatus resolve(Deadline deadline, Instant now) {
        if (CANCELLED.name().equalsIgnoreCase(deadline.getStatus())) return CANCELLED;
        return calculateStatus(deadline.getStartTime(), deadline.getEndTime(), now);
    }

    public static DeadlineStatus calculateStatus(Instant startTime, Instant endTime, Instant now) {
        if (now.isBefore(startTime)) {
            return UPCOMING;
        }
        if (!now.isBefore(endTime)) {
            return EXPIRED;
        }
        return ACTIVE;
    }
}
