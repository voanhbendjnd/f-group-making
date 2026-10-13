package com.fmaking.service.dto;

public record StudentDeadlineRow(
    Long userId,
    String fullName,
    String email,
    Integer schoolClassId
) {}
