package com.fmaking.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.List;

@Getter
@Setter
public class UpdateDeadlineDTO {

    @NotNull
    private Integer id;

    @NotBlank
    @Size(min = 2, max = 100)
    private String name;

    private String description;

    private Instant startTime;

    @NotNull
    private Instant endTime;

    private List<Integer> schoolClassIds;
}
