package com.fmaking.service.dto;

import com.fmaking.domain.DeadlineStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeadlineValidateDTO {

    private boolean valid;
    private DeadlineStatus status;
    private Integer deadlineId;
    private String name;
    private String description;
    private Instant startTime;
    private Instant endTime;
    private Integer classId;
    private String className;
    private String message;
}
