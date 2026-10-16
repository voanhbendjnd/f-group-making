package com.fmaking.service.dto;

import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter @Setter
public class CloseDeadlineDTO {
    private List<Integer> confirmedClassIds;
    private Long expectedVersion;
}
