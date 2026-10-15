package com.fmaking.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CreateGroupRequest {
    @NotBlank(message = "Tên nhóm không được để trống")
    @Size(min = 2, max = 100, message = "Tên nhóm phải từ 2 đến 100 ký tự")
    private String name;
}
