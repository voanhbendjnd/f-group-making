package com.fmaking.service.dto;

import java.util.List;

public record DeadlineCreatedEvent(
    Integer deadlineId,
    List<Integer> schoolClassIds
) {}
