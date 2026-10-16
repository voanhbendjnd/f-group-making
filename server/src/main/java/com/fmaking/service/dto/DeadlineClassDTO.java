package com.fmaking.service.dto;

import com.fmaking.domain.DeadlineStatus;
import java.time.Instant;

public record DeadlineClassDTO(Integer schoolClassId, String schoolClassName,
                               Instant startTime, Instant endTime, DeadlineStatus status, boolean canEdit) { }
