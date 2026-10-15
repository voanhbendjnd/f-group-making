package com.fmaking.service.dto;

import com.fmaking.domain.DeadlineStatus;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.List;

@Getter
@Setter
public class DeadlineDTO {

    private Integer id;
    private String name;
    private String description;
    private Instant startTime;
    private Instant endTime;
    private DeadlineStatus status;
    private long version;
    private Instant cancelledAt;
    private String cancelledBy;
    private boolean canEdit;
    private boolean canCancel;
    private List<Integer> schoolClassIds;
    private List<String> schoolClassNames;
    private Instant createdDate;
    private String createdBy;
    private Instant lastModifiedDate;
    private String lastModifiedBy;
}
