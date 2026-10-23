package com.fmaking.domain;

import java.time.Instant;

public enum DeadlineStatus {
    UNSCHEDULED,
    UPCOMING,
    ACTIVE,
    EXPIRED,
    CANCELLED;

    public static DeadlineStatus resolve(Deadline deadline, Instant now) {
        if (CANCELLED.name().equalsIgnoreCase(deadline.getStatus())) return EXPIRED;
        return calculateStatus(deadline.getStartTime(), deadline.getEndTime(), now);
    }

    public static DeadlineStatus resolve(Deadline deadline, Integer classId, Instant now) {
        if (CANCELLED.name().equalsIgnoreCase(deadline.getStatus())) return EXPIRED;
        return calculateStatus(deadline.getStartTime(), deadline.endTimeFor(classId), now);
    }

    public static DeadlineStatus calculateStatus(Instant startTime, Instant endTime, Instant now) {
        if (startTime == null || endTime == null) return UNSCHEDULED;
        if (now.isBefore(startTime)) {
            return UPCOMING;
        }
        if (!now.isBefore(endTime)) {
            return EXPIRED;
        }
        return ACTIVE;
    }
}
