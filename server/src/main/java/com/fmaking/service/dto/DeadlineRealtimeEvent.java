package com.fmaking.service.dto;

import com.fmaking.domain.DeadlineStatus;
import java.time.Instant;
import java.util.List;

public record DeadlineRealtimeEvent(String eventId, String eventType, Integer deadlineId,
        List<Integer> affectedClassIds, DeadlineStatus status, Instant startTime, Instant endTime,
        Instant occurredAt, long version) { }
