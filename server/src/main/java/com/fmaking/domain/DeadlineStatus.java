package com.fmaking.domain;

import java.time.Instant;

public enum DeadlineStatus {
    UPCOMING,
    ACTIVE,
    EXPIRED;

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
