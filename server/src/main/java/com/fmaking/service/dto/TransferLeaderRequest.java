package com.fmaking.service.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TransferLeaderRequest {
    @NotNull(message = "ID trưởng nhóm mới không được để trống")
    private Long newLeaderId;
}
