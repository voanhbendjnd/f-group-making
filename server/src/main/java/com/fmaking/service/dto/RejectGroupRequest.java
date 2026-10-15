package com.fmaking.service.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RejectGroupRequest {
    @NotBlank(message = "Lý do từ chối không được để trống")
    private String reason;
}
