package com.fmaking.service.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupRealtimeEvent {
    private String eventId;
    private String eventType;
    private Long groupId;
    private Integer deadlineId;
    private Integer schoolClassId;
    private String actor;
    private Instant timestamp;
    private Object payload;
}
